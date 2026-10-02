// Espionaje: misiones de espías contra un país ajeno. Pueden salir mal y el espía ser capturado.

import { canAfford, addResources } from '../shared/economy.js';
import { UNIT_TYPES, emptyUnits } from '../shared/military.js';
import { TECH_TREE } from '../shared/tech.js';
import { BUILDING_TYPES } from '../shared/buildings.js';
import { SPY_MISSIONS } from '../shared/espionage.js';

/**
 * Ejecuta una misión. Devuelve { error } o { success, caught, text, event }.
 * `event` (si existe) es público: se anuncia en el chat y se avisa al dueño del país.
 */
export function runSpyMission(game, playerId, missionId, countryId, { now = Date.now(), rng = Math.random, COUNTRIES, nextId }) {
  if (game.phase !== 'active') return { error: 'La partida todavía no está en marcha' };
  const player = game.players[playerId];
  const mission = SPY_MISSIONS[missionId];
  const target = game.countries[countryId];
  if (!player || player.eliminated) return { error: 'Jugador no válido' };
  if (!mission) return { error: 'Misión desconocida' };
  if (!target) return { error: 'Ese país no existe' };
  if (target.owner === playerId) return { error: 'No puedes espiar tus propios países' };
  if (mission.needsPlayer && !target.owner) return { error: 'Esta misión solo se puede hacer contra otro jugador' };
  const key = `spy:${missionId}`;
  if ((player.cooldowns[key] ?? 0) > now) return { error: 'Tus espías todavía están preparando la siguiente misión' };
  if (!canAfford(player.resources, mission.cost)) return { error: 'No tienes recursos suficientes' };

  // Robar tecnología: tiene que haber algo que robar que puedas usar.
  let stealable = [];
  if (missionId === 'steal') {
    const theirs = game.players[target.owner]?.unlocked ?? [];
    stealable = theirs.filter((id) => !player.unlocked.includes(id)
      && TECH_TREE[id].requires.every((r) => player.unlocked.includes(r)));
    if (!stealable.length) return { error: 'Ese jugador no tiene ninguna tecnología que te sirva ahora' };
  }

  addResources(player.resources, mission.cost, -1);
  player.cooldowns[key] = now + Math.round(mission.cooldownMs / game.speed);
  const name = COUNTRIES.get(countryId).name;
  const success = rng() < mission.success;
  const caught = !success && rng() < 0.6;
  const base = { id: nextId(), ts: now, type: 'spy', mission: missionId, country: countryId, owner: target.owner, success };

  if (!success) {
    return {
      success, caught,
      text: caught ? `Tu espía ha sido capturado en ${name}` : `La misión ha fallado en ${name}, pero tu espía ha escapado`,
      event: caught ? { ...base, caught: true, by: playerId } : null,
    };
  }

  if (missionId === 'recon') {
    player.intel ??= {};
    player.intel[countryId] = now + Math.round(mission.revealMs / game.speed);
    return { success, caught: false, text: `Tus espías vigilan ${name}: verás sus tropas durante un tiempo`, event: null };
  }
  if (missionId === 'sabotage') {
    // Detiene las obras y daña un edificio; si no hay edificios, destruye parte de la guarnición.
    target.constructing = null;
    target.developing = null;
    const built = BUILDING_TYPES.filter((t) => target.buildings?.[t]);
    let what;
    if (built.length) {
      const t = built[Math.floor(rng() * built.length)];
      target.buildings = { ...target.buildings, [t]: target.buildings[t] - 1 };
      if (!target.buildings[t]) delete target.buildings[t];
      what = 'un edificio dañado';
    } else {
      const left = emptyUnits();
      for (const t of UNIT_TYPES) left[t] = Math.floor((target.units[t] ?? 0) * 0.8);
      target.units = left;
      what = 'parte de la guarnición destruida';
    }
    return { success, caught: false, text: `Sabotaje con éxito en ${name}: ${what}`, event: { ...base, damage: what } };
  }
  if (missionId === 'steal') {
    const node = stealable[Math.floor(rng() * stealable.length)];
    player.unlocked.push(node);
    return { success, caught: false, text: 'Tus espías han robado los planos de una tecnología', node, event: { ...base, node } };
  }
  if (missionId === 'incite') {
    target.stability = Math.max(0, (target.stability ?? 100) - mission.stabilityHit);
    return { success, caught: false, text: `Has sembrado el descontento en ${name}: su estabilidad cae`, event: { ...base } };
  }
  return { error: 'Misión desconocida' };
}

