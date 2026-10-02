// Reglas de diplomacia compartidas por servidor y cliente.

export const RELATIONS = {
  peace: { label: 'Paz', icon: '☮' },
  war: { label: 'Guerra', icon: '⚔' },
  nap: { label: 'Pacto de no agresión', icon: '📜' },
  alliance: { label: 'Alianza', icon: '🤝' },
};

export const PROPOSALS = {
  peace: { label: 'Tratado de paz', verb: 'te propone la paz' },
  nap: { label: 'Pacto de no agresión', verb: 'te propone un pacto de no agresión' },
  alliance: { label: 'Alianza', verb: 'te propone una alianza' },
  trade: { label: 'Comercio', verb: 'te propone un intercambio' },
};

export const NAP_DURATION_MS = 5 * 60_000;
export const PROPOSAL_TTL_MS = 60_000;
export const MAX_PENDING_PER_PLAYER = 10;

/** Clave única para la relación entre dos jugadores (independiente del orden). */
export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Estado de la relación entre dos jugadores; por defecto, paz. */
export function relationOf(relations, a, b) {
  return relations?.[pairKey(a, b)] ?? { state: 'peace' };
}

/** ¿Qué propuestas tiene sentido hacer según la relación actual? */
export function proposalError(type, relation, now = Date.now(), { rivals = false } = {}) {
  const state = relation.state;
  // En partidas por equipos, las alianzas son solo entre compañeros.
  if (type === 'alliance' && rivals) return 'Sois de equipos contrarios: no podéis aliaros';
  if (type === 'peace' && state !== 'war') return 'Solo se puede proponer la paz estando en guerra';
  if (type === 'nap' && (state === 'alliance' || (state === 'nap' && relation.until > now))) {
    return 'Ya tenéis un acuerdo vigente';
  }
  if (type === 'alliance' && state === 'war') return 'Primero tenéis que firmar la paz';
  if (type === 'alliance' && state === 'alliance') return 'Ya sois aliados';
  if (type === 'trade' && state === 'war') return 'No se puede comerciar con un país en guerra';
  return null;
}

export function declareWarError(relation, now = Date.now()) {
  if (relation.state === 'war') return 'Ya estáis en guerra';
  if (relation.state === 'nap' && relation.until > now) return 'Tenéis un pacto de no agresión vigente';
  return null;
}
