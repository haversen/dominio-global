// Prueba de carga: lanza bots que crean salas, juegan en tiempo real y miden la latencia del servidor.
// Uso: npm run load-test -- [salas=20] [jugadoresPorSala=4] [segundos=30] [url=http://localhost:3000]

import { io } from 'socket.io-client';
import crypto from 'node:crypto';
import { decodeCountries } from '../shared/wire.js';

const [ROOMS = 20, PER_ROOM = 4, SECONDS = 30, URL = 'http://localhost:3000'] = process.argv.slice(2)
  .map((v, i) => (i < 3 ? Number(v) : v));

const latencies = [];
const counts = { actions: 0, ok: 0, rejected: 0, timeouts: 0 };
const sockets = [];

function bot() {
  const socket = io(URL, {
    auth: { token: crypto.randomBytes(16).toString('hex') },
    transports: ['websocket'],
    reconnection: false,
  });
  sockets.push(socket);
  socket.state = { room: null, me: null };
  socket.on('room:state', (room) => {
    if (room.game) room.game.countries = decodeCountries(room.game.countries);
    socket.state.room = room;
  });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

async function send(socket, event, payload = {}) {
  const t0 = performance.now();
  counts.actions++;
  try {
    const res = await socket.timeout(5000).emitWithAck(event, payload);
    latencies.push(performance.now() - t0);
    res.ok ? counts.ok++ : counts.rejected++;
    return res;
  } catch {
    counts.timeouts++;
    return { ok: false };
  }
}

// Acción aleatoria propia de un jugador: reclutar, mover tropas o escribir en el chat.
async function act(socket, world) {
  const { room, me } = socket.state;
  const game = room?.game;
  if (!game || game.phase !== 'active') return;
  const mine = Object.entries(game.countries).filter(([, c]) => c.owner === me);
  if (!mine.length) return;
  const [id, country] = mine[Math.floor(Math.random() * mine.length)];
  const roll = Math.random();
  if (roll < 0.4) {
    await send(socket, 'game:recruit', { countryId: id, type: 'infantry', count: 1 });
  } else if (roll < 0.85 && country.units.infantry > 1) {
    const targets = world.get(id).neighbors;
    const to = targets[Math.floor(Math.random() * targets.length)];
    await send(socket, 'game:move', { from: id, to, units: { infantry: Math.ceil(country.units.infantry / 2) } });
  } else {
    await send(socket, 'chat:send', { text: `Informe ${Math.floor(Math.random() * 1000)}` });
  }
}

async function main() {
  const worldRes = await fetch(`${URL}/shared/world.json`);
  const world = new Map((await worldRes.json()).countries.map((c) => [c.id, c]));
  console.log(`Conectando ${ROOMS * PER_ROOM} bots en ${ROOMS} salas contra ${URL}…`);

  const players = [];
  for (let r = 0; r < ROOMS; r++) {
    const host = await bot();
    const created = await send(host, 'room:create', { name: `Bot${r}-0` });
    host.state.me = created.you;
    host.state.room = null; // llegará por room:state
    players.push(host);
    for (let p = 1; p < PER_ROOM; p++) {
      const guest = await bot();
      const joined = await send(guest, 'room:join', { name: `Bot${r}-${p}`, code: created.room.code });
      guest.state.me = joined.you;
      await send(guest, 'room:ready', { ready: true });
      players.push(guest);
    }
    await send(host, 'room:settings', { patch: { gameSpeed: 'fast', maxPlayers: Math.max(PER_ROOM, 2) } });
    for (const g of players.slice(-PER_ROOM + 1)) await send(g, 'room:ready', { ready: true });
    await send(host, 'room:start');
  }

  latencies.length = 0;
  Object.assign(counts, { actions: 0, ok: 0, rejected: 0, timeouts: 0 });
  console.log(`Jugando durante ${SECONDS} s (cada bot actúa ~1 vez por segundo)…`);
  const end = Date.now() + SECONDS * 1000;
  await Promise.all(players.map(async (s) => {
    while (Date.now() < end) {
      await act(s, world);
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 800));
    }
  }));

  const health = await (await fetch(`${URL}/health`)).json();
  latencies.sort((a, b) => a - b);
  const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))]?.toFixed(1);
  console.log('\nResultados');
  console.log(`  Acciones: ${counts.actions} (${(counts.actions / SECONDS).toFixed(0)}/s) · aceptadas ${counts.ok} · rechazadas por reglas ${counts.rejected} · sin respuesta ${counts.timeouts}`);
  console.log(`  Latencia de respuesta: p50 ${pct(0.5)} ms · p95 ${pct(0.95)} ms · p99 ${pct(0.99)} ms`);
  console.log(`  Servidor: ${health.rooms} salas, ${health.players} jugadores, ${health.memoryMB} MB de memoria`);
  console.log(`  Reloj del servidor: ${health.tickAvgMs} ms por ciclo de media (máx. ${health.tickMaxMs} ms, presupuesto 250 ms)`);

  for (const s of sockets) s.disconnect();
  process.exit(counts.timeouts > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
