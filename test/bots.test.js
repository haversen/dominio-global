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

test('bots: los de nivel difícil defienden su capital; los fáciles no', async () => {
  const { declareWar } = await import('../server/diplomacy.js');
  const { battleOdds, COUNTRIES } = await import('../server/game.js');
  const held = { easy: 0, hard: 0 };
  for (const level of ['easy', 'hard']) {
    for (let trial = 0, attempt = 0; trial < 6 && attempt < 40; attempt++) {
      const rm = new RoomManager();
      const t = tok(200 + attempt + (level === 'hard' ? 50 : 0));
      const { room, player: host } = rm.createRoom(t, 'Humana');
      rm.attachSocket(t, 's');
      rm.updateSettings(room, host, { bots: 1, botLevel: level, fogOfWar: false, troopPace: 'fast', winDomination: false, winTimeLimit: true });
      rm.start(room, host);
      const g = room.game;
      const bot = [...room.players.values()].find((p) => p.bot);
      const capital = g.homes[bot.id];
      // La humana se queda con un vecino de la capital del bot, le declara la guerra y ataca con lo justo para ganar.
      const from = COUNTRIES.get(capital).neighbors.find((n) => g.countries[n] && !g.countries[n].owner
        && !COUNTRIES.get(capital).sea.includes(n));
      if (!from) continue; // capital en una isla: se prueba con otra partida
      trial++;
      g.countries[from].owner = host.id;
      declareWar(g, host.id, bot.id, Date.now());
      g.players[bot.id].resources.money = 3000;
      let army = { ...g.countries[capital].units };
      for (const k of Object.keys(army)) army[k] = 0;
      for (army.infantry = 1; battleOdds(g, host.id, from, capital, army) < 1.3; army.infantry++);
      g.countries[from].units = { ...army };
      assert.equal(rm.moveArmy(room, host, from, capital, army).error, undefined);
      const start = Date.now();
      for (let s = 0; s <= 10 * 60_000 && g.armies.some((a) => a.owner === host.id); s += 1_000) rm.tick(start + s);
      if (g.countries[capital].owner === bot.id) held[level]++;
    }
  }
  assert.ok(held.hard >= 4, `difícil aguanta ${held.hard}/6`);
  assert.ok(held.easy <= 2, `fácil aguanta ${held.easy}/6`);
});

test('bots: la dificultad se elige en la sala', async () => {
  const { SETTINGS_SCHEMA } = await import('../shared/settings.js');
  const { BOT_LEVEL_IDS } = await import('../server/bots.js');
  assert.deepEqual(SETTINGS_SCHEMA.botLevel.options, BOT_LEVEL_IDS);
  assert.equal(SETTINGS_SCHEMA.botLevel.default, 'normal');
});

test('bots: en difícil se alían y van a la guerra contra quien se escapa', async () => {
  const { COUNTRIES } = await import('../server/game.js');
  const { relationOf } = await import('../shared/diplomacy.js');
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(tok(300), 'Líder');
  rm.attachSocket(tok(300), 's');
  rm.updateSettings(room, host, { bots: 3, botLevel: 'hard', fogOfWar: false, winDomination: false, winTimeLimit: true, timeLimitMinutes: 120 });
  rm.start(room, host);
  const g = room.game;
  const bots = [...room.players.values()].filter((p) => p.bot);
  // La humana se queda con medio mundo (sin tropas), incluidos los vecinos de cada bot.
  for (const [id, c] of Object.entries(g.countries)) {
    const nextToBot = bots.some((b) => COUNTRIES.get(g.homes[b.id]).neighbors.includes(id));
    if (!c.owner && (nextToBot || Math.random() < 0.5)) {
      c.owner = host.id;
      for (const t of Object.keys(c.units)) c.units[t] = 0;
    }
  }
  const start = Date.now();
  for (let s = 0; s <= 10 * 60_000; s += 1_000) rm.tick(start + s);
  const rel = (a, b) => relationOf(g.relations, a, b).state;
  assert.ok(bots.some((b) => rel(b.id, host.id) === 'war'), 'alguno declara la guerra a la líder');
  assert.ok(bots.some((a) => bots.some((b) => a !== b && rel(a.id, b.id) === 'alliance')), 'los bots se alían entre ellos');
});
