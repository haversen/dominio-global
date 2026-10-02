import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLD, COUNTRIES, createGame, pickCountry, tickGame, releasePlayer, PICK_DURATION_MS,
  incomeFor, upkeepFor, developCountry, recruit, moveArmy, privateGame, publicGame,
} from '../server/game.js';
import {
  production, countryIncome, developCost, developMs, STARTING_RESOURCES, MAX_LEVEL, CAPITAL_BONUS,
  INCOME_PER_MINUTE, economyRating,
} from '../shared/economy.js';
import { UNITS, resolveBattle, startingArmy, totalUnits, moveError, travelMs } from '../shared/military.js';
import { declareWar, propose, respond, cancelProposal } from '../server/diplomacy.js';
import { relationOf, NAP_DURATION_MS, PROPOSAL_TTL_MS } from '../shared/diplomacy.js';
import { techCost, techMs } from '../shared/tech.js';
import { encodeCountries, decodeCountries } from '../shared/wire.js';
import { research } from '../server/game.js';
import { RoomManager } from '../server/rooms.js';

const tok = (n) => n.toString(16).padStart(32, '0');
const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

test('el mapa es un grafo conexo y simétrico', () => {
  assert.ok(WORLD.countries.length > 150);
  for (const c of WORLD.countries) {
    assert.ok(c.neighbors.length > 0, `${c.id} sin vecinos`);
    for (const n of c.neighbors) assert.ok(COUNTRIES.get(n).neighbors.includes(c.id), `${c.id}-${n} no es simétrico`);
  }
});

test('reparto aleatorio: un país distinto por jugador, sin vecinos entre sí', () => {
  for (let run = 0; run < 50; run++) {
    const game = createGame({ countryAssignment: 'random' }, players);
    assert.equal(game.phase, 'active');
    const homes = Object.values(game.homes);
    assert.equal(new Set(homes).size, players.length);
    for (const h of homes) assert.ok(economyRating(h) >= 1, `${h} es una capital poco viable`);
    for (const [pid, cid] of Object.entries(game.homes)) {
      assert.equal(game.countries[cid].owner, pid);
      for (const other of homes) {
        if (other !== cid) assert.ok(!COUNTRIES.get(cid).neighbors.includes(other), `${cid} limita con ${other}`);
      }
    }
  }
});

test('elección: no se puede elegir un país ocupado ni vecino de otro jugador', () => {
  const game = createGame({ countryAssignment: 'choose' }, ['a', 'b'], { now: 0 });
  assert.equal(game.phase, 'picking');
  assert.equal(game.pickDeadline, PICK_DURATION_MS);

  assert.equal(pickCountry(game, 'a', 'ESP'), null);
  assert.match(pickCountry(game, 'b', 'ESP'), /ocupado/);
  assert.match(pickCountry(game, 'b', 'FRA'), /ocupado/);
  assert.match(pickCountry(game, 'b', 'XXX'), /no existe/);
  assert.equal(pickCountry(game, 'a', 'DEU'), null, 'se puede cambiar de elección');
  assert.equal(pickCountry(game, 'b', 'ESP'), null, 'ESP queda libre al cambiar');
});

test('elección: al acabar el tiempo se asigna país a quien no eligió', () => {
  const game = createGame({ countryAssignment: 'choose' }, ['a', 'b'], { now: 0 });
  pickCountry(game, 'a', 'BRA');
  assert.equal(tickGame(game, ['a', 'b'], PICK_DURATION_MS - 1).picked, undefined);
  assert.equal(tickGame(game, ['a', 'b'], PICK_DURATION_MS).picked, true);
  assert.equal(game.phase, 'active');
  assert.equal(game.homes.a, 'BRA');
  assert.ok(game.homes.b && !COUNTRIES.get('BRA').neighbors.includes(game.homes.b));
});

test('un jugador que abandona deja sus países neutrales', () => {
  const game = createGame({ countryAssignment: 'random' }, ['a', 'b']);
  const home = game.homes.a;
  releasePlayer(game, 'a');
  assert.equal(game.countries[home].owner, null);
  assert.equal(game.homes.a, undefined);
});

test('sala: la elección termina cuando todos han elegido o se va quien faltaba', () => {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(tok(1), 'Uno');
  rm.attachSocket(tok(1), 's1');
  const { player: p2 } = rm.joinRoom(tok(2), 'Dos', room.code);
  rm.attachSocket(tok(2), 's2');
  rm.joinRoom(tok(3), 'Tres', room.code);
  rm.attachSocket(tok(3), 's3');
  rm.updateSettings(room, host, { countryAssignment: 'choose' });
  for (const p of room.players.values()) rm.setReady(room, p, true);
  rm.start(room, host);
  assert.equal(room.game.phase, 'picking');

  rm.pickCountry(room, host, 'CHN');
  assert.throws(() => rm.pickCountry(room, p2, 'MNG'), { code: 'INVALID_PICK' });
  rm.pickCountry(room, p2, 'ARG');
  assert.equal(room.game.phase, 'picking');

  rm.leave(tok(3));
  assert.equal(room.game.phase, 'active');
  assert.deepEqual(room.game.homes, { [host.id]: 'CHN', [p2.id]: 'ARG' });
  assert.equal(decodeCountries(rm.toPublic(room).game.countries).CHN.owner, host.id);
});

// ---------- Economía en tiempo real ----------

const SETTINGS = { countryAssignment: 'random', gameSpeed: 'normal' };
const T0 = PICK_DURATION_MS; // momento en que arranca la partida en gameWithHomes

function gameWithHomes(homes) {
  const game = createGame({ countryAssignment: 'choose', gameSpeed: 'normal' }, Object.keys(homes), { now: 0 });
  for (const [pid, cid] of Object.entries(homes)) pickCountry(game, pid, cid);
  tickGame(game, Object.keys(homes), T0);
  return game;
}

// Azar controlado para que los combates sean reproducibles.
const fixedRng = (value = 0.5) => () => value;

test('producción: los países ricos producen más; nivel y capital la aumentan', () => {
  const usa = production(COUNTRIES.get('USA'));
  const lux = production(COUNTRIES.get('LUX'));
  assert.ok(usa.money > lux.money && usa.industry > lux.industry);
  assert.ok(production(COUNTRIES.get('SAU')).oil > usa.oil);
  assert.equal(production(COUNTRIES.get('USA'), 3).money, Math.round(usa.money * 1.5));
  const capital = countryIncome(COUNTRIES.get('ESP'), 1, true);
  assert.equal(capital.money, (production(COUNTRIES.get('ESP')).money + CAPITAL_BONUS.money) * INCOME_PER_MINUTE);
});

test('economía: los recursos se acumulan de forma continua menos el mantenimiento', () => {
  const game = gameWithHomes({ a: 'ESP', b: 'JPN' });
  const income = incomeFor(game, 'a');
  const upkeep = upkeepFor(game, 'a');
  assert.ok(upkeep.food > 0 && upkeep.oil > 0, 'el ejército inicial cuesta mantenimiento');

  tickGame(game, ['a', 'b'], T0 + 30_000); // medio minuto
  const res = game.players.a.resources;
  assert.ok(Math.abs(res.money - (STARTING_RESOURCES.money + (income.money - upkeep.money) / 2)) < 1e-6);
  assert.ok(Math.abs(res.food - (STARTING_RESOURCES.food + (income.food - upkeep.food) / 2)) < 1e-6);
});

test('economía: los recursos nunca bajan de cero y sin ellos falta suministro', () => {
  const game = gameWithHomes({ a: 'ESP', b: 'JPN' });
  game.countries.ESP.units.tank = 500; // mantenimiento de petróleo enorme
  tickGame(game, ['a', 'b'], T0 + 60_000);
  assert.equal(game.players.a.resources.oil, 0);
  assert.equal(privateGame(game, 'a').supply.oil, false);
});

test('desarrollo: cuesta recursos, tarda en completarse y tiene límites', () => {
  const game = gameWithHomes({ a: 'ESP', b: 'JPN' });
  assert.match(developCountry(game, 'a', 'JPN', T0), /propios/);

  const cost = developCost(1);
  assert.equal(developCountry(game, 'a', 'ESP', T0), null);
  assert.equal(game.players.a.resources.money, STARTING_RESOURCES.money - cost.money);
  assert.equal(game.countries.ESP.level, 1, 'aún en construcción');
  assert.match(developCountry(game, 'a', 'ESP', T0), /ya se está/);

  tickGame(game, ['a', 'b'], T0 + developMs(1));
  assert.equal(game.countries.ESP.level, 2);
  assert.equal(game.countries.ESP.developing, null);

  game.players.a.resources = { money: 0, food: 0, oil: 0, industry: 0 };
  assert.match(developCountry(game, 'a', 'ESP', T0), /suficientes/);
  game.countries.ESP.level = MAX_LEVEL;
  assert.match(developCountry(game, 'a', 'ESP', T0), /máximo/);
});

// ---------- Tropas ----------

test('reclutar: cuesta recursos y las unidades llegan tras el entrenamiento', () => {
  const game = gameWithHomes({ a: 'ESP', b: 'CHE' });
  const before = game.countries.ESP.units.infantry;
  assert.equal(recruit(game, 'a', 'ESP', 'infantry', 5, T0), null);
  assert.equal(game.players.a.resources.money, STARTING_RESOURCES.money - UNITS.infantry.cost.money * 5);
  assert.equal(game.countries.ESP.units.infantry, before);

  tickGame(game, ['a', 'b'], T0 + UNITS.infantry.trainMs);
  assert.equal(game.countries.ESP.units.infantry, before + 5);

  assert.match(recruit(game, 'b', 'CHE', 'navy', 1, T0), /costa/);
  assert.match(recruit(game, 'a', 'FRA', 'infantry', 1, T0), /tus países/);
  assert.match(recruit(game, 'a', 'ESP', 'infantry', 0, T0), /de 1 a/);
  assert.match(recruit(game, 'a', 'ESP', 'tank', 50, T0), /suficientes/);
});

test('mover: valida vecinos, cantidades y el paso por mar', () => {
  const game = gameWithHomes({ a: 'ESP', b: 'JPN' });
  assert.match(moveArmy(game, 'a', 'ESP', 'ITA', { infantry: 1 }, T0).error, /vecinos/);
  assert.match(moveArmy(game, 'a', 'ESP', 'FRA', { infantry: 999 }, T0).error, /tantas/);
  assert.match(moveArmy(game, 'a', 'ESP', 'FRA', {}, T0).error, /al menos/);
  assert.match(moveArmy(game, 'a', 'JPN', 'KOR', { infantry: 1 }, T0).error, /tus países/);

  // España-Marruecos es una ruta marítima: la infantería necesita barco.
  assert.match(moveArmy(game, 'a', 'ESP', 'MAR', { infantry: 2 }, T0).error, /barco/);
  assert.equal(moveError(COUNTRIES.get('ESP'), COUNTRIES.get('MAR'), { infantry: 0, tank: 0, aircraft: 1, navy: 0 }), null);
  assert.match(moveError(COUNTRIES.get('DEU'), COUNTRIES.get('CHE'), { infantry: 0, tank: 0, aircraft: 0, navy: 1 }), /sin costa/);

  const { army } = moveArmy(game, 'a', 'ESP', 'MAR', { infantry: 2, navy: 1 }, T0);
  assert.ok(army.arriveAt > T0);
  assert.equal(game.countries.ESP.units.infantry, startingArmy(COUNTRIES.get('ESP')).infantry - 2);
});

test('los aviones llegan antes que la infantería', () => {
  const from = COUNTRIES.get('BRA');
  const to = COUNTRIES.get('ARG');
  const inf = travelMs(from, to, { infantry: 1, tank: 0, aircraft: 0, navy: 0 });
  const air = travelMs(from, to, { infantry: 0, tank: 0, aircraft: 1, navy: 0 });
  assert.ok(air < inf);
  // La velocidad de juego acorta los tiempos.
  assert.ok(travelMs(from, to, { infantry: 1, tank: 0, aircraft: 0, navy: 0 }, 1.6) < inf);
});

test('combate: un ejército fuerte conquista el país y el débil es rechazado', () => {
  const big = { infantry: 20, tank: 10, aircraft: 0, navy: 0 };
  const small = { infantry: 3, tank: 0, aircraft: 0, navy: 0 };
  const win = resolveBattle(big, small, {}, fixedRng());
  assert.equal(win.attackerWins, true);
  assert.equal(totalUnits(win.defendersLeft), 0);
  assert.ok(totalUnits(win.attackersLeft) > 0 && totalUnits(win.attackersLeft) <= totalUnits(big));

  const lose = resolveBattle(small, big, {}, fixedRng());
  assert.equal(lose.attackerWins, false);
  assert.equal(totalUnits(lose.attackersLeft), 0);
});

test('combate: terreno, capital y ataque anfibio favorecen al defensor', () => {
  const atk = { infantry: 0, tank: 5, aircraft: 0, navy: 0 };
  const def = { infantry: 10, tank: 0, aircraft: 0, navy: 0 };
  const plains = resolveBattle(atk, def, { terrain: 'plains' }, fixedRng());
  const mountains = resolveBattle(atk, def, { terrain: 'mountains' }, fixedRng());
  assert.ok(mountains.attackPower < plains.attackPower, 'los tanques sufren en montaña');
  assert.ok(mountains.defensePower > plains.defensePower);
  assert.ok(resolveBattle(atk, def, { capital: true }, fixedRng()).defensePower > plains.defensePower);
  assert.ok(resolveBattle(atk, def, { amphibious: true }, fixedRng()).attackPower < plains.attackPower);
  const unsupplied = resolveBattle(atk, def, { attackerSupply: { oil: false } }, fixedRng());
  assert.ok(unsupplied.attackPower < plains.attackPower);
});

test('conquista: al llegar el ejército, el país cambia de dueño y la capital se pierde', () => {
  const game = gameWithHomes({ a: 'ESP', b: 'JPN' });
  // Escenario: b solo conserva Portugal, que es su capital.
  game.countries.JPN.owner = null;
  game.countries.PRT.owner = 'b';
  game.homes.b = 'PRT';
  game.countries.PRT.units = { infantry: 1, tank: 0, aircraft: 0, navy: 0 };
  game.countries.ESP.units.tank = 20;
  assert.match(moveArmy(game, 'a', 'ESP', 'PRT', { tank: 20 }, T0).error, /guerra/, 'sin guerra no hay ataque');
  declareWar(game, 'a', 'b', T0);
  const { army } = moveArmy(game, 'a', 'ESP', 'PRT', { tank: 20 }, T0);

  const result = tickGame(game, ['a', 'b'], army.arriveAt, fixedRng());
  assert.equal(result.changed, true);
  assert.equal(game.countries.PRT.owner, 'a');
  assert.equal(game.homes.b, undefined, 'b pierde su capital');
  const battle = result.events.find((e) => e.type === 'battle');
  assert.equal(battle.attackerWins, true);
  assert.equal(battle.capitalTaken, true);

  // b se ha quedado sin países ni ejércitos: eliminado.
  assert.ok(result.events.some((e) => e.type === 'eliminated' && e.player === 'b'));
  assert.equal(game.players.b.eliminated, true);
});

test('refuerzos: mover a un país propio suma las tropas sin combate', () => {
  const game = gameWithHomes({ a: 'ESP', b: 'JPN' });
  game.countries.FRA.owner = 'a';
  const fraBefore = { ...game.countries.FRA.units };
  const { army } = moveArmy(game, 'a', 'ESP', 'FRA', { infantry: 4 }, T0);
  const result = tickGame(game, ['a', 'b'], army.arriveAt);
  assert.equal(result.events.length, 0);
  assert.equal(game.countries.FRA.units.infantry, fraBefore.infantry + 4);
});

test('abandonar: los países quedan neutrales con sus tropas y los ejércitos desaparecen', () => {
  const game = gameWithHomes({ a: 'ESP', b: 'JPN' });
  moveArmy(game, 'a', 'ESP', 'FRA', { infantry: 2 }, T0);
  releasePlayer(game, 'a');
  assert.equal(game.countries.ESP.owner, null);
  assert.ok(game.countries.ESP.units.infantry > 0);
  assert.equal(game.armies.length, 0);
});

test('privacidad: cada jugador solo ve sus recursos', () => {
  const game = createGame(SETTINGS, ['a', 'b']);
  const pub = JSON.stringify(publicGame(game));
  assert.ok(!pub.includes('resources'));
  assert.deepEqual(privateGame(game, 'a').resources, STARTING_RESOURCES);
  assert.equal(privateGame(game, 'zzz'), null);
});

test('todos los perfiles económicos corresponden a países del mapa', async () => {
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../shared/economy.js', import.meta.url), 'utf8'));
  const ids = [...src.matchAll(/\b([A-Z]{3}): \[/g)].map((m) => m[1]);
  assert.ok(ids.length > 80);
  for (const id of ids) assert.ok(COUNTRIES.has(id), `${id} no está en el mapa`);
});

// ---------- Diplomacia, comercio y tecnología ----------

test('diplomacia: guerra unilateral, paz y alianza por propuesta aceptada', () => {
  const game = gameWithHomes({ a: 'ESP', b: 'JPN', c: 'BRA' });
  assert.equal(relationOf(game.relations, 'a', 'b').state, 'peace');
  assert.match(propose(game, 'a', 'b', 'peace', null, T0).error, /guerra/);

  assert.equal(declareWar(game, 'a', 'b', T0).error, undefined);
  assert.equal(relationOf(game.relations, 'b', 'a').state, 'war');
  assert.match(declareWar(game, 'b', 'a', T0).error, /Ya estáis/);
  assert.match(propose(game, 'a', 'b', 'alliance', null, T0).error, /paz/);

  const { proposal } = propose(game, 'a', 'b', 'peace', null, T0);
  assert.match(respond(game, 'a', proposal.id, true, T0).error, /no existe/, 'solo el destinatario responde');
  assert.equal(respond(game, 'b', proposal.id, true, T0).accepted, true);
  assert.equal(relationOf(game.relations, 'a', 'b').state, 'peace');

  const ally = propose(game, 'c', 'a', 'alliance', null, T0).proposal;
  respond(game, 'a', ally.id, true, T0);
  assert.equal(relationOf(game.relations, 'a', 'c').state, 'alliance');
  // Romper la alianza es una traición, pero se permite.
  assert.equal(declareWar(game, 'c', 'a', T0).betrayal, true);
});

test('diplomacia: el pacto de no agresión impide declarar la guerra hasta que expira', () => {
  const game = gameWithHomes({ a: 'ESP', b: 'JPN' });
  const { proposal } = propose(game, 'a', 'b', 'nap', null, T0);
  respond(game, 'b', proposal.id, true, T0);
  assert.equal(relationOf(game.relations, 'a', 'b').state, 'nap');
  assert.match(declareWar(game, 'b', 'a', T0 + 1000).error, /pacto/);

  const result = tickGame(game, ['a', 'b'], T0 + NAP_DURATION_MS);
  assert.ok(result.events.some((e) => e.type === 'pact-ended'));
  assert.equal(relationOf(game.relations, 'a', 'b').state, 'peace');
  assert.equal(declareWar(game, 'b', 'a', T0 + NAP_DURATION_MS).error, undefined);
});

test('diplomacia: las propuestas caducan, se pueden cancelar y no se duplican', () => {
  const game = gameWithHomes({ a: 'ESP', b: 'JPN' });
  const { proposal } = propose(game, 'a', 'b', 'alliance', null, T0);
  assert.match(propose(game, 'a', 'b', 'alliance', null, T0).error, /igual/);
  assert.match(cancelProposal(game, 'b', proposal.id).error, /no existe/);
  assert.equal(cancelProposal(game, 'a', proposal.id).error, undefined);

  propose(game, 'a', 'b', 'alliance', null, T0);
  tickGame(game, ['a', 'b'], T0 + PROPOSAL_TTL_MS);
  assert.equal(game.proposals.length, 0);
  assert.equal(privateGame(game, 'b').proposals.length, 0);
});

test('comercio: intercambia recursos solo si ambos los tienen al aceptar', () => {
  const game = gameWithHomes({ a: 'ESP', b: 'JPN' });
  const resA = game.players.a.resources;
  const resB = game.players.b.resources;
  assert.match(propose(game, 'a', 'b', 'trade', { give: { money: 99999 } }, T0).error, /No tienes/);
  assert.match(propose(game, 'a', 'b', 'trade', { give: { money: -5 } }, T0).error, /inválida/);
  assert.match(propose(game, 'a', 'b', 'trade', {}, T0).error, /inválida/);

  const before = { a: { ...resA }, b: { ...resB } };
  const { proposal } = propose(game, 'a', 'b', 'trade', { give: { money: 50 }, receive: { oil: 10 } }, T0);
  assert.ok(privateGame(game, 'b').proposals.some((p) => p.id === proposal.id), 'b ve la oferta');
  respond(game, 'b', proposal.id, true, T0);
  assert.equal(resA.money, before.a.money - 50);
  assert.equal(resB.money, before.b.money + 50);
  assert.equal(resA.oil, before.a.oil + 10);
  assert.equal(resB.oil, before.b.oil - 10);

  // Si al aceptar ya no tiene lo que ofrecía, el trato falla.
  const gift = propose(game, 'a', 'b', 'trade', { give: { food: 10 } }, T0).proposal;
  resA.food = 0;
  assert.match(respond(game, 'b', gift.id, true, T0).error, /ya no tiene/);

  declareWar(game, 'a', 'b', T0);
  assert.match(propose(game, 'a', 'b', 'trade', { give: { money: 1 } }, T0).error, /guerra/);
});

test('alianza: las tropas enviadas a un aliado refuerzan su país', () => {
  const game = gameWithHomes({ a: 'ESP', b: 'JPN' });
  game.countries.FRA.owner = 'b';
  game.countries.FRA.units = { infantry: 2, tank: 0, aircraft: 0, navy: 0 };
  const { proposal } = propose(game, 'a', 'b', 'alliance', null, T0);
  respond(game, 'b', proposal.id, true, T0);

  const { army } = moveArmy(game, 'a', 'ESP', 'FRA', { infantry: 3 }, T0);
  const result = tickGame(game, ['a', 'b'], army.arriveAt);
  assert.ok(result.events.some((e) => e.type === 'reinforce'));
  assert.equal(game.countries.FRA.owner, 'b');
  assert.equal(game.countries.FRA.units.infantry, 5);
});

test('paz durante la marcha: el ejército da media vuelta y vuelve a casa', () => {
  const game = gameWithHomes({ a: 'ESP', b: 'JPN' });
  game.countries.FRA.owner = 'b';
  declareWar(game, 'a', 'b', T0);
  const homeInf = game.countries.ESP.units.infantry;
  const { army } = moveArmy(game, 'a', 'ESP', 'FRA', { infantry: 3 }, T0);
  const { proposal } = propose(game, 'a', 'b', 'peace', null, T0);
  respond(game, 'b', proposal.id, true, T0);

  tickGame(game, ['a', 'b'], army.arriveAt);
  assert.equal(game.countries.FRA.owner, 'b', 'no hay batalla');
  const back = game.armies.find((x) => x.returning);
  assert.ok(back && back.to === 'ESP');
  tickGame(game, ['a', 'b'], back.arriveAt);
  assert.equal(game.countries.ESP.units.infantry, homeInf);
});

test('tecnología: cuesta recursos, tarda y aplica sus bonificaciones', () => {
  const game = gameWithHomes({ a: 'ESP', b: 'JPN' });
  const incomeBefore = incomeFor(game, 'a').money;
  assert.match(research(game, 'a', 'magic', T0), /desconocida/);
  assert.equal(research(game, 'a', 'economy', T0), null);
  assert.equal(game.players.a.resources.money, STARTING_RESOURCES.money - techCost(1).money);
  assert.match(research(game, 'a', 'military', T0), /otra/);

  const result = tickGame(game, ['a', 'b'], T0 + techMs(1));
  assert.ok(result.events.some((e) => e.type === 'research' && e.player === 'a'));
  assert.equal(game.players.a.tech.economy, 1);
  assert.ok(Math.abs(incomeFor(game, 'a').money - incomeBefore * 1.1) < 1e-9);

  const upkeepBefore = upkeepFor(game, 'a').food;
  game.players.a.tech.logistics = 2;
  assert.ok(Math.abs(upkeepFor(game, 'a').food - upkeepBefore * 0.8) < 1e-9);

  game.players.a.tech.economy = 3;
  game.players.a.resources.money = 99999;
  game.players.a.resources.industry = 99999;
  assert.match(research(game, 'a', 'economy', T0), /máximo/);
});

test('combate: la tecnología militar inclina la balanza', () => {
  const atk = { infantry: 10, tank: 0, aircraft: 0, navy: 0 };
  const def = { infantry: 7, tank: 0, aircraft: 0, navy: 0 };
  const base = resolveBattle(atk, def, {}, fixedRng());
  const boosted = resolveBattle(atk, def, { attackBonus: 1.3 }, fixedRng());
  const fortified = resolveBattle(atk, def, { defenseBonus: 1.3 }, fixedRng());
  assert.ok(boosted.attackPower > base.attackPower);
  assert.ok(fortified.defensePower > base.defensePower);
});

// ---------- IA neutral y victoria ----------

import { checkEnd, currentStandings } from '../server/game.js';

function gameWith(settings, homes) {
  const all = { countryAssignment: 'choose', gameSpeed: 'normal', ...settings };
  const game = createGame(all, Object.keys(homes), { now: 0 });
  for (const [pid, cid] of Object.entries(homes)) pickCountry(game, pid, cid);
  tickGame(game, Object.keys(homes), T0);
  return game;
}

test('IA: las guarniciones neutrales se recuperan con el tiempo hasta un máximo', () => {
  const game = gameWith({ aiDifficulty: 'normal' }, { a: 'ESP', b: 'JPN' });
  const start = game.countries.FRA.units.infantry;
  game.countries.FRA.units.infantry = 0;
  for (let t = 1; t <= 200; t++) tickGame(game, ['a', 'b'], T0 + t * 20_000);
  assert.equal(game.countries.FRA.units.infantry, Math.ceil(start * 1.5));
});

test('IA: un vecino neutral envía refuerzos si llegan antes que el atacante', () => {
  const game = gameWith({ aiDifficulty: 'normal' }, { a: 'BRA', b: 'JPN' });
  game.countries.PRY.units.infantry = 10; // vecino de Argentina
  const { army } = moveArmy(game, 'a', 'BRA', 'ARG', { tank: 3 }, T0);
  tickGame(game, ['a', 'b'], T0 + 3_000);
  const helper = game.armies.find((x) => x.owner === null && x.to === 'ARG');
  assert.ok(helper, 'hay refuerzo neutral');
  assert.ok(helper.arriveAt < army.arriveAt);
});

test('IA: contraataca un país recién conquistado con defensa débil (y la pasiva no)', () => {
  for (const [level, expectAttack] of [['normal', true], ['passive', false]]) {
    const game = gameWith({ aiDifficulty: level }, { a: 'ESP', b: 'JPN' });
    game.countries.FRA.owner = 'a';
    game.countries.FRA.formerNeutral = true;
    game.countries.FRA.conqueredAt = T0;
    game.countries.FRA.units = { infantry: 1, tank: 0, aircraft: 0, navy: 0 };
    game.countries.DEU.units = { infantry: 20, tank: 10, aircraft: 0, navy: 0 };
    tickGame(game, ['a', 'b'], T0 + 3_000);
    const attack = game.armies.find((x) => x.owner === null && x.to === 'FRA');
    assert.equal(Boolean(attack), expectAttack, level);
    if (!attack) continue;
    const result = tickGame(game, ['a', 'b'], attack.arriveAt, fixedRng());
    assert.equal(game.countries.FRA.owner, null, 'la IA recupera el país');
    assert.ok(result.events.some((e) => e.type === 'battle' && e.attacker === null));
  }
});

test('victoria por dominación al controlar el % del mundo', () => {
  const game = gameWith({ winDomination: true, dominationPercent: 30 }, { a: 'ESP', b: 'JPN' });
  assert.equal(checkEnd(game, T0), null);
  for (const id of ['RUS', 'CAN', 'USA', 'CHN', 'BRA']) game.countries[id].owner = 'a';
  const result = checkEnd(game, T0);
  assert.equal(result.winner, 'a');
  assert.equal(result.reason, 'domination');
  assert.equal(game.phase, 'ended');
  assert.ok(result.standings[0].areaPct >= 30);
});

test('victoria por ser el último en pie, solo si empezaron varios jugadores', () => {
  const game = gameWith({ winLastStanding: true }, { a: 'ESP', b: 'JPN' });
  game.players.b.eliminated = true;
  assert.deepEqual([checkEnd(game, T0).winner, game.result.reason], ['a', 'lastStanding']);

  const solo = gameWith({ winLastStanding: true }, { a: 'ESP' });
  assert.equal(checkEnd(solo, T0), null);
});

test('victoria por puntuación al acabar el tiempo; derrota si la IA elimina a todos', () => {
  const game = gameWith({ winTimeLimit: true, timeLimitMinutes: 15 }, { a: 'ESP', b: 'JPN' });
  game.players.b.tech.economy = 3; // la tecnología también puntúa
  assert.equal(checkEnd(game, T0 + 14 * 60_000), null);
  const top = currentStandings(game)[0].id;
  const result = checkEnd(game, T0 + 15 * 60_000);
  assert.equal(result.reason, 'time');
  assert.equal(result.winner, top);

  const lost = gameWith({ winLastStanding: true }, { a: 'ESP', b: 'JPN' });
  lost.players.a.eliminated = true;
  lost.players.b.eliminated = true;
  assert.deepEqual([checkEnd(lost, T0).winner, lost.result.reason], [null, 'defeat']);
});

test('sala: al terminar se puede volver al lobby y jugar otra', () => {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(tok(1), 'Uno');
  rm.attachSocket(tok(1), 's1');
  const { player: p2 } = rm.joinRoom(tok(2), 'Dos', room.code);
  rm.attachSocket(tok(2), 's2');
  rm.setReady(room, p2, true);
  rm.start(room, host);
  assert.throws(() => rm.backToLobby(room, host), /no ha terminado/);

  rm.leave(tok(2)); // el otro se va: último en pie
  assert.equal(room.state, 'finished');
  assert.equal(room.game.result.winner, host.id);
  rm.backToLobby(room, host);
  assert.equal(room.state, 'lobby');
  assert.equal(room.game, null);
});

test('red: el formato compacto de los países se decodifica sin pérdidas', () => {
  const game = gameWithHomes({ a: 'ESP', b: 'JPN' });
  recruit(game, 'a', 'ESP', 'tank', 1, T0);
  developCountry(game, 'a', 'ESP', T0);
  game.countries.FRA.level = 3;
  game.countries.ESP.buildings = { factory: 2, bunker: 1 };
  game.countries.ESP.constructing = { type: 'farm', toLevel: 1, readyAt: T0 + 5000 };
  const decoded = decodeCountries(JSON.parse(JSON.stringify(encodeCountries(game.countries))));
  for (const [id, c] of Object.entries(game.countries)) {
    assert.deepEqual(decoded[id], {
      owner: c.owner, level: c.level, units: c.units, training: c.training, developing: c.developing,
      buildings: c.buildings, constructing: c.constructing,
    }, id);
  }
  assert.ok(JSON.stringify(encodeCountries(game.countries)).length < JSON.stringify(game.countries).length / 3);
});

// ---------- Árbol tecnológico y bombas ----------

import { researchNode, launchStrike } from '../server/game.js';
import { TECH_TREE } from '../shared/tech.js';
import { WEAPONS, UNITS as ALL_UNITS } from '../shared/military.js';

function richGame(homes = { a: 'ESP', b: 'JPN' }) {
  const game = gameWithHomes(homes);
  for (const p of Object.values(game.players)) {
    p.resources = { money: 100_000, food: 100_000, oil: 100_000, industry: 100_000 };
  }
  return game;
}

test('árbol: las tropas avanzadas exigen investigar la rama en orden', () => {
  const game = richGame();
  assert.match(recruit(game, 'a', 'ESP', 'heavytank', 1, T0), /investigar/);
  assert.match(researchNode(game, 'a', 'arm3', T0), /anterior/);
  assert.equal(researchNode(game, 'a', 'arm2', T0), null);
  assert.match(researchNode(game, 'a', 'armA', T0), /otra/, 'una investigación a la vez en cada rama');
  assert.equal(researchNode(game, 'a', 'inf2', T0), null, 'pero las demás ramas investigan en paralelo');
  assert.equal(research(game, 'a', 'economy', T0), null, 'y las doctrinas también');

  tickGame(game, ['a', 'b'], T0 + TECH_TREE.arm2.ms);
  assert.ok(game.players.a.unlocked.includes('arm2'));
  assert.equal(recruit(game, 'a', 'ESP', 'heavytank', 2, T0 + TECH_TREE.arm2.ms), null);
  assert.match(researchNode(game, 'a', 'arm2', T0), /Ya está/);
  assert.match(recruit(game, 'b', 'JPN', 'heavytank', 1, T0), /investigar/, 'cada jugador investiga lo suyo');
});

test('árbol: las unidades nuevas son más fuertes y los barcos necesitan costa', () => {
  assert.ok(ALL_UNITS.mbt.attack > ALL_UNITS.heavytank.attack && ALL_UNITS.heavytank.attack > ALL_UNITS.tank.attack);
  assert.ok(ALL_UNITS.jet.speed > ALL_UNITS.aircraft.speed);
  const game = richGame({ a: 'CHE', b: 'JPN' });
  game.players.a.unlocked.push('sea2');
  assert.match(recruit(game, 'a', 'CHE', 'submarine', 1, T0), /costa/);
});

test('bombas: requieren investigación, guerra, alcance y recarga', () => {
  const game = richGame();
  game.countries.FRA.owner = 'b';
  assert.match(launchStrike(game, 'a', 'bombing', 'FRA', T0).error, /investigar/);
  game.players.a.unlocked.push('bomb1', 'bomb2');
  assert.match(launchStrike(game, 'a', 'bombing', 'FRA', T0).error, /guerra/);
  declareWar(game, 'a', 'b', T0);
  assert.match(launchStrike(game, 'a', 'bombing', 'POL', T0).error, /alcance/);

  const { strike } = launchStrike(game, 'a', 'bombing', 'FRA', T0);
  assert.equal(strike.from, 'ESP');
  assert.match(launchStrike(game, 'a', 'bombing', 'FRA', T0 + 1000).error, /recargando/);
  assert.equal(launchStrike(game, 'a', 'missile', 'POL', T0).error, undefined, 'el misil llega más lejos');
  assert.match(launchStrike(game, 'a', 'bombing', 'ESP', T0 + 60_000).error, /propios/);
});

test('bombas: el impacto destruye tropas e infraestructura; los cazas pueden interceptar', () => {
  const game = richGame();
  game.players.a.unlocked.push('bomb1', 'bomb2', 'bomb3');
  const fra = game.countries.FRA;
  fra.units = normalizeTest({ infantry: 20, tank: 10 });
  fra.level = 4;
  const { strike } = launchStrike(game, 'a', 'nuke', 'FRA', T0);
  const result = tickGame(game, ['a', 'b'], strike.arriveAt, fixedRng(0.99)); // 0.99: sin intercepción
  const hit = result.events.find((e) => e.type === 'strike');
  assert.equal(hit.intercepted, false);
  assert.ok(totalUnits(fra.units) <= 30 * (1 - WEAPONS.nuke.kill) + 1);
  assert.equal(fra.level, 1);
  assert.ok(fra.contaminatedUntil > strike.arriveAt, 'queda contaminado');

  // Un país propio contaminado no produce.
  game.countries.FRA.owner = 'a';
  const before = incomeFor(game, 'a').money;
  delete game.countries.FRA.contaminatedUntil;
  assert.ok(incomeFor(game, 'a').money > before);

  // Con muchos cazas, un bombardeo puede ser interceptado.
  game.countries.PRT.units = normalizeTest({ aircraft: 30 });
  const s2 = launchStrike(game, 'a', 'bombing', 'PRT', T0).strike;
  const r2 = tickGame(game, ['a', 'b'], s2.arriveAt, fixedRng(0));
  assert.equal(r2.events.find((e) => e.type === 'strike').intercepted, true);
  assert.equal(game.countries.PRT.units.aircraft, 30);
});

function normalizeTest(units) {
  return Object.fromEntries(Object.keys(ALL_UNITS).map((t) => [t, units[t] ?? 0]));
}
