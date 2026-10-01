// Árbol tecnológico compartido por servidor y cliente.

export const TECH_TYPES = ['economy', 'military', 'defense', 'logistics'];
export const TECH_MAX_LEVEL = 3;

export const TECHS = {
  economy: { label: 'Industrialización', icon: '⚙', effect: '+10 % de producción por nivel' },
  military: { label: 'Doctrina militar', icon: '⚔', effect: '+10 % de ataque por nivel' },
  defense: { label: 'Fortificaciones', icon: '🛡', effect: '+10 % de defensa por nivel' },
  logistics: { label: 'Logística', icon: '⛟', effect: '+15 % de velocidad y −10 % de mantenimiento por nivel' },
};

export function emptyTech() {
  return { economy: 0, military: 0, defense: 0, logistics: 0 };
}

/** Coste de investigar el nivel `toLevel`. */
export function techCost(toLevel) {
  return { money: 80 * toLevel, industry: 30 * toLevel };
}

/** Tiempo de investigación (ms a velocidad normal) del nivel `toLevel`. */
export function techMs(toLevel) {
  return 30_000 * toLevel;
}

// Multiplicadores que aplica cada rama.
export const techBonus = {
  income: (tech) => 1 + 0.1 * (tech?.economy ?? 0),
  attack: (tech) => 1 + 0.1 * (tech?.military ?? 0),
  defense: (tech) => 1 + 0.1 * (tech?.defense ?? 0),
  speed: (tech) => 1 + 0.15 * (tech?.logistics ?? 0),
  upkeep: (tech) => 1 - 0.1 * (tech?.logistics ?? 0),
};
