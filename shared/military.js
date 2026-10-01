// Reglas militares compartidas por servidor y cliente: unidades, terreno, movimiento y combate.

export const UNIT_TYPES = ['infantry', 'tank', 'aircraft', 'navy'];

// Costes en recursos; mantenimiento por minuto; velocidad en unidades de mapa por segundo.
export const UNITS = {
  infantry: {
    label: 'Infantería', short: 'Inf', icon: '♟',
    cost: { money: 8, food: 3 }, upkeep: { food: 0.3 },
    attack: 1, defense: 1.5, speed: 14, trainMs: 4_000,
  },
  tank: {
    label: 'Tanques', short: 'Tnq', icon: '▰',
    cost: { money: 22, industry: 6, oil: 3 }, upkeep: { oil: 0.4 },
    attack: 4, defense: 3, speed: 22, trainMs: 8_000,
  },
  aircraft: {
    label: 'Aviación', short: 'Av', icon: '✈',
    cost: { money: 32, industry: 10, oil: 5 }, upkeep: { oil: 0.8 },
    attack: 5, defense: 2, speed: 60, trainMs: 12_000,
  },
  navy: {
    label: 'Marina', short: 'Mar', icon: '⚓',
    cost: { money: 26, industry: 8, oil: 4 }, upkeep: { oil: 0.5 },
    attack: 3, defense: 3, speed: 24, trainMs: 12_000, coastalOnly: true,
  },
};

// Qué recurso necesita cada unidad para rendir al 100 %.
const SUPPLY = { infantry: 'food', tank: 'oil', aircraft: 'oil', navy: 'oil' };
const UNSUPPLIED_FACTOR = 0.5;

export const TERRAIN_INFO = {
  plains: { label: 'Llanura', defense: 1, attack: {} },
  mountains: { label: 'Montaña', defense: 1.5, attack: { tank: 0.6 } },
  jungle: { label: 'Selva', defense: 1.3, attack: { tank: 0.7, aircraft: 0.7 } },
  desert: { label: 'Desierto', defense: 1, attack: { infantry: 0.8, tank: 1.2 } },
  frozen: { label: 'Helado', defense: 1.4, attack: { infantry: 0.8, tank: 0.7 } },
};

const TERRAIN_GROUPS = {
  mountains: 'CHE AUT AFG NPL BTN BOL PER KGZ TJK ARM GEO LSO MNE ALB MKD BIH XKX CHL ETH YEM NOR',
  jungle: 'BRA COD COG GAB CMR GNQ COL GUY SUR PNG IDN MYS BRN LAO MMR KHM VNM LBR SLE NIC HND GTM BLZ CRI PAN SLB VUT',
  desert: 'SAU DZA LBY EGY MRT MLI NER TCD SDN ESH OMN ARE QAT KWT IRQ JOR TKM NAM BWA MNG AUS',
  frozen: 'GRL ISL RUS CAN FLK',
};
const TERRAIN = {};
for (const [terrain, ids] of Object.entries(TERRAIN_GROUPS)) for (const id of ids.split(' ')) TERRAIN[id] = terrain;

export function terrainOf(countryId) {
  return TERRAIN[countryId] ?? 'plains';
}

export const CAPITAL_DEFENSE = 1.25;
export const LEVEL_DEFENSE = 0.05; // +5 % de defensa por nivel de desarrollo por encima de 1
export const AMPHIBIOUS_ATTACK = 0.75; // atacar desde el mar penaliza

export const GAME_SPEEDS = { slow: 0.6, normal: 1, fast: 1.6 };

export function emptyUnits() {
  return { infantry: 0, tank: 0, aircraft: 0, navy: 0 };
}

export function totalUnits(units) {
  return UNIT_TYPES.reduce((sum, t) => sum + (units[t] ?? 0), 0);
}

export function addUnits(target, delta, sign = 1) {
  for (const t of UNIT_TYPES) target[t] = (target[t] ?? 0) + sign * (delta[t] ?? 0);
  return target;
}

/** Guarnición inicial de un país neutral, según su economía y tamaño. */
export function neutralGarrison(country, economy) {
  return {
    infantry: 2 + 2 * economy + (country.area >= 1_000_000 ? 2 : 0),
    tank: economy >= 2 ? economy : 0,
    aircraft: economy >= 4 ? 2 : 0,
    navy: country.coastal && economy >= 3 ? 2 : 0,
  };
}

/** Ejército inicial de cada jugador en su capital. */
export function startingArmy(country) {
  return { infantry: 10, tank: 3, aircraft: 1, navy: country.coastal ? 1 : 0 };
}

/**
 * Comprueba si un grupo de unidades puede ir de `from` a `to`.
 * Devuelve un mensaje de error o null.
 */
export function moveError(from, to, units) {
  if (!from.neighbors.includes(to.id)) return 'Solo puedes mover tropas a países vecinos';
  if (totalUnits(units) <= 0) return 'Elige al menos una unidad';
  if (units.navy > 0 && !to.coastal) return 'La marina no puede entrar en un país sin costa';
  const byLand = units.infantry + units.tank;
  if (from.sea.includes(to.id) && byLand > 0 && units.navy === 0) {
    return 'Para cruzar el mar con tropas de tierra necesitas al menos un barco';
  }
  return null;
}

/** Duración del viaje en ms: depende de la distancia y de la unidad más lenta. */
export function travelMs(from, to, units, speed = 1) {
  const slowest = Math.min(...UNIT_TYPES.filter((t) => units[t] > 0).map((t) => UNITS[t].speed));
  const dist = Math.hypot(to.cx - from.cx, to.cy - from.cy);
  let secs = Math.min(Math.max(dist / slowest, 3), 25);
  if (from.sea.includes(to.id)) secs *= 1.3;
  return Math.round((secs * 1000) / speed);
}

function power(units, kind, { terrain = 'plains', supplied = {} } = {}) {
  let total = 0;
  for (const t of UNIT_TYPES) {
    if (!units[t]) continue;
    let value = UNITS[t][kind] * units[t];
    if (kind === 'attack') value *= TERRAIN_INFO[terrain].attack[t] ?? 1;
    if (supplied[SUPPLY[t]] === false) value *= UNSUPPLIED_FACTOR;
    total += value;
  }
  return total;
}

// Aplica una fracción de bajas a cada tipo, con redondeo aleatorio.
function applyLosses(units, fraction, rng) {
  const left = emptyUnits();
  for (const t of UNIT_TYPES) {
    const lost = units[t] * fraction;
    const whole = Math.floor(lost) + (rng() < lost - Math.floor(lost) ? 1 : 0);
    left[t] = Math.max(0, units[t] - whole);
  }
  return left;
}

/**
 * Resuelve una batalla.
 * ctx: { terrain, capital, level, amphibious, attackerSupply, defenderSupply, attackBonus, defenseBonus }
 * Devuelve { attackerWins, attackersLeft, defendersLeft, attackPower, defensePower }.
 */
export function resolveBattle(attackers, defenders, ctx = {}, rng = Math.random) {
  const terrain = ctx.terrain ?? 'plains';
  const luck = () => 0.8 + rng() * 0.4;

  let attackPower = power(attackers, 'attack', { terrain, supplied: ctx.attackerSupply }) * luck();
  if (ctx.amphibious) attackPower *= AMPHIBIOUS_ATTACK;
  attackPower *= ctx.attackBonus ?? 1; // tecnología

  let defensePower = power(defenders, 'defense', { supplied: ctx.defenderSupply }) * luck();
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
