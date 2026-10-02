// Misiones secretas: cada jugador recibe un objetivo oculto al empezar.
// Cumplirlo da puntos (o la victoria, si así se configuró) y se revela a todos.

import { MISSIONS } from '../shared/world.js';
import { REGIONS } from '../shared/scenarios.js';
import { BUILDING_TYPES } from '../shared/buildings.js';
import { domainCount } from '../shared/military.js';
import { STRATEGIC_TYPES, strategicOf } from '../shared/strategic.js';

/** Reparte una misión a cada jugador según el mapa (solo regiones con bastantes países jugables). */
export function assignMissions(game, playerIds, rng, { playable }) {
  const regions = Object.entries(REGIONS)
    .filter(([, r]) => r.countries.filter(playable).length >= 6)
    .map(([id]) => id);
  for (const pid of playerIds) {
    const options = ['builder', 'developer', 'admiral', 'spymaster', 'tycoon', 'strategist'];
    if (regions.length) options.push('continent', 'continent');
    const others = playerIds.filter((x) => x !== pid);
    if (others.length) options.push('hunter');
    const type = options[Math.floor(rng() * options.length)];
    const mission = { type, done: false };
    if (type === 'continent') mission.region = regions[Math.floor(rng() * regions.length)];
    if (type === 'hunter') mission.target = others[Math.floor(rng() * others.length)];
    game.players[pid].mission = mission;
  }
}

/** Progreso de una misión: { have, need }. */
export function missionProgress(game, pid, { playable, COUNTRIES }) {
  const player = game.players[pid];
  const m = player?.mission;
  if (!m) return null;
  const mine = Object.entries(game.countries).filter(([, c]) => c.owner === pid);
  switch (m.type) {
    case 'continent': {
      const list = REGIONS[m.region].countries.filter(playable);
      return { have: list.filter((id) => game.countries[id]?.owner === pid).length, need: Math.ceil(list.length / 2) };
    }
    case 'builder':
      return { have: mine.reduce((n, [, c]) => n + BUILDING_TYPES.reduce((k, t) => k + (c.buildings?.[t] ?? 0), 0), 0), need: 12 };
    case 'developer':
      return { have: mine.filter(([, c]) => c.level >= 4).length, need: 3 };
    case 'hunter':
      return { have: game.players[m.target]?.eliminated || !game.players[m.target] ? 1 : 0, need: 1 };
    case 'admiral': {
      const coastal = mine.filter(([id]) => COUNTRIES.get(id).coastal).length;
      const ships = mine.reduce((n, [, c]) => n + domainCount(c.units, 'sea'), 0)
        + game.armies.filter((a) => a.owner === pid).reduce((n, a) => n + domainCount(a.units, 'sea'), 0);
      return { have: Math.min(coastal, 8) + Math.min(ships, 10), need: 18 };
    }
    case 'spymaster':
      return { have: player.stats?.spySuccess ?? 0, need: 5 };
    case 'tycoon':
      return { have: Math.floor(player.resources.money), need: 2500 };
    case 'strategist': {
      const owned = new Set(mine.flatMap(([id]) => strategicOf(id)));
      return { have: STRATEGIC_TYPES.filter((t) => owned.has(t)).length, need: STRATEGIC_TYPES.length };
    }
    default:
      return null;
  }
}

/** Marca las misiones cumplidas. Devuelve [{ player, mission }]. */
export function checkMissions(game, ctx) {
  const done = [];
  for (const [pid, p] of Object.entries(game.players)) {
    if (p.eliminated || !p.mission || p.mission.done) continue;
    const prog = missionProgress(game, pid, ctx);
    if (prog && prog.have >= prog.need) {
      p.mission.done = true;
      done.push({ player: pid, mission: p.mission });
    }
  }
  return done;
}


