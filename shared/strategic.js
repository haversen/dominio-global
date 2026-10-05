// Recursos estratégicos: solo existen en algunos países (como en la vida real) y hacen falta para
// las armas y tropas más avanzadas. Hay que controlar un país que los tenga, o ser aliado de quien lo controla.

export const STRATEGIC = {
  uranium: {
    label: 'Uranio', icon: '☢️',
    countries: ['KAZ', 'CAN', 'AUS', 'NAM', 'NER', 'RUS', 'UZB', 'ZAF', 'USA', 'CHN', 'UKR', 'BRA', 'G_CAP', 'J_SHI', 'J_AIN',
      'R_CTE', 'R_SUS', 'R_ALB', 'R_HAT'],
  },
  rareEarths: {
    label: 'Tierras raras', icon: '💎',
    countries: ['CHN', 'AUS', 'USA', 'MMR', 'IND', 'RUS', 'VNM', 'BRA', 'MYS', 'COD', 'ZAF', 'GRL', 'G_ATE', 'G_TRA', 'J_AMA', 'J_UES',
      'R_SAR', 'R_NOR', 'R_PER'],
  },
  rubber: {
    label: 'Caucho', icon: '🌳',
    countries: ['THA', 'IDN', 'VNM', 'MYS', 'IND', 'CIV', 'LBR', 'CHN', 'BRA', 'GTM', 'PHL', 'LKA', 'NGA', 'KHM', 'MMR', 'G_CIL', 'G_LID', 'J_SAI', 'J_JUR',
      'R_COL', 'R_SAL', 'R_CRP', 'R_TRP'],
  },
};
export const STRATEGIC_TYPES = Object.keys(STRATEGIC);

// Qué necesita cada unidad o arma.
export const NEEDS = {
  unit: { mech: 'rubber', heavytank: 'rubber', bomber: 'rubber', mbt: 'rareEarths', jet: 'rareEarths' },
  weapon: { missile: 'rareEarths', nuke: 'uranium' },
};

const byCountry = new Map();
for (const [type, { countries }] of Object.entries(STRATEGIC)) {
  for (const id of countries) byCountry.set(id, [...(byCountry.get(id) ?? []), type]);
}

/** Recursos estratégicos de un país (lista, a menudo vacía). */
export const strategicOf = (countryId) => byCountry.get(countryId) ?? [];

/** Recurso que necesita una unidad o arma (o null). */
export function needOf({ unit, weapon }) {
  return (unit ? NEEDS.unit[unit] : NEEDS.weapon[weapon]) ?? null;
}

/**
 * ¿Tiene acceso el jugador a un recurso? owners: dueños de cada país; friends: él y sus aliados;
 * inMap: países jugables del mapa. Si el recurso no existe en el mapa elegido, no se exige.
 */
export function hasAccess(type, owners, friends, inMap = () => true) {
  const sources = STRATEGIC[type].countries.filter(inMap);
  if (!sources.length) return true;
  return sources.some((id) => friends.has(owners(id)));
}

export function missingText(type, spec = STRATEGIC[type]) {
  const s = spec;
  return `Necesitas ${s.icon} ${s.label.toLowerCase()}: controla un país que lo tenga (o alíate con quien lo controle)`;
}
