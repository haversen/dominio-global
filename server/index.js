import os from 'node:os';
import { createGameServer } from './app.js';
import { createStorage } from './storage.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SAVE_EVERY_MS = 60_000;

const { server, rooms, close } = createGameServer();
const storage = createStorage();

// Recupera las partidas que estaban en marcha antes de reiniciar.
try {
  const restored = rooms.restore(await storage.load());
  console.log(`Guardado en ${storage.kind}. Partidas recuperadas: ${restored}`);
} catch (err) {
  console.error('[guardado] No se pudieron recuperar las partidas:', err.message);
}

let saving = Promise.resolve();
const save = () => {
  saving = saving
    .then(() => storage.save(rooms.serialize()))
    .catch((err) => console.error('[guardado] Error al guardar:', err.message));
  return saving;
};
setInterval(save, SAVE_EVERY_MS).unref();

// Cierre ordenado (Ctrl+C o el servicio de hosting al reiniciar): guarda antes de salir.
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (closing) process.exit(1);
    closing = true;
    console.log('\nGuardando partidas y cerrando el servidor…');
    await save();
    await close();
    process.exit(0);
  });
}

server.listen(PORT, HOST, () => {
  console.log('\n  DOMINIO GLOBAL — servidor en marcha\n');
  console.log(`  Local:  http://localhost:${PORT}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  Red:    http://${a.address}:${PORT}`);
    }
  }
  console.log('');
});
