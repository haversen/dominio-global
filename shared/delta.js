// Envío por diferencias: tras el primer estado completo, cada jugador solo recibe lo que ha cambiado
// (normalmente unos pocos países, el reloj y los ejércitos), en lugar de los 175 países cada vez.

const json = (v) => JSON.stringify(v ?? null);

/**
 * Compara el estado nuevo con lo último que se envió a ese jugador.
 * Devuelve { full, patch, cache }: full = hay que mandar el estado entero.
 */
export function makeDelta(cache, state) {
  const next = { code: state.code, hasGame: Boolean(state.game), top: {}, game: {}, countries: {} };
  const full = !cache || cache.code !== state.code || cache.hasGame !== next.hasGame;
  const patch = {};
  for (const [k, v] of Object.entries(state)) {
    if (k === 'game') continue;
    next.top[k] = json(v);
    if (!full && cache.top[k] !== next.top[k]) patch[k] = v;
  }
  if (state.game) {
    const g = {};
    for (const [k, v] of Object.entries(state.game)) {
      if (k === 'countries') continue;
      next.game[k] = json(v);
      if (!full && cache.game[k] !== next.game[k]) g[k] = v;
    }
    const c = {};
    for (const [id, v] of Object.entries(state.game.countries ?? {})) {
      next.countries[id] = json(v);
      if (!full && cache.countries[id] !== next.countries[id]) c[id] = v;
    }
    if (Object.keys(c).length) g.countries = c;
    if (Object.keys(g).length) patch.game = g;
  }
  return { full, patch, cache: next };
}

/** Aplica un parche sobre el último estado (en formato compacto) recibido del servidor. */
export function applyDelta(raw, patch) {
  const out = { ...raw, ...patch, game: raw.game };
  if (patch.game) {
    out.game = {
      ...raw.game,
      ...patch.game,
      countries: { ...raw.game?.countries, ...(patch.game.countries ?? {}) },
    };
  }
  return out;
}
