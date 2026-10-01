// IA de los países neutrales. Son ejércitos sin dueño (owner: null) que:
//   1. recuperan poco a poco su guarnición,
//   2. envían refuerzos a un vecino neutral cuando ven tropas enemigas acercándose,
//   3. contraatacan países de jugadores con fronteras débiles.

import { UNITS, UNIT_TYPES, emptyUnits, totalUnits, travelMs, domainCount } from '../shared/military.js';

export const AI_LEVELS = {
  passive: { regenMs: 40_000, reinforce: false, counter: null, revengeOnly: true },
  normal: { regenMs: 20_000, reinforce: true, counter: 2.0, revengeOnly: true },
  aggressive: { regenMs: 12_000, reinforce: true, counter: 1.4, revengeOnly: false },
};

const THINK_MS = 3_000;
const REGEN_CAP = 1.5;            // la guarnición crece hasta 1,5× la inicial
const KEEP_INFANTRY = 2;          // lo mínimo que se queda defendiendo
const REVENGE_WINDOW_MS = 5 * 60_000;
const ATTACK_COOLDOWN_MS = 60_000;
const MAX_ACTIONS_PER_THINK = 3;

export function createAIState(level, countries, now) {
  return {
    level: AI_LEVELS[level] ? level : 'normal',
    caps: Object.fromEntries(Object.entries(countries).map(([id, c]) => [id, Math.ceil(c.units.infantry * REGEN_CAP)])),
    nextRegen: now,
    nextThink: now,
    answered: [],   // ejércitos a los que ya se respondió con refuerzos
    cooldowns: {},  // país neutral -> momento en que puede volver a atacar
  };
}

const power = (units, kind) => UNIT_TYPES.reduce((sum, t) => sum + UNITS[t][kind] * (units[t] ?? 0), 0);

/** Avanza la IA. Necesita el mapa (COUNTRIES) para vecinos y distancias. Devuelve true si cambió algo. */
export function tickAI(game, COUNTRIES, now) {
  const ai = game.ai;
  if (!ai) return false;
  const cfg = AI_LEVELS[ai.level];
  let changed = false;

  if (now >= ai.nextRegen) {
    ai.nextRegen = now + cfg.regenMs / game.speed;
    for (const [id, c] of Object.entries(game.countries)) {
      if (c.owner === null && c.units.infantry < (ai.caps[id] ?? 0)) {
        c.units.infantry += 1;
        changed = true;
      }
    }
  }

  if (now < ai.nextThink) return changed;
  ai.nextThink = now + THINK_MS;
  let actions = 0;

  const launch = (from, to, units) => {
    addArmy(game, COUNTRIES, from, to, units, now);
    actions++;
    changed = true;
  };

  // Refuerzos: un vecino neutral manda tropas si llegan antes que el atacante.
  if (cfg.reinforce) {
    const answered = new Set(ai.answered);
    for (const army of game.armies) {
      if (actions >= MAX_ACTIONS_PER_THINK) break;
      if (army.owner === null || answered.has(army.id) || army.returning) continue;
      if (game.countries[army.to].owner !== null) continue;
      answered.add(army.id);
      const target = COUNTRIES.get(army.to);
      for (const n of target.neighbors) {
        const helper = game.countries[n];
        if (helper.owner !== null || target.sea.includes(n)) continue;
        const spare = Math.floor((helper.units.infantry - KEEP_INFANTRY) / 2);
        if (spare < 1) continue;
        const units = { ...emptyUnits(), infantry: spare };
        if (now + travelMs(COUNTRIES.get(n), target, units, game.speed) >= army.arriveAt) continue;
        helper.units.infantry -= spare;
        launch(n, army.to, units);
        break;
      }
    }
    // Solo recordamos ejércitos que siguen en marcha.
    const marching = new Set(game.armies.map((a) => a.id));
    ai.answered = [...answered].filter((id) => marching.has(id));
  }

  // Contraataques contra fronteras débiles de los jugadores.
  if (cfg.counter) {
    for (const [id, c] of Object.entries(game.countries)) {
      if (actions >= MAX_ACTIONS_PER_THINK) break;
      if (c.owner === null || !game.players[c.owner]) continue;
      if (cfg.revengeOnly && !(c.formerNeutral && now - c.conqueredAt < REVENGE_WINDOW_MS)) continue;
      if (game.armies.some((a) => a.owner === null && a.to === id)) continue;

      const defense = power(c.units, 'defense') * 1.5 + 1;
      for (const n of COUNTRIES.get(id).neighbors) {
        const attacker = game.countries[n];
        if (attacker.owner !== null || (ai.cooldowns[n] ?? 0) > now) continue;
        if (COUNTRIES.get(id).sea.includes(n) && domainCount(attacker.units, 'sea') === 0) continue;
        const units = { ...attacker.units, infantry: Math.max(0, attacker.units.infantry - KEEP_INFANTRY) };
        if (!COUNTRIES.get(id).coastal) for (const t of UNIT_TYPES) if (UNITS[t].domain === 'sea') units[t] = 0;
        if (totalUnits(units) === 0 || power(units, 'attack') < cfg.counter * defense) continue;
        for (const t of UNIT_TYPES) attacker.units[t] -= units[t];
        ai.cooldowns[n] = now + ATTACK_COOLDOWN_MS;
        launch(n, id, units);
        break;
      }
    }
  }
  return changed;
}

function addArmy(game, COUNTRIES, from, to, units, now) {
  game.armies.push({
    id: ++game.seq,
    owner: null,
    from,
    to,
    units,
    departAt: now,
    arriveAt: now + travelMs(COUNTRIES.get(from), COUNTRIES.get(to), units, game.speed),
  });
}
