// Construcciones de cada país (fábricas, pozos, granjas...). Compartido por servidor y cliente.
//
// Cada edificio tiene niveles 1-3. El espacio de un país depende de su desarrollo:
// la suma de niveles de sus edificios no puede pasar de 2 × nivel de desarrollo.
// Solo se construye una cosa a la vez en cada país.

export const BUILDINGS = {
  factory: {
    label: 'Fábrica', icon: '🏭', produces: { industry: 6 },
    desc: '+6 🏭 industria por minuto y nivel', cost: { money: 60, industry: 15 },
  },
  oilwell: {
    label: 'Pozo petrolífero', icon: '🛢️', produces: { oil: 5 },
    desc: '+5 🛢️ petróleo por minuto y nivel', cost: { money: 70, industry: 25 },
  },
  farm: {
    label: 'Granja', icon: '🌾', produces: { food: 6 },
    desc: '+6 🌾 alimentos por minuto y nivel', cost: { money: 40, industry: 10 },
  },
  bank: {
    label: 'Banco', icon: '🏦', produces: { money: 8 },
    desc: '+8 💰 dinero por minuto y nivel', cost: { money: 80, industry: 20 },
  },
  barracks: {
    label: 'Cuartel', icon: '🎖️', train: 0.2,
    desc: 'Las tropas se entrenan un 20 % más rápido por nivel', cost: { money: 60, industry: 25 },
  },
  bunker: {
    label: 'Búnker', icon: '🛡️', defense: 0.15,
    desc: '+15 % de defensa del país por nivel', cost: { money: 70, industry: 35 },
  },
};
export const BUILDING_TYPES = Object.keys(BUILDINGS);
export const MAX_BUILDING_LEVEL = 3;
export const SLOTS_PER_LEVEL = 2;

/** Espacio total de un país según su nivel de desarrollo. */
export const buildingSlots = (devLevel) => devLevel * SLOTS_PER_LEVEL;

export function usedSlots(buildings) {
  return BUILDING_TYPES.reduce((n, t) => n + (buildings?.[t] ?? 0), 0);
}

/** Coste de subir un edificio al nivel `toLevel`. */
export function buildingCost(type, toLevel) {
  return Object.fromEntries(Object.entries(BUILDINGS[type].cost).map(([r, v]) => [r, v * toLevel]));
}

/** Tiempo de construcción (ms a velocidad normal) del nivel `toLevel`. */
export function buildingMs(toLevel) {
  return 20_000 * toLevel;
}

/** Recursos por minuto que dan los edificios de un país. */
export function buildingIncome(buildings) {
  const out = {};
  for (const t of BUILDING_TYPES) {
    const level = buildings?.[t] ?? 0;
    for (const [r, v] of Object.entries(BUILDINGS[t].produces ?? {})) out[r] = (out[r] ?? 0) + v * level;
  }
  return out;
}

/** Multiplicador del tiempo de entrenamiento (cuartel). */
export const trainFactor = (buildings) => Math.max(0.4, 1 - BUILDINGS.barracks.train * (buildings?.barracks ?? 0));

/** Multiplicador de defensa (búnker). */
export const bunkerFactor = (buildings) => 1 + BUILDINGS.bunker.defense * (buildings?.bunker ?? 0);

/** Motivo por el que no se puede construir (o null). */
export function buildError(country, type) {
  if (!BUILDINGS[type]) return 'Edificio desconocido';
  const level = country.buildings?.[type] ?? 0;
  if (level >= MAX_BUILDING_LEVEL) return 'Ese edificio ya está al nivel máximo';
  if (country.constructing) return 'Ya hay una obra en marcha en este país';
  if (usedSlots(country.buildings) >= buildingSlots(country.level)) {
    return 'No queda espacio: desarrolla el país para construir más';
  }
  return null;
}

/** Los edificios pierden niveles (guerra, bombas). */
export function damageBuildings(buildings, levels) {
  if (!buildings || levels <= 0) return buildings ?? {};
  const out = {};
  for (const t of BUILDING_TYPES) {
    const left = Math.max(0, (buildings[t] ?? 0) - levels);
    if (left) out[t] = left;
  }
  return out;
}
