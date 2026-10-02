import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../server/rooms.js';
import { totalUnits } from '../shared/military.js';

const tok = (n) => n.toString(16).padStart(32, '0');

test('bots: son opcionales, rellenan plazas y juegan solos', () => {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(tok(1), 'Humana');
  rm.attachSocket(tok(1), 's1');
  rm.updateSettings(room, host, {
    bots: 3, aiDifficulty: 'normal', fogOfWar: false,
    // Que la partida no termine antes de tiempo: así se ve jugar a los bots.
    winDomination: false, winLastStanding: false, winSpace: false, winTimeLimit: true, timeLimitMinutes: 120,
  });
  rm.start(room, host);

  const bots = [...room.players.values()].filter((p) => p.bot);
  assert.equal(bots.length, 3);
  assert.ok(bots.every((b) => room.game.homes[b.id]), 'cada bot tiene su país');
  assert.equal(rm.toPublic(room).players.filter((p) => p.bot).length, 3);

  // 15 minutos de partida simulada.
  const start = Date.now();
  for (let t = 0; t <= 15 * 60_000; t += 1_000) rm.tick(start + t);

  const g = room.game;
  const did = { built: 0, research: 0, armies: 0, conquests: 0 };
  for (const b of bots) {
    const p = g.players[b.id];
    did.research += p.unlocked.length - 4 + Object.values(p.tech).reduce((a, x) => a + x, 0) + Object.keys(p.research).length;
    did.conquests += p.stats.conquests;
    for (const c of Object.values(g.countries)) {
      if (c.owner === b.id) did.built += Object.keys(c.buildings ?? {}).length + (c.constructing ? 1 : 0);
    }
  }
  did.armies = g.events.filter((e) => e.type === 'battle' && bots.some((b) => b.id === e.attacker)).length;
  assert.ok(did.built > 0, 'los bots construyen');
  assert.ok(did.research > 0, 'los bots investigan');
  assert.ok(did.conquests > 0 || did.armies > 0, 'los bots atacan');
  assert.ok(bots.some((b) => Object.values(g.countries).some((c) => c.owner === b.id && totalUnits(c.units) > 0)));
});

test('bots: con 0 no hay ninguno, y una sala solo con bots se cierra', () => {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(tok(5), 'Solo');
  rm.attachSocket(tok(5), 's5');
  rm.start(room, host);
  assert.equal([...room.players.values()].filter((p) => p.bot).length, 0, 'por defecto no hay bots');

  const other = rm.createRoom(tok(6), 'Otra');
  rm.attachSocket(tok(6), 's6');
  rm.updateSettings(other.room, other.player, { bots: 2 });
  rm.start(other.room, other.player);
  rm.leave(tok(6));
  assert.equal(rm.rooms.has(other.room.code), false, 'sin humanos, la sala desaparece');
});

test('bots: no pueden pasar de 16 jugadores en total', () => {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(tok(7), 'Uno');
  rm.attachSocket(tok(7), 's7');
  for (let i = 0; i < 4; i++) {
    rm.joinRoom(tok(10 + i), `J${i}`, room.code);
    rm.attachSocket(tok(10 + i), `s${10 + i}`);
    rm.setReady(room, room.players.get(rm.tokens.get(tok(10 + i)).playerId), true);
  }
  rm.updateSettings(room, host, { maxPlayers: 8, bots: 12 });
  for (const p of room.players.values()) if (p.id !== host.id) p.ready = true;
  assert.throws(() => rm.start(room, host), { code: 'INVALID_SETTINGS' });
});
