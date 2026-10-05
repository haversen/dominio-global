// Mapa mundial interactivo en SVG: zoom con rueda/pellizco, arrastre, minimapa y selección.
// El zoom se implementa cambiando el viewBox, así el SVG siempre se ve nítido.

import { terrainOf, UNITS, UNIT_TYPES } from '/shared/military.js';
import { STRATEGIC, strategicOf } from '/shared/strategic.js';
import { replacedBy } from '/shared/ancient.js';
import { strategicSpec } from '/shared/eras.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_ZOOM = 14;
const CLICK_TOLERANCE_PX = 5;
// Un dedo nunca se queda quieto del todo: en pantallas táctiles se tolera más movimiento en un toque.
const TAP_TOLERANCE_PX = 14;
const LABEL_PX = 11;
const LABEL_CHAR_PX = LABEL_PX * 0.58; // ancho aproximado de un carácter
// Colores de mapa topográfico (estilo mapa impreso / Call of War).
const TERRAIN_COLORS = {
  plains: [205, 200, 152],
  mountains: [190, 166, 126],
  jungle: [140, 168, 106],
  desert: [228, 208, 156],
  frozen: [236, 240, 242],
  taiga: [166, 182, 136],
};
// Símbolos dibujados sobre cada tipo de terreno.
const TERRAIN_SYMBOLS = { mountains: 'mountains', jungle: 'trees', taiga: 'trees', desert: 'dunes' };
// Países enormes cuyo terreno de juego es «helado» pero que en su mayoría son bosque boreal.
const VISUAL_TERRAIN = { RUS: 'taiga', CAN: 'taiga' };
const OFFMAP_FILL = '#8a877e';
const VARIANT_KEYS = ['d', 'ds', 'cx', 'cy', 'lw', 'lon', 'lat'];
// Países neutrales (los controla la IA): todos del mismo gris para distinguirlos de los jugadores.
const NEUTRAL_FILL = '#c4c3bb';
const OWNER_MIX = 0.55; // cuánto color del dueño se mezcla con el terreno
// Por debajo de este zoom se dibujan los contornos simplificados (mucho más rápidos de pintar).
const DETAIL_ZOOM = 2.2;
const DETAIL_ZOOM_LOW_GFX = 6;
// En pantallas táctiles (móviles y tabletas) se usan las fronteras sencillas hasta acercarse bastante.
const DETAIL_ZOOM_TOUCH = 4;
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const MINIMAP_GESTURE_MS = 250;
const LOW_GFX_KEY = 'dg.lowGfx';

function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const hex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const parseHex = (color) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(color ?? '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Cada país tiene su tono de terreno con una ligera variación para que no parezca plano.
const terrainCache = new Map();
function terrainShade(id) {
  if (!terrainCache.has(id)) {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const k = 0.94 + (h % 13) / 100;
    terrainCache.set(id, TERRAIN_COLORS[visualTerrain(id)].map((v) => Math.min(255, v * k)));
  }
  return terrainCache.get(id);
}
const visualTerrain = (id) => VISUAL_TERRAIN[id] ?? terrainOf(id);
const neutralFill = () => NEUTRAL_FILL;
// Mapas de otra época (la antigua Grecia) se dibujan encima de los países actuales que sustituyen.
const layerOf = (c) => (c.era ? `era-${c.era}` : replacedBy(c.id) ? `replaced-${replacedBy(c.id)}` : 'modern');
// País de un jugador: su color mezclado con el terreno (se sigue viendo si es desierto, selva...).
function ownedFill(id, color) {
  const rgb = parseHex(color);
  if (!rgb) return color;
  const t = terrainShade(id);
  return hex(rgb.map((v, i) => v * OWNER_MIX + t[i] * (1 - OWNER_MIX)));
}

// Textura de relieve generada al vuelo (ruido suave que se repite sin costuras).
function reliefTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  const octaves = [[8, 0.5], [16, 0.3], [32, 0.2]];
  const grids = octaves.map(([cells]) => Array.from({ length: cells * cells }, () => Math.random()));
  const smooth = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      octaves.forEach(([cells, weight], o) => {
        const gx = (x / size) * cells;
        const gy = (y / size) * cells;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const g = grids[o];
        const at = (i, j) => g[((j + cells) % cells) * cells + ((i + cells) % cells)];
        const sx = smooth(gx - x0);
        const sy = smooth(gy - y0);
        const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
        const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
        v += (top * (1 - sy) + bottom * sy) * weight;
      });
      const i = (y * size + x) * 4;
      // Curvas de nivel: líneas finas donde el «relieve» cruza cada altura.
      const band = (v * 9) % 1;
      if (band < 0.07) {
        img.data[i] = 92; img.data[i + 1] = 70; img.data[i + 2] = 44;
        img.data[i + 3] = 70;
      } else {
        // Sombreado suave entre curvas.
        const light = v > 0.5;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : 60;
        img.data[i + 3] = Math.abs(v - 0.5) * (light ? 90 : 120);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

// Patrones de símbolos topográficos (en unidades del mapa: se ven más al acercar el zoom).
function symbolPatterns() {
  const make = (id, size, ...shapes) => {
    const p = svg('pattern', { id, width: size, height: size, patternUnits: 'userSpaceOnUse' });
    p.append(...shapes);
    return p;
  };
  const peak = (x, y, s) => svg('path', { d: `M${x - s} ${y + s * 0.7}L${x} ${y - s * 0.7}L${x + s} ${y + s * 0.7}`, class: 'sym-peak' });
  const tree = (x, y, r) => svg('circle', { cx: x, cy: y, r, class: 'sym-tree' });
  const dot = (x, y) => svg('circle', { cx: x, cy: y, r: 0.35, class: 'sym-dot' });
  return [
    make('mountains', 14, peak(4, 4, 2.2), peak(11, 11, 2.6), peak(10, 3, 1.4)),
    make('trees', 7, tree(2, 2, 0.55), tree(5.5, 5, 0.7), tree(2.5, 6, 0.45)),
    make('dunes', 10, dot(2, 2), dot(7, 4), dot(4, 8), dot(9, 9),
      svg('path', { d: 'M1 5.5q2 -1.2 4 0', class: 'sym-dune' })),
  ];
}

// Iconos de los ejércitos en marcha en los mapas de otra época.
const ERA_ARMY_ICONS = {
  greece: { sea: '⛵', air: '🏹', armor: '🐎', infantry: '🛡️' },
  sengoku: { sea: '⛵', air: '🏹', armor: '🐎', infantry: '🎌' },
};

// Tipo de icono de un ejército en marcha según sus unidades.
function armyIcon(a, era = null) {
  if (a.kind === 'strike') return { kind: 'strike', text: a.count };
  const units = a.units ?? {};
  const by = (pred) => UNIT_TYPES.filter((t) => pred(UNITS[t])).reduce((n, t) => n + (units[t] ?? 0), 0);
  const total = by(() => true) || 1;
  const icons = ERA_ARMY_ICONS[era];
  const kind = by((u) => u.domain === 'sea') > 0 && a.sea ? 'sea'
    : by((u) => u.domain === 'air') === total ? 'air'
      : by((u) => u.class === 'armor') > 0 ? 'armor' : 'infantry';
  if (icons) return { kind, text: icons[kind] };
  if (kind === 'armor') return { kind }; // silueta de tanque
  return { kind, text: { sea: '🚢', air: '✈️', infantry: '🪖' }[kind] };
}

export class WorldMap {
  constructor({ svgEl, minimapEl, tooltipEl, world, onSelect, onContext = () => {}, tooltipText, now = Date.now }) {
    this.svgEl = svgEl;
    this.minimapEl = minimapEl;
    this.tooltipEl = tooltipEl;
    this.world = world;
    this.onSelect = onSelect;
    this.onContext = onContext;
    this.tooltipText = tooltipText;
    this.now = now; // reloj sincronizado con el servidor
    this.armies = [];
    this.armyEls = new Map();
    this.badgeEls = new Map();
    this.armyLoop = null;
    this.byId = new Map(world.countries.map((c) => [c.id, c]));

    this.fit = { x: 0, y: 0, w: world.width, h: world.height };
    this.view = { ...this.fit };
    this.committed = { ...this.view }; // la vista que el SVG tiene dibujada (viewBox)
    this.box = { left: 0, top: 0, width: 0, height: 0 }; // tamaño del mapa en pantalla (en caché)
    this.selected = null;
    this.pointers = new Map();
    this.drag = null;
    this.pinch = null;
    this.frame = null;
    this.animation = null;

    this.lowGfx = (() => {
      try {
        const saved = localStorage.getItem(LOW_GFX_KEY);
        if (saved !== null) return saved === '1';
      } catch { /* sin almacenamiento */ }
      // Por defecto, gráficos ligeros en móviles con poca memoria o pocos núcleos.
      return Boolean(navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency ?? 8) <= 2;
    })();
    this.detail = 'high';
    this.#build();
    this.setLowGraphics(this.lowGfx);
    this.#bindMap();
    this.#bindMinimap();
    new ResizeObserver(() => this.#resize()).observe(svgEl);
  }

  // ---------- Construcción ----------

  #build() {
    const { world, svgEl } = this;
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    this.paths = new Map();
    this.labels = [];
    this.off = new Set(); // países fuera del mapa elegido
    const countries = svg('g', { id: 'map-countries' });
    const labels = svg('g', { class: 'map-labels' });

    // Océano con profundidad, oleaje y relieve de la tierra.
    const defs = svg('defs');
    const ocean = svg('radialGradient', { id: 'ocean-grad', cx: '50%', cy: '45%', r: '75%' });
    ocean.append(
      svg('stop', { offset: '0', 'stop-color': '#86afc6' }),
      svg('stop', { offset: '0.6', 'stop-color': '#6d9ab5' }),
      svg('stop', { offset: '1', 'stop-color': '#527f9c' }),
    );
    const waves = svg('pattern', { id: 'waves', width: 60, height: 24, patternUnits: 'userSpaceOnUse' });
    waves.append(svg('path', { d: 'M0 12 Q7.5 8 15 12 T30 12 T45 12 T60 12', class: 'wave' }),
      svg('path', { d: 'M-15 0 Q-7.5 -4 0 0 T15 0 T30 0 T45 0 T60 0', class: 'wave' }),
      svg('path', { d: 'M-15 24 Q-7.5 20 0 24 T15 24 T30 24 T45 24 T60 24', class: 'wave' }));
    defs.append(ocean, waves);
    const relief = reliefTexture();
    if (relief) {
      const pattern = svg('pattern', { id: 'relief', width: 70, height: 70, patternUnits: 'userSpaceOnUse' });
      pattern.append(svg('image', { href: relief, width: 70, height: 70, preserveAspectRatio: 'none' }));
      defs.append(pattern);
    }
    defs.append(...symbolPatterns());
    // Cada trazado guarda sus dos versiones: detallada (d) y simplificada (ds).
    this.detailed = []; // [{ el, d, ds }]
    const both = (el, d, ds) => {
      this.detailed.push({ el, d, ds: ds || d });
      return el;
    };
    // Costa, relieve y símbolos por capa: los de otra época solo se ven en su mapa.
    const layers = [...new Set(world.countries.map(layerOf))];
    const inLayer = (layer) => world.countries.filter((c) => layerOf(c) === layer);
    const landOf = (layer, cls, list = inLayer(layer)) => {
      const d = list.map((c) => c.d).join('');
      return d ? both(svg('path', { d, class: `${cls} layer-${layer}` }), d, list.map((c) => c.ds || c.d).join('')) : null;
    };
    // Un trazado por tipo de terreno para dibujar encima sus símbolos (montañas, árboles, dunas).
    const symbolLayers = layers.flatMap((layer) => Object.entries(TERRAIN_SYMBOLS).map(([terrain, pattern]) => {
      const el = landOf(layer, `terrain-symbols sym-${terrain}`, inLayer(layer).filter((c) => visualTerrain(c.id) === terrain));
      el?.setAttribute('fill', `url(#${pattern})`);
      return el;
    })).filter(Boolean);
    this.layerClass = new Map(world.countries.map((c) => [c.id, `layer-${layerOf(c)}`]));

    for (const c of world.countries) {
      const path = both(svg('path', { d: c.d, class: `country ${this.layerClass.get(c.id)}`, id: `c-${c.id}`, 'data-id': c.id, fill: neutralFill(c.id) }), c.d, c.ds);
      countries.append(path);
      this.paths.set(c.id, path);

      const text = svg('text', { x: c.cx, y: c.cy });
      text.textContent = c.name;
      // Recursos estratégicos del país, debajo del nombre.
      const strategic = strategicOf(c.id);
      if (strategic.length) {
        const icons = svg('tspan', { x: c.cx, dy: '1.25em', class: 'label-res' });
        icons.textContent = strategic.map((r) => (c.era ? strategicSpec(r, c.era).icon : STRATEGIC[r].icon)).join('');
        text.append(icons);
      }
      labels.append(text);
      // La etiqueta solo se muestra cuando el país es más ancho que su nombre en pantalla.
      this.labels.push({ el: text, id: c.id, widthUnits: c.lw, textPx: c.name.length * LABEL_CHAR_PX });
    }

    this.hoverPath = svg('path', { class: 'country-hover' });
    this.selectPath = svg('path', { class: 'country-selected' });
    this.markers = svg('g', { class: 'map-markers' });
    this.routesLayer = svg('g', { class: 'map-routes' });
    this.badgesLayer = svg('g', { class: 'map-badges' });
    this.armiesLayer = svg('g', { class: 'map-armies' });
    this.fxLayer = svg('g', { class: 'map-fx' });
    this.labelsGroup = labels;

    svgEl.append(
      defs,
      svg('path', { d: world.sphere, class: 'sphere' }),
      svg('path', { d: world.sphere, class: 'sea-waves' }),
      svg('path', { d: world.graticule, class: 'graticule' }),
      ...layers.map((layer) => landOf(layer, 'coast-halo wide')),
      ...layers.map((layer) => landOf(layer, 'coast-halo')),
      countries,
      ...(relief ? layers.map((layer) => landOf(layer, 'relief')) : []),
      ...symbolLayers,
      this.hoverPath,
      this.selectPath,
      labels,
      this.routesLayer,
      this.badgesLayer,
      this.markers,
      this.armiesLayer,
      this.fxLayer,
    );

    // El minimapa reutiliza los mismos países con <use>: los colores se actualizan solos.
    this.minimapEl.setAttribute('viewBox', `0 0 ${world.width} ${world.height}`);
    this.viewportRect = svg('rect', { class: 'minimap-viewport' });
    this.minimapEl.append(
      svg('path', { d: world.sphere, class: 'sphere' }),
      svg('use', { href: '#map-countries' }),
      this.viewportRect,
    );
  }

  // ---------- Estado visual ----------

  /**
   * colors:  { [countryId]: { fill, classes: [] } } solo para países no neutrales
   * markers: [{ countryId, color, kind: 'home' | 'pick' }]
   * dimmed:  Set de países atenuados (p. ej. no elegibles)
   * classes: { [countryId]: [clases extra] } (p. ej. objetivos posibles)
   * badges:  [{ countryId, text, color, always }] número de tropas sobre cada país
   */
  update({ colors = {}, markers = [], dimmed = new Set(), classes = {}, badges = [] }) {
    // Un país que cambia de dueño destella unos instantes (la clase sobrevive a otras actualizaciones).
    this.capturedUntil ??= new Map();
    const now = performance.now();
    for (const [id, path] of this.paths) {
      const style = colors[id];
      const off = this.off.has(id);
      const fill = off ? OFFMAP_FILL : style?.fill ? ownedFill(id, style.fill) : neutralFill();
      if (this.updatedOnce && path.getAttribute('fill') !== fill) this.capturedUntil.set(id, now + 1600);
      const flashing = (this.capturedUntil.get(id) ?? 0) > now;
      path.setAttribute('fill', fill);
      path.setAttribute('class', ['country', this.layerClass.get(id), ...(style?.classes ?? []), ...(classes[id] ?? []),
        dimmed.has(id) ? 'dimmed' : '', flashing ? 'captured' : '', off ? 'offmap' : ''].filter(Boolean).join(' '));
      if (style?.fill && !off) path.style.stroke = style.fill;
      else path.style.removeProperty('stroke');
    }
    this.#renderBadges(badges);
    this.updatedOnce = true;
    for (const [id, until] of this.capturedUntil) {
      if (until <= now) this.capturedUntil.delete(id);
      else setTimeout(() => this.paths.get(id).classList.remove('captured'), until - now);
    }

    this.markers.replaceChildren(...markers.map(({ countryId, color, kind }) => {
      const c = this.byId.get(countryId);
      const g = svg('g', { class: `marker marker-${kind}`, transform: `translate(${c.cx} ${c.cy})` });
      const inner = svg('g', { class: 'marker-scale' });
      inner.append(
        svg('circle', { r: 7, fill: color }),
        svg('path', { d: 'M0-4.2 1.2-1.3 4.2-1.3 1.8 0.6 2.7 3.6 0 1.8-2.7 3.6-1.8 0.6-4.2-1.3-1.2-1.3Z' }),
      );
      g.append(inner);
      return g;
    }));
    // Con marcador, el nombre baja para no quedar tapado.
    const marked = new Set(markers.map((m) => m.countryId));
    for (const label of this.labels) {
      if (marked.has(label.id)) label.el.setAttribute('dy', '1.6em');
      else label.el.removeAttribute('dy');
    }
    this.#scheduleApply();
  }

  #renderBadges(badges) {
    const seen = new Set();
    for (const { countryId, text, color, always, capital } of badges) {
      seen.add(countryId);
      let el = this.badgeEls.get(countryId);
      if (!el) {
        const c = this.byId.get(countryId);
        el = { g: svg('g', { class: 'badge', transform: `translate(${c.cx} ${c.cy})` }) };
        el.inner = svg('g', { class: 'badge-scale' });
        el.rect = svg('rect', { y: -21, height: 16, rx: 8 });
        el.text = svg('text', { y: -13 });
        el.inner.append(el.rect, el.text);
        el.g.append(el.inner);
        this.badgesLayer.append(el.g);
        this.badgeEls.set(countryId, el);
      }
      const label = capital ? `★ ${text}` : String(text);
      if (el.label !== label) {
        el.label = label;
        el.text.textContent = label;
        const w = 10 + label.length * 6.6;
        el.rect.setAttribute('x', -w / 2);
        el.rect.setAttribute('width', w);
      }
      el.rect.setAttribute('fill', color);
      el.always = always;
      el.g.classList.toggle('badge-player', Boolean(always));
    }
    for (const [id, el] of this.badgeEls) {
      if (!seen.has(id)) {
        el.g.remove();
        this.badgeEls.delete(id);
      }
    }
  }

  /**
   * armies: [{ id, from, to, departAt, arriveAt, color, count, mine, units?, sea?, kind? }]
   * (kind 'strike' = bomba). Cada ejército avanza por una ruta curva dejando un rastro.
   */
  setArmies(armies) {
    this.armies = armies;
    const ids = new Set(armies.map((a) => a.id));
    for (const [id, el] of this.armyEls) {
      if (!ids.has(id)) {
        el.route.remove();
        el.trail.remove();
        el.token.remove();
        this.armyEls.delete(id);
      }
    }
    for (const a of armies) {
      const existing = this.armyEls.get(a.id);
      if (existing) {
        existing.count.textContent = a.kind === 'strike' ? '' : a.count;
        continue;
      }
      const from = this.byId.get(a.from);
      const realTo = this.byId.get(a.to);
      // Las flotas que cruzan medio mundo dan la vuelta por el borde del mapa (p. ej. por el Pacífico).
      const W = this.world.width;
      let toX = realTo.cx;
      if (a.sea && Math.abs(realTo.cx - from.cx) > W * 0.45) toX += realTo.cx > from.cx ? -W : W;
      const to = { cx: toX, cy: realTo.cy };
      const shift = realTo.cx - toX; // 0 si no da la vuelta
      // Curva suave: el punto de control se separa de la línea recta según la distancia.
      const dx = to.cx - from.cx;
      const dy = to.cy - from.cy;
      const bend = a.kind === 'strike' ? 0.35 : 0.15;
      const ctrl = { x: (from.cx + to.cx) / 2 - dy * bend, y: (from.cy + to.cy) / 2 + dx * bend };
      const d = `M${from.cx} ${from.cy}Q${ctrl.x} ${ctrl.y} ${to.cx} ${to.cy}`;
      const cls = `${a.mine ? ' mine' : ''}${a.kind === 'strike' ? ' strike' : ''}`;
      // Ruta y rastro se dibujan dos veces cuando dan la vuelta al mundo (una copia desplazada).
      const copies = shift ? [0, shift] : [0];
      const route = svg('g');
      for (const x of copies) route.append(svg('path', { d, class: `army-route${cls}`, stroke: a.color, transform: `translate(${x} 0)` }));
      const trail = svg('g');
      for (const x of copies) trail.append(svg('path', { class: `army-trail${cls}`, stroke: a.color, transform: `translate(${x} 0)` }));

      const icon = armyIcon(a, this.era);
      const token = svg('g', { class: `army army-${icon.kind}${a.kind === 'strike' ? ' strike' : ''}` });
      const inner = svg('g', { class: 'army-scale' });
      inner.setAttribute('transform', this.#markerScale());
      const glyph = svg('g', { class: 'army-glyph' });
      if (icon.kind === 'armor' && !icon.text) {
        // Silueta de tanque (no existe un emoji de tanque).
        glyph.append(
          svg('rect', { x: -8, y: -1, width: 16, height: 6, rx: 3, class: 'tank-body' }),
          svg('rect', { x: -4.5, y: -5.5, width: 8, height: 5, rx: 1.5, class: 'tank-body' }),
          svg('rect', { x: 3, y: -4.2, width: 8, height: 1.8, rx: 0.9, class: 'tank-body' }),
        );
      } else {
        const t = svg('text', { class: 'army-emoji', y: 1 });
        t.textContent = icon.text;
        glyph.append(t);
      }
      const count = svg('text', { class: 'army-count', y: 17 });
      count.textContent = a.kind === 'strike' ? '' : a.count;
      inner.append(svg('circle', { r: 12, fill: a.color, class: 'army-disc' }), glyph, count);
      token.append(inner);
      this.routesLayer.append(route, trail);
      this.armiesLayer.append(token);
      this.armyEls.set(a.id, { route, trail, token, inner, glyph, count, from, to, ctrl, a, icon });
    }
    if (armies.length && !this.armyLoop) this.#animateArmies();
  }

  #animateArmies() {
    const point = (el, t) => {
      const u = 1 - t;
      return {
        x: u * u * el.from.cx + 2 * u * t * el.ctrl.x + t * t * el.to.cx,
        y: u * u * el.from.cy + 2 * u * t * el.ctrl.y + t * t * el.to.cy,
      };
    };
    const step = () => {
      if (!this.armies.length) {
        this.armyLoop = null;
        return;
      }
      const now = this.now();
      for (const el of this.armyEls.values()) {
        const { a } = el;
        const t = Math.min(1, Math.max(0, (now - a.departAt) / (a.arriveAt - a.departAt)));
        const p = point(el, t);
        const W = this.world.width;
        const x = p.x < 0 ? p.x + W : p.x > W ? p.x - W : p.x; // al salir por un borde, entra por el otro
        el.token.setAttribute('transform', `translate(${x.toFixed(2)} ${p.y.toFixed(2)})`);
        // Rastro: el tramo de ruta ya recorrido (subdivisión de la curva en t).
        const q = { x: el.from.cx + (el.ctrl.x - el.from.cx) * t, y: el.from.cy + (el.ctrl.y - el.from.cy) * t };
        const trailD = `M${el.from.cx} ${el.from.cy}Q${q.x.toFixed(2)} ${q.y.toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
        for (const path of el.trail.children) path.setAttribute('d', trailD);
        // Aviones y bombas miran hacia donde van.
        if ((el.icon.kind === 'air' && !this.era) || el.icon.kind === 'strike') {
          const ahead = point(el, Math.min(1, t + 0.02));
          const angle = (Math.atan2(ahead.y - p.y, ahead.x - p.x) * 180) / Math.PI;
          el.glyph.setAttribute('transform', `rotate(${(angle + (el.icon.kind === 'air' ? 45 : 0)).toFixed(1)})`);
        } else if (el.icon.kind === 'armor') {
          // El tanque dibujado mira a la derecha; el caballo (emoji) mira a la izquierda.
          const goingLeft = el.to.cx < el.from.cx;
          el.glyph.setAttribute('transform', goingLeft === !el.icon.text ? 'scale(-1 1)' : '');
        }
      }
      this.armyLoop = requestAnimationFrame(step);
    };
    this.armyLoop = requestAnimationFrame(step);
  }

  /** Época del mapa (cambia los iconos de los ejércitos en marcha). */
  setEra(era) {
    this.era = era;
  }

  /**
   * Países recortados para el mapa elegido (la Rusia europea en el mapa de Europa):
   * cambia su contorno, su centro y su etiqueta, y el resto del país se ve apagado, fuera del mapa.
   * list: { [countryId]: { d, ds, cx, cy, lw, lon, lat, rest, rests } } o null para volver al mapa normal.
   */
  setVariant(list = null) {
    if (list === (this.variant ?? null)) return;
    this.variantSaved ??= new Map();
    for (const [id, saved] of this.variantSaved) this.#placeCountry(id, saved);
    this.variantSaved.clear();
    for (const el of this.variantRests ?? []) el.remove();
    this.detailed = this.detailed.filter((x) => !this.variantRests?.includes(x.el));
    this.variantRests = [];
    this.variant = list;
    for (const [id, v] of Object.entries(list ?? {})) {
      const c = this.byId.get(id);
      if (!c) continue;
      this.variantSaved.set(id, Object.fromEntries(VARIANT_KEYS.map((k) => [k, c[k]])));
      this.#placeCountry(id, v);
      const rest = svg('path', { class: 'country offmap variant-rest', fill: OFFMAP_FILL });
      this.paths.get(id).after(rest);
      this.detailed.push({ el: rest, d: v.rest, ds: v.rests || v.rest });
      this.variantRests.push(rest);
    }
    this.#updateDetail(true);
  }

  #placeCountry(id, v) {
    const c = this.byId.get(id);
    for (const k of VARIANT_KEYS) c[k] = v[k];
    const entry = this.detailed.find((x) => x.el === this.paths.get(id));
    if (entry) Object.assign(entry, { d: v.d, ds: v.ds || v.d });
    const label = this.labels.find((l) => l.id === id);
    if (label) {
      label.el.setAttribute('x', v.cx);
      label.el.setAttribute('y', v.cy);
      for (const t of label.el.querySelectorAll('tspan')) t.setAttribute('x', v.cx);
      label.widthUnits = v.lw;
    }
    this.badgeEls.get(id)?.g.setAttribute('transform', `translate(${v.cx} ${v.cy})`);
  }

  /** Países que no forman parte del mapa elegido (se ven apagados y no se pueden tocar). */
  setScope(isPlayable, focusIds = null) {
    // Si se juega un mapa de otra época, se muestra en lugar de los países actuales que sustituye.
    const eras = new Set(this.world.countries.filter((c) => c.era && isPlayable(c.id)).map((c) => c.era));
    for (const el of [this.svgEl, this.minimapEl]) {
      for (const cls of [...el.classList]) if (cls.startsWith('show-era-')) el.classList.remove(cls);
      for (const era of eras) el.classList.add(`show-era-${era}`);
    }
    const hidden = (c) => (c.era ? !eras.has(c.era) : eras.has(replacedBy(c.id)));
    this.hidden = new Set(this.world.countries.filter(hidden).map((c) => c.id));
    this.off = new Set(this.world.countries.filter((c) => !isPlayable(c.id)).map((c) => c.id));
    for (const label of this.labels) label.off = this.off.has(label.id) || this.hidden.has(label.id);
    // Los mapas pequeños dejan acercarse más.
    this.maxZoom = MAX_ZOOM;
    for (const [id, path] of this.paths) path.classList.toggle('offmap', this.off.has(id));
    // Vista inicial del mapa: el recuadro que encierra los países elegidos.
    this.home = null;
    if (this.off.size) {
      let box = null;
      for (const id of focusIds ?? []) {
        const b = this.paths.get(id)?.getBBox();
        if (!b || b.width > this.world.width * 0.4) continue; // países que cruzan el mapa
        box = box
          ? { x0: Math.min(box.x0, b.x), y0: Math.min(box.y0, b.y), x1: Math.max(box.x1, b.x + b.width), y1: Math.max(box.y1, b.y + b.height) }
          : { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height };
      }
      if (box) {
        const pad = 30;
        const w = box.x1 - box.x0 + pad * 2;
        const h = box.y1 - box.y0 + pad * 2;
        const aspect = this.fit.w / this.fit.h;
        const vw = Math.max(w, h * aspect);
        this.home = { x: (box.x0 + box.x1) / 2 - vw / 2, y: (box.y0 + box.y1) / 2 - vw / aspect / 2, w: vw, h: vw / aspect };
        this.maxZoom = Math.max(MAX_ZOOM, (this.fit.w / this.home.w) * 4);
      }
    }
    this.#scheduleApply();
  }

  showHome() {
    this.#animateTo(this.home ?? { ...this.fit });
  }

  /** Destello de batalla sobre un país. */
  flash(countryId, kind = 'battle') {
    const c = this.byId.get(countryId);
    if (!c) return;
    const g = svg('g', { transform: `translate(${c.cx} ${c.cy})` });
    const inner = svg('g', { transform: this.#markerScale() });
    const size = kind === 'nuke' ? 3 : 1;
    inner.append(
      svg('circle', { r: 26 * size, class: `blast blast-${kind}` }),
      svg('circle', { r: 12 * size, class: `blast-core blast-${kind}` }),
    );
    g.append(inner);
    this.fxLayer.append(g);
    setTimeout(() => g.remove(), kind === 'nuke' ? 2600 : 1300);
  }

  /** Marca de un compañero sobre un país: un anillo que late con un icono, durante unos segundos. */
  ping(countryId, color, icon, durationMs = 8000) {
    const c = this.byId.get(countryId);
    if (!c) return;
    const g = svg('g', { transform: `translate(${c.cx} ${c.cy})`, class: 'map-ping' });
    const inner = svg('g', { transform: this.#markerScale() });
    const label = svg('text', { class: 'ping-icon', y: -40 });
    label.textContent = icon;
    inner.append(
      svg('circle', { r: 30, class: 'ping-ring', stroke: color }),
      svg('circle', { r: 30, class: 'ping-ring ping-ring-late', stroke: color }),
      svg('circle', { r: 6, class: 'ping-dot', fill: color }),
      label,
    );
    g.append(inner);
    this.fxLayer.append(g);
    setTimeout(() => g.remove(), durationMs);
  }

  #markerScale() {
    return `scale(${this.#unitsPerPx().toFixed(3)})`;
  }

  // Unidades del mapa por píxel de pantalla en la vista dibujada.
  #unitsPerPx() {
    return this.box.width ? this.committed.w / this.box.width : 1;
  }

  // Mide el mapa en pantalla (una sola vez por gesto, no en cada movimiento).
  #measure() {
    const r = this.svgEl.parentElement.getBoundingClientRect();
    this.box = { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  select(id, { center = false } = {}) {
    this.selected = id && this.byId.has(id) ? id : null;
    const c = this.selected && this.byId.get(this.selected);
    this.selectPath.setAttribute('d', c ? this.#outline(c) : '');
    if (c && center) this.centerOn(id);
  }

  centerOn(id, minZoom = 2.5) {
    const c = this.byId.get(id);
    if (!c) return;
    // En los mapas pequeños nunca se aleja más que la vista inicial del mapa.
    const zoom = Math.max(this.zoom, minZoom, this.home ? this.fit.w / this.home.w : 0);
    const w = this.fit.w / zoom;
    const h = this.fit.h / zoom;
    this.#animateTo({ x: c.cx - w / 2, y: c.cy - h / 2, w, h });
  }

  zoomBy(factor) {
    this.#measure();
    this.#zoomAt(this.box.left + this.box.width / 2, this.box.top + this.box.height / 2, factor);
    this.#commitSoon();
  }

  reset() {
    this.showHome();
  }

  get zoom() {
    return this.fit.w / this.view.w;
  }

  /** Gráficos ligeros: sin texturas ni símbolos y con contornos simples hasta acercarse mucho. */
  setLowGraphics(on) {
    this.lowGfx = Boolean(on);
    try {
      localStorage.setItem(LOW_GFX_KEY, this.lowGfx ? '1' : '0');
    } catch { /* sin almacenamiento */ }
    this.svgEl.classList.toggle('low-gfx', this.lowGfx);
    this.#updateDetail(true);
  }

  #outline(c) {
    return this.detail === 'low' ? c.ds || c.d : c.d;
  }

  // Cambia entre contornos simplificados y detallados según el zoom.
  #updateDetail(force = false) {
    const limit = this.lowGfx ? DETAIL_ZOOM_LOW_GFX : TOUCH ? DETAIL_ZOOM_TOUCH : DETAIL_ZOOM;
    const detail = this.zoom < limit ? 'low' : 'high';
    if (detail === this.detail && !force) return;
    this.detail = detail;
    for (const { el, d, ds } of this.detailed) el.setAttribute('d', detail === 'low' ? ds : d);
    if (this.selected) this.selectPath.setAttribute('d', this.#outline(this.byId.get(this.selected)));
  }

  // ---------- Vista ----------

  #resize() {
    this.#measure();
    const rect = this.box;
    if (!rect.width || !rect.height) return;
    const { width: W, height: H } = this.world;
    const aspect = rect.width / rect.height;
    const zoom = this.zoom;
    const cx = this.view.x + this.view.w / 2;
    const cy = this.view.y + this.view.h / 2;

    this.fit = aspect > W / H
      ? { w: H * aspect, h: H, x: (W - H * aspect) / 2, y: 0 }
      : { w: W, h: W / aspect, x: 0, y: (H - W / aspect) / 2 };

    const w = this.fit.w / zoom;
    const h = this.fit.h / zoom;
    this.view = { x: cx - w / 2, y: cy - h / 2, w, h };
    this.#apply();
  }

  #clamp(v) {
    const { width: W, height: H } = this.world;
    const w = Math.min(Math.max(v.w, this.fit.w / (this.maxZoom ?? MAX_ZOOM)), this.fit.w);
    const h = w * (this.fit.h / this.fit.w);
    const clampAxis = (pos, size, total) => (size >= total ? (total - size) / 2 : Math.min(Math.max(pos, 0), total - size));
    return { x: clampAxis(v.x, w, W), y: clampAxis(v.y, h, H), w, h };
  }

  // Algo cambió en marcadores, insignias o etiquetas. En mitad de un gesto solo se recolocan
  // (sin redibujar el mapa); si no, se redibuja todo.
  #scheduleApply() {
    this.overlayDirty = true;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (this.pointers.size || this.animation || this.commitTimer) this.#syncOverlay();
      else this.#apply();
    });
  }

  // Durante un gesto (arrastrar, pellizcar, rueda, animación) no se vuelve a dibujar el mapa:
  // se mueve con una transformación CSS la imagen ya dibujada, que la tarjeta gráfica desplaza
  // sin coste. Al terminar el gesto (o si se aleja mucho de lo dibujado) se redibuja de verdad.
  #preview() {
    if (this.previewFrame) return;
    this.previewFrame = requestAnimationFrame(() => {
      this.previewFrame = null;
      this.view = this.#clamp(this.view);
      const c = this.committed;
      const v = this.view;
      const k = this.box.width / v.w; // píxeles por unidad en la vista nueva
      const scale = c.w / v.w;
      const tx = (c.x - v.x) * k;
      const ty = (c.y - v.y) * k;
      // Se redibuja si se ve demasiado borde vacío o la escala cambió mucho (se vería borroso).
      const far = Math.abs(tx) > this.box.width * 0.3 || Math.abs(ty) > this.box.height * 0.3
        || (scale - 1) * (scale - 1) > 0.2 * 0.2 * (scale < 1 ? 1 : 4);
      if (far && performance.now() - (this.lastCommit ?? 0) > 120) {
        this.#apply();
        return;
      }
      this.svgEl.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${scale.toFixed(4)})`;
      // El minimapa repinta todos los países: durante el gesto se actualiza solo de vez en cuando.
      const t = performance.now();
      if (t - (this.minimapAt ?? 0) > MINIMAP_GESTURE_MS) {
        this.minimapAt = t;
        this.#updateMinimap();
      }
    });
  }

  // Redibuja poco después del último movimiento de la rueda o de un zoom con botones.
  #commitSoon(delay = 160) {
    clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => {
      this.commitTimer = null;
      this.#apply();
    }, delay);
  }

  #updateMinimap() {
    const { x, y, w, h } = this.view;
    this.viewportRect.setAttribute('x', x);
    this.viewportRect.setAttribute('y', y);
    this.viewportRect.setAttribute('width', w);
    this.viewportRect.setAttribute('height', h);
    this.minimapEl.classList.toggle('zoomed', this.zoom > 1.05);
  }

  #apply() {
    clearTimeout(this.commitTimer);
    this.commitTimer = null;
    if (this.previewFrame) cancelAnimationFrame(this.previewFrame);
    this.previewFrame = null;
    this.lastCommit = performance.now();
    this.view = this.#clamp(this.view);
    const { x, y, w, h } = this.view;
    this.svgEl.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    this.svgEl.style.transform = '';
    const zoomChanged = !this.committed || Math.abs(this.committed.w - w) > 1e-6 || this.overlayDirty !== false;
    this.committed = { x, y, w, h };
    // Al solo desplazar el mapa, etiquetas e insignias no cambian de tamaño: no hace falta tocarlas.
    if (zoomChanged) this.#syncOverlay();
    this.#updateDetail();
    this.#updateMinimap();
  }

  // Tamaño en pantalla de etiquetas, marcadores, insignias y ejércitos según el zoom dibujado.
  #syncOverlay() {
    this.overlayDirty = false;
    const unitsPerPx = this.#unitsPerPx();
    this.labelsGroup.setAttribute('font-size', (LABEL_PX * unitsPerPx).toFixed(2));
    // Marcadores, insignias y ejércitos mantienen el mismo tamaño en pantalla sea cual sea el zoom.
    const markerScale = `scale(${(unitsPerPx * 1.4).toFixed(3)})`;
    for (const m of this.markers.children) m.firstChild.setAttribute('transform', markerScale);
    const pxScale = `scale(${unitsPerPx.toFixed(3)})`;
    for (const el of this.armyEls.values()) el.inner.setAttribute('transform', pxScale);
    for (const el of this.fxLayer.querySelectorAll('.map-ping > g')) el.setAttribute('transform', pxScale);

    const zoom = this.zoom;
    for (const label of this.labels) {
      const visible = !label.off && label.widthUnits / unitsPerPx >= label.textPx;
      label.el.style.display = visible ? '' : 'none';
      // Las tropas neutrales solo se muestran cuando hay sitio; las de jugadores, siempre.
      const badge = this.badgeEls.get(label.id);
      if (badge) {
        badge.inner.setAttribute('transform', pxScale);
        badge.g.style.display = badge.always || label.widthUnits / unitsPerPx >= 34 ? '' : 'none';
      }
    }
  }

  #toMap(clientX, clientY) {
    const rect = this.box;
    return {
      x: this.view.x + ((clientX - rect.left) / rect.width) * this.view.w,
      y: this.view.y + ((clientY - rect.top) / rect.height) * this.view.h,
    };
  }

  #zoomAt(clientX, clientY, factor) {
    this.animation = null;
    const p = this.#toMap(clientX, clientY);
    const target = this.#clamp({ ...this.view, w: this.view.w / factor });
    const ratio = target.w / this.view.w;
    this.view = {
      x: p.x - (p.x - this.view.x) * ratio,
      y: p.y - (p.y - this.view.y) * ratio,
      w: target.w,
      h: target.h,
    };
    this.#preview();
  }

  #animateTo(target, duration = 400) {
    const from = { ...this.view };
    const to = this.#clamp(target);
    const start = performance.now();
    const token = {};
    this.animation = token;
    const step = (t) => {
      if (this.animation !== token) return;
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - (1 - k) ** 3;
      this.view = {
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        w: from.w + (to.w - from.w) * e,
        h: from.h + (to.h - from.h) * e,
      };
      if (k < 1) {
        this.#preview();
        requestAnimationFrame(step);
      } else {
        this.animation = null;
        this.#apply();
      }
    };
    requestAnimationFrame(step);
  }

  // ---------- Interacción ----------

  #bindMap() {
    const el = this.svgEl;

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const speed = e.deltaMode === 1 ? 0.05 : 0.0015;
      if (!this.commitTimer) this.#measure();
      this.#zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * speed));
      this.#commitSoon();
    }, { passive: false });

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      el.setPointerCapture(e.pointerId);
      if (!this.pointers.size) this.#measure();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.animation = null;
      this.#hideTooltip();

      if (this.pointers.size === 1) {
        this.drag = {
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
          tolerance: e.pointerType === 'mouse' ? CLICK_TOLERANCE_PX : TAP_TOLERANCE_PX,
          target: (() => {
            const id = e.target.closest?.('.country')?.dataset.id ?? null;
            return id && this.off.has(id) ? null : id;
          })(),
          anchor: this.#toMap(e.clientX, e.clientY),
        };
      } else if (this.pointers.size === 2) {
        this.drag = null;
        this.pinch = { dist: this.#pinchDistance() };
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return this.#hover(e);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pinch && this.pointers.size === 2) {
        const dist = this.#pinchDistance();
        const [a, b] = [...this.pointers.values()];
        this.#zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / this.pinch.dist);
        this.pinch.dist = dist;
        this.pinched = true;
        return;
      }
      if (!this.drag) return;
      if (!this.drag.moved && Math.hypot(e.clientX - this.drag.startX, e.clientY - this.drag.startY) > this.drag.tolerance) {
        this.drag.moved = true;
        el.classList.add('dragging');
      }
      if (this.drag.moved) {
        const p = this.#toMap(e.clientX, e.clientY);
        this.view.x += this.drag.anchor.x - p.x;
        this.view.y += this.drag.anchor.y - p.y;
        this.#preview();
      }
    });

    const end = (e) => {
      if (!this.pointers.delete(e.pointerId)) return;
      if (this.drag && !this.drag.moved && e.type === 'pointerup') {
        this.select(this.drag.target);
        this.onSelect(this.drag.target);
      }
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size === 0) {
        const moved = this.drag?.moved || e.type === 'pointercancel' || this.pinched;
        this.drag = null;
        this.pinched = false;
        el.classList.remove('dragging');
        if (moved) this.#apply(); // el gesto ha terminado: ahora sí se redibuja
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', () => this.#hover(null));
    // Clic derecho: orden rápida sobre un país (enviar tropas).
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const id = e.target.closest?.('.country')?.dataset.id;
      if (id) this.onContext(id);
    });
  }

  #pinchDistance() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  #hover(e) {
    const id = e?.target.closest?.('.country')?.dataset.id ?? null;
    if (id !== this.hovered) {
      this.hovered = id;
      this.hoverPath.setAttribute('d', id ? this.#outline(this.byId.get(id)) : '');
    }
    if (!id || e.pointerType === 'touch') return this.#hideTooltip();

    const box = this.svgEl.parentElement.getBoundingClientRect();
    this.tooltipEl.replaceChildren(...this.tooltipText(id));
    this.tooltipEl.style.transform = `translate(${e.clientX - box.left + 14}px, ${e.clientY - box.top + 14}px)`;
    this.tooltipEl.classList.remove('hidden');
  }

  #hideTooltip() {
    this.tooltipEl.classList.add('hidden');
  }

  #bindMinimap() {
    const el = this.minimapEl;
    const moveTo = (e) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * this.world.width;
      const y = ((e.clientY - rect.top) / rect.height) * this.world.height;
      this.animation = null;
      this.view = { ...this.view, x: x - this.view.w / 2, y: y - this.view.h / 2 };
      this.#preview();
      this.#commitSoon(120);
    };
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      moveTo(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (el.hasPointerCapture(e.pointerId)) moveTo(e);
    });
  }
}
