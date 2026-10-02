import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, pickCountry, tickGame, build, recruit, incomeFor, researchNode, research, moveArmy, PICK_DURATION_MS, STABILITY,
} from '../server/game.js';
import { BUILDINGS, buildingMs, buildingCost } from '../shared/buildings.js';
import { TECH_TREE, treeBonus } from '../shared/tech.js';
import { UNITS, emptyUnits, resolveBattle } from '../shared/military.js';
import { leaderBonus } from '../shared/leaders.js';

const T0 = PICK_DURATION_MS;
const players = ['a', 'b'];

function game() {
  const g = createGame({ countryAssignment: 'choose', gameSpeed: 'normal' }, players, { now: 0 });
  pickCountry(g, 'a', 'ESP');
  pickCountry(g, 'b', 'JPN');
  tickGame(g, players, T0);
  for (const p of Object.values(g.players)) p.resources = { money: 100_000, food: 100_000, oil: 100_000, industry: 100_000 };
  return g;
}

test('construcciones: una fábrica cuesta, tarda y después produce industria', () => {
  const g = game();
  const before = incomeFor(g, 'a').industry;
  const money = g.players.a.resources.money;
  assert.equal(build(g, 'a', 'ESP', 'factory', T0), null);
  assert.equal(money - g.players.a.resources.money, buildingCost('factory', 1).money);
  assert.match(build(g, 'a', 'ESP', 'farm', T0), /obra/, 'una obra a la vez por país');
  assert.match(build(g, 'b', 'ESP', 'farm', T0), /tus propios/);

  tickGame(g, players, T0 + buildingMs(1));
  assert.equal(g.countries.ESP.buildings.factory, 1);
  assert.equal(g.countries.ESP.constructing, null);
  const gain = incomeFor(g, 'a').industry - before;
  const expected = BUILDINGS.factory.produces.industry * leaderBonus(g.players.a.president).income;
  assert.ok(Math.abs(gain - expected) < 1e-6, `+${gain} industria/min`);
});

test('construcciones: el espacio depende del desarrollo y hay nivel máximo', () => {
  const g = game();
  let t = T0;
  const finish = (type) => {
    assert.equal(build(g, 'a', 'ESP', type, t), null, type);
    t += buildingMs(g.countries.ESP.constructing.toLevel);
    tickGame(g, players, t);
  };
  finish('farm');
  finish('farm');
  assert.match(build(g, 'a', 'ESP', 'bank', t), /espacio/, 'nivel 1 de desarrollo = 2 huecos');
  g.countries.ESP.level = 2;
  finish('farm');
  assert.match(build(g, 'a', 'ESP', 'farm', t), /máximo/);
  assert.equal(build(g, 'a', 'ESP', 'bank', t), null);
});

test('construcciones: el cuartel acelera el entrenamiento y el búnker defiende', () => {
  const g = game();
  g.countries.ESP.buildings = { barracks: 2 };
  recruit(g, 'a', 'ESP', 'infantry', 1, T0);
  assert.equal(g.countries.ESP.training[0].readyAt - T0, Math.round(UNITS.infantry.trainMs * 0.6));

  const attackers = { ...emptyUnits(), infantry: 10 };
  const defenders = { ...emptyUnits(), infantry: 6 };
  const rng = () => 0.5;
  const plain = resolveBattle(attackers, defenders, {}, rng);
  const bunker = resolveBattle(attackers, defenders, { defenseBonus: 1 + BUILDINGS.bunker.defense * 3 }, rng);
  assert.ok(bunker.defensePower > plain.defensePower * 1.4);
});

test('conquistar un país daña sus edificios', () => {
  const g = game();
  g.countries.PRT.buildings = { factory: 2, farm: 1 };
  g.countries.PRT.units = { ...emptyUnits(), infantry: 1 };
  g.countries.ESP.units = { ...emptyUnits(), infantry: 30 };
  const { army } = moveArmy(g, 'a', 'ESP', 'PRT', { infantry: 30 }, T0);
  tickGame(g, players, army.arriveAt, () => 0.5);
  assert.equal(g.countries.PRT.owner, 'a');
  assert.deepEqual(g.countries.PRT.buildings, { factory: 1 });
});

test('árbol: cada rama investiga en paralelo y las modificaciones mejoran a su tipo de tropa', () => {
  const g = game();
  assert.equal(researchNode(g, 'a', 'armA', T0), null);
  assert.equal(researchNode(g, 'a', 'infA', T0), null);
  assert.equal(researchNode(g, 'a', 'airA', T0), null);
  assert.equal(research(g, 'a', 'economy', T0), null);
  assert.equal(Object.keys(g.players.a.research).length, 4);
  tickGame(g, players, T0 + 60_000);
  assert.deepEqual(g.players.a.research, {});
  for (const id of ['armA', 'infA', 'airA']) assert.ok(g.players.a.unlocked.includes(id), id);

  const bonus = treeBonus(g.players.a.unlocked);
  assert.equal(bonus.defense.armor, TECH_TREE.armA.effect.mult);
  assert.equal(bonus.attack.infantry, TECH_TREE.infA.effect.mult);
  assert.equal(bonus.intercept, 1.5);
  assert.equal(bonus.attack.armor, undefined, 'solo mejora lo que dice');

  const tanks = { ...emptyUnits(), tank: 5 };
  const rng = () => 0.5;
  const base = resolveBattle(tanks, tanks, {}, rng);
  const armored = resolveBattle(tanks, tanks, { defenderMods: bonus.defense }, rng);
  assert.ok(armored.defensePower > base.defensePower * 1.1);
});

test('partidas guardadas con la investigación antigua siguen funcionando', () => {
  const g = game();
  g.players.a.research = { node: 'arm2', readyAt: T0 + 1000 };
  tickGame(g, players, T0 + 1000);
  assert.ok(g.players.a.unlocked.includes('arm2'));
  assert.deepEqual(g.players.a.research, {});
});

test('tomar la capital elimina al jugador y el conquistador se queda con todo su imperio', () => {
  const g = game();
  // b tiene su capital (Japón) y además Corea del Sur.
  g.countries.KOR.owner = 'b';
  g.countries.KOR.units = { ...emptyUnits(), infantry: 7 };
  g.countries.JPN.units = { ...emptyUnits(), infantry: 1 };
  g.countries.CHN.owner = 'a';
  g.countries.CHN.units = { ...emptyUnits(), infantry: 40, navy: 2 };
  g.relations['a|b'] = { state: 'war' };
  const { army, error } = moveArmy(g, 'a', 'CHN', 'JPN', { infantry: 40, navy: 2 }, T0);
  assert.equal(error, undefined);
  const { events } = tickGame(g, players, army.arriveAt, () => 0.5);
  assert.equal(g.countries.JPN.owner, 'a');
  assert.equal(g.players.b.eliminated, true, 'sin capital, b queda eliminado');
  assert.equal(g.countries.KOR.owner, 'a', 'sus demás países pasan a quien tomó la capital');
  assert.ok(g.countries.KOR.units.infantry >= 7, 'con la guarnición que tenían');
  assert.ok(g.countries.KOR.stability <= STABILITY.fromPlayer, 'recién anexionado: inestable');
  const elim = events.find((e) => e.type === 'eliminated');
  assert.equal(elim.reason, 'capital');
  assert.equal(elim.by, 'a');
  assert.equal(elim.annexed, 1);
});

test('equilibrio: cazas más lentos, barcos más rápidos e infantería algo mejor', () => {
  assert.ok(UNITS.aircraft.speed <= 400, 'el caza no es tan rápido');
  assert.ok(UNITS.navy.speed >= 70, 'los barcos van más rápido por mar');
  assert.ok(UNITS.infantry.attack > 1 && UNITS.infantry.defense > 1);
});

test('equilibrio: la infantería barata ya no gana siempre defendiendo', async () => {
  const { resolveBattle, stackFactor } = await import('../shared/military.js');
  // Defensa por cada moneda: la infantería no puede ser mucho mejor que los tanques.
  const perMoney = (t) => UNITS[t].defense / UNITS[t].cost.money;
  assert.ok(perMoney('infantry') < perMoney('tank') * 1.2, `infantería ${perMoney('infantry')} vs tanque ${perMoney('tank')}`);
  // Acumular cientos de tropas rinde menos por unidad.
  assert.equal(stackFactor(40), 1);
  assert.ok(stackFactor(500) < 0.6);
  // 500 infantes (5.000 de dinero) frente a un ejército de tanques que cuesta lo mismo.
  const half = () => 0.5;
  const tanks = { ...emptyUnits(), tank: Math.floor(5000 / UNITS.tank.cost.money) };
  const r = resolveBattle(tanks, { ...emptyUnits(), infantry: 500 }, { terrain: 'plains' }, half);
  assert.ok(r.attackerWins, `tanques ${r.attackPower} contra infantería ${r.defensePower}`);
});

test('reclutar un lote grande tarda más que uno pequeño', () => {
  const g = createGame({ countryAssignment: 'random' }, ['a'], { now: 0 });
  tickGame(g, ['a'], PICK_DURATION_MS);
  const home = g.homes.a;
  g.players.a.resources = { money: 1e6, food: 1e6, oil: 1e6, industry: 1e6 };
  assert.equal(recruit(g, 'a', home, 'infantry', 1, PICK_DURATION_MS), null);
  assert.equal(recruit(g, 'a', home, 'infantry', 100, PICK_DURATION_MS), null);
  const [one, hundred] = g.countries[home].training;
  assert.ok(hundred.readyAt - PICK_DURATION_MS > (one.readyAt - PICK_DURATION_MS) * 20);
});

test('si la capital la toman las fuerzas neutrales, el imperio pasa a ser neutral', () => {
  const g = game();
  g.countries.KOR.owner = 'b';
  g.homes.b = null;
  g.fallen = { b: null };
  // Las eliminaciones se comprueban cuando llega un ejército: a mueve tropas entre sus países.
  g.countries.FRA.owner = 'a';
  g.countries.ESP.units = { ...emptyUnits(), infantry: 5 };
  const { army } = moveArmy(g, 'a', 'ESP', 'FRA', { infantry: 1 }, T0);
  tickGame(g, players, army.arriveAt);
  assert.equal(g.players.b.eliminated, true);
  assert.equal(g.countries.KOR.owner, null);
});

test('ajuste de la capital: «se vuelve neutral» y «trasladar la capital»', () => {
  const setup = (rule) => {
    const g = createGame({ countryAssignment: 'choose', gameSpeed: 'normal', capitalCapture: rule }, players, { now: 0 });
    pickCountry(g, 'a', 'ESP');
    pickCountry(g, 'b', 'JPN');
    tickGame(g, players, T0);
    g.countries.KOR.owner = 'b';
    g.countries.KOR.level = 3;
    g.countries.KOR.units = { ...emptyUnits(), infantry: 7 };
    g.countries.JPN.units = { ...emptyUnits(), infantry: 1 };
    g.countries.CHN.owner = 'a';
    g.countries.CHN.units = { ...emptyUnits(), infantry: 40, navy: 2 };
    g.relations['a|b'] = { state: 'war' };
    const { army } = moveArmy(g, 'a', 'CHN', 'JPN', { infantry: 40, navy: 2 }, T0);
    return { g, ...tickGame(g, players, army.arriveAt, () => 0.5) };
  };

  const neutral = setup('neutral');
  assert.equal(neutral.g.countries.JPN.owner, 'a');
  assert.equal(neutral.g.players.b.eliminated, true);
  assert.equal(neutral.g.countries.KOR.owner, null, 'nadie hereda: el imperio se vuelve neutral');

  const move = setup('move');
  assert.equal(move.g.countries.JPN.owner, 'a');
  assert.equal(move.g.players.b.eliminated, false, 'sigue jugando');
  assert.equal(move.g.homes.b, 'KOR', 'la capital pasa a su mejor país');
  assert.equal(move.events.find((e) => e.type === 'battle').capitalMoved, 'KOR');
});
