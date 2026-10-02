// Reglas militares compartidas por servidor y cliente: unidades, terreno, movimiento, combate y bombas.

import { ANCIENT_REGIONS } from './ancient.js';

// `speed` es la velocidad real de marcha en km/h.
// Cada unidad pertenece a una clase (para el terreno y el suministro) y a un dominio
// (tierra, aire o mar, para el movimiento). Las de nivel II y III se desbloquean en el árbol tecnológico.
export const UNITS = {
  // Infantería
  infantry: {
    label: 'Infantería', icon: '♟', class: 'infantry', domain: 'land', tier: 1,
    cost: { money: 8, food: 3 }, upkeep: { food: 0.3 },
    attack: 1.3, defense: 1.8, speed: 20, trainMs: 4_000,
  },
  mech: {
    label: 'Infantería mecanizada', icon: '♞', class: 'infantry', domain: 'land', tier: 2,
    cost: { money: 14, food: 3, industry: 3, oil: 1 }, upkeep: { food: 0.3, oil: 0.2 },
    attack: 2, defense: 2.5, speed: 35, trainMs: 6_000,
  },
  specops: {
    label: 'Fuerzas especiales', icon: '✪', class: 'special', domain: 'land', tier: 3,
    cost: { money: 30, food: 5, industry: 5 }, upkeep: { food: 0.6 },
    attack: 4, defense: 3, speed: 30, trainMs: 9_000,
  },
  // Blindados
  tank: {
    label: 'Tanques', icon: '▰', class: 'armor', domain: 'land', tier: 1,
    cost: { money: 22, industry: 6, oil: 3 }, upkeep: { oil: 0.4 },
    attack: 4, defense: 3, speed: 25, trainMs: 8_000,
  },
  heavytank: {
    label: 'Tanques pesados', icon: '▮', class: 'armor', domain: 'land', tier: 2,
    cost: { money: 40, industry: 12, oil: 6 }, upkeep: { oil: 0.7 },
    attack: 7, defense: 6, speed: 18, trainMs: 12_000,
  },
  mbt: {
    label: 'Carros de combate modernos', icon: '◆', class: 'armor', domain: 'land', tier: 3,
    cost: { money: 60, industry: 18, oil: 8 }, upkeep: { oil: 1 },
    attack: 10, defense: 8, speed: 40, trainMs: 15_000,
  },
  // Aviación
  aircraft: {
    label: 'Cazas', icon: '✈', class: 'air', domain: 'air', tier: 1,
    cost: { money: 32, industry: 10, oil: 5 }, upkeep: { oil: 0.8 },
    attack: 5, defense: 2, speed: 320, trainMs: 12_000, interceptor: 1,
  },
  bomber: {
    label: 'Bombarderos', icon: '✠', class: 'air', domain: 'air', tier: 2,
    cost: { money: 50, industry: 15, oil: 8 }, upkeep: { oil: 1.2 },
    attack: 9, defense: 1, speed: 260, trainMs: 15_000,
  },
  jet: {
    label: 'Cazas a reacción', icon: '➶', class: 'air', domain: 'air', tier: 3,
    cost: { money: 70, industry: 20, oil: 10 }, upkeep: { oil: 1.5 },
    attack: 8, defense: 5, speed: 520, trainMs: 18_000, interceptor: 2,
  },
  // Marina
  navy: {
    label: 'Destructores', icon: '⚓', class: 'naval', domain: 'sea', tier: 1,
    cost: { money: 26, industry: 8, oil: 4 }, upkeep: { oil: 0.5 },
    attack: 3, defense: 3, speed: 80, trainMs: 12_000,
  },
  submarine: {
    label: 'Submarinos', icon: '◒', class: 'naval', domain: 'sea', tier: 2,
    cost: { money: 40, industry: 12, oil: 6 }, upkeep: { oil: 0.7 },
    attack: 6, defense: 2, speed: 65, trainMs: 14_000,
  },
  carrier: {
    label: 'Portaaviones', icon: '⛴', class: 'naval', domain: 'sea', tier: 3,
    cost: { money: 90, industry: 30, oil: 12 }, upkeep: { oil: 2 },
    attack: 5, defense: 8, speed: 75, trainMs: 20_000, interceptor: 1,
  },
};

export const UNIT_TYPES = Object.keys(UNITS);

// Velocidades reales (km/h) en los mapas de otra época: a pie, a caballo y a remo.
// El mapa de la antigua Grecia es pequeño, así que los viajes duran parecido a los del mundo actual.
const ERA_SPEEDS = {
  greece: {
    infantry: 5, mech: 5, specops: 6, tank: 12, heavytank: 10, mbt: 7,
    aircraft: 5, bomber: 3, jet: 4, navy: 15, submarine: 13, carrier: 11,
  },
};

/** Velocidad de una unidad (km/h) en la época de un mapa (o la normal). */
export function unitSpeed(type, era = null) {
  return ERA_SPEEDS[era]?.[type] ?? UNITS[type].speed;
}
export const BASE_UNITS = UNIT_TYPES.filter((t) => UNITS[t].tier === 1);

// Qué recurso necesita cada clase para rendir al 100 %.
const SUPPLY = { infantry: 'food', special: 'food', armor: 'oil', air: 'oil', naval: 'oil' };
const UNSUPPLIED_FACTOR = 0.5;

// Modificadores de ataque por clase (las fuerzas especiales ignoran el terreno).
export const TERRAIN_INFO = {
  plains: { label: 'Llanura', defense: 1, attack: {} },
  mountains: { label: 'Montaña', defense: 1.5, attack: { armor: 0.6 } },
  jungle: { label: 'Selva', defense: 1.3, attack: { armor: 0.7, air: 0.7 } },
  desert: { label: 'Desierto', defense: 1, attack: { infantry: 0.8, armor: 1.2 } },
  frozen: { label: 'Helado', defense: 1.4, attack: { infantry: 0.8, armor: 0.7 } },
};

const TERRAIN_GROUPS = {
  mountains: 'CHE AUT AFG NPL BTN BOL PER KGZ TJK ARM GEO LSO MNE ALB MKD BIH XKX CHL ETH YEM NOR',
  jungle: 'BRA COD COG GAB CMR GNQ COL GUY SUR PNG IDN MYS BRN LAO MMR KHM VNM LBR SLE NIC HND GTM BLZ CRI PAN SLB VUT',
  desert: 'SAU DZA LBY EGY MRT MLI NER TCD SDN ESH OMN ARE QAT KWT IRQ JOR TKM NAM BWA MNG AUS',
  frozen: 'GRL ISL RUS CAN FLK',
};
const TERRAIN = Object.fromEntries(ANCIENT_REGIONS.map((r) => [r.id, r.terrain]));
for (const [terrain, ids] of Object.entries(TERRAIN_GROUPS)) for (const id of ids.split(' ')) TERRAIN[id] = terrain;

export function terrainOf(countryId) {
  return TERRAIN[countryId] ?? 'plains';
}

export const CAPITAL_DEFENSE = 1.25;
export const LEVEL_DEFENSE = 0.05; // +5 % de defensa por nivel de desarrollo por encima de 1
export const AMPHIBIOUS_ATTACK = 0.75; // atacar desde el mar penaliza

export const GAME_SPEEDS = { marathon: 0.25, slow: 0.6, normal: 1, fast: 1.6 };

export function emptyUnits() {
  return Object.fromEntries(UNIT_TYPES.map((t) => [t, 0]));
}

/** Completa un objeto de unidades con ceros para los tipos que falten. */
export function normalizeUnits(units = {}) {
  return Object.fromEntries(UNIT_TYPES.map((t) => [t, units[t] ?? 0]));
}

export function totalUnits(units) {
  return UNIT_TYPES.reduce((sum, t) => sum + (units?.[t] ?? 0), 0);
}

export function addUnits(target, delta, sign = 1) {
  for (const t of UNIT_TYPES) target[t] = (target[t] ?? 0) + sign * (delta?.[t] ?? 0);
  return target;
}

/** Unidades de un dominio ('land', 'air', 'sea') dentro de un grupo. */
export function domainCount(units, domain) {
  return UNIT_TYPES.reduce((sum, t) => sum + (UNITS[t].domain === domain ? units?.[t] ?? 0 : 0), 0);
}

/** Guarnición inicial de un país neutral, según su economía y tamaño. */
export function neutralGarrison(country, economy) {
  return normalizeUnits({
    infantry: 2 + 2 * economy + (country.area >= 1_000_000 ? 2 : 0),
    tank: economy >= 2 ? economy : 0,
    aircraft: economy >= 4 ? 2 : 0,
    navy: country.coastal && economy >= 3 ? 2 : 0,
  });
}

/** Ejército inicial de cada jugador en su capital. */
export function startingArmy(country) {
  return normalizeUnits({ infantry: 10, tank: 3, aircraft: 1, navy: country.coastal ? 1 : 0 });
}

/**
 * Comprueba si un grupo de unidades puede ir de `from` a `to`.
 * Devuelve un mensaje de error o null.
 */
/** ¿Es un viaje por mar a un país lejano (no vecino)? Lo pueden hacer las flotas. */
export const isNavalRoute = (from, to) => from.id !== to.id && !from.neighbors.includes(to.id);

export function moveError(from, to, units) {
  if (totalUnits(units) <= 0) return 'Elige al menos una unidad';
  if (isNavalRoute(from, to)) {
    // Con barcos se puede llegar a cualquier país con costa del mundo, llevando también tropas y aviones.
    if (!from.coastal) return 'Solo puedes zarpar desde un país con costa';
    if (!to.coastal) return 'Por mar solo se llega a países con costa';
    if (domainCount(units, 'sea') === 0) return 'Para llegar por mar a un país lejano necesitas al menos un barco';
    return null;
  }
  if (domainCount(units, 'sea') > 0 && !to.coastal) return 'Los barcos no pueden entrar en un país sin costa';
  // En la Antigüedad nada vuela: arqueros y máquinas de asedio también necesitan barco.
  const walkers = domainCount(units, 'land') + (from.era ? domainCount(units, 'air') : 0);
  if (from.sea.includes(to.id) && walkers > 0 && domainCount(units, 'sea') === 0) {
    return 'Para cruzar el mar con tropas de tierra necesitas al menos un barco';
  }
  return null;
}

// Ritmo de las tropas (se elige en la sala). `scale` = cuántas veces más rápido que la vida real.
export const TROOP_PACES = {
  realistic: { label: 'Realista: como en la vida real (horas o días)', scale: 1 },
  slow: { label: 'Lenta: 1 hora real = 1 minuto', scale: 60 },
  normal: { label: 'Normal: 1 hora real = 10 segundos', scale: 360 },
  fast: { label: 'Rápida: 1 hora real = 2 segundos', scale: 1800 },
  arcade: { label: 'Arcade: casi al instante', scale: 7200 },
};
export const DEFAULT_PACE = 'fast';
export const paceScale = (pace) => TROOP_PACES[pace]?.scale ?? TROOP_PACES[DEFAULT_PACE].scale;

const EARTH_RADIUS_KM = 6371;
const ROUTE_FACTOR = 1.15; // los caminos nunca son una línea recta
const MIN_TRAVEL_MS = 2_000;

/** Distancia real en km entre los centros de dos países. */
export function distanceKm(from, to) {
  const rad = Math.PI / 180;
  const dLat = (to.lat - from.lat) * rad;
  const dLon = (to.lon - from.lon) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a))) * ROUTE_FACTOR;
}

/**
 * Duración del viaje en ms: distancia real en km dividida por la velocidad (km/h) de la unidad
 * más lenta, como en la vida real. `speed` acelera el reloj (ritmo de tropas × velocidad de juego).
 */
export function travelMs(from, to, units, speed = 1, speedMods = {}) {
  let present = UNIT_TYPES.filter((t) => (units[t] ?? 0) > 0);
  // Por mar, las tropas de tierra y los aviones viajan a bordo: manda la velocidad de los barcos.
  const bySea = from.sea.includes(to.id) || isNavalRoute(from, to);
  const ships = present.filter((t) => UNITS[t].domain === 'sea');
  if (bySea && ships.length) present = ships;
  const kmh = (t) => unitSpeed(t, from.era) * (speedMods[UNITS[t].class] ?? 1);
  const slowest = present.length ? Math.min(...present.map(kmh)) : unitSpeed('infantry', from.era);
  let hours = distanceKm(from, to) / slowest;
  if (from.sea.includes(to.id)) hours *= 1.3; // embarcar y desembarcar
  else if (isNavalRoute(from, to)) hours *= 1.4; // las rutas marítimas rodean continentes
  return Math.max(MIN_TRAVEL_MS, Math.round((hours * 3_600_000) / speed));
}

// mods: multiplicadores por clase de unidad (modificaciones del árbol tecnológico).
function power(units, kind, { terrain = 'plains', supplied = {}, mods = {} } = {}) {
  let total = 0;
  for (const t of UNIT_TYPES) {
    if (!units[t]) continue;
    const unit = UNITS[t];
    let value = unit[kind] * units[t] * (mods[unit.class] ?? 1);
    if (kind === 'attack') value *= TERRAIN_INFO[terrain].attack[unit.class] ?? 1;
    if (supplied[SUPPLY[unit.class]] === false) value *= UNSUPPLIED_FACTOR;
    total += value;
  }
  return total;
}

// Aplica una fracción de bajas a cada tipo, con redondeo aleatorio.
function applyLosses(units, fraction, rng) {
  const left = emptyUnits();
  for (const t of UNIT_TYPES) {
    const n = units[t] ?? 0;
    const lost = n * fraction;
    const whole = Math.floor(lost) + (rng() < lost - Math.floor(lost) ? 1 : 0);
    left[t] = Math.max(0, n - whole);
  }
  return left;
}

/**
 * Resuelve una batalla.
 * ctx: { terrain, capital, level, amphibious, attackerSupply, defenderSupply, attackBonus, defenseBonus,
 *        attackerMods, defenderMods }  (mods: multiplicadores por clase de unidad)
 * Devuelve { attackerWins, attackersLeft, defendersLeft, attackPower, defensePower }.
 */
export function resolveBattle(attackers, defenders, ctx = {}, rng = Math.random) {
  attackers = normalizeUnits(attackers);
  defenders = normalizeUnits(defenders);
  const terrain = ctx.terrain ?? 'plains';
  const luck = () => 0.8 + rng() * 0.4;

  let attackPower = power(attackers, 'attack', { terrain, supplied: ctx.attackerSupply, mods: ctx.attackerMods }) * luck();
  if (ctx.amphibious) attackPower *= AMPHIBIOUS_ATTACK;
  attackPower *= ctx.attackBonus ?? 1; // tecnología

  let defensePower = power(defenders, 'defense', { supplied: ctx.defenderSupply, mods: ctx.defenderMods }) * luck();
  defensePower *= ctx.defenseBonus ?? 1;
  defensePower *= TERRAIN_INFO[terrain].defense;
  defensePower *= 1 + LEVEL_DEFENSE * ((ctx.level ?? 1) - 1);
  if (ctx.capital) defensePower *= CAPITAL_DEFENSE;

  const attackerWins = attackPower > defensePower;
  // El ganador pierde más cuanto más igualada esté la batalla.
  const winnerLoss = (loser, winner) => (winner > 0 ? Math.min(0.9, 0.6 * (loser / winner) ** 1.3) : 0);

  if (attackerWins) {
    const left = applyLosses(attackers, winnerLoss(defensePower, attackPower), rng);
    // El país conquistado nunca queda vacío.
    if (totalUnits(left) === 0) {
      const strongest = UNIT_TYPES.find((t) => attackers[t] > 0);
      left[strongest] = 1;
    }
    return { attackerWins, attackersLeft: left, defendersLeft: emptyUnits(), attackPower, defensePower };
  }
  return {
    attackerWins,
    attackersLeft: emptyUnits(),
    defendersLeft: applyLosses(defenders, winnerLoss(attackPower, defensePower), rng),
    attackPower,
    defensePower,
  };
}

// ---------- Bombas ----------

// range: saltos de frontera desde el país propio más cercano. Las bombas se compran al lanzarlas.
export const WEAPONS = {
  bombing: {
    label: 'Bombardeo convencional', icon: '💣', range: 1, flightMs: 4_000, cooldownMs: 20_000,
    cost: { money: 40, industry: 10, oil: 10 }, kill: 0.25, levels: 0, interceptable: 1,
  },
  missile: {
    label: 'Misil balístico', icon: '🚀', range: 3, flightMs: 6_000, cooldownMs: 45_000,
    cost: { money: 90, industry: 30, oil: 15 }, kill: 0.4, levels: 1, interceptable: 0.6,
  },
  nuke: {
    label: 'Bomba nuclear', icon: '☢', range: 5, flightMs: 9_000, cooldownMs: 180_000,
    cost: { money: 300, industry: 120, oil: 60 }, kill: 0.85, levels: 4, interceptable: 0.25,
    contaminationMs: 180_000,
  },
};
export const WEAPON_TYPES = Object.keys(WEAPONS);

/** Probabilidad de que las defensas aéreas del objetivo derriben el arma (boost: radar, escudo). */
export function interceptChance(defenders, weapon, boost = 1) {
  const shield = UNIT_TYPES.reduce((s, t) => s + (UNITS[t].interceptor ?? 0) * (defenders?.[t] ?? 0), 0);
  return Math.min(0.9, Math.min(0.75, shield * 0.06) * boost) * WEAPONS[weapon].interceptable;
}

/** Daños de un impacto: unidades que sobreviven y niveles de desarrollo perdidos. */
export function strikeDamage(units, weapon, rng = Math.random, extraKill = 0) {
  const kill = Math.min(0.95, WEAPONS[weapon].kill + extraKill);
  return { unitsLeft: applyLosses(normalizeUnits(units), kill, rng), levelsLost: WEAPONS[weapon].levels };
}
