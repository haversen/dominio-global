import { readFileSync } from 'node:fs';
import {
  STARTING_RESOURCES, MAX_LEVEL, RESOURCES, countryIncome, developCost, developMs, canAfford,
  addResources, emptyResources, economyRating,
} from '../shared/economy.js';
import {
  UNITS, UNIT_TYPES, GAME_SPEEDS, emptyUnits, addUnits, totalUnits, neutralGarrison, startingArmy,
  moveError, travelMs, resolveBattle, terrainOf, WEAPONS, interceptChance, strikeDamage, paceScale, isNavalRoute,
  MAX_RECRUIT, BATCH_TIME_STEP,
} from '../shared/military.js';
import { SCENARIOS, DEFAULT_SCENARIO, scenarioOf, inScenario, scenarioArea, eraOf, hasSpaceVictory } from '../shared/scenarios.js';
import { unitLabel, weaponLabel, weaponAllowed, spaceAllowed, strategicSpec } from '../shared/eras.js';
import {
  TECHS, TECH_MAX_LEVEL, TECH_TREE, emptyTech, techCost, techMs, techBonus, startingUnlocks, isUnlocked,
  nodeError, treeBonus, DOCTRINE_BRANCH,
} from '../shared/tech.js';
import {
  BUILDINGS, buildError, buildingCost, buildingMs, buildingIncome, trainFactor, bunkerFactor, damageBuildings,
} from '../shared/buildings.js';
import { relationOf, tickDiplomacy, forgetPlayer, setRelation } from './diplomacy.js';
import { hasTeams, sideCountries } from '../shared/teams.js';
import { createAIState, tickAI } from './ai.js';
import { standings, checkVictory } from './victory.js';
import { encodeCountries } from '../shared/wire.js';
import { DEFAULT_PRESIDENT, PRESIDENTS, leaderBonus, discountCost } from '../shared/leaders.js';
import { createMarket, tickMarket, forgetOffers, publicMarket } from './market.js';
import { tickLoans, publicLoans } from './loans.js';
import { needOf, hasAccess, missingText } from '../shared/strategic.js';
import { runSpyMission } from './espionage.js';
import { createWorld, tickWorld, worldEffects, isSanctioned, nukesBanned, addNews, voteUN } from './world.js';
import { assignMissions, checkMissions, missionProgress } from './missions.js';
import { SPACE_STAGES, MISSIONS, FIRST_EVENT_MS, UN_FIRST_MS } from '../shared/world.js';

// Mapa del mundo generado por scripts/build-world.js.
export const WORLD = JSON.parse(readFileSync(new URL('../shared/world.json', import.meta.url), 'utf8'));
export const COUNTRIES = new Map(WORLD.countries.map((c) => [c.id, c]));
// Mapas con países recortados (la Rusia europea en el mapa de Europa): mismo país, otro contorno y otro centro.
const VARIANT_COUNTRIES = Object.fromEntries(Object.entries(WORLD.variants ?? {}).map(([name, list]) => {
  const map = new Map(COUNTRIES);
  for (const [id, v] of Object.entries(list)) map.set(id, { ...COUNTRIES.get(id), ...v });
  return [name, map];
}));
/** Los países tal como son en el mapa de esta partida (para distancias y tiempos de viaje). */
export const countriesFor = (game) => VARIANT_COUNTRIES[scenarioOf(game.scenario).variant] ?? COUNTRIES;
// Superficie total de cada mapa (para el % de dominación).
const TOTAL_AREA = Object.fromEntries(Object.keys(SCENARIOS).map((id) => [id,
  WORLD.countries.filter((c) => inScenario(id, c.id)).reduce((sum, c) => sum + scenarioArea(id, c), 0)]));
const playable = (game, countryId) => inScenario(game.scenario, countryId);

export const PICK_DURATION_MS = 60_000;

// Estabilidad de los países conquistados (0-100) y rebeliones.
export const STABILITY = {
  start: 100,           // capital y países iniciales
  fromNeutral: 40,      // recién conquistado a la IA
  fromPlayer: 25,       // recién conquistado a otro jugador
  perMinute: 4,         // se recupera con el tiempo...
  garrisonBonus: 4,     // ...y más rápido con al menos 5 tropas dentro
  emptyPenalty: 6,      // sin tropas se desmorona
  strikeHit: 20,        // un bombardeo baja la estabilidad
  revoltBelow: 25,      // por debajo de esto puede haber revueltas
  checkMs: 30_000,      // cada cuánto se comprueba (velocidad normal)
};
// Cansancio de guerra: cada unidad perdida cansa a la población y baja los ingresos.
export const WEARINESS = { perUnitLost: 0.004, max: 0.4, decayPerMinute: 0.02 };
export const MAX_BATCH = MAX_RECRUIT;
const MIN_START_AREA_KM2 = 150_000;
const PREFERRED_START_DISTANCE = 3;
const EVENT_HISTORY = 30;

/**
 * Estado de la partida (tiempo real; el servidor avanza el reloj con tickGame):
 *   phase:     'picking' | 'active' | 'ended'
 *   countries: { [id]: { owner, level, units, training: [{type, count, readyAt}], developing,
 *                        buildings: { tipo: nivel }, constructing: { type, toLevel, readyAt } | null } }
 *   armies:    [{ id, owner, from, to, units, departAt, arriveAt }]   tropas en marcha
 *   events:    últimas batallas y eliminaciones (para avisos y animaciones)
 *   homes:     { [playerId]: countryId }  capital de cada jugador (se pierde si la conquistan)
 *   players:   { [playerId]: { resources, eliminated, tech, unlocked, research: { rama: {...} }, cooldowns } }  (privado)
 *   strikes:   [{ id, owner, weapon, from, to, departAt, arriveAt }]  bombas en vuelo
 *   relations: { 'a|b': { state, until } }  diplomacia entre jugadores (por defecto, paz)
 *   proposals: [{ id, type, from, to, expiresAt, trade? }]  propuestas pendientes (privadas)
 *   market:    { prices, history, offers, nextSample }  bolsa y ofertas entre jugadores
 *
 * profiles: { [playerId]: { president, country } } elegidos en la sala antes de empezar.
 */
export function createGame(settings, playerIds, { now = Date.now(), rng = Math.random, profiles = {} } = {}) {
  const scenario = SCENARIOS[settings.mapScenario] ? settings.mapScenario : DEFAULT_SCENARIO;
  const game = {
    phase: 'picking',
    speed: GAME_SPEEDS[settings.gameSpeed] ?? 1,
    scenario,
    pace: paceScale(settings.troopPace), // cuántas veces más rápido que la vida real se mueven las tropas
    fog: settings.fogOfWar === true,     // niebla de guerra: cada jugador solo ve cerca de lo suyo
    countries: Object.fromEntries(WORLD.countries.map((c) => [c.id, {
      owner: null,
      level: 1,
      // Los países fuera del mapa elegido quedan vacíos y no se pueden pisar.
      units: inScenario(scenario, c.id) ? neutralGarrison(c, economyRating(c.id)) : emptyUnits(),
      training: [],
      developing: null,
      buildings: {},
      constructing: null,
    }])),
    homes: {},
    picks: {},
    pickDeadline: null,
    players: Object.fromEntries(playerIds.map((id) => [id, {
      resources: { ...STARTING_RESOURCES },
      eliminated: false,
      tech: emptyTech(),
      unlocked: startingUnlocks(), // nodos del árbol tecnológico investigados
      research: {},                // rama -> { tech, toLevel, readyAt } o { node, readyAt } (una por rama)
      cooldowns: {},               // arma -> momento en que se puede volver a lanzar
      president: PRESIDENTS[profiles[id]?.president] ? profiles[id].president : DEFAULT_PRESIDENT,
      stats: { battlesWon: 0, battlesLost: 0, conquests: 0, unitsLost: 0 },
      intel: {},                   // país -> hasta cuándo lo revela un espía
      space: { stage: 0 },         // carrera espacial: 0 nada, 1 satélite, 2 estación, 3 Luna
      mission: null,               // misión secreta (se reparte al empezar)
    }])),
    startPlayers: playerIds.length,
    victory: {
      domination: settings.winDomination ? settings.dominationPercent : null,
      lastStanding: Boolean(settings.winLastStanding),
      timeLimitMs: settings.winTimeLimit ? settings.timeLimitMinutes * 60_000 : null,
      // La victoria científica solo existe en la Guerra Fría; en los demás mapas la Luna da puntos.
      space: settings.winSpace === true && hasSpaceVictory(settings.mapScenario),
      mission: settings.winMission === true,
    },
    result: null,
    relations: {},
    loans: [],
    proposals: [],
    armies: [],
    strikes: [],
    events: [],
    seq: 0,
    startedAt: null,
    lastTick: now,
  };

  game.ai = createAIState(settings.aiDifficulty, game.countries, now);
  game.market = createMarket(now);
  game.world = createWorld(settings, now);

  // Los países elegidos en la sala se respetan (si siguen siendo válidos).
  for (const id of playerIds) {
    const wanted = profiles[id]?.country;
    if (wanted && COUNTRIES.has(wanted) && !isBlockedFor(game, id, wanted)) game.picks[id] = wanted;
  }

  // Partida por equipos: los compañeros empiezan aliados (y no pueden romper la alianza).
  game.teamMode = settings.teams ?? 'none';
  game.capitalRule = settings.capitalCapture ?? 'empire';
  game.teams = hasTeams(settings)
    ? Object.fromEntries(playerIds.map((id) => [id, profiles[id]?.team ?? null]))
    : null;
  if (game.teams) {
    for (const a of playerIds) {
      for (const b of playerIds) {
        if (a < b && game.teams[a] && game.teams[a] === game.teams[b]) setRelation(game, a, b, 'alliance');
      }
    }
    game.startTeams = new Set(Object.values(game.teams).filter(Boolean)).size;
  }
  if (settings.countryAssignment === 'choose' && !allPicked(game, playerIds)) {
    game.pickDeadline = now + PICK_DURATION_MS;
  } else {
    finishPicking(game, playerIds, rng, now);
  }
  return game;
}

// ---------- Elección de país ----------

/**
 * Países que un jugador no puede elegir: los que están fuera del mapa, los ya tomados por otros
 * y sus vecinos (en los escenarios históricos sí se puede empezar al lado de otro jugador).
 */
export function isBlockedFor(game, playerId, countryId) {
  if (!playable(game, countryId)) return true;
  const neighborsOk = scenarioOf(game.scenario).allowNeighbors;
  for (const [pid, taken] of Object.entries({ ...game.picks, ...game.homes })) {
    if (pid === playerId) continue;
    if (taken === countryId) return true;
    if (!neighborsOk && COUNTRIES.get(taken).neighbors.includes(countryId)) return true;
  }
  return false;
}

/** Devuelve un mensaje de error o null si la elección es válida. */
export function pickCountry(game, playerId, countryId) {
  if (game.phase !== 'picking') return 'Ya no se pueden elegir países';
  if (!COUNTRIES.has(countryId)) return 'Ese país no existe';
  if (!playable(game, countryId)) return 'Ese país no forma parte de este mapa';
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
    country.stability = STABILITY.start;
  }
  game.picks = {};
  game.pickDeadline = null;
  game.phase = 'active';
  game.nextStabilityCheck = now + STABILITY.checkMs;
  assignMissions(game, playerIds.filter((id) => game.players[id]), rng, { playable: (id) => playable(game, id) });
  if (game.world) {
    game.world.nextEventAt = now + FIRST_EVENT_MS / game.speed;
    game.world.nextSessionAt = now + UN_FIRST_MS / game.speed;
  }
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
      // Un país inestable produce menos (al 50 % con estabilidad 0).
      const k = stabilityFactor(c);
      const income = countryIncome(COUNTRIES.get(id), c.level, game.homes[c.owner] === id);
      addResources(income, buildingIncome(c.buildings));
      for (const r of RESOURCES) t.income[r] += income[r] * k;
    }
    addUnits(t.units, c.units);
  }
  for (const a of game.armies) if (a.owner && game.players[a.owner]) addUnits(entry(a.owner).units, a.units);
  return totals;
}

const bonusOf = (game, playerId) => leaderBonus(game.players[playerId]?.president);
const stabilityFactor = (c) => 0.5 + (c.stability ?? 100) / 200;

/** El jugador y sus aliados (comparten recursos estratégicos y visión). */
export function friendsOf(game, playerId) {
  const friends = new Set([playerId]);
  for (const pid of Object.keys(game.players)) {
    if (pid !== playerId && relationOf(game.relations, playerId, pid).state === 'alliance') friends.add(pid);
  }
  return friends;
}

/** Error si al jugador le falta el recurso estratégico que necesita una unidad o arma. */
export function strategicError(game, playerId, what) {
  const need = needOf(what);
  if (!need) return null;
  const ok = hasAccess(need, (id) => game.countries[id]?.owner, friendsOf(game, playerId), (id) => playable(game, id));
  return ok ? null : missingText(need, strategicSpec(need, eraOf(game.scenario)));
}

function applyIncomeTech(game, playerId, raw) {
  const weariness = game.players[playerId]?.weariness ?? 0;
  const sanctions = isSanctioned(game, playerId, game.lastTick) ? 0.8 : 1; // sanciones de la ONU
  const mult = techBonus.income(game.players[playerId]?.tech) * bonusOf(game, playerId).income * (1 - weariness) * sanctions;
  const world = worldEffects(game, game.lastTick).income; // eventos mundiales
  const total = emptyResources();
  for (const r of RESOURCES) total[r] = (raw?.[r] ?? 0) * mult * world[r];
  return total;
}

// La estación espacial acelera todas las investigaciones.
const researchFactor = (game, playerId) => bonusOf(game, playerId).researchMs * ((game.players[playerId]?.space?.stage ?? 0) >= 2 ? 0.8 : 1);

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
    return `Primero tienes que investigar ${unitLabel(type, eraOf(game.scenario))} en el árbol tecnológico`;
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH) return `Puedes reclutar de 1 a ${MAX_BATCH} unidades`;
  if (unit.domain === 'sea' && !COUNTRIES.get(countryId).coastal) return 'Los barcos solo se construyen en países con costa';
  const missing = strategicError(game, playerId, { unit: type });
  if (missing) return missing;

  const cost = scaleCost(discountCost(unit.cost, bonusOf(game, playerId).cost), count);
  const player = game.players[playerId];
  if (!canAfford(player.resources, cost)) return 'No tienes recursos suficientes';

  addResources(player.resources, cost, -1);
  // El cuartel del país y las modificaciones del árbol acortan el entrenamiento.
  const ms = unit.trainMs * (1 + (count - 1) * BATCH_TIME_STEP) * trainFactor(country.buildings)
    * (treeBonus(player.unlocked).train[unit.class] ?? 1) * worldEffects(game, now).train;
  country.training.push({ type, count, readyAt: now + Math.round(ms / game.speed) });
  return null;
}

/** Construye (o mejora) un edificio en un país propio. */
export function build(game, playerId, countryId, type, now = Date.now()) {
  if (game.phase !== 'active') return 'La partida todavía no está en marcha';
  const country = game.countries[countryId];
  if (!country) return 'Ese país no existe';
  if (country.owner !== playerId) return 'Solo puedes construir en tus propios países';
  country.buildings ??= {};
  const error = buildError(country, type);
  if (error) return error;
  const toLevel = (country.buildings[type] ?? 0) + 1;
  const player = game.players[playerId];
  const cost = discountCost(buildingCost(type, toLevel), bonusOf(game, playerId).cost);
  if (!canAfford(player.resources, cost)) return 'No tienes recursos suficientes';

  addResources(player.resources, cost, -1);
  country.constructing = { type, toLevel, readyAt: now + Math.round(buildingMs(toLevel) / game.speed) };
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
  const cost = discountCost(developCost(country.level), bonusOf(game, playerId).cost);
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
  normalizeResearch(player);
  if (player.research[DOCTRINE_BRANCH.id]) return 'Ya estás investigando otra doctrina';
  const toLevel = player.tech[tech] + 1;
  if (toLevel > TECH_MAX_LEVEL) return 'Esa tecnología ya está al máximo';
  const cost = techCost(toLevel);
  if (!canAfford(player.resources, cost)) return 'No tienes recursos suficientes';

  addResources(player.resources, cost, -1);
  const ms = techMs(toLevel) * researchFactor(game, playerId);
  player.research[DOCTRINE_BRANCH.id] = { tech, toLevel, readyAt: now + Math.round(ms / game.speed) };
  return null;
}

/** Investiga un nodo del árbol tecnológico (desbloquea una unidad o un arma). */
export function researchNode(game, playerId, nodeId, now = Date.now()) {
  if (game.phase !== 'active') return 'La partida todavía no está en marcha';
  const player = game.players[playerId];
  if (!player || player.eliminated) return 'Jugador no válido';
  const error = nodeError(player.unlocked, nodeId);
  if (error) return error;
  const node = TECH_TREE[nodeId];
  if (node.unlocks?.weapon && !weaponAllowed(node.unlocks.weapon, eraOf(game.scenario))) return 'Eso no existe en esta época';
  normalizeResearch(player);
  if (player.research[node.branch]) return 'Ya estás investigando otra cosa en esta rama';
  if (!canAfford(player.resources, node.cost)) return 'No tienes recursos suficientes';

  addResources(player.resources, node.cost, -1);
  const ms = node.ms * researchFactor(game, playerId);
  player.research[node.branch] = { node: nodeId, readyAt: now + Math.round(ms / game.speed) };
  return null;
}

/** Siguiente etapa de la carrera espacial (satélite, estación, Luna). Usa su propio hueco de investigación. */
export function researchSpace(game, playerId, now = Date.now()) {
  if (game.phase !== 'active') return 'La partida todavía no está en marcha';
  const player = game.players[playerId];
  if (!player || player.eliminated) return 'Jugador no válido';
  if (!spaceAllowed(eraOf(game.scenario))) return 'En esta época no existe la carrera espacial';
  normalizeResearch(player);
  player.space ??= { stage: 0 };
  const stage = SPACE_STAGES[player.space.stage];
  if (!stage) return 'Ya has llegado a la Luna';
  if (player.research.space) return 'Tu programa espacial ya está trabajando en una misión';
  if (stage.requires.some((r) => !player.unlocked.includes(r))) {
    return 'Primero investiga los bombarderos (Aviación II) y el misil balístico (Bombas II)';
  }
  if (stage.minCountries && Object.values(game.countries).filter((c) => c.owner === playerId).length < stage.minCountries) {
    return `Necesitas controlar al menos ${stage.minCountries} países para financiar la misión`;
  }
  const cost = discountCost(stage.cost, bonusOf(game, playerId).cost);
  if (!canAfford(player.resources, cost)) return 'No tienes recursos suficientes';
  addResources(player.resources, cost, -1);
  player.research.space = { space: player.space.stage + 1, readyAt: now + Math.round((stage.ms * researchFactor(game, playerId)) / game.speed) };
  return null;
}

/** Voto en la ONU. */
export function voteInUN(game, playerId, vote) {
  if (game.phase !== 'active') return 'La partida todavía no está en marcha';
  return voteUN(game, playerId, vote);
}

// Partidas guardadas con la versión anterior: una sola investigación en `research`.
function normalizeResearch(player) {
  const r = player.research;
  if (!r) player.research = {};
  else if ('readyAt' in r) player.research = { [r.node ? TECH_TREE[r.node].branch : DOCTRINE_BRANCH.id]: r };
  player.space ??= { stage: 0 };
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
      if (!dist.has(n) && playable(game, n)) {
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
  const era = eraOf(game.scenario);
  if (!weaponAllowed(weapon, era)) return { error: 'Esa arma no existe en esta época' };
  if (!isUnlocked(player.unlocked, { weapon })) return { error: `Primero tienes que investigar: ${weaponLabel(weapon, era)}` };
  const target = game.countries[targetId];
  if (!target) return { error: 'Ese país no existe' };
  if (!playable(game, targetId)) return { error: 'Ese país no forma parte de este mapa' };
  if (target.owner === playerId) return { error: 'No puedes bombardear tus propios países' };
  if (target.owner) {
    const rel = relationOf(game.relations, playerId, target.owner).state;
    if (rel !== 'war') return { error: 'Solo puedes bombardear a jugadores con los que estás en guerra' };
  }
  if ((player.cooldowns[weapon] ?? 0) > now) return { error: 'Esa arma todavía se está recargando' };
  if (weapon === 'nuke' && nukesBanned(game, now)) return { error: 'La ONU ha prohibido las armas nucleares por ahora' };
  const missing = strategicError(game, playerId, { weapon });
  if (missing) return { error: missing };
  const reach = hopsFromPlayer(game, playerId, spec.range).get(targetId);
  if (!reach) return { error: `Fuera de alcance: ${weaponLabel(weapon, era)} llega a ${spec.range} país(es) de distancia` };
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
  if (weapon === 'nuke' && game.world) game.world.offender = playerId; // la ONU votará sanciones
  if (weapon === 'nuke') player.stats.nukes = (player.stats.nukes ?? 0) + 1;
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
    intercepted: rng() < interceptChance(target.units, strike.weapon,
      target.owner ? treeBonus(game.players[target.owner]?.unlocked).intercept : 1),
    losses: emptyUnits(),
    levelsLost: 0,
  };
  if (!event.intercepted) {
    const extraKill = treeBonus(game.players[strike.owner]?.unlocked).bombKill;
    const { unitsLeft, levelsLost } = strikeDamage(target.units, strike.weapon, rng, extraKill);
    for (const t of UNIT_TYPES) event.losses[t] = target.units[t] - unitsLeft[t];
    target.units = unitsLeft;
    event.levelsLost = Math.min(levelsLost, target.level - 1);
    target.level -= event.levelsLost;
    target.buildings = damageBuildings(target.buildings, levelsLost);
    if (target.owner) target.stability = Math.max(0, (target.stability ?? 100) - STABILITY.strikeHit * (spec.contaminationMs ? 2.5 : 1));
    if (spec.contaminationMs) {
      target.contaminatedUntil = now + Math.round(spec.contaminationMs / game.speed);
      target.buildings = {};
      target.constructing = null;
    }
    const stats = game.players[target.owner]?.stats;
    if (stats) stats.unitsLost += totalUnits(event.losses);
    addWeariness(game, target.owner, totalUnits(event.losses));
  }
  pushEvent(game, event);
  return event;
}

// Lo rápido que se mueven las tropas de un jugador: velocidad de juego × ritmo de tropas × logística.
function playerSpeed(game, playerId) {
  return game.speed * (game.pace ?? paceScale()) * techBonus.speed(game.players[playerId]?.tech);
}
const speedMods = (game, playerId) => treeBonus(game.players[playerId]?.unlocked).speed;

/** Misión de espionaje. Devuelve { error } o el resultado (ver espionage.js). */
export function spy(game, playerId, mission, countryId, now = Date.now(), rng = Math.random) {
  if (game.countries[countryId] && !playable(game, countryId)) return { error: 'Ese país no forma parte de este mapa' };
  const result = runSpyMission(game, playerId, mission, countryId, { now, rng, COUNTRIES, nextId: () => ++game.seq });
  if (result.event) pushEvent(game, result.event);
  if (result.success) {
    const stats = game.players[playerId].stats;
    stats.spySuccess = (stats.spySuccess ?? 0) + 1;
  }
  return result;
}

/** Envía tropas a un país vecino. Devuelve { error } o { army }. */
export function moveArmy(game, playerId, fromId, toId, rawUnits, now = Date.now()) {
  if (game.phase !== 'active') return { error: 'La partida todavía no está en marcha' };
  const source = game.countries[fromId];
  const from = countriesFor(game).get(fromId);
  const to = countriesFor(game).get(toId);
  if (!source || !from || !to) return { error: 'País desconocido' };
  if (!playable(game, toId)) return { error: 'Ese país no forma parte de este mapa' };
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
  let duration = travelMs(from, to, units, playerSpeed(game, playerId), speedMods(game, playerId));
  if (from.sea.includes(toId) || isNavalRoute(from, to)) duration *= worldEffects(game, now).sea; // huracanes
  const army = {
    id: ++game.seq,
    owner: playerId,
    from: fromId,
    to: toId,
    units,
    departAt: now,
    arriveAt: now + Math.round(duration),
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

  if (minutes > 0) {
    const revolts = tickStability(game, minutes, now, rng);
    if (revolts.length) {
      events.push(...revolts);
      events.push(...checkEliminations(game, now));
      changed = true;
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
    if (country.constructing && country.constructing.readyAt <= now) {
      const { type, toLevel } = country.constructing;
      country.buildings = { ...country.buildings, [type]: toLevel };
      country.constructing = null;
      changed = true;
    }
  }

  for (const [pid, player] of Object.entries(game.players)) {
    normalizeResearch(player);
    for (const [branch, r] of Object.entries(player.research)) {
      if (r.readyAt > now) continue;
      if (r.node) player.unlocked.push(r.node);
      else if (r.space) {
        player.space.stage = r.space;
        const stage = SPACE_STAGES[r.space - 1];
        const news = addNews(game, {
          ts: now, kind: 'space', icon: stage.icon, headline: `${stage.label.toUpperCase()}`,
          text: `{player} completa su misión espacial: ${stage.label.toLowerCase()}.`, vars: { player: pid },
        });
        events.push({ type: 'space', player: pid, stage: r.space, news });
        changed = true;
      } else player.tech[r.tech] = r.toLevel;
      events.push({ type: 'research', player: pid, ...r });
      delete player.research[branch];
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

  if (tickAI(game, countriesFor(game), now)) changed = true;
  if (tickMarket(game, now)) changed = true;
  // Préstamos: caducan peticiones y se cobran los vencidos.
  const loanCount = game.loans?.length ?? 0;
  for (const e of tickLoans(game, now)) {
    events.push(e);
    changed = true;
  }
  if ((game.loans?.length ?? 0) !== loanCount) changed = true;

  // Eventos mundiales y ONU.
  for (const e of tickWorld(game, now, rng, worldCtx(game))) {
    changed = true;
    if (e.type !== 'world-changed') events.push(e);
  }
  // Misiones secretas cumplidas (se revelan a todos).
  for (const { player, mission } of checkMissions(game, missionCtx(game))) {
    const news = addNews(game, {
      ts: now, kind: 'mission', icon: MISSIONS[mission.type].icon, headline: 'MISIÓN SECRETA CUMPLIDA',
      text: '{player} revela su objetivo oculto y lo ha conseguido.', vars: { player },
    });
    events.push({ type: 'mission', player, mission, news });
    changed = true;
  }

  const ended = checkEnd(game, now);
  if (ended) changed = true;
  return { changed, events, ended };
}

/** Clasificación actual de la partida. */
export function currentStandings(game) {
  const scenario = game.scenario ?? DEFAULT_SCENARIO;
  return standings(game, (id) => scenarioArea(scenario, COUNTRIES.get(id)), TOTAL_AREA[scenario] ?? TOTAL_AREA.world);
}

const worldCtx = (game) => ({
  playable: (id) => playable(game, id),
  alivePlayers: () => Object.keys(game.players).filter((id) => !game.players[id].eliminated),
  ownedBy: (pid) => Object.keys(game.countries).filter((id) => game.countries[id].owner === pid),
  isCapital: (id) => Object.values(game.homes).includes(id),
  standings: () => currentStandings(game),
});
const missionCtx = (game) => ({ playable: (id) => playable(game, id), COUNTRIES });

/** Si se cumple alguna condición de victoria, termina la partida. Devuelve el resultado o null. */
export function checkEnd(game, now = Date.now()) {
  if (game.phase !== 'active') return null;
  const table = currentStandings(game);
  const alive = Object.entries(game.players).filter(([, p]) => !p.eliminated);
  // Victoria científica (llegar a la Luna) y por misión secreta, si están activadas.
  const spaceWinner = game.victory.space && alive.find(([, p]) => (p.space?.stage ?? 0) >= SPACE_STAGES.length);
  const missionWinner = game.victory.mission && alive.find(([, p]) => p.mission?.done);
  const outcome = spaceWinner ? { winner: spaceWinner[0], reason: 'space' }
    : missionWinner ? { winner: missionWinner[0], reason: 'mission' }
    : checkVictory(game, table, now);
  if (!outcome) return null;
  // Por equipos gana todo el equipo del ganador.
  if (game.teams && outcome.winner) {
    outcome.team = outcome.team ?? game.teams[outcome.winner];
    outcome.winners = Object.keys(game.teams).filter((id) => game.teams[id] === outcome.team);
  } else {
    outcome.winners = outcome.winner ? [outcome.winner] : [];
  }
  game.phase = 'ended';
  game.armies = [];
  game.strikes = [];
  game.proposals = [];
  if (game.market) game.market.offers = [];
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
      const from = countriesFor(game).get(army.to);
      const back = countriesFor(game).get(army.from);
      game.armies.push({
        ...army,
        id: ++game.seq,
        from: army.to,
        to: army.from,
        departAt: now,
        arriveAt: now + travelMs(from, back, army.units, playerSpeed(game, army.owner), speedMods(game, army.owner)),
        returning: true,
      });
      return null;
    }
  }

  const before = { ...target.units };
  const attackerTree = treeBonus(game.players[army.owner]?.unlocked);
  const defenderTree = defender ? treeBonus(game.players[defender]?.unlocked) : null;
  const result = resolveBattle(army.units, target.units, {
    terrain: terrainOf(army.to),
    capital: Boolean(defender && game.homes[defender] === army.to),
    level: target.level,
    amphibious: (COUNTRIES.get(army.from).sea.includes(army.to) || isNavalRoute(COUNTRIES.get(army.from), COUNTRIES.get(army.to)))
      && !attackerTree.amphibious,
    attackerMods: attackerTree.attack,
    defenderMods: defenderTree?.defense ?? {},
    attackerSupply: supplyOf(game, army.owner),
    defenderSupply: defender ? supplyOf(game, defender) : {},
    attackBonus: techBonus.attack(game.players[army.owner]?.tech) * bonusOf(game, army.owner).attack,
    defenseBonus: (defender ? techBonus.defense(game.players[defender]?.tech) * bonusOf(game, defender).defense : 1)
      * bunkerFactor(target.buildings),
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
    attackerUnits: { ...army.units },
    defenderUnits: before,
    report: result.report,
    capitalTaken: false,
  };

  const attackerStats = game.players[army.owner]?.stats;
  const defenderStats = game.players[defender]?.stats;
  addWeariness(game, army.owner, totalUnits(event.attackerLosses));
  addWeariness(game, defender, totalUnits(event.defenderLosses));
  if (attackerStats) {
    attackerStats[result.attackerWins ? 'battlesWon' : 'battlesLost']++;
    attackerStats.unitsLost += totalUnits(event.attackerLosses);
    if (result.attackerWins) attackerStats.conquests++;
    if (result.attackerWins && defender) attackerStats.playerConquests = (attackerStats.playerConquests ?? 0) + 1;
  }
  if (defenderStats) {
    defenderStats[result.attackerWins ? 'battlesLost' : 'battlesWon']++;
    defenderStats.unitsLost += totalUnits(event.defenderLosses);
  }

  if (result.attackerWins) {
    target.formerNeutral = defender === null; // la IA intentará recuperarlo
    target.conqueredAt = now;
    target.owner = army.owner;
    // La población de un país recién conquistado no está contenta: puede sublevarse.
    target.stability = army.owner ? (defender ? STABILITY.fromPlayer : STABILITY.fromNeutral) : undefined;
    target.units = result.attackersLeft;
    target.training = [];
    target.developing = null;
    target.level = Math.max(1, target.level - 1); // la guerra destruye infraestructura
    target.buildings = damageBuildings(target.buildings, 1);
    target.constructing = null;
    if (defender && game.homes[defender] === army.to) {
      delete game.homes[defender];
      event.capitalTaken = true;
      const refuge = game.capitalRule === 'move' ? newCapital(game, defender) : null;
      if (refuge) {
        // Con la regla «trasladar la capital», el gobierno huye a su país más fuerte y sigue luchando.
        game.homes[defender] = refuge;
        event.capitalMoved = refuge;
      } else {
        // Perder la capital elimina al jugador (se comprueba justo después de las llegadas).
        (game.fallen ??= {})[defender] = army.owner;
      }
    }
  } else {
    target.units = result.defendersLeft;
  }
  pushEvent(game, event);
  return event;
}

/** Nueva capital tras perder la anterior: el país más desarrollado, y si empatan, el mejor defendido. */
function newCapital(game, playerId) {
  let best = null;
  let bestScore = -1;
  for (const [id, c] of Object.entries(game.countries)) {
    if (c.owner !== playerId) continue;
    const score = c.level * 1000 + totalUnits(c.units);
    if (score > bestScore) [best, bestScore] = [id, score];
  }
  return best;
}

/**
 * Queda eliminado quien pierde su capital o se queda sin países ni tropas en marcha.
 * Al caer la capital, el resto de su imperio se desmorona: sus países pasan a ser neutrales
 * (conservan sus tropas como guarnición) y sus ejércitos en marcha se disuelven.
 */
function checkEliminations(game, now) {
  const events = [];
  for (const [pid, player] of Object.entries(game.players)) {
    if (player.eliminated) continue;
    const lostCapital = !game.homes[pid];
    const hasCountry = Object.values(game.countries).some((c) => c.owner === pid);
    const hasArmy = game.armies.some((a) => a.owner === pid);
    if (!lostCapital && (hasCountry || hasArmy)) continue;

    player.eliminated = true;
    player.research = {};
    // Quien toma la capital se queda con todo el imperio (y con las tropas que hay dentro).
    // Si la tomaron las fuerzas neutrales, o el conquistador ya no sigue en pie, todo pasa a ser neutral.
    const by = lostCapital ? game.fallen?.[pid] ?? null : null;
    // Con la regla «el imperio se vuelve neutral», nadie hereda nada.
    const heir = game.capitalRule !== 'neutral' && by && game.players[by] && !game.players[by].eliminated ? by : null;
    let annexed = 0;
    for (const c of Object.values(game.countries)) {
      if (c.owner !== pid) continue;
      c.owner = heir;
      c.developing = null;
      c.constructing = null;
      if (heir) {
        annexed++;
        // Un imperio recién anexionado está revuelto: hay que dejar guarnición para que no se subleve.
        c.stability = Math.min(c.stability ?? STABILITY.start, STABILITY.fromPlayer);
      } else {
        c.training = [];
      }
    }
    game.armies = game.armies.filter((a) => a.owner !== pid);
    game.strikes = game.strikes.filter((s) => s.owner !== pid);
    forgetPlayer(game, pid);
    forgetOffers(game, pid);
    const event = {
      id: ++game.seq, ts: now, type: 'eliminated', player: pid,
      ...(lostCapital ? { reason: 'capital', by: game.fallen?.[pid] ?? null, annexed } : {}),
    };
    pushEvent(game, event);
    events.push(event);
  }
  return events;
}

function addWeariness(game, playerId, unitsLost) {
  const player = game.players[playerId];
  if (!player || !unitsLost) return;
  player.weariness = Math.min(WEARINESS.max, (player.weariness ?? 0) + unitsLost * WEARINESS.perUnitLost);
}

/**
 * Estabilidad: se recupera con el tiempo y con guarnición; sin tropas se desmorona.
 * Los países muy inestables (no capitales) pueden sublevarse y volver a ser neutrales.
 */
function tickStability(game, minutes, now, rng) {
  const events = [];
  for (const [id, c] of Object.entries(game.countries)) {
    if (!c.owner || !game.players[c.owner]) continue;
    const garrison = totalUnits(c.units);
    let delta = STABILITY.perMinute;
    if (garrison >= 5) delta += STABILITY.garrisonBonus;
    if (garrison === 0) delta -= STABILITY.perMinute + STABILITY.emptyPenalty;
    c.stability = Math.max(0, Math.min(100, (c.stability ?? 100) + delta * minutes));
  }
  for (const p of Object.values(game.players)) {
    if (p.weariness) p.weariness = Math.max(0, p.weariness - WEARINESS.decayPerMinute * minutes);
  }
  if (now < (game.nextStabilityCheck ?? 0)) return events;
  game.nextStabilityCheck = now + STABILITY.checkMs / game.speed;
  for (const [id, c] of Object.entries(game.countries)) {
    if (!c.owner || game.homes[c.owner] === id || c.stability >= STABILITY.revoltBelow) continue;
    const chance = ((STABILITY.revoltBelow - c.stability) / 100) * 0.5;
    if (rng() >= chance) continue;
    const owner = c.owner;
    // Revuelta: el país vuelve a ser neutral y los rebeldes se suman a lo que quede de guarnición.
    c.owner = null;
    c.training = [];
    c.developing = null;
    c.constructing = null;
    c.stability = undefined;
    c.units.infantry += 3 + Math.floor(rng() * 4);
    c.formerNeutral = false;
    const event = { id: ++game.seq, ts: now, type: 'revolt', country: id, player: owner };
    pushEvent(game, event);
    events.push(event);
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
      c.constructing = null;
    }
  }
  game.armies = game.armies.filter((a) => a.owner !== playerId);
  game.strikes = game.strikes.filter((s) => s.owner !== playerId);
  forgetPlayer(game, playerId);
  forgetOffers(game, playerId);
  delete game.homes[playerId];
  delete game.picks[playerId];
  delete game.players[playerId];
}

// ---------- Vistas ----------

/**
 * Países que ve un jugador con niebla de guerra: los suyos y los de sus aliados, sus vecinos,
 * los destinos de sus ejércitos y los que revelan sus espías. null = lo ve todo.
 */
export function visibleCountries(game, viewerId, now = Date.now()) {
  if (!game.fog || game.phase !== 'active' || !viewerId) return null;
  const viewer = game.players[viewerId];
  // El satélite espía de la carrera espacial lo ve todo.
  if (!viewer || viewer.eliminated || (viewer.space?.stage ?? 0) >= 1) return null;
  const friends = new Set([viewerId]);
  for (const pid of Object.keys(game.players)) {
    if (pid !== viewerId && relationOf(game.relations, viewerId, pid).state === 'alliance') friends.add(pid);
  }
  const seen = new Set();
  for (const [id, c] of Object.entries(game.countries)) {
    if (!friends.has(c.owner)) continue;
    seen.add(id);
    for (const n of COUNTRIES.get(id).neighbors) seen.add(n);
  }
  for (const a of game.armies) if (friends.has(a.owner)) seen.add(a.to);
  for (const [id, until] of Object.entries(viewer.intel ?? {})) if (until > now) seen.add(id);
  return seen;
}

// El informe de batalla (tropas de cada bando y por qué ganó uno) solo lo reciben los dos bandos.
function privateBattle(e, viewerId) {
  if (e.type !== 'battle' || !e.report || viewerId === e.attacker || viewerId === e.defender) return e;
  const { report, attackerUnits, defenderUnits, ...rest } = e;
  return rest;
}

export function publicGame(game, viewerId = null, now = Date.now()) {
  const visible = visibleCountries(game, viewerId, now);
  const canSee = (id) => !visible || visible.has(id);
  return {
    fog: Boolean(visible),
    phase: game.phase,
    scenario: game.scenario ?? DEFAULT_SCENARIO,
    pace: game.pace ?? paceScale(),
    pickDeadline: game.pickDeadline,
    startedAt: game.startedAt,
    speed: game.speed,
    homes: game.homes,
    picks: game.picks,
    countries: encodeCountries(game.countries, visible),
    // Con niebla solo se ven los ejércitos y bombas que salen o llegan a países visibles.
    armies: visible ? game.armies.filter((a) => a.owner === viewerId || canSee(a.from) || canSee(a.to)) : game.armies,
    strikes: visible ? game.strikes.filter((x) => x.owner === viewerId || canSee(x.to)) : game.strikes,
    events: viewerId ? game.events.map((e) => privateBattle(e, viewerId)) : game.events,
    relations: game.relations,
    teams: game.teams ?? null,
    capitalRule: game.capitalRule ?? 'empire',
    market: publicMarket(game.market),
    loans: publicLoans(game),
    presidents: Object.fromEntries(Object.entries(game.players).map(([id, p]) => [id, p.president])),
    victory: game.victory,
    result: game.result,
    world: game.world ? {
      events: game.world.events,
      un: game.world.un,
      active: game.world.active,
      news: game.world.news.slice(-15),
      session: game.world.session && {
        ...game.world.session,
        votes: undefined,
        voted: Object.keys(game.world.session.votes), // quién ha votado (no qué)
      },
      sanctions: game.world.sanctions,
      nukeBanUntil: game.world.nukeBanUntil,
    } : null,
    // La carrera espacial es pública; las misiones solo se revelan al cumplirlas.
    space: Object.fromEntries(Object.entries(game.players).map(([id, p]) => [id, p.space?.stage ?? 0])),
    missionsDone: Object.fromEntries(Object.entries(game.players).filter(([, p]) => p.mission?.done).map(([id, p]) => [id, p.mission])),
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
    president: player.president,
    weariness: Math.round((player.weariness ?? 0) * 100), // cansancio de guerra en %
    mission: player.mission ? { ...player.mission, progress: missionProgress(game, playerId, missionCtx(game)) } : null,
    vote: game.world?.session?.votes?.[playerId] ?? null,
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
  // En «Dos bandos», primero los países históricos de su bando (el Eje recibe Alemania o Italia...).
  const side = sideCountries(game.teamMode, game.scenario, game.teams?.[playerId]).filter((id) => free.some((c) => c.id === id));
  if (side.length) return side[Math.floor(rng() * Math.min(side.length, 2))];
  // En los escenarios históricos se reparten primero los países protagonistas.
  const featured = (scenarioOf(game.scenario).featured ?? []).filter((id) => free.some((c) => c.id === id));
  if (featured.length) return featured[Math.floor(rng() * Math.min(featured.length, 2))];
  const viable = free.filter((c) => c.area >= MIN_START_AREA_KM2 && economyRating(c.id) >= 1);
  const pool = viable.length ? viable : free;

  for (let minDist = PREFERRED_START_DISTANCE; minDist >= 0; minDist--) {
    const candidates = pool.filter((c) => (distance.get(c.id) ?? Infinity) >= minDist);
    if (candidates.length) return candidates[Math.floor(rng() * candidates.length)].id;
  }
  const any = WORLD.countries.filter((c) => !taken.includes(c.id) && playable(game, c.id));
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

