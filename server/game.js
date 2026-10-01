import { readFileSync } from 'node:fs';
import {
  STARTING_RESOURCES, MAX_LEVEL, RESOURCES, countryIncome, developCost, developMs, canAfford,
  addResources, emptyResources, economyRating,
} from '../shared/economy.js';
import {
  UNITS, UNIT_TYPES, GAME_SPEEDS, emptyUnits, addUnits, totalUnits, neutralGarrison, startingArmy,
  moveError, travelMs, resolveBattle, terrainOf, WEAPONS, interceptChance, strikeDamage,
} from '../shared/military.js';
import {
  TECHS, TECH_MAX_LEVEL, TECH_TREE, emptyTech, techCost, techMs, techBonus, startingUnlocks, isUnlocked,
  nodeError,
} from '../shared/tech.js';
import { relationOf, tickDiplomacy, forgetPlayer } from './diplomacy.js';
import { createAIState, tickAI } from './ai.js';
import { standings, checkVictory } from './victory.js';
import { encodeCountries } from '../shared/wire.js';

// Mapa del mundo generado por scripts/build-world.js.
export const WORLD = JSON.parse(readFileSync(new URL('../shared/world.json', import.meta.url), 'utf8'));
export const COUNTRIES = new Map(WORLD.countries.map((c) => [c.id, c]));
const TOTAL_AREA = WORLD.countries.reduce((sum, c) => sum + c.area, 0);

export const PICK_DURATION_MS = 60_000;
export const MAX_BATCH = 50; // unidades máximas por orden de reclutamiento
const MIN_START_AREA_KM2 = 150_000;
const PREFERRED_START_DISTANCE = 3;
const EVENT_HISTORY = 30;

/**
 * Estado de la partida (tiempo real; el servidor avanza el reloj con tickGame):
 *   phase:     'picking' | 'active' | 'ended'
 *   countries: { [id]: { owner, level, units, training: [{type, count, readyAt}], developing } }
 *   armies:    [{ id, owner, from, to, units, departAt, arriveAt }]   tropas en marcha
 *   events:    últimas batallas y eliminaciones (para avisos y animaciones)
 *   homes:     { [playerId]: countryId }  capital de cada jugador (se pierde si la conquistan)
 *   players:   { [playerId]: { resources, eliminated, tech, unlocked, research, cooldowns } }  (privado)
 *   strikes:   [{ id, owner, weapon, from, to, departAt, arriveAt }]  bombas en vuelo
 *   relations: { 'a|b': { state, until } }  diplomacia entre jugadores (por defecto, paz)
 *   proposals: [{ id, type, from, to, expiresAt, trade? }]  propuestas pendientes (privadas)
 */
export function createGame(settings, playerIds, { now = Date.now(), rng = Math.random } = {}) {
  const game = {
    phase: 'picking',
    speed: GAME_SPEEDS[settings.gameSpeed] ?? 1,
    countries: Object.fromEntries(WORLD.countries.map((c) => [c.id, {
      owner: null,
      level: 1,
      units: neutralGarrison(c, economyRating(c.id)),
      training: [],
      developing: null,
    }])),
    homes: {},
    picks: {},
    pickDeadline: null,
    players: Object.fromEntries(playerIds.map((id) => [id, {
      resources: { ...STARTING_RESOURCES },
      eliminated: false,
      tech: emptyTech(),
      unlocked: startingUnlocks(), // nodos del árbol tecnológico investigados
      research: null,              // { tech, toLevel, readyAt } o { node, readyAt }
      cooldowns: {},               // arma -> momento en que se puede volver a lanzar
      stats: { battlesWon: 0, battlesLost: 0, conquests: 0, unitsLost: 0 },
    }])),
    startPlayers: playerIds.length,
    victory: {
      domination: settings.winDomination ? settings.dominationPercent : null,
      lastStanding: Boolean(settings.winLastStanding),
      timeLimitMs: settings.winTimeLimit ? settings.timeLimitMinutes * 60_000 : null,
    },
    result: null,
    relations: {},
    proposals: [],
    armies: [],
    strikes: [],
    events: [],
    seq: 0,
    startedAt: null,
    lastTick: now,
  };

  game.ai = createAIState(settings.aiDifficulty, game.countries, now);

  if (settings.countryAssignment === 'choose') {
    game.pickDeadline = now + PICK_DURATION_MS;
  } else {
    finishPicking(game, playerIds, rng, now);
  }
  return game;
}

// ---------- Elección de país ----------

/** Países que un jugador no puede elegir: los ya tomados por otros y sus vecinos. */
export function isBlockedFor(game, playerId, countryId) {
  for (const [pid, taken] of Object.entries({ ...game.picks, ...game.homes })) {
    if (pid === playerId) continue;
    if (taken === countryId || COUNTRIES.get(taken).neighbors.includes(countryId)) return true;
  }
  return false;
}

/** Devuelve un mensaje de error o null si la elección es válida. */
export function pickCountry(game, playerId, countryId) {
  if (game.phase !== 'picking') return 'Ya no se pueden elegir países';
  if (!COUNTRIES.has(countryId)) return 'Ese país no existe';
  if (isBlockedFor(game, playerId, countryId)) {
    return 'Ese país está ocupado o limita con el de otro jugador';
  }
  game.picks[playerId] = countryId;
  return null;
}

export function allPicked(game, playerIds) {
  return playerIds.every((id) => game.picks[id]);
}

/** Cierra la fase de elección: reparte país a quien no eligió y pone el reloj en marcha. */
export function finishPicking(game, playerIds, rng = Math.random, now = Date.now()) {
  for (const id of playerIds) {
    if (!game.picks[id]) game.picks[id] = autoPick(game, id, rng);
  }
  for (const id of playerIds) {
    const countryId = game.picks[id];
    const country = game.countries[countryId];
    game.homes[id] = countryId;
    country.owner = id;
    country.units = startingArmy(COUNTRIES.get(countryId));
  }
  game.picks = {};
  game.pickDeadline = null;
  game.phase = 'active';
  game.startedAt = now;
  game.lastTick = now;
  if (game.ai) {
    game.ai.nextRegen = now + 20_000;
    game.ai.nextThink = now + 3_000;
  }
}

// ---------- Economía ----------

// Una sola pasada por el mapa: ingresos brutos y tropas de cada jugador.
function economyTotals(game) {
  const totals = {};
  const entry = (pid) => (totals[pid] ??= { income: emptyResources(), units: emptyUnits() });
  for (const [id, c] of Object.entries(game.countries)) {
    if (!c.owner || !game.players[c.owner]) continue;
    const t = entry(c.owner);
    // Un país contaminado por una bomba nuclear no produce nada.
    if (!(c.contaminatedUntil > game.lastTick)) {
      addResources(t.income, countryIncome(COUNTRIES.get(id), c.level, game.homes[c.owner] === id));
    }
    addUnits(t.units, c.units);
  }
  for (const a of game.armies) if (a.owner && game.players[a.owner]) addUnits(entry(a.owner).units, a.units);
  return totals;
}

function applyIncomeTech(game, playerId, raw) {
  const mult = techBonus.income(game.players[playerId]?.tech);
  const total = emptyResources();
  for (const r of RESOURCES) total[r] = (raw?.[r] ?? 0) * mult;
  return total;
}

function upkeepOfUnits(game, playerId, units) {
  const total = emptyResources();
  if (!units) return total;
  const mult = techBonus.upkeep(game.players[playerId]?.tech);
  for (const t of UNIT_TYPES) {
    for (const [r, amount] of Object.entries(UNITS[t].upkeep)) total[r] += amount * units[t] * mult;
  }
  return total;
}

/** Ingresos por minuto del jugador. */
export function incomeFor(game, playerId) {
  return applyIncomeTech(game, playerId, economyTotals(game)[playerId]?.income);
}

/** Mantenimiento por minuto de todas sus tropas (en países y en marcha). */
export function upkeepFor(game, playerId) {
  return upkeepOfUnits(game, playerId, economyTotals(game)[playerId]?.units);
}

/** Sin alimentos o sin petróleo, las unidades que dependen de ellos rinden menos. */
export function supplyOf(game, playerId) {
  const res = game.players[playerId]?.resources;
  if (!res) return {};
  return { food: res.food > 0, oil: res.oil > 0 };
}

// ---------- Acciones ----------

export function recruit(game, playerId, countryId, type, count, now = Date.now()) {
  if (game.phase !== 'active') return 'La partida todavía no está en marcha';
  const country = game.countries[countryId];
  if (!country || country.owner !== playerId) return 'Solo puedes reclutar en tus países';
  const unit = UNITS[type];
  if (!unit) return 'Tipo de unidad desconocido';
  if (!isUnlocked(game.players[playerId].unlocked, { unit: type })) {
    return `Primero tienes que investigar ${unit.label} en el árbol tecnológico`;
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH) return `Puedes reclutar de 1 a ${MAX_BATCH} unidades`;
  if (unit.domain === 'sea' && !COUNTRIES.get(countryId).coastal) return 'Los barcos solo se construyen en países con costa';

  const cost = scaleCost(unit.cost, count);
  const player = game.players[playerId];
  if (!canAfford(player.resources, cost)) return 'No tienes recursos suficientes';

  addResources(player.resources, cost, -1);
  country.training.push({ type, count, readyAt: now + Math.round(unit.trainMs / game.speed) });
  return null;
}

export function developCountry(game, playerId, countryId, now = Date.now()) {
  if (game.phase !== 'active') return 'La partida todavía no está en marcha';
  const country = game.countries[countryId];
  if (!country) return 'Ese país no existe';
  if (country.owner !== playerId) return 'Solo puedes desarrollar tus propios países';
  if (country.level >= MAX_LEVEL) return 'Ese país ya está al nivel máximo';
  if (country.developing) return 'Ese país ya se está desarrollando';

  const player = game.players[playerId];
  const cost = developCost(country.level);
  if (!canAfford(player.resources, cost)) return 'No tienes recursos suficientes';

  addResources(player.resources, cost, -1);
  country.developing = {
    toLevel: country.level + 1,
    readyAt: now + Math.round(developMs(country.level) / game.speed),
  };
  return null;
}

export function research(game, playerId, tech, now = Date.now()) {
  if (game.phase !== 'active') return 'La partida todavía no está en marcha';
  const player = game.players[playerId];
  if (!player || player.eliminated) return 'Jugador no válido';
  if (!TECHS[tech]) return 'Tecnología desconocida';
  if (player.research) return 'Ya estás investigando otra tecnología';
  const toLevel = player.tech[tech] + 1;
  if (toLevel > TECH_MAX_LEVEL) return 'Esa tecnología ya está al máximo';
  const cost = techCost(toLevel);
  if (!canAfford(player.resources, cost)) return 'No tienes recursos suficientes';

  addResources(player.resources, cost, -1);
  player.research = { tech, toLevel, readyAt: now + Math.round(techMs(toLevel) / game.speed) };
  return null;
}

/** Investiga un nodo del árbol tecnológico (desbloquea una unidad o un arma). */
export function researchNode(game, playerId, nodeId, now = Date.now()) {
  if (game.phase !== 'active') return 'La partida todavía no está en marcha';
  const player = game.players[playerId];
  if (!player || player.eliminated) return 'Jugador no válido';
  if (player.research) return 'Ya estás investigando otra tecnología';
  const error = nodeError(player.unlocked, nodeId);
  if (error) return error;
  const node = TECH_TREE[nodeId];
  if (!canAfford(player.resources, node.cost)) return 'No tienes recursos suficientes';

  addResources(player.resources, node.cost, -1);
  player.research = { node: nodeId, readyAt: now + Math.round(node.ms / game.speed) };
  return null;
}

// Saltos de frontera desde cualquier país del jugador (para el alcance de las bombas).
function hopsFromPlayer(game, playerId, maxHops) {
  const dist = new Map();
  const queue = [];
  for (const [id, c] of Object.entries(game.countries)) {
    if (c.owner === playerId) {
      dist.set(id, { hops: 0, from: id });
      queue.push(id);
    }
  }
  while (queue.length) {
    const id = queue.shift();
    const { hops, from } = dist.get(id);
    if (hops >= maxHops) continue;
    for (const n of COUNTRIES.get(id).neighbors) {
      if (!dist.has(n)) {
        dist.set(n, { hops: hops + 1, from });
        queue.push(n);
      }
    }
  }
  return dist;
}

/** Lanza una bomba contra un país. Devuelve { error } o { strike }. */
export function launchStrike(game, playerId, weapon, targetId, now = Date.now()) {
  if (game.phase !== 'active') return { error: 'La partida todavía no está en marcha' };
  const player = game.players[playerId];
  const spec = WEAPONS[weapon];
  if (!player || player.eliminated) return { error: 'Jugador no válido' };
  if (!spec) return { error: 'Arma desconocida' };
  if (!isUnlocked(player.unlocked, { weapon })) return { error: `Primero tienes que investigar: ${spec.label}` };
  const target = game.countries[targetId];
  if (!target) return { error: 'Ese país no existe' };
  if (target.owner === playerId) return { error: 'No puedes bombardear tus propios países' };
  if (target.owner) {
    const rel = relationOf(game.relations, playerId, target.owner).state;
    if (rel !== 'war') return { error: 'Solo puedes bombardear a jugadores con los que estás en guerra' };
  }
  if ((player.cooldowns[weapon] ?? 0) > now) return { error: 'Esa arma todavía se está recargando' };
  const reach = hopsFromPlayer(game, playerId, spec.range).get(targetId);
  if (!reach) return { error: `Fuera de alcance: ${spec.label} llega a ${spec.range} país(es) de distancia` };
  if (!canAfford(player.resources, spec.cost)) return { error: 'No tienes recursos suficientes' };

  addResources(player.resources, spec.cost, -1);
  player.cooldowns[weapon] = now + Math.round(spec.cooldownMs / game.speed);
  const strike = {
    id: ++game.seq,
    owner: playerId,
    weapon,
    from: reach.from,
    to: targetId,
    departAt: now,
    arriveAt: now + Math.round(spec.flightMs / game.speed),
  };
  game.strikes.push(strike);
  return { strike };
}

function strikeHits(game, strike, now, rng) {
  const target = game.countries[strike.to];
  const spec = WEAPONS[strike.weapon];
  const event = {
    id: ++game.seq,
    ts: now,
    type: 'strike',
    weapon: strike.weapon,
    country: strike.to,
    attacker: strike.owner,
    defender: target.owner,
    intercepted: rng() < interceptChance(target.units, strike.weapon),
    losses: emptyUnits(),
    levelsLost: 0,
  };
  if (!event.intercepted) {
    const { unitsLeft, levelsLost } = strikeDamage(target.units, strike.weapon, rng);
    for (const t of UNIT_TYPES) event.losses[t] = target.units[t] - unitsLeft[t];
    target.units = unitsLeft;
    event.levelsLost = Math.min(levelsLost, target.level - 1);
    target.level -= event.levelsLost;
    if (spec.contaminationMs) target.contaminatedUntil = now + Math.round(spec.contaminationMs / game.speed);
    const stats = game.players[target.owner]?.stats;
    if (stats) stats.unitsLost += totalUnits(event.losses);
  }
  pushEvent(game, event);
  return event;
}

function playerSpeed(game, playerId) {
  return game.speed * techBonus.speed(game.players[playerId]?.tech);
}

/** Envía tropas a un país vecino. Devuelve { error } o { army }. */
export function moveArmy(game, playerId, fromId, toId, rawUnits, now = Date.now()) {
  if (game.phase !== 'active') return { error: 'La partida todavía no está en marcha' };
  const source = game.countries[fromId];
  const from = COUNTRIES.get(fromId);
  const to = COUNTRIES.get(toId);
  if (!source || !from || !to) return { error: 'País desconocido' };
  if (source.owner !== playerId) return { error: 'Solo puedes mover tropas desde tus países' };

  const units = emptyUnits();
  for (const t of UNIT_TYPES) {
    const n = rawUnits?.[t] ?? 0;
    if (!Number.isInteger(n) || n < 0) return { error: 'Cantidad de unidades inválida' };
    if (n > source.units[t]) return { error: 'No tienes tantas unidades ahí' };
    units[t] = n;
  }
  const error = moveError(from, to, units);
  if (error) return { error };
  // Solo se puede entrar en países de otros jugadores en guerra (ataque) o aliados (refuerzo).
  const targetOwner = game.countries[toId].owner;
  if (targetOwner && targetOwner !== playerId) {
    const rel = relationOf(game.relations, playerId, targetOwner).state;
    if (rel !== 'war' && rel !== 'alliance') {
      return { error: 'No estás en guerra con ese jugador: declárale la guerra primero' };
    }
  }

  addUnits(source.units, units, -1);
  const army = {
    id: ++game.seq,
    owner: playerId,
    from: fromId,
    to: toId,
    units,
    departAt: now,
    arriveAt: now + travelMs(from, to, units, playerSpeed(game, playerId)),
  };
  game.armies.push(army);
  return { army };
}

// ---------- Reloj ----------

/**
 * Avanza la partida hasta `now`. Devuelve { changed, picked, events }:
 * changed indica que el estado público ha cambiado (hay que difundirlo).
 */
export function tickGame(game, playerIds, now = Date.now(), rng = Math.random) {
  if (game.phase === 'picking') {
    if (now < game.pickDeadline) return { changed: false, events: [] };
    finishPicking(game, playerIds, rng, now);
    return { changed: true, picked: true, events: [] };
  }
  if (game.phase !== 'active') return { changed: false, events: [] };

  let changed = false;
  const events = [];

  // Economía continua: ingresos menos mantenimiento, proporcional al tiempo transcurrido.
  const minutes = ((now - game.lastTick) / 60_000) * game.speed;
  game.lastTick = now;
  if (minutes > 0) {
    const totals = economyTotals(game);
    for (const [pid, player] of Object.entries(game.players)) {
      if (player.eliminated) continue;
      const income = applyIncomeTech(game, pid, totals[pid]?.income);
      const upkeep = upkeepOfUnits(game, pid, totals[pid]?.units);
      for (const r of RESOURCES) {
        player.resources[r] = Math.max(0, player.resources[r] + (income[r] - upkeep[r]) * minutes);
      }
    }
  }

  for (const country of Object.values(game.countries)) {
    if (country.training.length) {
      const ready = country.training.filter((t) => t.readyAt <= now);
      if (ready.length) {
        for (const t of ready) country.units[t.type] += t.count;
        country.training = country.training.filter((t) => t.readyAt > now);
        changed = true;
      }
    }
    if (country.developing && country.developing.readyAt <= now) {
      country.level = country.developing.toLevel;
      country.developing = null;
      changed = true;
    }
  }

  for (const [pid, player] of Object.entries(game.players)) {
    if (player.research && player.research.readyAt <= now) {
      const r = player.research;
      if (r.node) player.unlocked.push(r.node);
      else player.tech[r.tech] = r.toLevel;
      events.push({ type: 'research', player: pid, ...r });
      player.research = null;
    }
  }

  const diplomacy = tickDiplomacy(game, now);
  if (diplomacy.changed) changed = true;
  for (const [a, b] of diplomacy.endedPacts) events.push({ type: 'pact-ended', players: [a, b] });

  const landed = game.strikes.filter((s) => s.arriveAt <= now);
  if (landed.length) {
    game.strikes = game.strikes.filter((s) => s.arriveAt > now);
    for (const strike of landed) events.push(strikeHits(game, strike, now, rng));
    changed = true;
  }
  for (const c of Object.values(game.countries)) {
    if (c.contaminatedUntil && c.contaminatedUntil <= now) {
      delete c.contaminatedUntil;
      changed = true;
    }
  }

  const arrived = game.armies.filter((a) => a.arriveAt <= now).sort((a, b) => a.arriveAt - b.arriveAt);
  if (arrived.length) {
    game.armies = game.armies.filter((a) => a.arriveAt > now);
    for (const army of arrived) {
      const event = arrive(game, army, now, rng);
      if (event) events.push(event);
    }
    events.push(...checkEliminations(game, now));
    changed = true;
  }

  if (tickAI(game, COUNTRIES, now)) changed = true;

  const ended = checkEnd(game, now);
  if (ended) changed = true;
  return { changed, events, ended };
}

/** Clasificación actual de la partida. */
export function currentStandings(game) {
  return standings(game, COUNTRIES, TOTAL_AREA);
}

/** Si se cumple alguna condición de victoria, termina la partida. Devuelve el resultado o null. */
export function checkEnd(game, now = Date.now()) {
  if (game.phase !== 'active') return null;
  const table = currentStandings(game);
  const outcome = checkVictory(game, table, now);
  if (!outcome) return null;
  game.phase = 'ended';
  game.armies = [];
  game.strikes = [];
  game.proposals = [];
  game.result = { ...outcome, endedAt: now, duration: now - game.startedAt, standings: table };
  return game.result;
}

function arrive(game, army, now, rng) {
  const target = game.countries[army.to];
  if (target.owner === army.owner) {
    addUnits(target.units, army.units);
    return null;
  }
  // Tropas que vuelven a casa: si su país de origen ya no es suyo, se pierden.
  if (army.returning) return null;

  const defender = target.owner;
  if (defender && army.owner !== null) {
    const rel = relationOf(game.relations, army.owner, defender).state;
    if (rel === 'alliance') {
      // Refuerzo a un aliado: las tropas pasan a defender su país.
      addUnits(target.units, army.units);
      return { id: ++game.seq, ts: now, type: 'reinforce', country: army.to, from: army.owner, to: defender };
    }
    if (rel !== 'war') {
      // Se firmó la paz mientras marchaban: dan media vuelta.
      const from = COUNTRIES.get(army.to);
      const back = COUNTRIES.get(army.from);
      game.armies.push({
        ...army,
        id: ++game.seq,
        from: army.to,
        to: army.from,
        departAt: now,
        arriveAt: now + travelMs(from, back, army.units, playerSpeed(game, army.owner)),
        returning: true,
      });
      return null;
    }
  }

  const before = { ...target.units };
  const result = resolveBattle(army.units, target.units, {
    terrain: terrainOf(army.to),
    capital: Boolean(defender && game.homes[defender] === army.to),
    level: target.level,
    amphibious: COUNTRIES.get(army.from).sea.includes(army.to),
    attackerSupply: supplyOf(game, army.owner),
    defenderSupply: defender ? supplyOf(game, defender) : {},
    attackBonus: techBonus.attack(game.players[army.owner]?.tech),
    defenseBonus: defender ? techBonus.defense(game.players[defender]?.tech) : 1,
  }, rng);

  const event = {
    id: ++game.seq,
    ts: now,
    type: 'battle',
    country: army.to,
    from: army.from,
    attacker: army.owner,
    defender,
    attackerWins: result.attackerWins,
    attackerLosses: diffUnits(army.units, result.attackersLeft),
    defenderLosses: diffUnits(before, result.defendersLeft),
    capitalTaken: false,
  };

  const attackerStats = game.players[army.owner]?.stats;
  const defenderStats = game.players[defender]?.stats;
  if (attackerStats) {
    attackerStats[result.attackerWins ? 'battlesWon' : 'battlesLost']++;
    attackerStats.unitsLost += totalUnits(event.attackerLosses);
    if (result.attackerWins) attackerStats.conquests++;
  }
  if (defenderStats) {
    defenderStats[result.attackerWins ? 'battlesLost' : 'battlesWon']++;
    defenderStats.unitsLost += totalUnits(event.defenderLosses);
  }

  if (result.attackerWins) {
    target.formerNeutral = defender === null; // la IA intentará recuperarlo
    target.conqueredAt = now;
    target.owner = army.owner;
    target.units = result.attackersLeft;
    target.training = [];
    target.developing = null;
    target.level = Math.max(1, target.level - 1); // la guerra destruye infraestructura
    if (defender && game.homes[defender] === army.to) {
      delete game.homes[defender];
      event.capitalTaken = true;
    }
  } else {
    target.units = result.defendersLeft;
  }
  pushEvent(game, event);
  return event;
}

// Un jugador sin países ni tropas en marcha queda eliminado.
function checkEliminations(game, now) {
  const events = [];
  for (const [pid, player] of Object.entries(game.players)) {
    if (player.eliminated) continue;
    const hasCountry = Object.values(game.countries).some((c) => c.owner === pid);
    const hasArmy = game.armies.some((a) => a.owner === pid);
    if (!hasCountry && !hasArmy) {
      player.eliminated = true;
      player.research = null;
      forgetPlayer(game, pid);
      const event = { id: ++game.seq, ts: now, type: 'eliminated', player: pid };
      pushEvent(game, event);
      events.push(event);
    }
  }
  return events;
}

function pushEvent(game, event) {
  game.events.push(event);
  if (game.events.length > EVENT_HISTORY) game.events.shift();
}

function diffUnits(before, after) {
  const d = emptyUnits();
  for (const t of UNIT_TYPES) d[t] = before[t] - after[t];
  return d;
}

function scaleCost(cost, count) {
  return Object.fromEntries(Object.entries(cost).map(([r, v]) => [r, v * count]));
}

/** Un jugador abandona: sus países vuelven a ser neutrales (con sus tropas) y sus ejércitos se disuelven. */
export function releasePlayer(game, playerId) {
  for (const c of Object.values(game.countries)) {
    if (c.owner === playerId) {
      c.owner = null;
      c.training = [];
      c.developing = null;
    }
  }
  game.armies = game.armies.filter((a) => a.owner !== playerId);
  game.strikes = game.strikes.filter((s) => s.owner !== playerId);
  forgetPlayer(game, playerId);
  delete game.homes[playerId];
  delete game.picks[playerId];
  delete game.players[playerId];
}

// ---------- Vistas ----------

export function publicGame(game) {
  return {
    phase: game.phase,
    pickDeadline: game.pickDeadline,
    startedAt: game.startedAt,
    speed: game.speed,
    homes: game.homes,
    picks: game.picks,
    countries: encodeCountries(game.countries),
    armies: game.armies,
    strikes: game.strikes,
    events: game.events,
    relations: game.relations,
    victory: game.victory,
    result: game.result,
    eliminated: Object.fromEntries(Object.entries(game.players).map(([id, p]) => [id, p.eliminated])),
  };
}

/** Lo que solo ve cada jugador: recursos, ingresos y mantenimiento por minuto. */
export function privateGame(game, playerId) {
  const player = game.players[playerId];
  if (!player) return null;
  const round = (obj, decimals = 0) => Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, decimals ? Math.round(v * 10) / 10 : Math.floor(v)]),
  );
  return {
    resources: round(player.resources),
    income: round(incomeFor(game, playerId), 1),
    upkeep: round(upkeepFor(game, playerId), 1),
    supply: supplyOf(game, playerId),
    eliminated: player.eliminated,
    tech: player.tech,
    unlocked: player.unlocked,
    cooldowns: player.cooldowns,
    research: player.research,
    proposals: game.proposals.filter((p) => p.from === playerId || p.to === playerId),
  };
}

/** Privado + clasificación (se envía cada segundo). La clasificación se calcula una vez por sala. */
export function privateGameWithStandings(game, playerId, table = null) {
  const data = privateGame(game, playerId);
  if (data) data.standings = game.result?.standings ?? table ?? currentStandings(game);
  return data;
}

// ---------- Reparto automático ----------

// Elige un país libre lo más alejado posible de los demás jugadores.
function autoPick(game, playerId, rng) {
  const taken = Object.entries({ ...game.picks, ...game.homes })
    .filter(([pid]) => pid !== playerId)
    .map(([, cid]) => cid);
  const distance = distancesFrom(taken);

  const free = WORLD.countries.filter((c) => !isBlockedFor(game, playerId, c.id));
  const viable = free.filter((c) => c.area >= MIN_START_AREA_KM2 && economyRating(c.id) >= 1);
  const pool = viable.length ? viable : free;

  for (let minDist = PREFERRED_START_DISTANCE; minDist >= 0; minDist--) {
    const candidates = pool.filter((c) => (distance.get(c.id) ?? Infinity) >= minDist);
    if (candidates.length) return candidates[Math.floor(rng() * candidates.length)].id;
  }
  const any = WORLD.countries.filter((c) => !taken.includes(c.id));
  return any[Math.floor(rng() * any.length)].id;
}

// BFS multiorigen: saltos de frontera desde el país tomado más cercano.
function distancesFrom(sources) {
  const dist = new Map(sources.map((id) => [id, 0]));
  const queue = [...sources];
  while (queue.length) {
    const id = queue.shift();
    for (const n of COUNTRIES.get(id).neighbors) {
      if (!dist.has(n)) {
        dist.set(n, dist.get(id) + 1);
        queue.push(n);
      }
    }
  }
  return dist;
}

