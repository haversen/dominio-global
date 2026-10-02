// Economía compartida por servidor y cliente: producción de cada país y costes de desarrollo.
// El juego es en tiempo real: la producción se expresa por minuto y se cobra de forma continua.

import { ANCIENT_REGIONS } from './ancient.js';

export const RESOURCES = ['money', 'food', 'oil', 'industry'];

export const RESOURCE_INFO = {
  money: { label: 'Dinero', short: 'Din.', icon: '💰' },
  food: { label: 'Alimentos', short: 'Alim.', icon: '🌾' },
  oil: { label: 'Petróleo', short: 'Petr.', icon: '🛢️' },
  industry: { label: 'Industria', short: 'Ind.', icon: '🏭' },
};

export const STARTING_RESOURCES = { money: 120, food: 50, oil: 40, industry: 40 };
// production() da puntos de producción; multiplicados por esto son recursos por minuto.
export const INCOME_PER_MINUTE = 3;

export const MAX_LEVEL = 5;
// La capital de cada jugador produce un extra fijo para que nadie empiece en desventaja.
export const CAPITAL_BONUS = { money: 6, food: 2, oil: 1, industry: 3 };
const LEVEL_BONUS = 0.25; // +25 % de producción por nivel por encima de 1

// Perfil aproximado de cada país (0-5): [economía, agricultura, petróleo, industria].
// Los países que no aparecen usan DEFAULT_PROFILE.
const DEFAULT_PROFILE = [1, 1, 0, 0];
const PROFILES = {
  USA: [5, 3, 3, 5], CHN: [5, 3, 2, 5], JPN: [4, 1, 0, 5], DEU: [4, 1, 0, 5], KOR: [4, 1, 0, 4],
  GBR: [4, 1, 1, 3], FRA: [4, 2, 0, 3], CAN: [4, 2, 3, 2], CHE: [4, 1, 0, 2], IND: [3, 3, 1, 3],
  ITA: [3, 1, 0, 3], RUS: [3, 2, 4, 3], BRA: [3, 3, 2, 2], TWN: [3, 1, 0, 4], ESP: [3, 2, 0, 2],
  AUS: [3, 2, 1, 1], NLD: [3, 1, 1, 2], SWE: [3, 1, 0, 2], BEL: [3, 1, 0, 2], AUT: [3, 1, 0, 2],
  NOR: [3, 0, 3, 1], SAU: [3, 0, 4, 1], ARE: [3, 0, 3, 1], QAT: [3, 0, 3, 0], ISR: [3, 0, 0, 2],
  DNK: [3, 2, 0, 1], IRL: [3, 1, 0, 1], FIN: [3, 1, 0, 1], LUX: [3, 0, 0, 1], MEX: [2, 2, 2, 2],
  IDN: [2, 2, 1, 2], TUR: [2, 2, 0, 2], POL: [2, 2, 0, 2], ARG: [2, 3, 1, 1], IRN: [2, 1, 4, 1],
  ZAF: [2, 1, 0, 2], THA: [2, 3, 0, 2], MYS: [2, 2, 1, 2], CHL: [2, 1, 0, 1], CZE: [2, 1, 0, 2],
  PRT: [2, 1, 0, 1], GRC: [2, 1, 0, 1], NZL: [2, 2, 0, 1], HUN: [2, 1, 0, 1], KWT: [2, 0, 3, 0],
  BRN: [2, 0, 2, 0], ISL: [2, 1, 0, 0], NGA: [1, 2, 3, 0], EGY: [1, 2, 1, 1], PHL: [1, 2, 0, 1],
  COL: [1, 2, 1, 1], PAK: [1, 2, 0, 1], BGD: [1, 2, 0, 1], VNM: [1, 3, 1, 2], ROU: [1, 2, 0, 1],
  PER: [1, 1, 0, 1], IRQ: [1, 1, 4, 0], KAZ: [1, 2, 3, 1], DZA: [1, 1, 3, 0], UKR: [1, 3, 0, 2],
  MAR: [1, 1, 0, 1], VEN: [1, 1, 4, 0], LBY: [1, 0, 3, 0], AGO: [1, 1, 3, 0], AZE: [1, 1, 2, 0],
  OMN: [1, 0, 2, 0], ECU: [1, 1, 1, 0], URY: [1, 2, 0, 0], PRY: [1, 2, 0, 0], TKM: [1, 0, 2, 0],
  GAB: [1, 0, 2, 0], COG: [1, 0, 2, 0], TTO: [1, 0, 2, 0], SDN: [0, 1, 1, 0], SYR: [0, 1, 1, 0],
  YEM: [0, 0, 1, 0], MNG: [0, 1, 0, 0], AFG: [0, 1, 0, 0], GRL: [0, 0, 0, 0], ESH: [0, 0, 0, 0],
  SOM: [0, 1, 0, 0], XSL: [0, 1, 0, 0], TCD: [0, 1, 1, 0], NER: [0, 1, 0, 0], MLI: [0, 1, 0, 0],
  ...Object.fromEntries(ANCIENT_REGIONS.map((r) => [r.id, r.profile])),
};

export function emptyResources() {
  return { money: 0, food: 0, oil: 0, industry: 0 };
}

/** Puntos de producción de un país (objeto con los cuatro recursos). */
export function production(country, level = 1) {
  const [eco, agri, oil, ind] = PROFILES[country.id] ?? DEFAULT_PROFILE;
  const base = {
    money: 2 + 3 * eco,
    food: 1 + 2 * agri + (country.area >= 1_000_000 ? 1 : 0),
    oil: 2 * oil,
    industry: 1 + 2 * ind,
  };
  const mult = 1 + LEVEL_BONUS * (level - 1);
  return Object.fromEntries(RESOURCES.map((r) => [r, Math.round(base[r] * mult)]));
}

/** Ingresos por minuto de un país para su dueño (incluye la bonificación si es su capital). */
export function countryIncome(country, level = 1, isCapital = false) {
  const base = production(country, level);
  if (isCapital) addResources(base, CAPITAL_BONUS);
  for (const r of RESOURCES) base[r] *= INCOME_PER_MINUTE;
  return base;
}

/** Perfil económico (0-5) usado para preferir capitales viables en el reparto automático. */
export function economyRating(countryId) {
  return (PROFILES[countryId] ?? DEFAULT_PROFILE)[0];
}

/** Coste de subir un país del nivel `level` al siguiente. */
export function developCost(level) {
  return { money: 40 * level, industry: 15 * level };
}

/** Tiempo de construcción (ms, a velocidad normal) para subir desde `level`. */
export function developMs(level) {
  return 15_000 * level;
}

export function canAfford(resources, cost) {
  return Object.entries(cost).every(([r, amount]) => resources[r] >= amount);
}

export function addResources(target, delta, sign = 1) {
  for (const r of RESOURCES) target[r] += sign * (delta[r] ?? 0);
  return target;
}
