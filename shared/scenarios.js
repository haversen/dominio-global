// Mapas de juego: el mundo entero, un continente o escenarios inspirados en guerras históricas.
// Los países fuera del mapa elegido no se juegan (se ven apagados y no se pueden atravesar).

import { historicIds, isAncient } from './ancient.js';

const list = (s) => s.trim().split(/\s+/);

const EUROPE = list(`
  ALB DEU AUT BEL BLR BIH BGR CZE CYP XNC HRV DNK SVK SVN ESP EST FIN FRA GRC HUN IRL ISL ITA XKX
  LVA LTU LUX MKD MDA MNE NOR NLD POL PRT GBR ROU RUS SRB SWE CHE UKR TUR`);
const MIDDLE_EAST = list('GEO ARM AZE SYR IRQ LBN ISR PSE JOR SAU KWT IRN QAT ARE OMN YEM');
const NORTH_AFRICA = list('EGY LBY TUN DZA MAR ESH');
const ASIA = list(`
  AFG ARM AZE BGD BTN BRN KHM CHN PRK KOR GEO IND IDN IRN IRQ ISR JPN JOR KAZ KGZ KWT LAO LBN MYS
  MNG MMR NPL OMN PAK PSE PHL QAT RUS SAU LKA SYR TWN TJK THA TLS TKM TUR ARE UZB VNM YEM`);
const AMERICAS = list(`
  ARG BHS BLZ BOL BRA CAN CHL COL CRI CUB ECU SLV USA GRL GTM GUY HTI HND JAM MEX NIC PAN PRY PER
  PRI DOM SUR TTO URY VEN FLK`);
const AFRICA = list(`
  DZA AGO BEN BWA BFA BDI CMR TCD COG CIV EGY ERI SWZ ETH GAB GMB GHA GIN GNQ GNB KEN LSO LBR LBY
  MDG MWI MLI MAR MRT MOZ NAM NER NGA COD CAF RWA ESH SEN SLE SOM XSL ZAF SDN SSD TZA TGO TUN UGA
  DJI ZMB ZWE`);
const PACIFIC = list(`
  CHN JPN KOR PRK TWN PHL VNM LAO KHM THA MMR MYS BRN IDN TLS PNG AUS NZL SLB VUT FJI NCL MNG RUS
  USA CAN IND BGD LKA NPL BTN`);

// Regiones para las misiones secretas («controla la mitad de...»).
export const REGIONS = {
  europe: { label: 'Europa', countries: EUROPE },
  asia: { label: 'Asia', countries: ASIA },
  americas: { label: 'América', countries: AMERICAS },
  africa: { label: 'África', countries: AFRICA },
  mideast: { label: 'Oriente Medio', countries: MIDDLE_EAST },
};

export const SCENARIOS = {
  world: {
    label: '🌍 Mundo entero',
    description: 'Los 175 países del mundo.',
    countries: null,
  },
  europe: {
    label: '🇪🇺 Solo Europa',
    description: 'Europa, de Portugal a Rusia, con Turquía.',
    countries: EUROPE,
    // Solo cuenta la parte europea de Rusia para el % de dominación.
    areas: { RUS: 4_000_000, TUR: 300_000 },
    // Rusia se dibuja solo hasta los Urales (variante «europe» de shared/world.json).
    variant: 'europe',
  },
  asia: {
    label: '🌏 Solo Asia',
    description: 'Asia, de Turquía a Japón y de Siberia a Indonesia.',
    countries: ASIA,
  },
  americas: {
    label: '🌎 Solo América',
    description: 'América del Norte, Central y del Sur, con el Caribe.',
    countries: AMERICAS,
  },
  africa: {
    label: '🌍 Solo África',
    description: 'Todo el continente africano y Madagascar.',
    countries: AFRICA,
  },
  ww1: {
    label: '⚔ Gran Guerra (1914-1918)',
    description: 'Europa, Oriente Medio y el norte de África. Imperios centrales contra la Entente.',
    countries: [...new Set([...EUROPE, ...MIDDLE_EAST, ...NORTH_AFRICA])],
    areas: { RUS: 4_000_000 },
    featured: ['DEU', 'FRA', 'GBR', 'RUS', 'AUT', 'ITA', 'TUR', 'SRB'],
    allowNeighbors: true,
  },
  ww2: {
    label: '✈ Segunda Guerra Mundial (1939-1945)',
    description: 'El mundo entero en guerra: el Eje contra los Aliados.',
    countries: null,
    featured: ['DEU', 'GBR', 'RUS', 'USA', 'JPN', 'ITA', 'FRA', 'CHN'],
    allowNeighbors: true,
  },
  pacific: {
    label: '⚓ Guerra del Pacífico (1941-1945)',
    description: 'Asia oriental, el Pacífico y Oceanía. Guerra naval e islas.',
    countries: PACIFIC,
    areas: { RUS: 3_000_000, USA: 3_000_000, CAN: 1_000_000 },
    featured: ['JPN', 'USA', 'CHN', 'AUS', 'IND', 'PHL', 'IDN', 'KOR'],
    allowNeighbors: true,
  },
  coldwar: {
    label: '☢ Guerra Fría (1947-1991)',
    description: 'Dos superpotencias y sus bloques se disputan el mundo.',
    countries: null,
    featured: ['USA', 'RUS', 'CHN', 'GBR', 'FRA', 'DEU', 'CUB', 'VNM'],
    spaceVictory: true, // el único mapa donde llegar a la Luna gana la partida
  },
  greece: {
    label: '🏛 Antigua Grecia (450 a. C.)',
    description: 'Polis griegas, reinos de los Balcanes y satrapías persas en torno al mar Egeo.',
    countries: historicIds('greece'),
    era: 'greece', // tropas, materiales y tecnología de la época (shared/eras.js)
    featured: ['G_ATE', 'G_ESP', 'G_MAC', 'G_LID', 'G_TEB', 'G_COR', 'G_BIZ', 'G_ARG'],
    allowNeighbors: true,
  },
  sengoku: {
    label: '🏯 Japón samurái (1560)',
    description: 'La época Sengoku: clanes samuráis en guerra por Japón, con la Corea Joseon, la China Ming, los yurchen, los mongoles, el reino de Ryūkyū y los ainu.',
    countries: historicIds('sengoku'),
    era: 'sengoku',
    featured: ['J_ODA', 'J_TAK', 'J_UES', 'J_MOR', 'J_SHI', 'J_JOS', 'J_MIN', 'J_HOJ', 'J_DAT', 'J_TOK',
      'J_IMA', 'J_OTO', 'J_CHO', 'J_ASK', 'J_MIY', 'J_ASA'],
    allowNeighbors: true,
    // China es enorme: para la dominación cuenta como un puñado de provincias japonesas.
    areas: { J_MIN: 40_000, J_LIA: 25_000, J_SHA: 30_000, J_NAJ: 40_000, J_ZHE: 30_000, J_FUJ: 25_000, J_JUR: 25_000, J_MON: 20_000 },
  },
  rome: {
    label: '🦅 Imperio romano (117 d. C.)',
    description: 'El Imperio romano de Trajano en su máxima extensión, dividido por sus grandes ciudades (Roma, Bizancio, Alejandría, Cartago, Antioquía…), contra el Imperio parto, los kushanos, los germanos, los sármatas, los dacios libres, Armenia, Kush y los caledonios.',
    countries: historicIds('rome'),
    era: 'rome',
    featured: ['R_ROM', 'R_BIZ', 'R_ALE', 'R_CAR', 'R_ANT', 'R_CTE', 'R_LUG', 'R_LON', 'R_ATE', 'R_MAR', 'R_ARM', 'R_SAR',
      'R_EFE', 'R_PRS', 'R_BOS', 'R_BAC'],
    allowNeighbors: true,
    // Desiertos y estepas enormes (el Sáhara, Arabia, Kush...) cuentan como mucho esto para la dominación.
    maxArea: 150_000,
  },
};
export const SCENARIO_IDS = Object.keys(SCENARIOS);
export const DEFAULT_SCENARIO = 'world';

const sets = new Map(SCENARIO_IDS.map((id) => [id, SCENARIOS[id].countries ? new Set(SCENARIOS[id].countries) : null]));

export const scenarioOf = (id) => SCENARIOS[id] ?? SCENARIOS[DEFAULT_SCENARIO];
export const eraOf = (id) => scenarioOf(id).era ?? null;
/** ¿Se puede ganar llegando a la Luna en este mapa? (solo en la Guerra Fría) */
export const hasSpaceVictory = (id) => scenarioOf(id).spaceVictory === true;

/** ¿Se juega este país en el mapa elegido? */
export function inScenario(scenarioId, countryId) {
  const set = sets.get(scenarioId) ?? null;
  // Las regiones de otra época solo existen en su propio mapa.
  return set ? set.has(countryId) : !isAncient(countryId);
}

/** Superficie que cuenta para la dominación (algunos países gigantes cuentan solo su parte del mapa). */
export function scenarioArea(scenarioId, country) {
  const scenario = scenarioOf(scenarioId);
  return Math.min(scenario.areas?.[country.id] ?? country.area, scenario.maxArea ?? Infinity);
}
