// Mapa mundial interactivo en SVG: zoom con rueda/pellizco, arrastre, minimapa y selección.
// El zoom se implementa cambiando el viewBox, así el SVG siempre se ve nítido.

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_ZOOM = 14;
const CLICK_TOLERANCE_PX = 5;
// Un dedo nunca se queda quieto del todo: en pantallas táctiles se tolera más movimiento en un toque.
const TAP_TOLERANCE_PX = 14;
const LABEL_PX = 11;
const LABEL_CHAR_PX = LABEL_PX * 0.58; // ancho aproximado de un carácter
const NEUTRAL_SHADES = ['#2c352b', '#323c30', '#283027', '#363f33'];

function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function hashShade(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return NEUTRAL_SHADES[h % NEUTRAL_SHADES.length];
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
    this.selected = null;
    this.pointers = new Map();
    this.drag = null;
    this.pinch = null;
    this.frame = null;
    this.animation = null;

    this.#build();
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
    const countries = svg('g', { id: 'map-countries' });
    const labels = svg('g', { class: 'map-labels' });

    for (const c of world.countries) {
      const path = svg('path', { d: c.d, class: 'country', id: `c-${c.id}`, 'data-id': c.id, fill: hashShade(c.id) });
      countries.append(path);
      this.paths.set(c.id, path);

      const text = svg('text', { x: c.cx, y: c.cy });
      text.textContent = c.name;
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
      svg('path', { d: world.sphere, class: 'sphere' }),
      svg('path', { d: world.graticule, class: 'graticule' }),
      countries,
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
      const fill = style?.fill ?? hashShade(id);
      if (this.updatedOnce && path.getAttribute('fill') !== fill) this.capturedUntil.set(id, now + 1600);
      const flashing = (this.capturedUntil.get(id) ?? 0) > now;
      path.setAttribute('fill', fill);
      path.setAttribute('class', ['country', ...(style?.classes ?? []), ...(classes[id] ?? []),
        dimmed.has(id) ? 'dimmed' : '', flashing ? 'captured' : ''].filter(Boolean).join(' '));
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

  /** armies: [{ id, from, to, departAt, arriveAt, color, count, mine, kind? }] (kind 'strike' = bomba) */
  setArmies(armies) {
    this.armies = armies;
    const ids = new Set(armies.map((a) => a.id));
    for (const [id, el] of this.armyEls) {
      if (!ids.has(id)) {
        el.route.remove();
        el.token.remove();
        this.armyEls.delete(id);
      }
    }
    for (const a of armies) {
      if (this.armyEls.has(a.id)) continue;
      const from = this.byId.get(a.from);
      const to = this.byId.get(a.to);
      const route = svg('line', {
        x1: from.cx, y1: from.cy, x2: to.cx, y2: to.cy,
        class: `army-route${a.mine ? ' mine' : ''}${a.kind === 'strike' ? ' strike' : ''}`, stroke: a.color,
      });
      const token = svg('g', { class: `army${a.kind === 'strike' ? ' strike' : ''}` });
      const inner = svg('g', { class: 'army-scale' });
      const label = svg('text', { y: 0.5 });
      label.textContent = a.count;
      inner.setAttribute('transform', this.#markerScale());
      inner.append(svg('circle', { r: 9, fill: a.color }), label);
      token.append(inner);
      this.routesLayer.append(route);
      this.armiesLayer.append(token);
      this.armyEls.set(a.id, { route, token, inner, from, to, a });
    }
    if (armies.length && !this.armyLoop) this.#animateArmies();
  }

  #animateArmies() {
    const step = () => {
      if (!this.armies.length) {
        this.armyLoop = null;
        return;
      }
      const now = this.now();
      for (const { token, from, to, a } of this.armyEls.values()) {
        const t = Math.min(1, Math.max(0, (now - a.departAt) / (a.arriveAt - a.departAt)));
        token.setAttribute('transform', `translate(${from.cx + (to.cx - from.cx) * t} ${from.cy + (to.cy - from.cy) * t})`);
      }
      this.armyLoop = requestAnimationFrame(step);
    };
    this.armyLoop = requestAnimationFrame(step);
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

  #markerScale() {
    const rect = this.svgEl.getBoundingClientRect();
    const unitsPerPx = rect.width ? this.view.w / rect.width : 1;
    return `scale(${unitsPerPx.toFixed(3)})`;
  }

  select(id, { center = false } = {}) {
    this.selected = id && this.byId.has(id) ? id : null;
    const c = this.selected && this.byId.get(this.selected);
    this.selectPath.setAttribute('d', c ? c.d : '');
    if (c && center) this.centerOn(id);
  }

  centerOn(id, minZoom = 2.5) {
    const c = this.byId.get(id);
    if (!c) return;
    const zoom = Math.max(this.zoom, minZoom);
    const w = this.fit.w / zoom;
    const h = this.fit.h / zoom;
    this.#animateTo({ x: c.cx - w / 2, y: c.cy - h / 2, w, h });
  }

  zoomBy(factor) {
    const rect = this.svgEl.getBoundingClientRect();
    this.#zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  reset() {
    this.#animateTo({ ...this.fit });
  }

  get zoom() {
    return this.fit.w / this.view.w;
  }

  // ---------- Vista ----------

  #resize() {
    const rect = this.svgEl.getBoundingClientRect();
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
    const w = Math.min(Math.max(v.w, this.fit.w / MAX_ZOOM), this.fit.w);
    const h = w * (this.fit.h / this.fit.w);
    const clampAxis = (pos, size, total) => (size >= total ? (total - size) / 2 : Math.min(Math.max(pos, 0), total - size));
    return { x: clampAxis(v.x, w, W), y: clampAxis(v.y, h, H), w, h };
  }

  #scheduleApply() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.#apply();
    });
  }

  #apply() {
    this.view = this.#clamp(this.view);
    const { x, y, w, h } = this.view;
    this.svgEl.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);

    const rect = this.svgEl.getBoundingClientRect();
    const unitsPerPx = rect.width ? w / rect.width : 1;
    this.labelsGroup.setAttribute('font-size', (LABEL_PX * unitsPerPx).toFixed(2));
    // Marcadores, insignias y ejércitos mantienen el mismo tamaño en pantalla sea cual sea el zoom.
    const markerScale = `scale(${(unitsPerPx * 1.4).toFixed(3)})`;
    for (const m of this.markers.children) m.firstChild.setAttribute('transform', markerScale);
    const pxScale = `scale(${unitsPerPx.toFixed(3)})`;
    for (const el of this.armyEls.values()) el.inner.setAttribute('transform', pxScale);

    const zoom = this.zoom;
    for (const label of this.labels) {
      const visible = label.widthUnits / unitsPerPx >= label.textPx;
      label.el.style.display = visible ? '' : 'none';
      // Las tropas neutrales solo se muestran cuando hay sitio; las de jugadores, siempre.
      const badge = this.badgeEls.get(label.id);
      if (badge) {
        badge.inner.setAttribute('transform', pxScale);
        badge.g.style.display = badge.always || label.widthUnits / unitsPerPx >= 34 ? '' : 'none';
      }
    }

    this.viewportRect.setAttribute('x', x);
    this.viewportRect.setAttribute('y', y);
    this.viewportRect.setAttribute('width', w);
    this.viewportRect.setAttribute('height', h);
    this.minimapEl.classList.toggle('zoomed', zoom > 1.05);
  }

  #toMap(clientX, clientY) {
    const rect = this.svgEl.getBoundingClientRect();
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
    this.#scheduleApply();
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
      this.#apply();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- Interacción ----------

  #bindMap() {
    const el = this.svgEl;

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const speed = e.deltaMode === 1 ? 0.05 : 0.0015;
      this.#zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * speed));
    }, { passive: false });

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.animation = null;
      this.#hideTooltip();

      if (this.pointers.size === 1) {
        this.drag = {
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
          tolerance: e.pointerType === 'mouse' ? CLICK_TOLERANCE_PX : TAP_TOLERANCE_PX,
          target: e.target.closest?.('.country')?.dataset.id ?? null,
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
        this.#apply();
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
        this.drag = null;
        el.classList.remove('dragging');
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
      this.hoverPath.setAttribute('d', id ? this.byId.get(id).d : '');
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
      this.#apply();
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
