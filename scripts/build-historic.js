// Genera las regiones de los mapas históricos (antigua Grecia, Japón samurái...) y las añade a shared/world.json.
// Uso: npm run build:historic (lo ejecuta también npm run build:map)
//
// Se toma la costa detallada de Natural Earth (1:50m) de los países actuales de la zona y se reparte
// la tierra entre las capitales de shared/ancient.js (cada punto pertenece a la capital más cercana).
// Las islas pequeñas van enteras a la región más cercana. Después se calculan las fronteras,
// la costa y las rutas marítimas cortas.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoNaturalEarth1, geoPath, geoArea } from 'd3-geo';
import { Delaunay } from 'd3-delaunay';
import polygonClipping from 'polygon-clipping';
import { HISTORIC_MAPS, isAncient } from '../shared/ancient.js';

const require = createRequire(import.meta.url);
const topology = require('world-atlas/countries-50m.json');

const WIDTH = 2000;
const HEIGHT = 1040;
const EARTH_RADIUS_KM = 6371;
const WHOLE_ISLAND_KM2 = 15_000; // por debajo, una pieza de tierra va entera a una sola región
const MIN_PIECE_KM2 = 8; // islotes que no se dibujan
const SEA_LINK_KM = 45; // dos costas más cerca que esto se conectan por mar

// De qué países actuales (código numérico ISO o nombre) sale la tierra de cada mapa.
// clip: solo se usa la parte del país dentro de ese polígono (lon, lat).
const EUROPE_BOX = [[-11, 35], [40, 35], [40, 61], [-11, 61], [-11, 35]];
const SOURCES = {
  greece: {
    lat: 39,
    countries: ['300', '792', '008', '807', '100', '196', 'N. Cyprus'],
  },
  sengoku: {
    lat: 37,
    countries: ['392', '410', '408', '156'],
    // De China solo entra el este: la costa de los Ming, Manchuria y el este de Mongolia Interior.
    clip: { 156: [[115, 24], [136, 24], [136, 54], [115, 54], [115, 24]] },
    // Corea y China se reparten por separado: la frontera Joseon-Ming ya era la de hoy (Yalu y Tumen).
    groups: [['392'], ['410', '408'], ['156']],
  },
  rome: {
    lat: 42,
    countries: [
      // Europa
      '380', '674', '250', '492', '724', '020', '620', '826', '372', '056', '528', '442', '276', '756', '040', '438',
      '208', '616', '203', '703', '348', '705', '191', '070', '688', '499', 'Kosovo', '008', '807', '300', '100',
      '642', '498', '804', '112', '440', '643', '470',
      // Asia
      '792', '196', 'N. Cyprus', '268', '051', '031', '760', '422', '376', '275', '400', '368', '414', '682',
      '364', '795', '004',
      // África
      '818', '434', '788', '012', '504', '729',
    ],
    // De los países enormes solo entra la parte que conocían los romanos y sus vecinos.
    clip: {
      643: [[27, 41], [48, 41], [48, 52], [27, 52], [27, 41]], // Rusia: estepa del mar Negro y el Cáucaso
      682: [[34, 25.5], [50, 25.5], [50, 33], [34, 33], [34, 25.5]], // Arabia Saudí: el norte
      '004': [[60, 29], [70, 29], [70, 39], [60, 39], [60, 29]], // Afganistán: Bactria y Aria
      434: [[9, 24], [26, 24], [26, 34], [9, 34], [9, 24]], // Libia: hasta el Fezán
      '012': [[-3, 31], [9, 31], [9, 38], [-3, 38], [-3, 31]], // Argelia: el norte, sin el Sáhara
      504: [[-14, 29], [0, 29], [0, 37], [-14, 37], [-14, 29]], // Marruecos: sin el Sáhara Occidental
      729: [[21, 15], [39, 15], [39, 23], [21, 23], [21, 15]], // Sudán: Nubia y Meroe
      // Sin territorios de ultramar (Guayana Francesa, Canarias, Azores, Madeira, Caribe...).
      250: EUROPE_BOX, 724: EUROPE_BOX, 620: EUROPE_BOX, 528: EUROPE_BOX, 208: EUROPE_BOX, 826: EUROPE_BOX,
    },
    // África se reparte por separado de Europa y Asia (ninguna región cruza el Estrecho ni el Sinaí).
    groups: [['818', '434', '788', '012', '504', '729']],
  },
};
// Lo que no esté en ningún grupo forma un grupo más (Europa y Asia en el mapa romano).
for (const cfg of Object.values(SOURCES)) {
  if (!cfg.groups) continue;
  const rest = cfg.countries.filter((c) => !cfg.groups.flat().includes(c));
  if (rest.length) cfg.groups.push(rest);
}

const projection = geoNaturalEarth1().fitExtent([[10, 10], [WIDTH - 10, HEIGHT - 10]], { type: 'Sphere' });
const path = geoPath(projection).digits(2);

const kmBetween = ([lon1, lat1], [lon2, lat2]) => {
  const dx = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.hypot(dx, lat2 - lat1) * 111.2;
};
const polygonsOf = (geom) => (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates);
const features = feature(topology, topology.objects.countries).features;

// Cada masa de tierra grande se reparte solo entre las capitales que están en ella:
// así ninguna región cruza un estrecho como el Bósforo.
function inside([x, y], polygon) {
  let hit = false;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

// Douglas-Peucker sobre el contorno ya proyectado.
function simplify(points, tol) {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let max = 0;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const d = len > 1e-9
        ? Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len
        : Math.hypot(px - ax, py - ay);
      if (d > max) { max = d; index = i; }
    }
    if (max > tol && index > 0) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
const planarArea = (pts) => Math.abs(pts.reduce((sum, [x, y], i) => {
  const [nx, ny] = pts[(i + 1) % pts.length];
  return sum + x * ny - nx * y;
}, 0)) / 2;

function svgPath(geometry, tol, minArea, digits) {
  let out = '';
  let biggest = null;
  for (const poly of geometry.coordinates) {
    for (const ring of poly) {
      // Se parte el anillo por su punto más lejano para que Douglas-Peucker tenga una línea de referencia.
      const pts = ring.slice(0, -1).map((p) => projection(p));
      let far = 1;
      for (let i = 1; i < pts.length; i++) {
        if (Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = i;
      }
      const simple = [...simplify(pts.slice(0, far + 1), tol), ...simplify([...pts.slice(far), pts[0]], tol).slice(1, -1)];
      if (!biggest || planarArea(pts) > planarArea(biggest)) biggest = simple;
      if (simple.length < 3 || planarArea(simple) < minArea) continue;
      out += `M${simple.map(([x, y]) => `${+x.toFixed(digits)},${+y.toFixed(digits)}`).join('L')}Z`;
    }
  }
  if (!out && biggest) out = `M${biggest.map(([x, y]) => `${+x.toFixed(digits)},${+y.toFixed(digits)}`).join('L')}Z`;
  return out;
}

function buildEra(era) {
  const { regions: defs } = HISTORIC_MAPS[era];
  const cfg = SOURCES[era];
  const KX = Math.cos((cfg.lat * Math.PI) / 180); // los grados de longitud son más cortos lejos del ecuador
  const toPlane = ([lon, lat]) => [lon * KX, lat];
  const toLonLat = ([x, y]) => [x / KX, y];
  const isSource = (f) => cfg.countries.includes(f.id ?? f.properties.name);
  const sources = features.filter(isSource);
  const others = features.filter((f) => !isSource(f));
  // Polígonos de cada país de origen, ya recortados a la zona del mapa (en el plano).
  const groups = cfg.groups ?? [cfg.countries];
  const sourcePolys = sources.flatMap((f) => {
    const clip = cfg.clip?.[f.id];
    const group = groups.findIndex((g) => g.includes(f.id ?? f.properties.name));
    return polygonsOf(f.geometry).flatMap((poly) => {
      const plane = poly.map((ring) => ring.map(toPlane));
      return (clip ? polygonClipping.intersection([plane], [[clip.map(toPlane)]]) : [plane]).map((p) => Object.assign(p, { group }));
    });
  });
  // Superficie en el plano (no depende del sentido de los anillos, que cambia al recortar).
  const km2Of = (plane) => plane.reduce((sum, ring, i) => sum + (i ? -1 : 1) * planarArea(ring), 0) * 111.2 ** 2;

  // ---------- Reparto de la tierra ----------

  const seeds = defs.map((r) => ({ ...r, p: toPlane([r.lon, r.lat]) }));
  const landSeeds = seeds.filter((s) => !s.island);
  const pieces = new Map(seeds.map((s) => [s.id, []])); // región -> polígonos en el plano
  const bigPieces = sourcePolys.filter((p) => km2Of(p) >= WHOLE_ISLAND_KM2);
  const landmasses = groups.flatMap((_, g) => {
    const own = bigPieces.filter((p) => p.group === g);
    return own.length ? polygonClipping.union(...own.map((p) => [p])).map((land) => Object.assign(land, { group: g })) : [];
  }).map((land) => {
    const own = landSeeds.filter((s) => inside(s.p, land));
    if (!own.length) {
      const [x, y] = land[0][0];
      console.log(`  (${era}: tierra sin capital cerca de ${(x / KX).toFixed(1)}, ${y.toFixed(1)}: va entera a la región más cercana)`);
      return null;
    }
    const voronoi = Delaunay.from(own.map((s) => s.p)).voronoi([-200 * KX, -90, 200 * KX, 90]);
    return { land, own, group: land.group, cells: own.map((_, i) => voronoi.cellPolygon(i)) };
  }).filter(Boolean);
  const lost = landSeeds.filter((s) => !landmasses.some((m) => m.own.includes(s)));
  if (lost.length) throw new Error(`${era}: capitales en el mar: ${lost.map((s) => s.name).join(', ')}`);
  const centroidPlane = (ring) => {
    let x = 0;
    let y = 0;
    for (const [px, py] of ring) { x += px; y += py; }
    return [x / ring.length, y / ring.length];
  };
  const nearest = (list, [x, y]) => list.reduce((best, s) => (
    Math.hypot(s.p[0] - x, s.p[1] - y) < Math.hypot(best.p[0] - x, best.p[1] - y) ? s : best));

  for (const plane of sourcePolys) {
    const km2 = km2Of(plane);
    if (km2 < MIN_PIECE_KM2) continue;
    const mine = landmasses.filter((m) => m.group === plane.group);
    const covered = km2 >= WHOLE_ISLAND_KM2 && mine.some(({ land }) => polygonClipping.intersection([plane], [land]).length > 0);
    if (km2 < WHOLE_ISLAND_KM2 || !covered) {
      pieces.get(nearest(seeds, centroidPlane(plane[0])).id).push(plane);
      continue;
    }
    for (const { land, own, cells } of mine) {
      own.forEach((s, i) => {
        for (const part of polygonClipping.intersection([plane], [land], [cells[i]])) pieces.get(s.id).push(part);
      });
    }
  }

  // ---------- Geometría de cada región ----------

  const snapKey = ([lon, lat]) => `${Math.round(lon * 1e4)},${Math.round(lat * 1e4)}`;
  const regions = [];
  for (const s of seeds) {
    const list = pieces.get(s.id);
    if (!list.length) throw new Error(`${era}: la región ${s.id} se ha quedado sin tierra`);
    // Las piezas de países distintos (Grecia y Bulgaria en Tracia...) se funden en una sola.
    const merged = polygonClipping.union(...list.map((p) => [p]));
    // polygon-clipping da los anillos exteriores en sentido antihorario; d3-geo los quiere al revés.
    const coordinates = merged.map((poly) => poly.map((ring) => ring.map(toLonLat).reverse()));
    regions.push({ seed: s, geometry: { type: 'MultiPolygon', coordinates } });
  }

  // ---------- Fronteras, costa y rutas por mar ----------

  const owners = new Map(); // vértice -> regiones que lo usan
  regions.forEach((r, i) => {
    for (const poly of r.geometry.coordinates) for (const ring of poly) for (const p of ring) {
      const k = snapKey(p);
      if (!owners.has(k)) owners.set(k, new Set());
      owners.get(k).add(i);
    }
  });
  const foreign = new Set(); // vértices de fronteras con países de fuera (Serbia, Siria, Irán...)
  for (const f of others) for (const poly of polygonsOf(f.geometry)) for (const ring of poly) for (const p of ring) foreign.add(snapKey(p));

  const shared = new Map(); // "i|j" -> vértices en común
  for (const set of owners.values()) {
    if (set.size < 2) continue;
    const list = [...set];
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const key = `${Math.min(list[a], list[b])}|${Math.max(list[a], list[b])}`;
        shared.set(key, (shared.get(key) ?? 0) + 1);
      }
    }
  }

  const out = regions.map((r) => {
    const s = r.seed;
    const coastPoints = [];
    for (const poly of r.geometry.coordinates) for (const ring of poly) for (const p of ring) {
      const k = snapKey(p);
      if (owners.get(k).size === 1 && !foreign.has(k)) coastPoints.push(p);
    }
    // Etiqueta y centro: el polígono más grande de la región.
    const main = r.geometry.coordinates.reduce((best, poly) => (
      geoArea({ type: 'Polygon', coordinates: poly }) > geoArea({ type: 'Polygon', coordinates: best }) ? poly : best));
    const mainGeo = { type: 'Polygon', coordinates: main };
    const [cx, cy] = path.centroid(mainGeo);
    const [[x0], [x1]] = path.bounds(mainGeo);
    return {
      id: s.id,
      name: s.name,
      era,
      d: svgPath(r.geometry, 0.02, 0.0004, 2),
      ds: svgPath(r.geometry, 0.25, 0.02, 1),
      cx: Math.round(cx * 100) / 100,
      cy: Math.round(cy * 100) / 100,
      lw: Math.round((x1 - x0) * 10) / 10,
      lon: s.lon, // la ciudad principal: las tropas viajan entre ciudades
      lat: s.lat,
      area: Math.round(geoArea(r.geometry) * EARTH_RADIUS_KM ** 2),
      coastal: Boolean(s.island) || coastPoints.length >= 5,
      coastPoints,
      neighbors: new Set(),
      sea: new Set(),
    };
  });

  for (const [key, n] of shared) {
    if (n < 2) continue; // tocarse en un solo punto no es frontera
    const [a, b] = key.split('|').map(Number);
    out[a].neighbors.add(out[b].id);
    out[b].neighbors.add(out[a].id);
  }

  // Costas cercanas: estrechos y travesías cortas (Eubea, Corcira, Lesbos, el Bósforo...).
  const sample = (pts) => pts.filter((_, i) => i % 3 === 0);
  const coastGap = (a, b) => {
    let best = Infinity;
    for (const p of sample(a.coastPoints)) for (const q of sample(b.coastPoints)) best = Math.min(best, kmBetween(p, q));
    return best;
  };
  const linkSea = (a, b) => {
    a.neighbors.add(b.id);
    b.neighbors.add(a.id);
    a.sea.add(b.id);
    b.sea.add(a.id);
  };
  const gaps = [];
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i];
      const b = out[j];
      if (!a.coastal || !b.coastal || a.neighbors.has(b.id)) continue;
      const gap = coastGap(a, b);
      gaps.push({ a, b, gap });
      if (gap <= SEA_LINK_KM) linkSea(a, b);
    }
  }

  // Todo el mapa debe ser alcanzable: se unen los grupos sueltos por su travesía más corta.
  for (;;) {
    const seen = new Set([out[0].id]);
    const queue = [out[0]];
    const byId = new Map(out.map((c) => [c.id, c]));
    while (queue.length) for (const n of queue.shift().neighbors) if (!seen.has(n)) { seen.add(n); queue.push(byId.get(n)); }
    if (seen.size === out.length) break;
    const bridge = gaps.filter((g) => seen.has(g.a.id) !== seen.has(g.b.id)).sort((x, y) => x.gap - y.gap)[0];
    if (!bridge) throw new Error(`${era}: no se puede conectar el mapa`);
    linkSea(bridge.a, bridge.b);
  }

  return out;
}

const pieceKm2 = (poly) => geoArea({ type: 'Polygon', coordinates: poly }) * EARTH_RADIUS_KM ** 2;

const worldUrl = new URL('../shared/world.json', import.meta.url);
const world = JSON.parse(readFileSync(worldUrl, 'utf8'));
world.countries = world.countries.filter((c) => !isAncient(c.id));
for (const era of Object.keys(HISTORIC_MAPS)) {
  const out = buildEra(era);
  for (const c of out) {
    delete c.coastPoints;
    world.countries.push({ ...c, neighbors: [...c.neighbors].sort(), sea: [...c.sea].sort() });
  }
  const kb = out.reduce((s, c) => s + c.d.length + c.ds.length, 0) / 1024;
  console.log(`${era}: ${out.length} regiones (${kb.toFixed(0)} KB de contornos)`);
  for (const c of out) console.log(`  ${c.id} ${c.name.padEnd(18)} ${String(c.area).padStart(8)} km²  ${c.coastal ? 'costa' : '     '}  ${c.neighbors.size} vecinos  ${[...c.sea].join(' ')}`);
}
writeFileSync(worldUrl, JSON.stringify(world));
