// Ajustes de partida compartidos por servidor y cliente.
// El servidor los usa para validar; el cliente, para pintar el formulario del lobby.

export const SETTINGS_SCHEMA = {
  maxPlayers: {
    label: 'Jugadores máximos',
    type: 'select',
    options: [2, 3, 4, 5, 6, 7, 8],
    default: 6,
  },
  gameSpeed: {
    label: 'Velocidad de juego',
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

  if (!next.winDomination && !next.winLastStanding && !next.winTimeLimit) {
    return { error: 'Debe haber al menos una condición de victoria activa' };
  }
  return { settings: next };
}
