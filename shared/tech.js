// Tecnología compartida por servidor y cliente, al estilo de War Thunder:
//   - Cada rama (infantería, blindados, aviación, marina, bombas y doctrinas) investiga por su
//     cuenta: se puede investigar una cosa a la vez EN CADA RAMA, todas en paralelo.
//   - Rangos I-IV. En cada rama hay tropas (vehículos) y modificaciones que las mejoran.
//     Cada nodo exige el anterior; las tropas de rango I vienen de serie.
//   - Doctrinas: mejoras generales con 3 niveles (producción, ataque, defensa, logística).

// ---------- Árbol ----------

export const TREE_BRANCHES = [
  { id: 'infantry', label: 'Infantería', icon: '🪖' },
  { id: 'armor', label: 'Blindados', icon: '▰' },
  { id: 'air', label: 'Aviación', icon: '✈️' },
  { id: 'naval', label: 'Marina', icon: '⚓' },
  { id: 'bombs', label: 'Bombas', icon: '💣' },
];
// Las doctrinas son una rama más, con su propio hueco de investigación.
export const DOCTRINE_BRANCH = { id: 'doctrine', label: 'Doctrinas', icon: '📜' };
export const RESEARCH_BRANCHES = [...TREE_BRANCHES.map((b) => b.id), DOCTRINE_BRANCH.id];
export const MAX_RANK = 4;

const mod1 = { money: 80, industry: 30 };
const tier2 = { money: 120, industry: 50 };
const mod2 = { money: 150, industry: 60, oil: 10 };
const tier3 = { money: 250, industry: 100, oil: 30 };
const mod4 = { money: 320, industry: 130, oil: 45 };

// Modificaciones: `effect` describe qué mejoran.
//   { stat: 'attack' | 'defense' | 'train' | 'speed', classes: [...], mult }
//   { stat: 'intercept', add } · { stat: 'amphibious' } · { stat: 'bombKill', add }
export const TECH_TREE = {
  // Infantería
  inf1: { branch: 'infantry', rank: 1, unlocks: { unit: 'infantry' }, requires: [], free: true },
  infA: {
    branch: 'infantry', rank: 1, label: 'Entrenamiento de élite', icon: '🎯', requires: ['inf1'], cost: mod1, ms: 30_000,
    desc: '+15 % de ataque de la infantería', effect: { stat: 'attack', classes: ['infantry', 'special'], mult: 1.15 },
  },
  inf2: { branch: 'infantry', rank: 2, unlocks: { unit: 'mech' }, requires: ['inf1'], cost: tier2, ms: 40_000 },
  infB: {
    branch: 'infantry', rank: 2, label: 'Reclutamiento rápido', icon: '⏱', requires: ['inf2'], cost: mod2, ms: 45_000,
    desc: 'La infantería se entrena un 30 % más rápido', effect: { stat: 'train', classes: ['infantry', 'special'], mult: 0.7 },
  },
  inf3: { branch: 'infantry', rank: 3, unlocks: { unit: 'specops' }, requires: ['inf2'], cost: tier3, ms: 70_000 },
  infC: {
    branch: 'infantry', rank: 4, label: 'Visión nocturna', icon: '🥽', requires: ['inf3'], cost: mod4, ms: 80_000,
    desc: '+20 % de defensa de la infantería', effect: { stat: 'defense', classes: ['infantry', 'special'], mult: 1.2 },
  },
  // Blindados
  arm1: { branch: 'armor', rank: 1, unlocks: { unit: 'tank' }, requires: [], free: true },
  armA: {
    branch: 'armor', rank: 1, label: 'Blindaje reforzado', icon: '🛡', requires: ['arm1'], cost: mod1, ms: 30_000,
    desc: '+15 % de defensa de los blindados', effect: { stat: 'defense', classes: ['armor'], mult: 1.15 },
  },
  arm2: { branch: 'armor', rank: 2, unlocks: { unit: 'heavytank' }, requires: ['arm1'], cost: tier2, ms: 40_000 },
  armB: {
    branch: 'armor', rank: 2, label: 'Motores diésel', icon: '⚙', requires: ['arm2'], cost: mod2, ms: 45_000,
    desc: 'Los blindados avanzan un 25 % más rápido', effect: { stat: 'speed', classes: ['armor'], mult: 1.25 },
  },
  arm3: { branch: 'armor', rank: 3, unlocks: { unit: 'mbt' }, requires: ['arm2'], cost: tier3, ms: 70_000 },
  armC: {
    branch: 'armor', rank: 4, label: 'Munición perforante', icon: '🎯', requires: ['arm3'], cost: mod4, ms: 80_000,
    desc: '+20 % de ataque de los blindados', effect: { stat: 'attack', classes: ['armor'], mult: 1.2 },
  },
  // Aviación
  air1: { branch: 'air', rank: 1, unlocks: { unit: 'aircraft' }, requires: [], free: true },
  airA: {
    branch: 'air', rank: 1, label: 'Radar', icon: '📡', requires: ['air1'], cost: mod1, ms: 30_000,
    desc: 'Tus defensas interceptan un 50 % más de bombas', effect: { stat: 'intercept', mult: 1.5 },
  },
  air2: { branch: 'air', rank: 2, unlocks: { unit: 'bomber' }, requires: ['air1'], cost: tier2, ms: 40_000 },
  airB: {
    branch: 'air', rank: 2, label: 'Pilotos veteranos', icon: '🎖', requires: ['air2'], cost: mod2, ms: 45_000,
    desc: '+15 % de ataque de la aviación', effect: { stat: 'attack', classes: ['air'], mult: 1.15 },
  },
  air3: { branch: 'air', rank: 3, unlocks: { unit: 'jet' }, requires: ['air2'], cost: tier3, ms: 70_000 },
  airC: {
    branch: 'air', rank: 4, label: 'Reabastecimiento en vuelo', icon: '⛽', requires: ['air3'], cost: mod4, ms: 80_000,
    desc: 'La aviación vuela un 30 % más rápido', effect: { stat: 'speed', classes: ['air'], mult: 1.3 },
  },
  // Marina
  sea1: { branch: 'naval', rank: 1, unlocks: { unit: 'navy' }, requires: [], free: true },
  seaA: {
    branch: 'naval', rank: 1, label: 'Sonar', icon: '🔊', requires: ['sea1'], cost: mod1, ms: 30_000,
    desc: '+15 % de defensa de los barcos', effect: { stat: 'defense', classes: ['naval'], mult: 1.15 },
  },
  sea2: { branch: 'naval', rank: 2, unlocks: { unit: 'submarine' }, requires: ['sea1'], cost: tier2, ms: 40_000 },
  seaB: {
    branch: 'naval', rank: 2, label: 'Desembarco anfibio', icon: '⛵', requires: ['sea2'], cost: mod2, ms: 45_000,
    desc: 'Atacar desde el mar ya no penaliza', effect: { stat: 'amphibious' },
  },
  sea3: { branch: 'naval', rank: 3, unlocks: { unit: 'carrier' }, requires: ['sea2'], cost: tier3, ms: 70_000 },
  seaC: {
    branch: 'naval', rank: 4, label: 'Torpedos guiados', icon: '🎯', requires: ['sea3'], cost: mod4, ms: 80_000,
    desc: '+20 % de ataque de los barcos', effect: { stat: 'attack', classes: ['naval'], mult: 1.2 },
  },
  // Bombas
  bomb1: { branch: 'bombs', rank: 1, unlocks: { weapon: 'bombing' }, requires: ['air1'], cost: { money: 100, industry: 40 }, ms: 30_000 },
  bombA: {
    branch: 'bombs', rank: 2, label: 'Bombas de racimo', icon: '💥', requires: ['bomb1'], cost: mod2, ms: 45_000,
    desc: 'Tus bombas destruyen un 10 % más de tropas', effect: { stat: 'bombKill', add: 0.1 },
  },
  bomb2: { branch: 'bombs', rank: 2, unlocks: { weapon: 'missile' }, requires: ['bomb1'], cost: { money: 200, industry: 80, oil: 30 }, ms: 60_000 },
  bombB: {
    branch: 'bombs', rank: 3, label: 'Escudo antimisiles', icon: '🛰', requires: ['bomb2'], cost: tier3, ms: 70_000,
    desc: 'Tus defensas interceptan un 50 % más de bombas', effect: { stat: 'intercept', mult: 1.5 },
  },
  bomb3: { branch: 'bombs', rank: 4, unlocks: { weapon: 'nuke' }, requires: ['bomb2', 'air2'], cost: { money: 400, industry: 150, oil: 60 }, ms: 90_000 },
};
export const TREE_NODES = Object.keys(TECH_TREE);

export function startingUnlocks() {
  return TREE_NODES.filter((id) => TECH_TREE[id].free);
}

/** Nodo del árbol que desbloquea una unidad o un arma. */
export function nodeFor({ unit, weapon }) {
  return TREE_NODES.find((id) => (unit && TECH_TREE[id].unlocks?.unit === unit)
    || (weapon && TECH_TREE[id].unlocks?.weapon === weapon));
}

export function isUnlocked(unlocked, { unit, weapon }) {
  const node = nodeFor({ unit, weapon });
  return Boolean(node && unlocked?.includes(node));
}

/**
 * Ventajas de las modificaciones investigadas:
 * { attack: {clase: mult}, defense: {...}, train: {...}, speed: {...}, intercept, amphibious, bombKill }
 */
export function treeBonus(unlocked = []) {
  const bonus = { attack: {}, defense: {}, train: {}, speed: {}, intercept: 1, amphibious: false, bombKill: 0 };
  for (const id of unlocked ?? []) {
    const effect = TECH_TREE[id]?.effect;
    if (!effect) continue;
    if (effect.classes) for (const c of effect.classes) bonus[effect.stat][c] = (bonus[effect.stat][c] ?? 1) * effect.mult;
    else if (effect.stat === 'intercept') bonus.intercept *= effect.mult;
    else if (effect.stat === 'amphibious') bonus.amphibious = true;
    else if (effect.stat === 'bombKill') bonus.bombKill += effect.add;
  }
  return bonus;
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
