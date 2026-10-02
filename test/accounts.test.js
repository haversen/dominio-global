import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createGameServer } from '../server/app.js';
import { AccountStore } from '../server/accounts.js';

// ---------- Almacén de cuentas ----------

test('cuentas: registro, inicio de sesión, sesiones y contraseñas que no se guardan', async () => {
  const store = new AccountStore();
  await assert.rejects(store.register('ab', 'secreto1'), { code: 'INVALID' });
  await assert.rejects(store.register('Pepe', '123'), { code: 'INVALID' });
  const { account, session } = await store.register('Pepe', 'secreto1');
  await assert.rejects(store.register('pepe', 'otraclave'), { code: 'TAKEN' }, 'sin distinguir mayúsculas');

  assert.equal(store.bySession(session), account);
  assert.equal(store.bySession('x'.repeat(48)), null);
  assert.ok(!JSON.stringify(store.serialize()).includes('secreto1'), 'la contraseña nunca se guarda');
  assert.ok(!JSON.stringify(store.serialize()).includes(session), 'la clave de sesión tampoco');

  await assert.rejects(store.login('pepe', 'mala'), { code: 'WRONG' });
  const again = await store.login('PEPE', 'secreto1');
  assert.equal(again.account, account);

  store.logout(session);
  assert.equal(store.bySession(session), null);
  assert.equal(store.bySession(again.session), account, 'cerrar una sesión no cierra las demás');
});

test('cuentas: frena a quien prueba contraseñas y sobrevive a un reinicio', async () => {
  const store = new AccountStore();
  const { session } = await store.register('Ana', 'clave123');
  for (let i = 0; i < 5; i++) await assert.rejects(store.login('ana', 'nope'), { code: 'WRONG' });
  await assert.rejects(store.login('ana', 'clave123'), { code: 'LOCKED' });

  store.addGame(store.users.get('ana'), 'ABC123', 'f'.repeat(32));
  const copy = new AccountStore();
  copy.restore(JSON.parse(JSON.stringify(store.serialize())));
  assert.equal(copy.bySession(session)?.username, 'Ana');
  assert.equal(copy.seatFor(copy.users.get('ana'), 'ABC123'), 'f'.repeat(32));
});

// ---------- Por la red: varias partidas por cuenta ----------

let server;
let url;
const clients = [];
let nextToken = 1;

before(async () => {
  server = createGameServer();
  await new Promise((resolve) => server.server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.server.address().port}`;
});

after(async () => {
  for (const c of clients) c.disconnect();
  await server.close();
});

function client(session) {
  const token = (nextToken++).toString(16).padStart(32, 'b');
  const socket = connect(url, { auth: { token, session }, transports: ['websocket'], reconnection: false });
  clients.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}
const req = (socket, event, payload = {}) => socket.timeout(3000).emitWithAck(event, payload);

test('mis partidas: una cuenta juega varias partidas y vuelve a cualquiera desde otro dispositivo', async () => {
  const phone = await client();
  const reg = await req(phone, 'auth:register', { username: 'Almirante', password: 'flota123' });
  assert.equal(reg.ok, true);
  assert.equal(reg.account.username, 'Almirante');

  // Crea una partida, vuelve al menú sin abandonarla y crea otra.
  const first = await req(phone, 'room:create', { avatar: '🦅' });
  assert.equal(first.ok, true);
  assert.equal(first.room.players[0].name, 'Almirante', 'el nombre es el de la cuenta');
  assert.equal((await req(phone, 'room:detach')).ok, true);
  const second = await req(phone, 'room:create', {});
  assert.notEqual(second.room.code, first.room.code);

  // Otro jugador (invitado) se une a la primera.
  const friend = await client();
  assert.equal((await req(friend, 'room:join', { name: 'Amiga', code: first.room.code })).ok, true);

  // Desde otro dispositivo con la misma cuenta se ven las dos partidas.
  const login = await req(await client(), 'auth:login', { username: 'almirante', password: 'flota123' });
  assert.equal(login.ok, true);
  const laptop = await client(login.session);
  const me = await req(laptop, 'account:me');
  assert.deepEqual(me.games.map((g) => g.code).sort(), [first.room.code, second.room.code].sort());
  const firstCard = me.games.find((g) => g.code === first.room.code);
  assert.equal(firstCard.players.length, 2);
  assert.equal(firstCard.isHost, true);

  // Entra en la primera: sigue siendo el mismo jugador (anfitrión), no uno nuevo.
  const entered = await req(laptop, 'room:enter', { code: first.room.code });
  assert.equal(entered.ok, true);
  assert.equal(entered.you, first.you);
  assert.equal(entered.room.players.length, 2);
  // Unirse con el código de una partida propia también la recupera.
  const rejoin = await req(laptop, 'room:join', { code: second.room.code });
  assert.equal(rejoin.you, second.you);
  assert.equal(rejoin.room.players.length, 1);

  // Abandonar una partida la quita de la lista.
  assert.equal((await req(laptop, 'room:leave')).ok, true);
  const after = await req(laptop, 'account:games');
  assert.deepEqual(after.games.map((g) => g.code), [first.room.code]);

  // Sin sesión no hay «Mis partidas».
  assert.equal((await req(friend, 'account:games')).code, 'NO_ACCOUNT');
  assert.equal((await req(friend, 'room:enter', { code: first.room.code })).code, 'NO_ACCOUNT');
});

test('mis partidas: una sesión cerrada ya no da acceso', async () => {
  const a = await client();
  const reg = await req(a, 'auth:register', { username: 'Temporal', password: 'clave123' });
  await req(a, 'auth:logout', { session: reg.session });
  const b = await client(reg.session);
  assert.equal((await req(b, 'account:me')).account, null);
});

test('las salas de espera de jugadores con cuenta también sobreviven a un reinicio', async () => {
  const { RoomManager } = await import('../server/rooms.js');
  const rm = new RoomManager();
  const seat = 'c'.repeat(32);
  const { room } = rm.createRoom(seat, 'Capitana', '🦅', { persistent: true });
  rm.createRoom('d'.repeat(32), 'Invitado'); // sala de un invitado: no se guarda
  const saved = JSON.parse(JSON.stringify(rm.serialize()));
  assert.deepEqual(saved.map((r) => r.code), [room.code]);
  const fresh = new RoomManager();
  assert.equal(fresh.restore(saved), 1);
  const ref = fresh.getByToken(seat);
  assert.equal(ref.room.state, 'lobby');
  assert.equal(ref.room.game, null);
  assert.equal(ref.player.persistent, true);
});
