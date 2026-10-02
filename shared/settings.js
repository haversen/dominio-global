import { SCENARIOS, SCENARIO_IDS, DEFAULT_SCENARIO } from './scenarios.js';
import { TROOP_PACES, DEFAULT_PACE } from './military.js';

// Ajustes de partida compartidos por servidor y cliente.
// El servidor los usa para validar; el cliente, para pintar el formulario del lobby.

export const SETTINGS_SCHEMA = {
  maxPlayers: {
    label: 'Jugadores máximos',
    type: 'select',
    options: [2, 3, 4, 5, 6, 7, 8],
    default: 6,
  },
  mapScenario: {
    label: 'Mapa',
    type: 'select',
    options: SCENARIO_IDS,
    labels: Object.fromEntries(SCENARIO_IDS.map((id) => [id, SCENARIOS[id].label])),
    default: DEFAULT_SCENARIO,
  },
  troopPace: {
    label: 'Movimiento de las tropas',
    type: 'select',
    options: Object.keys(TROOP_PACES),
    labels: Object.fromEntries(Object.entries(TROOP_PACES).map(([id, p]) => [id, p.label])),
    default: DEFAULT_PACE,
  },
  gameSpeed: {
    label: 'Velocidad de juego (economía e investigación)',
    type: 'select',
    options: ['marathon', 'slow', 'normal', 'fast'],
    labels: { marathon: 'Muy lenta (partidas de días)', slow: 'Lenta', normal: 'Normal', fast: 'Rápida' },
    default: 'normal',
  },
  aiDifficulty: {
    label: 'IA de los países neutrales',
    type: 'select',
    options: ['passive', 'normal', 'aggressive'],
    labels: { passive: 'Pasiva', normal: 'Normal', aggressive: 'Agresiva' },
    default: 'normal',
  },
  countryAssignment: {
    label: 'Quien no elija país en la sala',
    type: 'select',
    options: ['random', 'choose'],
    labels: { random: 'Recibe uno al azar', choose: 'Lo elige en el mapa' },
    default: 'random',
  },
  bots: {
    label: 'Bots (jugadores de la IA que rellenan plazas)',
    type: 'select',
    options: [0, 1, 2, 3, 4, 5],
    labels: { 0: 'Ninguno' },
    default: 0,
  },
  fogOfWar: {
    label: 'Niebla de guerra (solo ves cerca de tus países)',
    type: 'bool',
    default: true,
  },
  worldEvents: {
    label: 'Eventos mundiales y noticiero',
    type: 'bool',
    default: true,
  },
  unAssembly: {
    label: 'Naciones Unidas (votaciones entre jugadores)',
    type: 'bool',
    default: true,
  },
  winDomination: {
    label: 'Victoria por dominación',
    type: 'bool',
    default: true,
  },
  dominationPercent: {
    label: '% del mundo a controlar',
    type: 'select',
    options: [30, 40, 50, 60, 75],
    suffix: '%',
    default: 50,
    dependsOn: 'winDomination',
  },
  winLastStanding: {
    label: 'Victoria por ser el último en pie',
    type: 'bool',
    default: true,
  },
  winSpace: {
    label: 'Victoria científica (llegar a la Luna)',
    type: 'bool',
    default: true,
  },
  winMission: {
    label: 'Victoria por cumplir tu misión secreta',
    type: 'bool',
    default: false,
  },
  winTimeLimit: {
    label: 'Límite de tiempo (gana la mayor puntuación)',
    type: 'bool',
    default: false,
  },
  timeLimitMinutes: {
    label: 'Duración de la partida',
    type: 'select',
    options: [15, 30, 45, 60, 90, 120, 1440, 4320, 10080],
    suffix: ' min',
    labels: { 1440: '1 día', 4320: '3 días', 10080: '1 semana' },
    default: 60,
    dependsOn: 'winTimeLimit',
  },
};

export function defaultSettings() {
  return Object.fromEntries(
    Object.entries(SETTINGS_SCHEMA).map(([key, def]) => [key, def.default]),
  );
}

export function optionLabel(def, value) {
  return def.labels?.[value] ?? `${value}${def.suffix ?? ''}`;
}

/**
 * Aplica un cambio parcial sobre los ajustes actuales.
 * Devuelve { settings } si es válido o { error } con un mensaje legible.
 */
export function applySettingsPatch(current, patch) {
  if (!patch || typeof patch !== 'object') return { error: 'Ajustes inválidos' };

  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const def = SETTINGS_SCHEMA[key];
    if (!def) return { error: `Ajuste desconocido: ${key}` };
    if (def.type === 'bool' && typeof value !== 'boolean') {
      return { error: `Valor inválido para "${def.label}"` };
    }
    if (def.type === 'select' && !def.options.includes(value)) {
      return { error: `Valor inválido para "${def.label}"` };
    }
    next[key] = value;
  }

  if (!next.winDomination && !next.winLastStanding && !next.winTimeLimit && !next.winSpace && !next.winMission) {
    return { error: 'Debe haber al menos una condición de victoria activa' };
  }
  return { settings: next };
}
