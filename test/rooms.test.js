import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager, GameError, LOBBY_RECONNECT_GRACE_MS, EMPTY_ROOM_TTL_MS } from '../server/rooms.js';

const tok = (n) => n.toString(16).padStart(32, '0');

function setup() {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(tok(1), 'Anfitrión');
  rm.attachSocket(tok(1), 's1');
  return { rm, room, host };
}

test('crear sala genera un código de 6 caracteres y hace anfitrión al creador', () => {
  const { room, host } = setup();
  assert.match(room.code, /^[A-Z2-9]{6}$/);
  assert.equal(room.hostId, host.id);
  assert.equal(room.state, 'lobby');
});

test('unirse valida código, nombre repetido, sala llena y partida empezada', () => {
  const { rm, room, host } = setup();
  assert.throws(() => rm.joinRoom(tok(2), 'Pepe', 'ZZZZZZ'), { code: 'NOT_FOUND' });
  assert.throws(() => rm.joinRoom(tok(2), 'anfitrión', room.code), { code: 'NAME_TAKEN' });
  assert.throws(() => rm.joinRoom(tok(2), 'x', room.code), { code: 'INVALID_NAME' });

  rm.updateSettings(room, host, { maxPlayers: 2 });
  rm.joinRoom(tok(2), 'Pepe', room.code.toLowerCase()); // el código no distingue mayúsculas
  assert.throws(() => rm.joinRoom(tok(3), 'Ana', room.code), { code: 'FULL' });

  rm.attachSocket(tok(2), 's2');
  const pepe = rm.getByToken(tok(2)).player;
  rm.setReady(room, pepe, true);
  rm.start(room, host);
  assert.throws(() => rm.joinRoom(tok(4), 'Luis', room.code), { code: 'STARTED' });
});

test('solo el anfitrión cambia ajustes y empieza; los ajustes se validan', () => {
  const { rm, room, host } = setup();
  const { player: guest } = rm.joinRoom(tok(2), 'Invitado', room.code);
  rm.attachSocket(tok(2), 's2');

  assert.throws(() => rm.updateSettings(room, guest, { maxPlayers: 4 }), { code: 'NOT_HOST' });
  assert.throws(() => rm.updateSettings(room, host, { maxPlayers: 99 }), { code: 'INVALID_SETTINGS' });
  assert.throws(() => rm.updateSettings(room, host, { hack: 1 }), { code: 'INVALID_SETTINGS' });
  assert.throws(
    () => rm.updateSettings(room, host, { winDomination: false, winLastStanding: false, winSpace: false }),
    { code: 'INVALID_SETTINGS' },
  );

  rm.setReady(room, guest, true);
  rm.updateSettings(room, host, { gameSpeed: 'fast' });
  assert.equal(room.settings.gameSpeed, 'fast');
  assert.equal(guest.ready, false, 'cambiar ajustes quita el "listo"');

  assert.throws(() => rm.start(room, host), { code: 'NOT_READY' });
  assert.throws(() => rm.start(room, guest), { code: 'NOT_HOST' });
  rm.setReady(room, guest, true);
  rm.start(room, host);
  assert.equal(room.state, 'playing');
});

test('si el anfitrión se va, el anfitrión pasa a otro jugador; sala vacía se borra', () => {
  const { rm, room } = setup();
  const { player: guest } = rm.joinRoom(tok(2), 'Invitado', room.code);
  rm.attachSocket(tok(2), 's2');

  rm.leave(tok(1));
  assert.equal(room.hostId, guest.id);
  assert.ok(rm.rooms.has(room.code));

  const res = rm.leave(tok(2));
  assert.equal(res.deleted, true);
  assert.equal(rm.rooms.size, 0);
  assert.equal(rm.tokens.size, 0);
});

test('reconexión: el jugador conserva su plaza con el mismo token', () => {
  const { rm, room, host } = setup();
  rm.detachSocket(tok(1), 's1');
  assert.equal(host.connected, false);

  // Un socket antiguo que cae tarde no debe marcar como desconectado al nuevo.
  const res = rm.attachSocket(tok(1), 's9');
  assert.equal(res.previousSocketId, null);
  assert.equal(rm.detachSocket(tok(1), 's1'), null);
  assert.equal(host.connected, true);
  assert.equal(room.hostId, host.id);
});

test('limpieza: expulsa desconectados del lobby tras la gracia y borra salas abandonadas', () => {
  const { rm, room, host } = setup();
  rm.joinRoom(tok(2), 'Invitado', room.code);
  rm.attachSocket(tok(2), 's2');

  rm.detachSocket(tok(2), 's2');
  const t0 = Date.now();
  assert.deepEqual(rm.sweep(t0 + 1000).changed, []);
  const { changed } = rm.sweep(t0 + LOBBY_RECONNECT_GRACE_MS + 1000);
  assert.deepEqual(changed, [room]);
  assert.equal(room.players.size, 1);

  rm.detachSocket(tok(1), 's1');
  assert.ok(room.emptySince);
  // El anfitrión desconectado se elimina por la gracia y con él la sala.
  const { deleted } = rm.sweep(t0 + LOBBY_RECONNECT_GRACE_MS + EMPTY_ROOM_TTL_MS.lobby + 5000);
  assert.deepEqual(deleted, [room.code]);
  assert.equal(rm.rooms.size, 0);
  assert.equal(rm.getByToken(tok(1)), null);
  void host;
});

test('partida en curso: los desconectados no se expulsan, la sala dura más', () => {
  const { rm, room, host } = setup();
  rm.start(room, host);
  rm.detachSocket(tok(1), 's1');
  const t0 = Date.now();
  rm.sweep(t0 + LOBBY_RECONNECT_GRACE_MS + 1000);
  assert.equal(room.players.size, 1);
  assert.ok(rm.rooms.has(room.code));
  rm.sweep(t0 + EMPTY_ROOM_TTL_MS.playing + 1000);
  assert.equal(rm.rooms.has(room.code), false);
});

test('chat: sanea, limita frecuencia y guarda historial', () => {
  const { rm, room, host } = setup();
  assert.throws(() => rm.addChat(room, host, '   '), GameError);
  const msg = rm.addChat(room, host, 'hola\u0007 mundo');
  assert.equal(msg.text, 'hola  mundo');
  assert.throws(() => rm.addChat(room, host, 'otra vez'), { code: 'RATE_LIMIT' });
  assert.ok(room.chat.includes(msg));
});
