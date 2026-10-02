import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, pickCountry, tickGame, recruit, moveArmy, spy, incomeFor, publicGame, PICK_DURATION_MS, STABILITY,
  launchStrike,
} from '../server/game.js';
import { emptyUnits } from '../shared/military.js';
import { decodeCountries } from '../shared/wire.js';

const T0 = PICK_DURATION_MS;
const players = ['a', 'b'];

function game(settings = {}) {
  const g = createGame({ countryAssignment: 'choose', gameSpeed: 'normal', ...settings }, players, { now: 0 });
  pickCountry(g, 'a', 'ESP');
  pickCountry(g, 'b', 'JPN');
  tickGame(g, players, T0);
  for (const p of Object.values(g.players)) p.resources = { money: 100_000, food: 100_000, oil: 100_000, industry: 100_000 };
  return g;
}
const fixed = (v) => () => v;

// ---------- Niebla de guerra ----------

test('niebla de guerra: solo se ven las tropas propias, vecinas y las que revela un espía', () => {
  const g = game({ fogOfWar: true });
  const viewA = decodeCountries(publicGame(g, 'a').countries);
  assert.ok(!viewA.ESP.hidden && !viewA.FRA.hidden && !viewA.PRT.hidden, 'lo propio y lo vecino se ve');
  assert.equal(viewA.JPN.hidden, true, 'Japón (de b) está lejos: oculto');
  assert.equal(viewA.JPN.owner, 'b', 'pero se sabe de quién es');
  assert.equal(viewA.JPN.units.infantry, 0);
  assert.equal(decodeCountries(publicGame(g, null).countries).JPN.hidden, undefined, 'sin espectador, todo visible');

  assert.equal(spy(g, 'a', 'recon', 'JPN', T0, fixed(0)).success, true);
  assert.equal(decodeCountries(publicGame(g, 'a', T0).countries).JPN.hidden, undefined, 'el espía lo revela');
  assert.equal(decodeCountries(publicGame(g, 'a', T0 + 10 * 60_000).countries).JPN.hidden, true, 'por un tiempo');
});

// ---------- Recursos estratégicos ----------

test('recursos estratégicos: sin uranio no hay bomba nuclear; un aliado lo comparte', () => {
  const g = game();
  g.players.a.unlocked.push('inf2');
  assert.match(recruit(g, 'a', 'ESP', 'mech', 1, T0), /caucho/);
  g.countries.LKA.owner = 'b';
  assert.match(recruit(g, 'a', 'ESP', 'mech', 1, T0), /caucho/, 'un caucho ajeno no sirve');
  g.relations['a|b'] = { state: 'alliance' };
  assert.equal(recruit(g, 'a', 'ESP', 'mech', 1, T0), null, 'el del aliado sí');

  g.players.a.unlocked.push('bomb1', 'bomb2', 'air2', 'bomb3');
  delete g.relations['a|b'];
  assert.match(launchStrike(g, 'a', 'nuke', 'FRA', T0).error, /uranio/);
});

// ---------- Estabilidad y rebeliones ----------

test('estabilidad: un país recién conquistado sin tropas acaba sublevándose', () => {
  const g = game();
  g.countries.PRT.units = { ...emptyUnits(), infantry: 1 };
  g.countries.ESP.units = { ...emptyUnits(), infantry: 20 };
  const { army } = moveArmy(g, 'a', 'ESP', 'PRT', { infantry: 20 }, T0);
  tickGame(g, players, army.arriveAt, fixed(0.5));
  assert.equal(g.countries.PRT.owner, 'a');
  assert.equal(g.countries.PRT.stability, STABILITY.fromNeutral);

  // Produce menos mientras es inestable.
  const before = incomeFor(g, 'a').money;
  g.countries.PRT.stability = 100;
  assert.ok(incomeFor(g, 'a').money > before);

  // Sin guarnición se desmorona y se subleva.
  g.countries.PRT.units = emptyUnits();
  g.countries.PRT.stability = 5;
  let t = army.arriveAt;
  for (let i = 0; i < 20 && g.countries.PRT.owner === 'a'; i++) {
    t += STABILITY.checkMs;
    tickGame(g, players, t, fixed(0.01));
  }
  assert.equal(g.countries.PRT.owner, null, 'Portugal se ha declarado independiente');
  assert.ok(g.countries.PRT.units.infantry >= 3, 'con rebeldes armados');
  assert.equal(g.countries.ESP.owner, 'a', 'la capital nunca se subleva');
  assert.ok(g.events.some((e) => e.type === 'revolt' && e.country === 'PRT'));
});

test('cansancio de guerra: perder tropas baja los ingresos y se recupera con el tiempo', () => {
  const g = game();
  const before = incomeFor(g, 'a').money;
  g.players.a.weariness = 0.3;
  assert.ok(Math.abs(incomeFor(g, 'a').money - before * 0.7) < 1e-6);
  tickGame(g, players, T0 + 5 * 60_000);
  assert.ok(g.players.a.weariness < 0.3);
});

// ---------- Espionaje ----------

test('espionaje: sabotaje, robo de tecnología, revueltas y espías capturados', () => {
  const g = game();
  g.countries.JPN.buildings = { factory: 2 };
  const sab = spy(g, 'a', 'sabotage', 'JPN', T0, fixed(0));
  assert.equal(sab.success, true);
  assert.deepEqual(g.countries.JPN.buildings, { factory: 1 });
  assert.match(spy(g, 'a', 'sabotage', 'JPN', T0 + 1000, fixed(0)).error, /preparando/, 'hay que esperar entre misiones');

  g.players.b.unlocked.push('arm2');
  assert.equal(spy(g, 'a', 'steal', 'JPN', T0, fixed(0)).success, true);
  assert.ok(g.players.a.unlocked.includes('arm2'), 'a ha copiado los tanques pesados');
  assert.match(spy(g, 'a', 'steal', 'FRA', T0 + 999_999, fixed(0)).error, /otro jugador/);

  g.countries.KOR.owner = 'b';
  g.countries.KOR.stability = 80;
  assert.equal(spy(g, 'a', 'incite', 'KOR', T0, fixed(0)).success, true);
  assert.equal(g.countries.KOR.stability, 40);

  // Falla y lo capturan: se hace público.
  const seq = [0.95, 0.1]; // falla la misión y luego lo atrapan
  const fail = spy(g, 'a', 'recon', 'KOR', T0, () => seq.shift());
  assert.equal(fail.success, false);
  assert.equal(fail.caught, true);
  assert.ok(g.events.some((e) => e.type === 'spy' && e.caught && e.by === 'a'));
  assert.match(spy(g, 'a', 'recon', 'ESP', T0 + 999_999).error, /tus propios/);
});
