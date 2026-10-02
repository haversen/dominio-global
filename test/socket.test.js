import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createGameServer } from '../server/app.js';
import { COUNTRIES } from '../server/game.js';
import { applyDelta } from '../shared/delta.js';

let game;
let url;
const clients = [];
let nextToken = 1;

before(async () => {
  game = createGameServer();
  await new Promise((resolve) => game.server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${game.server.address().port}`;
});

after(async () => {
  for (const c of clients) c.disconnect();
  await game.close();
});

function client(token = (nextToken++).toString(16).padStart(32, 'a')) {
  const socket = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
  clients.push(socket);
  // Igual que el navegador: estado completo y después parches con lo que cambia.
  socket.views = new Set();
  const update = (view) => {
    socket.view = view;
    for (const fn of [...socket.views]) fn(view);
  };
  socket.on('room:state', (st) => update(st));
  socket.on('room:delta', ({ patch }) => socket.view && update(applyDelta(socket.view, patch)));
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

const req = (socket, event, payload = {}) => socket.timeout(2000).emitWithAck(event, payload);
const nextEvent = (socket, event) => new Promise((resolve) => socket.once(event, resolve));
// Espera a que el estado de la sala (reconstruido con los parches) cumpla una condición.
const nextRoom = (socket, pred = () => true) => new Promise((resolve) => {
  const fn = (view) => {
    if (!pred(view)) return;
    socket.views.delete(fn);
    resolve(view);
  };
  socket.views.add(fn);
});

test('rechaza conexiones sin token válido', async () => {
  await assert.rejects(client('nope'), /INVALID_TOKEN/);
});

test('flujo completo: crear, unirse, ajustes, listo, empezar', async () => {
  const host = await client();
  const guest = await client();

  const created = await req(host, 'room:create', { name: 'Anfitrión' });
  assert.equal(created.ok, true);
  const { code } = created.room;

  const stateForHost = nextRoom(host, (st) => st.players.length === 2);
  const joined = await req(guest, 'room:join', { name: 'Invitado', code });
  assert.equal(joined.ok, true);
  assert.equal(joined.room.players.length, 2);
  assert.equal((await stateForHost).players.length, 2, 'el anfitrión recibe la actualización');

  assert.equal((await req(guest, 'room:settings', { patch: { maxPlayers: 4 } })).code, 'NOT_HOST');
  assert.equal((await req(host, 'room:settings', { patch: { maxPlayers: 4 } })).ok, true);

  assert.equal((await req(host, 'room:start')).code, 'NOT_READY');
  await req(guest, 'room:ready', { ready: true });

  const started = nextRoom(guest, (st) => st.state === 'playing');
  assert.equal((await req(host, 'room:start')).ok, true);
  assert.equal((await started).state, 'playing');
});

test('chat llega a todos los jugadores de la sala', async () => {
  const a = await client();
  const b = await client();
  const { room } = await req(a, 'room:create', { name: 'Alfa' });
  await req(b, 'room:join', { name: 'Bravo', code: room.code });

  const received = new Promise((resolve) => {
    b.on('chat:message', (m) => { if (!m.system) resolve(m); });
  });
  await req(a, 'chat:send', { text: 'Avanzad' });
  const msg = await received;
  assert.equal(msg.text, 'Avanzad');
  assert.equal(msg.name, 'Alfa');
});

test('reconexión con el mismo token recupera la sala', async () => {
  const token = 'f'.repeat(32);
  const first = await client(token);
  const { room } = await req(first, 'room:create', { name: 'Volátil' });
  first.disconnect();

  const second = await client(token);
  const resumed = await req(second, 'session:resume');
  assert.equal(resumed.restored, true);
  assert.equal(resumed.room.code, room.code);
  assert.equal(resumed.room.players[0].connected, true);
});

test('una segunda pestaña con la misma sesión desplaza a la primera', async () => {
  const token = 'e'.repeat(32);
  const first = await client(token);
  await req(first, 'room:create', { name: 'Doble' });

  const replaced = nextEvent(first, 'session:replaced');
  const second = await client(token);
  await req(second, 'session:resume');
  await replaced;
  await new Promise((r) => setTimeout(r, 50));
  const ref = game.rooms.getByToken(token);
  assert.equal(ref.player.connected, true);
  assert.equal(ref.player.socketId, second.id);
});

test('expulsar a un jugador le avisa y lo saca de la sala', async () => {
  const host = await client();
  const guest = await client();
  const { room } = await req(host, 'room:create', { name: 'Jefe' });
  const { you } = await req(guest, 'room:join', { name: 'Soldado', code: room.code });

  const kicked = nextEvent(guest, 'room:kicked');
  assert.equal((await req(host, 'room:kick', { playerId: you })).ok, true);
  await kicked;
  assert.equal((await req(guest, 'chat:send', { text: 'hola' })).code, 'NO_ROOM');
});

test('partida: recursos privados y órdenes militares en tiempo real', async () => {
  const a = await client();
  const b = await client();
  const { room } = await req(a, 'room:create', { name: 'Norte' });
  await req(b, 'room:join', { name: 'Sur', code: room.code });
  await req(a, 'room:settings', { patch: { fogOfWar: false } }); // b tiene que ver los ejércitos de a
  await req(b, 'room:ready', { ready: true });

  const selfA = nextEvent(a, 'game:self');
  const publicB = nextRoom(b, (st) => st.state === 'playing');
  await req(a, 'room:start');
  const mine = await selfA;
  assert.ok(mine.resources.money > 0);
  assert.ok(mine.income.money > 0);

  // El estado público no contiene recursos de nadie.
  const pub = await publicB;
  assert.equal(pub.state, 'playing');
  assert.ok(!JSON.stringify(pub).includes('resources'));

  const { you } = await req(a, 'session:resume');
  const home = pub.game.homes[you];
  assert.equal((await req(a, 'game:recruit', { countryId: home, type: 'infantry', count: 2 })).ok, true);
  assert.equal((await req(a, 'game:recruit', { countryId: home, type: 'infantry', count: 999 })).ok, false);

  // Los aviones pueden ir a cualquier vecino, también por mar.
  const target = COUNTRIES.get(home).neighbors[0];
  const seenByB = nextRoom(b, (st) => st.game.armies.some((x) => x.from === home)).then(() => true);
  const moved = await req(a, 'game:move', { from: home, to: target, units: { aircraft: 1 } });
  assert.equal(moved.ok, true, moved.error);
  assert.ok(moved.arriveAt > Date.now());
  const seen = await seenByB; // b ve el ejército en marcha
  assert.ok(seen);
});

test('robustez: limita las ráfagas de acciones y expone métricas en /health', async () => {
  const spammer = await client();
  const replies = await Promise.all(Array.from({ length: 40 }, () => req(spammer, 'session:resume')));
  assert.ok(replies.some((r) => r.code === 'RATE_LIMIT'), 'se rechazan las acciones de más');
  assert.ok(replies.filter((r) => r.ok).length >= 15, 'las primeras sí se atienden');

  const health = await (await fetch(`${url}/health`)).json();
  assert.equal(health.ok, true);
  assert.ok(health.rooms >= 1 && health.players >= 1);
  assert.equal(typeof health.tickAvgMs, 'number');
});

test('mensajes privados: solo los reciben remitente y destinatario', async () => {
  const a = await client();
  const b = await client();
  const c = await client();
  const { room } = await req(a, 'room:create', { name: 'Ana' });
  const { you: bId } = await req(b, 'room:join', { name: 'Beto', code: room.code });
  await req(c, 'room:join', { name: 'Ciro', code: room.code });

  let leaked = false;
  c.on('dm:message', () => { leaked = true; });
  const received = nextEvent(b, 'dm:message');
  const echoed = nextEvent(a, 'dm:message');
  assert.equal((await req(a, 'dm:send', { playerId: bId, text: 'Pacto secreto' })).ok, true);
  assert.equal((await received).text, 'Pacto secreto');
  assert.equal((await echoed).to, bId);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(leaked, false);

  // El historial se recupera al reconectar.
  const resumed = await req(b, 'session:resume');
  assert.equal(resumed.dms.length, 1);
  assert.equal((await req(a, 'dm:send', { playerId: 'nadie', text: 'hola' })).ok, false);
});
