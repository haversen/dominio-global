// Diplomacia y comercio entre jugadores. Todas las funciones devuelven { error } o un resultado.

import {
  pairKey, relationOf, proposalError, declareWarError, NAP_DURATION_MS, PROPOSAL_TTL_MS,
  MAX_PENDING_PER_PLAYER,
} from '../shared/diplomacy.js';
import { RESOURCES, canAfford, addResources } from '../shared/economy.js';

export { relationOf };

function activePlayer(game, id) {
  const p = game.players[id];
  return p && !p.eliminated ? p : null;
}

export function setRelation(game, a, b, state, until = null) {
  if (state === 'peace') delete game.relations[pairKey(a, b)];
  else game.relations[pairKey(a, b)] = until ? { state, until } : { state };
}

export function declareWar(game, from, to, now = Date.now()) {
  if (game.phase !== 'active') return { error: 'La partida todavía no está en marcha' };
  if (from === to || !activePlayer(game, from) || !activePlayer(game, to)) return { error: 'Jugador no válido' };
  if (game.teams && game.teams[from] && game.teams[from] === game.teams[to]) {
    return { error: 'Sois del mismo equipo: no podéis atacaros' };
  }
  const relation = relationOf(game.relations, from, to);
  const error = declareWarError(relation, now);
  if (error) return { error };

  setRelation(game, from, to, 'war');
  // Las propuestas pendientes entre ambos dejan de tener sentido.
  game.proposals = game.proposals.filter((p) => pairKey(p.from, p.to) !== pairKey(from, to));
  return { betrayal: relation.state === 'alliance' };
}

/** Normaliza una oferta de comercio: { give, receive } con enteros >= 0. */
function parseTrade(payload) {
  const out = { give: {}, receive: {} };
  for (const side of ['give', 'receive']) {
    for (const r of RESOURCES) {
      const v = payload?.[side]?.[r] ?? 0;
      if (!Number.isInteger(v) || v < 0 || v > 1_000_000) return null;
      if (v > 0) out[side][r] = v;
    }
  }
  if (!Object.keys(out.give).length && !Object.keys(out.receive).length) return null;
  return out;
}

export function propose(game, from, to, type, payload, now = Date.now()) {
  if (game.phase !== 'active') return { error: 'La partida todavía no está en marcha' };
  if (!['peace', 'nap', 'alliance', 'trade'].includes(type)) return { error: 'Propuesta desconocida' };
  if (from === to || !activePlayer(game, from) || !activePlayer(game, to)) return { error: 'Jugador no válido' };

  const error = proposalError(type, relationOf(game.relations, from, to), now);
  if (error) return { error };
  if (game.proposals.some((p) => p.from === from && p.to === to && p.type === type)) {
    return { error: 'Ya tienes una propuesta igual pendiente' };
  }
  if (game.proposals.filter((p) => p.from === from).length >= MAX_PENDING_PER_PLAYER) {
    return { error: 'Tienes demasiadas propuestas pendientes' };
  }

  const proposal = { id: ++game.seq, type, from, to, createdAt: now, expiresAt: now + PROPOSAL_TTL_MS };
  if (type === 'trade') {
    const trade = parseTrade(payload);
    if (!trade) return { error: 'Oferta de comercio inválida' };
    if (!canAfford(game.players[from].resources, trade.give)) return { error: 'No tienes lo que ofreces' };
    proposal.trade = trade;
  }
  game.proposals.push(proposal);
  return { proposal };
}

/** El destinatario acepta o rechaza una propuesta. */
export function respond(game, playerId, proposalId, accept, now = Date.now()) {
  const proposal = game.proposals.find((p) => p.id === proposalId);
  if (!proposal || proposal.to !== playerId) return { error: 'Esa propuesta ya no existe' };
  game.proposals = game.proposals.filter((p) => p !== proposal);
  if (!accept) return { proposal, accepted: false };

  const { from, to, type } = proposal;
  if (!activePlayer(game, from) || !activePlayer(game, to)) return { error: 'El otro jugador ya no está' };
  // Las condiciones pueden haber cambiado desde que se hizo la propuesta.
  const error = proposalError(type, relationOf(game.relations, from, to), now);
  if (error) return { error };

  if (type === 'peace') setRelation(game, from, to, 'peace');
  if (type === 'nap') setRelation(game, from, to, 'nap', now + NAP_DURATION_MS);
  if (type === 'alliance') setRelation(game, from, to, 'alliance');
  if (type === 'trade') {
    const giver = game.players[from].resources;
    const taker = game.players[to].resources;
    if (!canAfford(giver, proposal.trade.give)) return { error: 'El otro jugador ya no tiene lo que ofrecía' };
    if (!canAfford(taker, proposal.trade.receive)) return { error: 'No tienes lo que te piden' };
    addResources(giver, proposal.trade.give, -1);
    addResources(taker, proposal.trade.give);
    addResources(taker, proposal.trade.receive, -1);
    addResources(giver, proposal.trade.receive);
  }
  return { proposal, accepted: true };
}

export function cancelProposal(game, playerId, proposalId) {
  const proposal = game.proposals.find((p) => p.id === proposalId);
  if (!proposal || proposal.from !== playerId) return { error: 'Esa propuesta ya no existe' };
  game.proposals = game.proposals.filter((p) => p !== proposal);
  return { proposal };
}

/** Caducan propuestas y pactos. Devuelve los pactos que han terminado. */
export function tickDiplomacy(game, now) {
  const before = game.proposals.length;
  game.proposals = game.proposals.filter((p) => p.expiresAt > now);
  const ended = [];
  for (const [key, rel] of Object.entries(game.relations)) {
    if (rel.state === 'nap' && rel.until <= now) {
      delete game.relations[key];
      ended.push(key.split('|'));
    }
  }
  return { changed: before !== game.proposals.length || ended.length > 0, endedPacts: ended };
}

/** Quita todo rastro diplomático de un jugador (abandono o eliminación). */
export function forgetPlayer(game, playerId) {
  game.proposals = game.proposals.filter((p) => p.from !== playerId && p.to !== playerId);
  for (const key of Object.keys(game.relations)) {
    if (key.split('|').includes(playerId)) delete game.relations[key];
  }
}
