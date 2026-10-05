import { SCENARIOS, SCENARIO_IDS, DEFAULT_SCENARIO, hasSpaceVictory } from './scenarios.js';
import { TEAM_MODES, TEAM_MODE_IDS } from './teams.js';
import { TROOP_PACES, DEFAULT_PACE } from './military.js';

// Ajustes de partida compartidos por servidor y cliente.
// El servidor los usa para validar; el cliente, para pintar el formulario del lobby.

export const SETTINGS_SCHEMA = {
  maxPlayers: {
    label: 'Jugadores máximos',
    type: 'select',
    options: [2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16],
    default: 6,
  },
  teams: {
    label: 'Equipos',
    type: 'select',
    options: TEAM_MODE_IDS,
    labels: Object.fromEntries(TEAM_MODE_IDS.map((id) => [id, TEAM_MODES[id].label])),
    default: 'none',
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
    options: [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15],
    labels: { 0: 'Ninguno' },
    default: 0,
  },
  // Cómo juegan los bots (server/bots.js, BOT_LEVELS). Fácil: atacan poco, no comercian ni se defienden.
  // Normal: defienden lo atacado, comercian y llevan tropas al frente. Difícil: además mandan refuerzos,
  // atacan en varios frentes y se alían contra el que va ganando.
  botLevel: {
    label: 'Dificultad de los bots',
    type: 'select',
    options: ['easy', 'normal', 'hard'],
    labels: { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' },
    default: 'normal',
    dependsOn: 'bots',
  },
  capitalCapture: {
    label: 'Al tomar la capital de un jugador',
    type: 'select',
    options: ['empire', 'neutral', 'move'],
    labels: {
      empire: 'El conquistador se queda con todo su imperio',
      neutral: 'Queda eliminado y su imperio se vuelve neutral',
      move: 'Traslada la capital y sigue jugando',
    },
    default: 'empire',
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
    label: 'Victoria científica (llegar a la Luna) · solo en la Guerra Fría',
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

  const space = next.winSpace && hasSpaceVictory(next.mapScenario);
  if (!next.winDomination && !next.winLastStanding && !next.winTimeLimit && !space && !next.winMission) {
    return { error: 'Debe haber al menos una condición de victoria activa' };
  }
  return { settings: next };
}
