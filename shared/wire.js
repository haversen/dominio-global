// Formato compacto de los países para enviarlos por la red (se envían varias veces por segundo).
//   { ESP: { owner, level, units: {infantry, tank, aircraft, navy}, training: [...], developing } }
// se transmite como
//   { ESP: { u: [n por tipo de unidad], o?: owner, l?: level, t?: [[tipo, n, listoEn]], d?: [nivel, listoEn],
//            x?: contaminadoHasta, b?: [nivel por edificio], c?: [edificio, nivel, listoEn] } }
// omitiendo los valores por defecto (sin dueño, nivel 1, sin entrenamiento ni obras).

import { UNIT_TYPES } from './military.js';
import { BUILDING_TYPES } from './buildings.js';

/**
 * visible: Set de países que ve el jugador (niebla de guerra) o null si lo ve todo.
 * De los países ocultos solo se envía el dueño, el nivel y si está contaminado: { h: 1, o?, l?, x? }.
 */
export function encodeCountries(countries, visible = null) {
  const out = {};
  for (const [id, c] of Object.entries(countries)) {
    if (visible && !visible.has(id)) {
      const e = { h: 1 };
      if (c.owner) e.o = c.owner;
      if (c.level > 1) e.l = c.level;
      if (c.contaminatedUntil) e.x = c.contaminatedUntil;
      out[id] = e;
      continue;
    }
    const e = { u: UNIT_TYPES.map((t) => c.units[t]) };
    if (c.owner) e.o = c.owner;
    if (c.level > 1) e.l = c.level;
    if (c.training.length) e.t = c.training.map((x) => [x.type, x.count, x.readyAt]);
    if (c.developing) e.d = [c.developing.toLevel, c.developing.readyAt];
    if (c.contaminatedUntil) e.x = c.contaminatedUntil;
    if (c.buildings && BUILDING_TYPES.some((t) => c.buildings[t])) e.b = BUILDING_TYPES.map((t) => c.buildings[t] ?? 0);
    if (c.constructing) e.c = [BUILDING_TYPES.indexOf(c.constructing.type), c.constructing.toLevel, c.constructing.readyAt];
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
      units: Object.fromEntries(UNIT_TYPES.map((t, i) => [t, e.u?.[i] ?? 0])),
      ...(e.h ? { hidden: true } : {}),
      training: (e.t ?? []).map(([type, count, readyAt]) => ({ type, count, readyAt })),
      developing: e.d ? { toLevel: e.d[0], readyAt: e.d[1] } : null,
      ...(e.x ? { contaminatedUntil: e.x } : {}),
      buildings: e.b ? Object.fromEntries(BUILDING_TYPES.map((t, i) => [t, e.b[i]]).filter(([, n]) => n)) : {},
      constructing: e.c ? { type: BUILDING_TYPES[e.c[0]], toLevel: e.c[1], readyAt: e.c[2] } : null,
    };
  }
  return out;
}
