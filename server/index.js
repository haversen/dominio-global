import os from 'node:os';
import { createGameServer } from './app.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const { server, close } = createGameServer();

// Cierre ordenado (Ctrl+C o el servicio de hosting al reiniciar).
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (closing) process.exit(1);
    closing = true;
    console.log('\nCerrando el servidor…');
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
