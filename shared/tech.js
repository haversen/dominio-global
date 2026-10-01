// Tecnología compartida por servidor y cliente:
//   - Árbol de investigación (estilo War Thunder): ramas de tropas y de bombas, con niveles I-III.
//     Cada nodo exige el anterior de su rama y desbloquea una unidad o un arma.
//   - Doctrinas: mejoras generales con 3 niveles (producción, ataque, defensa, logística).
// Solo se investiga una cosa a la vez (un nodo o un nivel de doctrina).

// ---------- Árbol ----------

export const TREE_BRANCHES = [
  { id: 'infantry', label: 'Infantería', icon: '♟' },
  { id: 'armor', label: 'Blindados', icon: '▰' },
  { id: 'air', label: 'Aviación', icon: '✈' },
  { id: 'naval', label: 'Marina', icon: '⚓' },
  { id: 'bombs', label: 'Bombas', icon: '💣' },
];

const tier2 = { money: 120, industry: 50 };
const tier3 = { money: 250, industry: 100, oil: 30 };

// Los nodos de nivel I de las tropas vienen investigados de serie.
export const TECH_TREE = {
  inf1: { branch: 'infantry', tier: 1, unlocks: { unit: 'infantry' }, requires: [], free: true },
  inf2: { branch: 'infantry', tier: 2, unlocks: { unit: 'mech' }, requires: ['inf1'], cost: tier2, ms: 40_000 },
  inf3: { branch: 'infantry', tier: 3, unlocks: { unit: 'specops' }, requires: ['inf2'], cost: tier3, ms: 70_000 },
  arm1: { branch: 'armor', tier: 1, unlocks: { unit: 'tank' }, requires: [], free: true },
  arm2: { branch: 'armor', tier: 2, unlocks: { unit: 'heavytank' }, requires: ['arm1'], cost: tier2, ms: 40_000 },
  arm3: { branch: 'armor', tier: 3, unlocks: { unit: 'mbt' }, requires: ['arm2'], cost: tier3, ms: 70_000 },
  air1: { branch: 'air', tier: 1, unlocks: { unit: 'aircraft' }, requires: [], free: true },
  air2: { branch: 'air', tier: 2, unlocks: { unit: 'bomber' }, requires: ['air1'], cost: tier2, ms: 40_000 },
  air3: { branch: 'air', tier: 3, unlocks: { unit: 'jet' }, requires: ['air2'], cost: tier3, ms: 70_000 },
  sea1: { branch: 'naval', tier: 1, unlocks: { unit: 'navy' }, requires: [], free: true },
  sea2: { branch: 'naval', tier: 2, unlocks: { unit: 'submarine' }, requires: ['sea1'], cost: tier2, ms: 40_000 },
  sea3: { branch: 'naval', tier: 3, unlocks: { unit: 'carrier' }, requires: ['sea2'], cost: tier3, ms: 70_000 },
  bomb1: { branch: 'bombs', tier: 1, unlocks: { weapon: 'bombing' }, requires: ['air1'], cost: { money: 100, industry: 40 }, ms: 30_000 },
  bomb2: { branch: 'bombs', tier: 2, unlocks: { weapon: 'missile' }, requires: ['bomb1'], cost: { money: 200, industry: 80, oil: 30 }, ms: 60_000 },
  bomb3: { branch: 'bombs', tier: 3, unlocks: { weapon: 'nuke' }, requires: ['bomb2', 'air2'], cost: { money: 400, industry: 150, oil: 60 }, ms: 90_000 },
};
export const TREE_NODES = Object.keys(TECH_TREE);

export function startingUnlocks() {
  return TREE_NODES.filter((id) => TECH_TREE[id].free);
}

/** Nodo del árbol que desbloquea una unidad o un arma. */
export function nodeFor({ unit, weapon }) {
  return TREE_NODES.find((id) => (unit && TECH_TREE[id].unlocks.unit === unit)
    || (weapon && TECH_TREE[id].unlocks.weapon === weapon));
}

export function isUnlocked(unlocked, { unit, weapon }) {
  const node = nodeFor({ unit, weapon });
  return Boolean(node && unlocked?.includes(node));
}

/** Motivo por el que no se puede investigar un nodo todavía (o null si se puede). */
export function nodeError(unlocked, nodeId) {
  const node = TECH_TREE[nodeId];
  if (!node) return 'Tecnología desconocida';
  if (unlocked.includes(nodeId)) return 'Ya está investigada';
  if (node.requires.some((r) => !unlocked.includes(r))) return 'Antes tienes que investigar la anterior';
  return null;
}

// ---------- Doctrinas ----------

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

/** Coste de investigar el nivel `toLevel` de una doctrina. */
export function techCost(toLevel) {
  return { money: 80 * toLevel, industry: 30 * toLevel };
}

/** Tiempo de investigación (ms a velocidad normal) del nivel `toLevel`. */
export function techMs(toLevel) {
  return 30_000 * toLevel;
}

// Multiplicadores que aplica cada doctrina.
export const techBonus = {
  income: (tech) => 1 + 0.1 * (tech?.economy ?? 0),
  attack: (tech) => 1 + 0.1 * (tech?.military ?? 0),
  defense: (tech) => 1 + 0.1 * (tech?.defense ?? 0),
  speed: (tech) => 1 + 0.15 * (tech?.logistics ?? 0),
  upkeep: (tech) => 1 - 0.1 * (tech?.logistics ?? 0),
};
