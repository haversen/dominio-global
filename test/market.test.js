import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, tickGame, recruit, incomeFor, COUNTRIES } from '../server/game.js';
import { trade, postOffer, acceptOffer, cancelOffer } from '../server/market.js';
import { declareWar } from '../server/diplomacy.js';
import { BASE_PRICES, MARKET_FEE, OFFER_TTL_MS, SAMPLE_MS, quote } from '../shared/market.js';
import { UNITS } from '../shared/military.js';
import { RoomManager } from '../server/rooms.js';

const tok = (n) => n.toString(16).padStart(32, '0');
const SETTINGS = { countryAssignment: 'random', gameSpeed: 'normal' };

function newGame(profiles = {}) {
  const game = createGame(SETTINGS, ['a', 'b'], { now: 0, profiles });
  for (const p of Object.values(game.players)) Object.assign(p.resources, { money: 1000, food: 500, oil: 500, industry: 500 });
  return game;
}

// ---------- Bolsa ----------

test('bolsa: comprar cuesta más que vender, y el precio se mueve con la demanda', () => {
  const game = newGame();
  const a = game.players.a;
  const bought = trade(game, 'a', 'food', 'buy', 100);
  assert.equal(a.resources.food, 600);
  assert.equal(a.resources.money, 1000 - bought.total);
  assert.ok(game.market.prices.food > BASE_PRICES.food, 'comprar sube el precio');

  const sold = trade(game, 'a', 'food', 'sell', 100);
  assert.ok(sold.total < bought.total, 'comprar y vender de golpe nunca da beneficio');
  assert.equal(a.resources.food, 500);
  assert.ok(Math.abs(game.market.prices.food - BASE_PRICES.food) < 1e-9);
});

test('bolsa: valida materiales, cantidades y fondos', () => {
  const game = newGame();
  assert.ok(trade(game, 'a', 'money', 'buy', 10).error);
  assert.ok(trade(game, 'a', 'oil', 'steal', 10).error);
  assert.ok(trade(game, 'a', 'oil', 'buy', 0).error);
  assert.ok(trade(game, 'a', 'oil', 'buy', 1.5).error);
  assert.ok(trade(game, 'a', 'oil', 'sell', 501).error);
  game.players.a.resources.money = 5;
  assert.match(trade(game, 'a', 'oil', 'buy', 100).error, /dinero/);
});

test('bolsa: el precio vuelve poco a poco a su valor normal y queda registrado', () => {
  const game = newGame();
  trade(game, 'a', 'oil', 'sell', 300);
  const low = game.market.prices.oil;
  assert.ok(low < BASE_PRICES.oil);
  tickGame(game, ['a', 'b'], game.startedAt + SAMPLE_MS);
  assert.ok(game.market.prices.oil > low && game.market.prices.oil < BASE_PRICES.oil);
  assert.equal(game.market.history.oil.length, 2);
});

test('presidente Mercader: opera sin comisión', () => {
  const normal = newGame();
  const merchant = newGame({ a: { president: 'merchant' } });
  const withFee = trade(normal, 'a', 'industry', 'buy', 100).total;
  const noFee = trade(merchant, 'a', 'industry', 'buy', 100).total;
  assert.equal(withFee, quote('industry', BASE_PRICES.industry, 'buy', 100, MARKET_FEE).total);
  assert.equal(noFee, quote('industry', BASE_PRICES.industry, 'buy', 100, 0).total);
  assert.ok(noFee < withFee);
});

// ---------- Ofertas entre jugadores ----------

test('ofertas: lo ofrecido queda reservado y se intercambia al aceptar', () => {
  const game = newGame();
  const { offer } = postOffer(game, 'a', { resource: 'oil', amount: 100 }, { resource: 'money', amount: 150 });
  assert.equal(game.players.a.resources.oil, 400, 'reservado al publicar');
  assert.match(acceptOffer(game, 'a', offer.id).error, /propia/);

  assert.equal(acceptOffer(game, 'b', offer.id).error, undefined);
  assert.equal(game.players.b.resources.oil, 600);
  assert.equal(game.players.b.resources.money, 850);
  assert.equal(game.players.a.resources.money, 1150);
  assert.equal(game.market.offers.length, 0);
  assert.ok(acceptOffer(game, 'b', offer.id).error, 'no se puede aceptar dos veces');
});

test('ofertas: retirar o caducar devuelve lo reservado; límite por jugador', () => {
  const game = newGame();
  const give = { resource: 'food', amount: 50 };
  const want = { resource: 'oil', amount: 20 };
  const ids = [1, 2, 3].map(() => postOffer(game, 'a', give, want, 0).offer.id);
  assert.match(postOffer(game, 'a', give, want, 0).error, /como mucho/);
  assert.equal(game.players.a.resources.food, 350);

  assert.deepEqual(cancelOffer(game, 'b', ids[0]).error !== undefined, true, 'solo el autor la retira');
  cancelOffer(game, 'a', ids[0]);
  assert.equal(game.players.a.resources.food, 400);

  tickGame(game, ['a', 'b'], game.startedAt + OFFER_TTL_MS + 1);
  assert.equal(game.market.offers.length, 0);
  assert.ok(game.players.a.resources.food >= 500, 'las caducadas también se devuelven');
});

test('ofertas: validan materiales y no se comercia con el enemigo', () => {
  const game = newGame();
  assert.ok(postOffer(game, 'a', { resource: 'oil', amount: 10 }, { resource: 'oil', amount: 5 }).error);
  assert.ok(postOffer(game, 'a', { resource: 'gold', amount: 10 }, { resource: 'oil', amount: 5 }).error);
  assert.ok(postOffer(game, 'a', { resource: 'oil', amount: 9999 }, { resource: 'money', amount: 5 }).error);
  const { offer } = postOffer(game, 'a', { resource: 'oil', amount: 10 }, { resource: 'money', amount: 5 });
  declareWar(game, 'b', 'a', Date.now());
  assert.match(acceptOffer(game, 'b', offer.id).error, /guerra/);
});

// ---------- Presidentes ----------

test('presidentes: la Economista gana más y la Industrial recluta más barato', () => {
  const homes = { a: { president: 'economist', country: 'ESP' }, b: { president: 'industrialist', country: 'JPN' } };
  const base = createGame(SETTINGS, ['a', 'b'], { now: 0, profiles: { a: { country: 'ESP', president: 'general' }, b: { country: 'JPN', president: 'general' } } });
  const game = createGame(SETTINGS, ['a', 'b'], { now: 0, profiles: homes });
  assert.equal(game.homes.a, 'ESP');
  assert.equal(game.homes.b, 'JPN');
  assert.ok(Math.abs(incomeFor(game, 'a').money - incomeFor(base, 'a').money * 1.15) < 1e-6);

  const before = game.players.b.resources.money;
  assert.equal(recruit(game, 'b', 'JPN', 'infantry', 10), null);
  assert.equal(before - game.players.b.resources.money, Math.ceil(UNITS.infantry.cost.money * 0.85) * 10);
});

test('países elegidos en la sala: se respetan y se salta la elección en el mapa', () => {
  const game = createGame({ countryAssignment: 'choose' }, ['a', 'b'], {
    now: 0, profiles: { a: { country: 'BRA' }, b: { country: 'AUS' } },
  });
  assert.equal(game.phase, 'active');
  assert.deepEqual(game.homes, { a: 'BRA', b: 'AUS' });

  const partial = createGame({ countryAssignment: 'choose' }, ['a', 'b'], { now: 0, profiles: { a: { country: 'BRA' } } });
  assert.equal(partial.phase, 'picking', 'quien no eligió lo hace en el mapa');
  assert.equal(partial.picks.a, 'BRA');
});

test('sala: perfil con avatar, presidente y país (sin vecinos de otro jugador)', () => {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(tok(1), 'Anfitrión', '🦅');
  const { player: guest } = rm.joinRoom(tok(2), 'Invitada', room.code, 'no-es-un-avatar');
  assert.equal(host.avatar, '🦅');
  assert.equal(guest.avatar, '🪖');

  rm.setProfile(room, host, { president: 'scientist', country: 'FRA' });
  assert.throws(() => rm.setProfile(room, guest, { country: 'FRA' }), { code: 'TAKEN' });
  assert.throws(() => rm.setProfile(room, guest, { country: COUNTRIES.get('FRA').neighbors[0] }), { code: 'TAKEN' });
  assert.throws(() => rm.setProfile(room, guest, { president: 'emperador' }), { code: 'INVALID' });
  assert.throws(() => rm.setProfile(room, guest, { avatar: '<b>' }), { code: 'INVALID' });
  rm.setProfile(room, guest, { country: 'ARG', avatar: '🐉' });

  rm.attachSocket(tok(1), 's1');
  rm.attachSocket(tok(2), 's2');
  rm.setReady(room, guest, true);
  rm.start(room, host);
  assert.deepEqual(room.game.homes, { [host.id]: 'FRA', [guest.id]: 'ARG' });
  assert.equal(room.game.players[host.id].president, 'scientist');
  assert.equal(rm.toPublic(room).players[1].avatar, '🐉');
});

// ---------- Partidas largas ----------

test('partidas largas: el mundo sigue sin nadie conectado y se recupera tras reiniciar', () => {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(tok(1), 'Anfitrión');
  rm.attachSocket(tok(1), 's1');
  rm.start(room, host);
  rm.detachSocket(tok(1), 's1');
  const t0 = room.game.lastTick;
  rm.tick(t0 + 60_000);
  assert.ok(room.game.players[host.id].resources.money > 120, 'los ingresos siguen llegando');

  rm.postOffer(room, host, { resource: 'food', amount: 10 }, { resource: 'money', amount: 10 });
  const saved = JSON.parse(JSON.stringify(rm.serialize()));
  assert.equal(saved.length, 1);

  const fresh = new RoomManager();
  assert.equal(fresh.restore(saved), 1);
  const ref = fresh.getByToken(tok(1));
  assert.equal(ref.room.code, room.code);
  assert.equal(ref.player.connected, false);
  assert.equal(ref.room.game.market.offers.length, 1);
  assert.deepEqual(ref.room.game.homes, room.game.homes);
  fresh.attachSocket(tok(1), 's9');
  fresh.tick(Date.now() + 1000);
  assert.equal(fresh.getByToken(tok(1)).player.connected, true);
});
