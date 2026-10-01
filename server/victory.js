// Clasificación y condiciones de victoria.

import { RESOURCES } from '../shared/economy.js';
import { totalUnits } from '../shared/military.js';
import { TECH_TYPES } from '../shared/tech.js';
import { scoreOf } from '../shared/score.js';

/** Clasificación actual, de mayor a menor puntuación. */
export function standings(game, COUNTRIES, totalArea) {
  const rows = {};
  for (const [pid, p] of Object.entries(game.players)) {
    rows[pid] = {
      id: pid,
      eliminated: p.eliminated,
      countries: 0,
      area: 0,
      development: 0,
      units: 0,
      techLevels: TECH_TYPES.reduce((s, t) => s + (p.tech?.[t] ?? 0), 0),
      resources: RESOURCES.reduce((s, r) => s + p.resources[r], 0),
      stats: p.stats,
    };
  }
  for (const [id, c] of Object.entries(game.countries)) {
    const row = rows[c.owner];
    if (!row) continue;
    row.countries++;
    row.area += COUNTRIES.get(id).area;
    row.development += c.level - 1;
    row.units += totalUnits(c.units);
  }
  for (const a of game.armies) if (rows[a.owner]) rows[a.owner].units += totalUnits(a.units);

  return Object.values(rows).map((r) => {
    const areaPct = Math.round((r.area / totalArea) * 1000) / 10;
    return {
      id: r.id,
      eliminated: r.eliminated,
      countries: r.countries,
      areaPct,
      units: r.units,
      techLevels: r.techLevels,
      stats: r.stats,
      score: scoreOf({ ...r, areaPct, resources: r.resources }),
    };
  }).sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || b.score - a.score);
}

/**
 * ¿Ha terminado la partida? Devuelve { winner, reason } o null.
 * game.victory: { domination: % | null, lastStanding: bool, timeLimitMs: ms | null }
 */
export function checkVictory(game, table, now) {
  const alive = table.filter((r) => !r.eliminated);
  if (alive.length === 0) return { winner: null, reason: 'defeat' };

  const { domination, lastStanding, timeLimitMs } = game.victory;
  if (domination) {
    const dominant = alive.find((r) => r.areaPct >= domination);
    if (dominant) return { winner: dominant.id, reason: 'domination' };
  }
  // «Último en pie» solo tiene sentido si la partida empezó con varios jugadores.
  if (lastStanding && game.startPlayers >= 2 && alive.length === 1) {
    return { winner: alive[0].id, reason: 'lastStanding' };
  }
  if (timeLimitMs && now - game.startedAt >= timeLimitMs) {
    return { winner: alive[0].id, reason: 'time' };
  }
  return null;
}
