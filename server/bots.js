// Bots: jugadores controlados por la IA que rellenan plazas (opcional, se elige en la sala).
// Usan exactamente las mismas acciones que un jugador humano, a través del RoomManager.

import { COUNTRIES } from './game.js';
import { UNITS, UNIT_TYPES, totalUnits, resolveBattle, terrainOf, moveError } from '../shared/military.js';
import { canAfford, developCost, MAX_LEVEL } from '../shared/economy.js';
import { TREE_NODES, TECH_TREE, TECH_TYPES, TECH_MAX_LEVEL, nodeError } from '../shared/tech.js';
import { buildError, buildingCost } from '../shared/buildings.js';
import { relationOf, PROPOSALS } from '../shared/diplomacy.js';
import { PRESIDENT_IDS } from '../shared/leaders.js';

export const BOT_NAMES = ['Bismarck', 'Napoleón', 'Juana', 'Atila', 'Cleopatra', 'Aníbal', 'Catalina', 'Saladino', 'Isabel', 'Gengis'];
const THINK_MS = 4_000;
// La capital nunca se deja desprotegida: perderla elimina al jugador.
const CAPITAL_GUARD = 8;
const RESERVE = { money: 40 };

// Carácter según la dificultad elegida para la IA.
const PERSONALITY = {
  passive: { margin: 1.8, attackEvery: 30_000, declareWar: false },
  normal: { margin: 1.4, attackEvery: 15_000, declareWar: true },
  aggressive: { margin: 1.15, attackEvery: 8_000, declareWar: true },
};

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
    const me = game.players[bot.id];
    if (!me || me.eliminated) continue;
    if ((bot.nextThink ?? 0) > now) continue;
    bot.nextThink = now + THINK_MS * (0.8 + rng() * 0.4);
    const mood = PERSONALITY[room.settings.aiDifficulty] ?? PERSONALITY.normal;
    respondToProposals(rm, room, bot, game, rng);
    voteInUN(rm, room, bot, game);
    // Cada turno elige una prioridad para no gastarlo todo en lo mismo.
    const roll = rng();
    if (roll < 0.3) research(rm, room, bot, me);
    else if (roll < 0.6) economy(rm, room, bot, game, me, rng);
    else recruitTroops(rm, room, bot, game, me, rng);
    attack(rm, room, bot, game, mood, now, rng);
  }
}

const mine = (game, pid) => Object.keys(game.countries).filter((id) => game.countries[id].owner === pid);
const areaOf = (game, pid) => mine(game, pid).reduce((s, id) => s + COUNTRIES.get(id).area, 0);

function respondToProposals(rm, room, bot, game, rng) {
  for (const p of game.proposals.filter((x) => x.to === bot.id)) {
    let accept;
    if (p.type === 'trade') {
      // Acepta si recibe al menos lo mismo que da (contando todo igual).
      const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
      accept = sum(p.trade.give) >= sum(p.trade.receive) && canAfford(game.players[bot.id].resources, p.trade.receive);
    } else if (p.type === 'peace') {
      accept = areaOf(game, bot.id) < areaOf(game, p.from) * 1.2 || rng() < 0.3;
    } else {
      accept = rng() < (p.type === 'alliance' ? 0.4 : 0.6);
    }
    if (PROPOSALS[p.type]) safely(() => rm.respondProposal(room, bot, p.id, accept));
  }
}

function voteInUN(rm, room, bot, game) {
  const s = game.world?.session;
  if (!s || s.votes[bot.id]) return;
  const againstMe = s.target === bot.id || s.a === bot.id || s.b === bot.id;
  const vote = s.type === 'aid' ? (s.target === bot.id ? 'yes' : 'no') : againstMe && s.type === 'sanctions' ? 'no' : 'yes';
  safely(() => rm.voteUN(room, bot, vote));
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
  const want = ['factory', 'farm', 'bank', 'oilwell', 'barracks', 'bunker'];
  const type = want.find((t) => !buildError(c, t) && canAfford(res, buildingCost(t, (c.buildings?.[t] ?? 0) + 1)));
  if (type && rng() < 0.7) safely(() => rm.build(room, bot, best, type));
  else if (c.level < MAX_LEVEL && !c.developing && canAfford(res, developCost(c.level)) && res.money > 150) {
    safely(() => rm.developCountry(room, bot, best));
  }
}

function recruitTroops(rm, room, bot, game, me, rng) {
  const countries = mine(game, bot.id);
  // Primero se protege la capital; luego se recluta en los países fronterizos.
  const capital = game.homes[bot.id];
  const frontier = countries.filter((id) => COUNTRIES.get(id).neighbors.some((n) => game.countries[n]?.owner !== bot.id));
  const where = capital && totalUnits(game.countries[capital].units) < CAPITAL_GUARD * 1.5
    ? capital
    : frontier[Math.floor(rng() * frontier.length)] ?? countries[0];
  if (!where || me.resources.money < RESERVE.money + 30) return;
  const options = UNIT_TYPES.filter((t) => UNITS[t].domain === 'land' || (UNITS[t].domain === 'air' && rng() < 0.3))
    .sort((a, b) => UNITS[b].attack - UNITS[a].attack);
  for (const t of options) {
    const r = safely(() => rm.recruit(room, bot, where, t, 3));
    if (r !== null) break;
  }
}

function attack(rm, room, bot, game, mood, now, rng) {
  const countries = mine(game, bot.id);
  if ((bot.nextAttack ?? 0) > now) return;
  bot.nextAttack = now + mood.attackEvery / game.speed;

  // Atacar: el objetivo más fácil al alcance (neutral o jugador en guerra).
  let best = null;
  for (const from of countries) {
    const here = game.countries[from].units;
    const isCapital = game.homes[bot.id] === from;
    // En la capital se queda una guarnición fuerte; en el resto, al menos una infantería.
    const keep = isCapital ? Math.max(CAPITAL_GUARD, Math.ceil(totalUnits(here) * 0.5)) : 1;
    if (totalUnits(here) - keep < 3) continue;
    const army = { ...here };
    let toKeep = keep;
    for (const t of ['infantry', 'mech', 'tank', 'heavytank', 'specops', 'mbt']) {
      const k = Math.min(army[t] ?? 0, toKeep);
      army[t] -= k;
      toKeep -= k;
    }
    for (const t of UNIT_TYPES) if (UNITS[t].domain === 'sea') army[t] = 0;
    for (const to of COUNTRIES.get(from).neighbors) {
      const target = game.countries[to];
      if (!target || target.owner === bot.id) continue;
      if (target.owner && relationOf(game.relations, bot.id, target.owner).state !== 'war') continue;
      if (moveError(COUNTRIES.get(from), COUNTRIES.get(to), army)) continue;
      const sim = resolveBattle(army, target.units, { terrain: terrainOf(to), level: target.level }, () => 0.5);
      const ratio = sim.attackPower / Math.max(1, sim.defensePower);
      if (ratio >= mood.margin && (!best || ratio > best.ratio)) best = { from, to, army, ratio };
    }
  }
  if (best) safely(() => rm.moveArmy(room, bot, best.from, best.to, best.army));

  // Declarar la guerra a un vecino humano más débil (no al principio).
  if (mood.declareWar && game.startedAt && now - game.startedAt > 5 * 60_000 / game.speed && rng() < 0.15) {
    const neighbors = new Set(countries.flatMap((id) => COUNTRIES.get(id).neighbors)
      .map((id) => game.countries[id]?.owner).filter((o) => o && o !== bot.id));
    const weak = [...neighbors].find((pid) => relationOf(game.relations, bot.id, pid).state === 'peace'
      && areaOf(game, pid) < areaOf(game, bot.id));
    if (weak) safely(() => rm.declareWar(room, bot, weak));
  }
}
