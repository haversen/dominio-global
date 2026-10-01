// Formato compacto de los países para enviarlos por la red (se envían varias veces por segundo).
//   { ESP: { owner, level, units: {infantry, tank, aircraft, navy}, training: [...], developing } }
// se transmite como
//   { ESP: { u: [inf, tnq, av, mar], o?: owner, l?: level, t?: [[tipo, n, listoEn]], d?: [nivel, listoEn] } }
// omitiendo los valores por defecto (sin dueño, nivel 1, sin entrenamiento ni obras).

import { UNIT_TYPES } from './military.js';

export function encodeCountries(countries) {
  const out = {};
  for (const [id, c] of Object.entries(countries)) {
    const e = { u: UNIT_TYPES.map((t) => c.units[t]) };
    if (c.owner) e.o = c.owner;
    if (c.level > 1) e.l = c.level;
    if (c.training.length) e.t = c.training.map((x) => [x.type, x.count, x.readyAt]);
    if (c.developing) e.d = [c.developing.toLevel, c.developing.readyAt];
    out[id] = e;
  }
  return out;
}

export function decodeCountries(compact) {
  const out = {};
  for (const [id, e] of Object.entries(compact)) {
    out[id] = {
      owner: e.o ?? null,
      level: e.l ?? 1,
      units: Object.fromEntries(UNIT_TYPES.map((t, i) => [t, e.u[i]])),
      training: (e.t ?? []).map(([type, count, readyAt]) => ({ type, count, readyAt })),
      developing: e.d ? { toLevel: e.d[0], readyAt: e.d[1] } : null,
    };
  }
  return out;
}
