// Clasificación y condiciones de victoria.

import { RESOURCES } from '../shared/economy.js';
import { totalUnits } from '../shared/military.js';
import { TECH_TYPES, startingUnlocks } from '../shared/tech.js';
import { scoreOf } from '../shared/score.js';
import { usedSlots } from '../shared/buildings.js';
import { MISSION_BONUS, SPACE_BONUS } from '../shared/world.js';

const FREE_NODES = startingUnlocks().length;

/** Clasificación actual, de mayor a menor puntuación. */
/** areaOf(countryId) da la superficie que cuenta en el mapa de la partida. */
export function standings(game, areaOf, totalArea) {
  const rows = {};
  for (const [pid, p] of Object.entries(game.players)) {
    rows[pid] = {
      id: pid,
      eliminated: p.eliminated,
      countries: 0,
      area: 0,
      development: 0,
      units: 0,
      // Doctrinas + nodos del árbol investigados (sin contar los que vienen de serie).
      techLevels: TECH_TYPES.reduce((s, t) => s + (p.tech?.[t] ?? 0), 0) + Math.max(0, (p.unlocked?.length ?? 0) - FREE_NODES),
      resources: RESOURCES.reduce((s, r) => s + p.resources[r], 0),
      stats: p.stats,
      // Bonificaciones: misión secreta cumplida y etapas de la carrera espacial.
      bonus: (p.mission?.done ? MISSION_BONUS : 0) + SPACE_BONUS[p.space?.stage ?? 0],
    };
  }
  for (const [id, c] of Object.entries(game.countries)) {
    const row = rows[c.owner];
    if (!row) continue;
    row.countries++;
    row.area += areaOf(id);
    row.development += c.level - 1 + usedSlots(c.buildings) / 2; // cada 2 niveles de edificios = 1 de desarrollo
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
      score: scoreOf({ ...r, areaPct, resources: r.resources }) + r.bonus,
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
  if (game.teams) return teamVictory(game, table, alive, now);

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

// Por equipos se suman los países y la puntuación de los compañeros.
// Devuelve el mejor jugador vivo del equipo ganador como `winner` (y `team`).
function teamVictory(game, table, alive, now) {
  const teamOf = (r) => game.teams[r.id];
  const best = (team) => alive.find((r) => teamOf(r) === team);
  const sum = (team, key, rows = table) => rows.filter((r) => teamOf(r) === team).reduce((s, r) => s + r[key], 0);
  const teamsAlive = [...new Set(alive.map(teamOf))];
  const { domination, lastStanding, timeLimitMs } = game.victory;
  if (domination) {
    const dominant = teamsAlive.find((t) => sum(t, 'areaPct', alive) >= domination);
    if (dominant) return { winner: best(dominant).id, team: dominant, reason: 'domination' };
  }
  if (lastStanding && (game.startTeams ?? 2) >= 2 && teamsAlive.length === 1) {
    return { winner: best(teamsAlive[0]).id, team: teamsAlive[0], reason: 'lastStanding' };
  }
  if (timeLimitMs && now - game.startedAt >= timeLimitMs) {
    const top = teamsAlive.reduce((a, b) => (sum(b, 'score') > sum(a, 'score') ? b : a));
    return { winner: best(top).id, team: top, reason: 'time' };
  }
  return null;
}
