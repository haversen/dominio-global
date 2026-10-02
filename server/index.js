import os from 'node:os';
import { createGameServer } from './app.js';
import { createStorage } from './storage.js';
import { AccountStore } from './accounts.js';
import { createPush, generateKeys } from './push.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SAVE_EVERY_MS = 60_000;

const storage = createStorage();

// Las cuentas se guardan poco después de cada cambio (registro, sesión, partida nueva).
let accountsTimer = null;
let savingAccounts = Promise.resolve();
const saveAccounts = () => {
  clearTimeout(accountsTimer);
  accountsTimer = null;
  savingAccounts = savingAccounts
    .then(() => track(storage.saveAccounts(accounts.serialize())))
    .catch((err) => console.error('[guardado] Error al guardar las cuentas:', err.message));
  return savingAccounts;
};
const accounts = new AccountStore({
  onChange: () => { accountsTimer ??= setTimeout(saveAccounts, 1500); },
});

// Estado del guardado, visible en /health (útil si los registros del hosting no cargan).
const saveStatus = { lastSaveAt: null, lastError: null };
const track = (promise) => promise
  .then(() => { saveStatus.lastSaveAt = new Date().toISOString(); saveStatus.lastError = null; })
  .catch((err) => { saveStatus.lastError = err.message; throw err; });

// Claves de los avisos al móvil: de las variables de entorno o generadas una vez y guardadas
// (si cambiaran, las suscripciones de los jugadores dejarían de funcionar).
let push = null;
try {
  let keys = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
    : await storage.loadValue('vapid');
  if (!keys) {
    keys = generateKeys();
    await storage.saveValue('vapid', keys);
  }
  push = createPush(keys);
} catch (err) {
  console.error('[avisos] No disponibles:', err.message);
}

const { server, rooms, close } = createGameServer({
  push,
  accounts,
  storageInfo: () => ({ kind: storage.kind.startsWith('archivo') ? 'archivo local' : storage.kind, ok: !saveStatus.lastError, ...saveStatus }),
});

// Recupera las cuentas y las partidas que estaban en marcha antes de reiniciar.
try {
  const users = accounts.restore(await storage.loadAccounts());
  const restored = rooms.restore(await storage.load());
  console.log(`Guardado en ${storage.kind}. Cuentas: ${users}. Partidas recuperadas: ${restored}`);
} catch (err) {
  console.error('[guardado] No se pudieron recuperar los datos:', err.message);
}

let saving = Promise.resolve();
const save = () => {
  saving = saving
    .then(() => track(storage.save(rooms.serialize())))
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
    await Promise.all([save(), saveAccounts()]);
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
