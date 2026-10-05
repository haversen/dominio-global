// Bots: jugadores controlados por la IA que rellenan plazas (opcional, se elige en la sala).
// Usan exactamente las mismas acciones que un jugador humano, a través del RoomManager.
// Su nivel (fácil, normal, difícil) se elige en la sala: los difíciles defienden lo atacado,
// llevan las tropas al frente, calculan cada batalla como el servidor y se alían contra el líder.

import { COUNTRIES, battleOdds, armyTravelMs } from './game.js';
import { UNITS, UNIT_TYPES, totalUnits, moveError } from '../shared/military.js';
import { canAfford, developCost, MAX_LEVEL } from '../shared/economy.js';
import { TREE_NODES, TECH_TREE, TECH_TYPES, TECH_MAX_LEVEL, nodeError } from '../shared/tech.js';
import { buildError, buildingCost } from '../shared/buildings.js';
import { relationOf, PROPOSALS } from '../shared/diplomacy.js';
import { strategicOf } from '../shared/strategic.js';
import { BASE_PRICES, MAX_TRADE } from '../shared/market.js';
import { PRESIDENT_IDS } from '../shared/leaders.js';

export const BOT_NAMES = ['Bismarck', 'Napoleón', 'Juana', 'Atila', 'Cleopatra', 'Aníbal', 'Catalina', 'Saladino', 'Isabel', 'Gengis',
  'Ramsés', 'Alejandro', 'Boudica', 'Pedro', 'Tokugawa', 'Moctezuma'];
// La capital nunca se deja desprotegida: perderla elimina al jugador.
const CAPITAL_GUARD = 8;
const RESERVE = { money: 40 };
const WAR_GRACE_MS = 5 * 60_000; // nadie declara guerras en los primeros minutos
const DIPLOMACY_EVERY_MS = 60_000;

// Lo que sabe hacer cada nivel. margin: ventaja que necesita para atacar (1,6 = un 60 % más fuerte).
// Los fáciles calculan a ojo (sin capital, murallas ni tecnología), no comercian ni se defienden;
// los difíciles piensan más a menudo, atacan en varios frentes, mandan refuerzos y se alían contra el líder.
export const BOT_LEVELS = {
  easy: {
    label: 'Fácil', thinkMs: 8_000, margin: 1.5, attackEvery: 40_000, attacks: 1, batch: 3, actions: 1,
    defend: false, reinforce: false, consolidate: false, declareWar: false, coalition: false, accurate: false,
  },
  normal: {
    label: 'Normal', thinkMs: 4_000, margin: 1.6, attackEvery: 12_000, attacks: 1, batch: 6, actions: 1,
    defend: true, reinforce: false, consolidate: true, declareWar: true, coalition: false, accurate: true,
  },
  hard: {
    label: 'Difícil', thinkMs: 2_500, margin: 1.6, attackEvery: 5_000, attacks: 3, batch: 6, actions: 2,
    defend: true, reinforce: true, consolidate: true, declareWar: true, coalition: true, accurate: true,
  },
};
export const BOT_LEVEL_IDS = Object.keys(BOT_LEVELS);

export function makeBot(index, rng) {
  return {
    name: `🤖 ${BOT_NAMES[index % BOT_NAMES.length]}`,
    avatar: '🤖',
    president: PRESIDENT_IDS[Math.floor(rng() * PRESIDENT_IDS.length)],
  };
}

const safely = (fn) => {
  try {
    return fn();
  } catch {
    return null; // una acción no válida simplemente no se hace
  }
};

/** Piensa y actúa por cada bot de la sala (cada pocos segundos). */
export function runBots(rm, room, now, rng = Math.random) {
  const game = room.game;
  if (!game || game.phase !== 'active') return;
  for (const bot of room.players.values()) {
    if (!bot.bot) continue;
    // bot.level solo existe en las pruebas (bots de distinto nivel en la misma partida).
    const level = BOT_LEVELS[bot.level ?? room.settings.botLevel] ?? BOT_LEVELS.normal;
    const me = game.players[bot.id];
    if (!me || me.eliminated) continue;
    if ((bot.nextThink ?? 0) > now) continue;
    bot.nextThink = now + level.thinkMs * (0.8 + rng() * 0.4);
    respondToProposals(rm, room, bot, game, level, rng);
    voteInUN(rm, room, bot, game);
    lend(rm, room, bot, game, me, rng);
    if (level.accurate) trade(rm, room, bot, game, me);
    if (level.defend) defend(rm, room, bot, game, me, level, now);
    // Cada turno elige una o dos prioridades para no gastarlo todo en lo mismo.
    for (let i = 0; i < level.actions; i++) {
      const roll = rng();
      if (roll < 0.3) research(rm, room, bot, me);
      else if (roll < 0.6) economy(rm, room, bot, game, me, rng);
      else recruitTroops(rm, room, bot, game, me, level, rng);
    }
    if (level.consolidate) consolidate(rm, room, bot, game);
    attack(rm, room, bot, game, level, now);
    diplomacy(rm, room, bot, game, level, now, rng);
  }
}

const mine = (game, pid) => Object.keys(game.countries).filter((id) => game.countries[id].owner === pid);
const areaOf = (game, pid) => mine(game, pid).reduce((s, id) => s + COUNTRIES.get(id).area, 0);
const isFriend = (game, a, b) => a === b || relationOf(game.relations, a, b).state === 'alliance';
const atWar = (game, a, b) => relationOf(game.relations, a, b).state === 'war';

/** El jugador más grande que no es el bot ni su aliado (el que va ganando). */
function leaderOf(game, botId) {
  let best = null;
  for (const pid of Object.keys(game.players)) {
    if (game.players[pid].eliminated || isFriend(game, botId, pid)) continue;
    const area = areaOf(game, pid);
    if (!best || area > best.area) best = { id: pid, area };
  }
  return best;
}

/** País fronterizo: linda con alguien que no es el bot ni su aliado. */
const isFrontier = (game, botId, id) => COUNTRIES.get(id).neighbors
  .some((n) => game.countries[n] && !isFriend(game, botId, game.countries[n].owner));

function respondToProposals(rm, room, bot, game, level, rng) {
  const leader = leaderOf(game, bot.id);
  for (const p of game.proposals.filter((x) => x.to === bot.id)) {
    let accept;
    if (p.type === 'trade') {
      // Acepta si recibe al menos lo mismo que da (contando todo igual).
      const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
      accept = sum(p.trade.give) >= sum(p.trade.receive) && canAfford(game.players[bot.id].resources, p.trade.receive);
    } else if (p.type === 'peace') {
      accept = areaOf(game, bot.id) < areaOf(game, p.from) * 1.2 || rng() < 0.3;
    } else if (level.coalition || level.accurate) {
      // Con el que va ganando, nada; con los demás, sí (sobre todo si también le hacen frente).
      const fromLeader = leader?.id === p.from && leader.area > areaOf(game, bot.id);
      const sharedEnemy = leader && atWar(game, p.from, leader.id);
      accept = !fromLeader && (sharedEnemy || rng() < (p.type === 'alliance' ? 0.5 : 0.7));
    } else {
      accept = rng() < (p.type === 'alliance' ? 0.4 : 0.6);
    }
    if (PROPOSALS[p.type]) safely(() => rm.respondProposal(room, bot, p.id, accept));
  }
}

// Los bots prestan dinero si el interés les compensa y les sobra.
const LEND_MIN_INTEREST = 8;
const LEND_RESERVE = 150;
function lend(rm, room, bot, game, me, rng) {
  const loan = (game.loans ?? []).find((l) => l.status === 'open' && l.borrower !== bot.id
    && l.interest >= LEND_MIN_INTEREST && me.resources.money >= l.amount + LEND_RESERVE
    && relationOf(game.relations, bot.id, l.borrower).state !== 'war');
  // Cuanto más interés ofrece, antes se anima.
  if (loan && rng() < Math.min(0.9, loan.interest / 40)) safely(() => rm.fundLoan(room, bot, loan.id));
}

function voteInUN(rm, room, bot, game) {
  const s = game.world?.session;
  if (!s || s.votes[bot.id]) return;
  const againstMe = s.target === bot.id || s.a === bot.id || s.b === bot.id;
  const vote = s.type === 'aid' ? (s.target === bot.id ? 'yes' : 'no') : againstMe && s.type === 'sanctions' ? 'no' : 'yes';
  safely(() => rm.voteUN(room, bot, vote));
}

// Bolsa (normal y difícil): sin petróleo, tanques y aviones rinden la mitad; el dinero limita todo lo demás.
// Los bots acumulaban cientos de alimentos e industria sin usar, así que venden lo que sobra y compran petróleo.
const KEEP = { food: 150, industry: 200 };
const OIL_TARGET = 40;
function trade(rm, room, bot, game, me) {
  const res = me.resources;
  const prices = game.market?.prices;
  if (!prices) return;
  for (const good of ['food', 'industry']) {
    const extra = Math.min(MAX_TRADE, Math.floor(res[good] - KEEP[good]));
    // Solo si el precio no se ha hundido (vender mucho de golpe lo baja).
    if (extra >= 20 && prices[good] >= BASE_PRICES[good] * 0.7) safely(() => rm.trade(room, bot, good, 'sell', extra));
  }
  if (res.oil < OIL_TARGET && res.money > RESERVE.money + 40) {
    const amount = Math.min(OIL_TARGET - Math.floor(res.oil), Math.floor((res.money - RESERVE.money) / (prices.oil * 1.2)));
    if (amount >= 5) safely(() => rm.trade(room, bot, 'oil', 'buy', amount));
  }
}

function research(rm, room, bot, me) {
  // Un nodo del árbol en una rama libre, o una doctrina.
  const node = TREE_NODES.find((id) => !me.research?.[TECH_TREE[id].branch] && !nodeError(me.unlocked, id)
    && canAfford(me.resources, TECH_TREE[id].cost ?? {}));
  if (node) safely(() => rm.researchNode(room, bot, node));
  const doctrine = TECH_TYPES.find((t) => me.tech[t] < TECH_MAX_LEVEL);
  if (doctrine && !me.research?.doctrine) safely(() => rm.research(room, bot, doctrine));
}

function economy(rm, room, bot, game, me, rng) {
  const countries = mine(game, bot.id);
  const res = me.resources;
  // Construir y desarrollar en el país más desarrollado.
  const best = countries.sort((a, b) => game.countries[b].level - game.countries[a].level)[0];
  if (!best) return;
  const c = game.countries[best];
  // Primero lo que más falta: sin comida o petróleo las tropas rinden la mitad.
  const want = res.food < 20 ? ['farm'] : res.oil < 20 ? ['oilwell'] : [];
  want.push('factory', 'farm', 'bank', 'oilwell', 'barracks', 'bunker');
  const type = want.find((t) => !buildError(c, t) && canAfford(res, buildingCost(t, (c.buildings?.[t] ?? 0) + 1)));
  if (type && rng() < 0.7) safely(() => rm.build(room, bot, best, type));
  else if (c.level < MAX_LEVEL && !c.developing && canAfford(res, developCost(c.level)) && res.money > 150) {
    safely(() => rm.developCountry(room, bot, best));
  }
}

// Tropas de tierra que puede reclutar, de la más fuerte a la más débil.
const landUnits = (strongestFirst = true) => UNIT_TYPES.filter((t) => UNITS[t].domain === 'land')
  .sort((a, b) => (strongestFirst ? UNITS[b].attack - UNITS[a].attack : UNITS[b].defense - UNITS[a].defense));

/** Recluta `count` unidades del mejor tipo posible (si no llega, menos). Devuelve true si lo consigue. */
function recruitBest(rm, room, bot, where, count, types) {
  for (const t of types) {
    for (let n = count; n >= 1; n = Math.floor(n / 2)) {
      if (safely(() => rm.recruit(room, bot, where, t, n)) !== null) return true;
    }
  }
  return false;
}

function recruitTroops(rm, room, bot, game, me, level, rng) {
  const countries = mine(game, bot.id);
  // Primero se protege la capital; luego se recluta en el frente más amenazado (o en uno al azar).
  const capital = game.homes[bot.id];
  const frontier = countries.filter((id) => isFrontier(game, bot.id, id));
  const pressure = (id) => COUNTRIES.get(id).neighbors.reduce((s, n) => {
    const c = game.countries[n];
    return s + (c && c.owner && !isFriend(game, bot.id, c.owner) ? totalUnits(c.units) : 0);
  }, 0);
  const where = capital && totalUnits(game.countries[capital].units) < CAPITAL_GUARD * 1.5 ? capital
    : level.accurate && frontier.length ? frontier.sort((a, b) => pressure(b) - pressure(a))[0]
      : frontier[Math.floor(rng() * frontier.length)] ?? countries[0];
  if (!where || me.resources.money < RESERVE.money + 30) return;
  // Un país sin vecinos por tierra (una isla) necesita barcos para salir.
  const island = level.accurate && COUNTRIES.get(where).neighbors.every((n) => COUNTRIES.get(where).sea.includes(n));
  if (island && COUNTRIES.get(where).coastal && !UNIT_TYPES.some((t) => UNITS[t].domain === 'sea' && game.countries[where].units[t] > 0)) {
    recruitBest(rm, room, bot, where, 2, UNIT_TYPES.filter((t) => UNITS[t].domain === 'sea'));
  }
  const types = [...landUnits(), ...UNIT_TYPES.filter((t) => UNITS[t].domain === 'air' && rng() < 0.3)];
  recruitBest(rm, room, bot, where, level.batch, types);
}

/** Ejércitos enemigos en marcha hacia un país del bot (se darán la vuelta si no hay guerra). */
const incoming = (game, botId, id) => game.armies.filter((a) => a.to === id && !isFriend(game, botId, a.owner)
  && (!a.owner || atWar(game, botId, a.owner)));

/** Tropas que defenderán un país cuando llegue el enemigo: las que hay y las que terminan antes de entrenar. */
function defendersAt(game, id, arriveAt) {
  const units = { ...game.countries[id].units };
  for (const t of game.countries[id].training ?? []) if (t.readyAt < arriveAt) units[t.type] += t.count;
  return units;
}

/**
 * Normal y difícil: si un ejército enemigo va a ganar en uno de sus países, recluta ahí (en cada turno,
 * hasta que aguante) y, en difícil, manda refuerzos de los vecinos que lleguen a tiempo.
 */
function defend(rm, room, bot, game, me, level, now) {
  const handled = (bot.defended ??= new Set());
  for (const a of game.armies) {
    const target = game.countries[a.to];
    if (!target || target.owner !== bot.id || !incoming(game, bot.id, a.to).includes(a)) continue;
    const odds = battleOdds(game, a.owner, a.from, a.to, a.units, defendersAt(game, a.to, a.arriveAt));
    if (odds < 0.8) continue; // ya aguanta
    // Refuerzos de los países vecinos que lleguen antes que el enemigo (una vez por ejército enemigo).
    if (level.reinforce && !handled.has(a.id)) {
      handled.add(a.id);
      for (const n of COUNTRIES.get(a.to).neighbors) {
        const c = game.countries[n];
        if (!c || c.owner !== bot.id || n === a.from) continue;
        const spare = spareUnits(game, bot.id, n, 1, true);
        if (totalUnits(spare) < 2 || moveError(COUNTRIES.get(n), COUNTRIES.get(a.to), spare)) continue;
        if (now + armyTravelMs(game, bot.id, n, a.to, spare) >= a.arriveAt) continue;
        safely(() => rm.moveArmy(room, bot, n, a.to, spare));
      }
    }
    // Y reclutar allí tropas de defensa.
    if (me.resources.money > RESERVE.money) recruitBest(rm, room, bot, a.to, level.batch, landUnits(false));
  }
  if (handled.size > 200) bot.defended = new Set([...handled].slice(-100));
}

/**
 * Guarnición de un país. Fácil: en la capital la mitad de lo que haya (mínimo 8) y en el resto `keepMin`.
 * Normal y difícil: lo justo para aguantar al ejército enemigo más fuerte de al lado (calculado como
 * el servidor), o todo si no basta.
 */
function guardKeep(game, botId, id, accurate, keepMin) {
  const here = game.countries[id].units;
  const capital = game.homes[botId] === id;
  if (!accurate) return capital ? Math.max(CAPITAL_GUARD, Math.ceil(totalUnits(here) * 0.5)) : keepMin;
  // En la capital, ante cualquier vecino que no sea aliado; en el resto, solo ante quien está en guerra con él.
  // También cuentan los ejércitos enemigos que ya vienen de camino.
  const threats = COUNTRIES.get(id).neighbors.map((n) => game.countries[n])
    .filter((c) => c && c.owner && c.owner !== botId && !isFriend(game, botId, c.owner) && totalUnits(c.units) > 0
      && (capital || atWar(game, botId, c.owner)));
  const marching = incoming(game, botId, id);
  const total = totalUnits(here);
  for (let keep = capital ? CAPITAL_GUARD : keepMin; keep < total; keep += Math.max(1, Math.ceil(total / 10))) {
    const guard = keepUnits(here, keep);
    const safe = threats.every((c) => {
      const from = Object.keys(game.countries).find((k) => game.countries[k] === c);
      return battleOdds(game, c.owner, from, id, c.units, guard) < 0.8;
    }) && marching.every((a) => battleOdds(game, a.owner, a.from, id, a.units, guard) < 0.8);
    if (safe) return keep;
  }
  return total;
}

// Las `count` unidades que se quedan (primero las de tierra; los barcos nunca salen de aquí).
function keepUnits(units, count) {
  const kept = Object.fromEntries(UNIT_TYPES.map((t) => [t, 0]));
  let left = count;
  for (const t of ['infantry', 'mech', 'tank', 'heavytank', 'specops', 'mbt', 'aircraft', 'bomber', 'jet']) {
    const k = Math.min(units[t] ?? 0, left);
    kept[t] = k;
    left -= k;
  }
  return kept;
}

/** Tropas que se pueden sacar de un país dejando una guarnición (más grande en la capital). */
function spareUnits(game, botId, id, keepMin, accurate = false) {
  const here = game.countries[id].units;
  const keep = guardKeep(game, botId, id, accurate, keepMin);
  const army = { ...here };
  let toKeep = keep;
  for (const t of ['infantry', 'mech', 'tank', 'heavytank', 'specops', 'mbt', 'aircraft', 'bomber', 'jet']) {
    const k = Math.min(army[t] ?? 0, toKeep);
    army[t] -= k;
    toKeep -= k;
  }
  for (const t of UNIT_TYPES) if (UNITS[t].domain === 'sea') army[t] = 0;
  return army;
}

/** Normal y difícil: las tropas de los países del interior avanzan hacia el frente. */
function consolidate(rm, room, bot, game) {
  const countries = mine(game, bot.id);
  const owned = new Set(countries);
  // Distancia (en fronteras) de cada país propio al frente más cercano.
  const dist = new Map();
  const queue = countries.filter((id) => isFrontier(game, bot.id, id));
  for (const id of queue) dist.set(id, 0);
  while (queue.length) {
    const id = queue.shift();
    for (const n of COUNTRIES.get(id).neighbors) {
      if (owned.has(n) && !dist.has(n)) {
        dist.set(n, dist.get(id) + 1);
        queue.push(n);
      }
    }
  }
  let moves = 0;
  for (const id of countries) {
    if (moves >= 3 || !dist.get(id)) continue; // en el frente (0) o sin camino
    const next = COUNTRIES.get(id).neighbors.find((n) => owned.has(n) && dist.get(n) === dist.get(id) - 1);
    const army = spareUnits(game, bot.id, id, 1, true);
    if (!next || totalUnits(army) < 3 || moveError(COUNTRIES.get(id), COUNTRIES.get(next), army)) continue;
    if (safely(() => rm.moveArmy(room, bot, id, next, army)) !== null) moves++;
  }
}

function attack(rm, room, bot, game, level, now) {
  if ((bot.nextAttack ?? 0) > now) return;
  bot.nextAttack = now + level.attackEvery / game.speed;
  const leader = level.coalition ? leaderOf(game, bot.id) : null;

  // Todas las batallas que ganaría, con su valor; luego se lanzan las mejores (una por país de origen).
  const options = [];
  for (const from of mine(game, bot.id)) {
    const army = spareUnits(game, bot.id, from, 1, level.accurate);
    if (totalUnits(army) < 3) continue;
    for (const to of COUNTRIES.get(from).neighbors) {
      const target = game.countries[to];
      if (!target || target.owner === bot.id) continue;
      if (target.owner && !atWar(game, bot.id, target.owner)) continue;
      // Para cruzar el mar hacen falta barcos: se llevan los que haya.
      const units = { ...army };
      if (COUNTRIES.get(from).sea.includes(to)) {
        for (const t of UNIT_TYPES) if (UNITS[t].domain === 'sea') units[t] = game.countries[from].units[t];
      }
      if (moveError(COUNTRIES.get(from), COUNTRIES.get(to), units)) continue;
      const odds = level.accurate
        ? battleOdds(game, bot.id, from, to, units)
        : battleOdds(game, bot.id, from, to, units, target.units) * (0.8 + Math.random() * 0.4); // fácil: a ojo
      if (odds < level.margin) continue;
      // Qué vale la pena: capitales enemigas, países desarrollados, recursos estratégicos y el líder.
      let value = 1 + 0.3 * (target.level - 1) + 0.5 * strategicOf(to).length;
      if (target.owner && game.homes[target.owner] === to) value += 2;
      if (target.owner) value += 0.5;
      if (leader && target.owner === leader.id) value += 1;
      options.push({ from, to, units, score: value * Math.min(odds, 3) });
    }
  }
  options.sort((a, b) => b.score - a.score);
  const used = new Set();
  let launched = 0;
  for (const o of options) {
    if (launched >= level.attacks || used.has(o.from) || used.has(`to:${o.to}`)) continue;
    if (safely(() => rm.moveArmy(room, bot, o.from, o.to, o.units)) === null) continue;
    used.add(o.from);
    used.add(`to:${o.to}`);
    launched++;
  }
}

/** Guerras, alianzas y paces. */
function diplomacy(rm, room, bot, game, level, now, rng) {
  if (!level.declareWar || !game.startedAt || now - game.startedAt < WAR_GRACE_MS / game.speed) return;
  if ((bot.nextDiplomacy ?? 0) > now) return;
  bot.nextDiplomacy = now + DIPLOMACY_EVERY_MS / game.speed;
  const myArea = areaOf(game, bot.id);
  const countries = mine(game, bot.id);
  const neighbors = new Set(countries.flatMap((id) => COUNTRIES.get(id).neighbors)
    .map((id) => game.countries[id]?.owner).filter((o) => o && o !== bot.id));
  const pending = (to) => game.proposals.some((p) => p.from === bot.id && p.to === to);

  if (level.coalition) {
    const leader = leaderOf(game, bot.id);
    // Si alguien se escapa (más del doble que el bot), coalición: alianza con los demás y guerra al líder.
    if (leader && leader.area > myArea * 2) {
      for (const pid of Object.keys(game.players)) {
        if (pid === bot.id || pid === leader.id || game.players[pid].eliminated || isFriend(game, bot.id, pid)) continue;
        if (atWar(game, bot.id, pid) || pending(pid)) continue;
        safely(() => rm.propose(room, bot, pid, 'alliance'));
        break; // una propuesta cada vez
      }
      // Solo le declara la guerra con un ejército mayor que el suyo (o casi igual si un aliado ya lucha contra él).
      const army = (pid) => mine(game, pid).reduce((s, id) => s + totalUnits(game.countries[id].units), 0);
      const allyFighting = Object.keys(game.players).some((pid) => pid !== bot.id && isFriend(game, bot.id, pid) && atWar(game, pid, leader.id));
      if (neighbors.has(leader.id) && relationOf(game.relations, bot.id, leader.id).state === 'peace'
        && army(bot.id) >= army(leader.id) * (allyFighting ? 0.8 : 1.2)) {
        safely(() => rm.declareWar(room, bot, leader.id));
      }
      return;
    }
  }

  // Pide la paz si está en guerra con alguien mucho más fuerte.
  for (const pid of neighbors) {
    if (atWar(game, bot.id, pid) && areaOf(game, pid) > myArea * 1.5 && !pending(pid)) {
      safely(() => rm.propose(room, bot, pid, 'peace'));
      return;
    }
  }
  // Declarar la guerra a un vecino más débil (de vez en cuando, y nunca en dos frentes a la vez si es normal).
  const wars = [...neighbors].filter((pid) => atWar(game, bot.id, pid)).length;
  if (wars > (level.coalition ? 1 : 0) || rng() > (level.coalition ? 0.5 : 0.25)) return;
  const weak = [...neighbors].find((pid) => relationOf(game.relations, bot.id, pid).state === 'peace' && areaOf(game, pid) < myArea);
  if (weak) safely(() => rm.declareWar(room, bot, weak));
}
