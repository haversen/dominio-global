// Genera shared/world.json a partir de los datos de Natural Earth (paquete world-atlas).
// Uso: npm run build:map
//
// Resultado: países ya proyectados a coordenadas SVG, con nombre en español,
// superficie, centroide y lista de vecinos (fronteras terrestres + rutas marítimas).

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { feature, neighbors as topoNeighbors } from 'topojson-client';
import { geoNaturalEarth1, geoPath, geoArea, geoGraticule10, geoCentroid } from 'd3-geo';
import countriesLib from 'i18n-iso-countries';

const require = createRequire(import.meta.url);
const topology = require('world-atlas/countries-110m.json');
countriesLib.registerLocale(require('i18n-iso-countries/langs/es.json'));

const WIDTH = 2000;
const HEIGHT = 1040;
const EARTH_RADIUS_KM = 6371;

// Territorios que no se juegan.
const EXCLUDED = new Set(['ATA', 'ATF']);

// Entidades sin código ISO en Natural Earth.
const UNNAMED = {
  'N. Cyprus': { id: 'XNC', name: 'Chipre del Norte' },
  Somaliland: { id: 'XSL', name: 'Somalilandia' },
  Kosovo: { id: 'XKX', name: 'Kosovo' },
};

// Nombres más cortos para que quepan en el mapa y en la interfaz.
const NAME_OVERRIDES = {
  USA: 'Estados Unidos',
  GBR: 'Reino Unido',
  RUS: 'Rusia',
  COD: 'R. D. del Congo',
  COG: 'Congo',
  CAF: 'Rep. Centroafricana',
  DOM: 'Rep. Dominicana',
  BOL: 'Bolivia',
  VEN: 'Venezuela',
  IRN: 'Irán',
  SYR: 'Siria',
  KOR: 'Corea del Sur',
  PRK: 'Corea del Norte',
  LAO: 'Laos',
  VNM: 'Vietnam',
  TZA: 'Tanzania',
  MDA: 'Moldavia',
  BIH: 'Bosnia',
  MKD: 'Macedonia del Norte',
  CZE: 'Chequia',
  TWN: 'Taiwán',
  PSE: 'Palestina',
  FLK: 'Islas Malvinas',
  ESH: 'Sáhara Occidental',
  SWZ: 'Esuatini',
  CIV: 'Costa de Marfil',
  GNQ: 'Guinea Ecuatorial',
  GNB: 'Guinea-Bisáu',
  TLS: 'Timor Oriental',
  SLB: 'Islas Salomón',
  BHS: 'Bahamas',
  TTO: 'Trinidad y Tobago',
  NCL: 'Nueva Caledonia',
  PRI: 'Puerto Rico',
  BRN: 'Brunéi',
  SSD: 'Sudán del Sur',
};

// Conexiones por mar (estrechos y rutas cortas) para que las islas sean alcanzables.
const SEA_LINKS = [
  ['GBR', 'FRA'], ['GBR', 'BEL'], ['GBR', 'NOR'], ['ISL', 'GBR'], ['ISL', 'GRL'], ['ISL', 'NOR'],
  ['GRL', 'CAN'], ['USA', 'RUS'], ['ESP', 'MAR'], ['ITA', 'TUN'], ['DNK', 'SWE'], ['DNK', 'NOR'],
  ['EST', 'FIN'], ['JPN', 'KOR'], ['JPN', 'RUS'], ['TWN', 'CHN'], ['TWN', 'PHL'], ['PHL', 'MYS'],
  ['PHL', 'IDN'], ['AUS', 'IDN'], ['AUS', 'PNG'], ['NZL', 'AUS'], ['NCL', 'AUS'], ['NCL', 'VUT'],
  ['VUT', 'SLB'], ['SLB', 'PNG'], ['FJI', 'VUT'], ['FJI', 'NZL'], ['LKA', 'IND'], ['MDG', 'MOZ'],
  ['CUB', 'USA'], ['CUB', 'MEX'], ['CUB', 'HTI'], ['JAM', 'CUB'], ['JAM', 'HTI'], ['BHS', 'USA'],
  ['BHS', 'CUB'], ['PRI', 'DOM'], ['TTO', 'VEN'], ['XNC', 'TUR'], ['CYP', 'LBN'], ['FLK', 'ARG'],
  ['EGY', 'SAU'], ['YEM', 'DJI'], ['YEM', 'ERI'], ['YEM', 'SOM'], ['GRC', 'ITA'], ['ALB', 'ITA'],
];

const geo = feature(topology, topology.objects.countries);
const geometries = topology.objects.countries.geometries;
const adjacency = topoNeighbors(geometries);

// Un arco que solo usa un país es costa: así sabemos qué países tienen salida al mar.
const arcUse = new Map();
const arcsOf = (g) => g.arcs.flat(2).map((a) => (a < 0 ? ~a : a));
for (const g of geometries) for (const a of new Set(arcsOf(g))) arcUse.set(a, (arcUse.get(a) ?? 0) + 1);
const isCoastal = (g) => arcsOf(g).some((a) => arcUse.get(a) === 1);

const projection = geoNaturalEarth1().fitExtent([[10, 10], [WIDTH - 10, HEIGHT - 10]], { type: 'Sphere' });
const path = geoPath(projection).digits(1);

function identify(f) {
  if (f.id == null) return UNNAMED[f.properties.name];
  const id = countriesLib.numericToAlpha3(f.id);
  if (!id) throw new Error(`Código desconocido ${f.id} (${f.properties.name})`);
  const name = NAME_OVERRIDES[id] ?? countriesLib.getName(id, 'es', { select: 'alias' }) ?? f.properties.name;
  return { id, name };
}

// Polígono más grande (evita que Francia caiga en el Atlántico por la Guayana).
function mainPolygon(f) {
  if (f.geometry.type !== 'MultiPolygon') return f;
  let best = null;
  let bestArea = -1;
  for (const coords of f.geometry.coordinates) {
    const poly = { type: 'Polygon', coordinates: coords };
    const area = path.area(poly);
    if (area > bestArea) {
      bestArea = area;
      best = poly;
    }
  }
  return best;
}

const idx = geo.features.map(identify);
const countries = [];
const indexToId = new Map();

geo.features.forEach((f, i) => {
  const { id, name } = idx[i];
  if (EXCLUDED.has(id)) return;
  const main = mainPolygon(f);
  const [cx, cy] = path.centroid(main);
  const [[x0], [x1]] = path.bounds(main);
  const [lon, lat] = geoCentroid(main);
  countries.push({
    id,
    name,
    d: path(f),
    cx: Math.round(cx * 10) / 10,
    cy: Math.round(cy * 10) / 10,
    lw: Math.round(x1 - x0), // ancho disponible para la etiqueta
    lon: Math.round(lon * 100) / 100, // centro geográfico (para distancias reales en km)
    lat: Math.round(lat * 100) / 100,
    area: Math.round(geoArea(f) * EARTH_RADIUS_KM ** 2),
    coastal: isCoastal(geometries[i]),
    neighbors: new Set(),
    sea: new Set(), // vecinos a los que solo se llega por mar
  });
  indexToId.set(i, id);
});

const byId = new Map(countries.map((c) => [c.id, c]));

adjacency.forEach((list, i) => {
  const a = byId.get(indexToId.get(i));
  if (!a) return;
  for (const j of list) {
    const b = byId.get(indexToId.get(j));
    if (b) a.neighbors.add(b.id);
  }
});

for (const [x, y] of SEA_LINKS) {
  const a = byId.get(x);
  const b = byId.get(y);
  if (!a || !b) throw new Error(`Ruta marítima con país inexistente: ${x}-${y}`);
  a.neighbors.add(y);
  b.neighbors.add(x);
  if (!a.coastal || !b.coastal) throw new Error(`Ruta marítima con país sin costa: ${x}-${y}`);
  a.sea.add(y);
  b.sea.add(x);
}

// Comprobaciones: todos alcanzables desde todos.
const isolated = countries.filter((c) => c.neighbors.size === 0).map((c) => `${c.id} ${c.name}`);
const seen = new Set([countries[0].id]);
const queue = [countries[0].id];
while (queue.length) {
  for (const n of byId.get(queue.shift()).neighbors) {
    if (!seen.has(n)) {
      seen.add(n);
      queue.push(n);
    }
  }
}
const unreachable = countries.filter((c) => !seen.has(c.id)).map((c) => `${c.id} ${c.name}`);
if (isolated.length || unreachable.length) {
  console.error('Aislados:', isolated);
  console.error('Inalcanzables desde', countries[0].id, ':', unreachable);
  process.exit(1);
}

countries.sort((a, b) => a.name.localeCompare(b.name, 'es'));
const world = {
  width: WIDTH,
  height: HEIGHT,
  sphere: path({ type: 'Sphere' }),
  graticule: path(geoGraticule10()),
  countries: countries.map((c) => ({ ...c, neighbors: [...c.neighbors].sort(), sea: [...c.sea].sort() })),
};

const out = new URL('../shared/world.json', import.meta.url);
writeFileSync(out, JSON.stringify(world));
console.log(`${countries.length} países escritos en shared/world.json (${(JSON.stringify(world).length / 1024).toFixed(0)} KB)`);
