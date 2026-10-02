// Guardado de las partidas en marcha para que sobrevivan a reinicios del servidor
// (en Render, cada actualización o cada vez que el servicio se duerme borra la memoria).
//
//   · Si existen UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN, se guardan en una base de datos
//     Upstash Redis (gratuita), que no se borra nunca.
//   · Si no, se guardan en un archivo (data/rooms.json o DATA_DIR), que sirve en tu ordenador.

import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY_PREFIX = 'dominio:room:';
const INDEX_KEY = 'dominio:rooms';
const ACCOUNTS_KEY = 'dominio:accounts';
const TTL_SECONDS = 8 * 24 * 60 * 60; // una partida abandonada desaparece a los 8 días
const BATCH = 8;

// Al copiar los valores es fácil arrastrar comillas, espacios, el nombre de la variable
// (UPSTASH_REDIS_REST_TOKEN=...) o la palabra Bearer: se quitan.
const clean = (value) => String(value ?? '')
  .trim()
  .replace(/^[A-Z_]+\s*=\s*/, '')
  .replace(/^["']+|["']+$/g, '')
  .replace(/^Bearer\s+/i, '')
  .trim();

export function createStorage(env = process.env) {
  const url = clean(env.UPSTASH_REDIS_REST_URL);
  const token = clean(env.UPSTASH_REDIS_REST_TOKEN);
  if (url && token) return redisStorage(url.replace(/\/$/, ''), token);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  return fileStorage(path.resolve(env.DATA_DIR || path.join(root, 'data'), 'rooms.json'));
}

function fileStorage(file) {
  const accountsFile = path.join(path.dirname(file), 'accounts.json');
  const writeAtomic = async (target, data) => {
    await mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.tmp`;
    await writeFile(tmp, JSON.stringify(data));
    await rename(tmp, target); // así nunca queda un archivo a medio escribir
  };
  return {
    kind: `archivo ${file}`,
    async loadAccounts() {
      try {
        return JSON.parse(await readFile(accountsFile, 'utf8'));
      } catch (err) {
        if (err.code !== 'ENOENT') console.error('[guardado] No se pudieron leer las cuentas', err.message);
        return [];
      }
    },
    saveAccounts: (accounts) => writeAtomic(accountsFile, accounts),
    // Valores sueltos (p. ej. las claves de los avisos).
    async loadValue(name) {
      try {
        return JSON.parse(await readFile(path.join(path.dirname(file), `${name}.json`), 'utf8'));
      } catch {
        return null;
      }
    },
    saveValue: (name, value) => writeAtomic(path.join(path.dirname(file), `${name}.json`), value),
    async load() {
      try {
        return JSON.parse(await readFile(file, 'utf8'));
      } catch (err) {
        if (err.code !== 'ENOENT') console.error('[guardado] No se pudo leer', err.message);
        return [];
      }
    },
    save: (snapshots) => writeAtomic(file, snapshots),
  };
}

function redisStorage(url, token) {
  const call = async (commands) => {
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (res.status === 401) {
      throw new Error('Upstash respondió 401: el token no es válido. Copia de nuevo UPSTASH_REDIS_REST_TOKEN (el normal, no el de solo lectura) en Render → Environment');
    }
    if (!res.ok) throw new Error(`Upstash respondió ${res.status}`);
    return res.json();
  };
  let saved = new Set();
  return {
    kind: 'Upstash Redis',
    async loadAccounts() {
      const [res] = await call([['GET', ACCOUNTS_KEY]]);
      return JSON.parse(res?.result ?? '[]');
    },
    async saveAccounts(accounts) {
      await call([['SET', ACCOUNTS_KEY, JSON.stringify(accounts)]]);
    },
    async loadValue(name) {
      const [res] = await call([['GET', `dominio:${name}`]]);
      return res?.result ? JSON.parse(res.result) : null;
    },
    async saveValue(name, value) {
      await call([['SET', `dominio:${name}`, JSON.stringify(value)]]);
    },
    async load() {
      const [index] = await call([['GET', INDEX_KEY]]);
      const codes = JSON.parse(index?.result ?? '[]');
      if (!codes.length) return [];
      const results = await call(codes.map((code) => ['GET', KEY_PREFIX + code]));
      saved = new Set(codes);
      return results.map((r) => (r?.result ? JSON.parse(r.result) : null)).filter(Boolean);
    },
    async save(snapshots) {
      const codes = snapshots.map((s) => s.code);
      // Por tandas, para no pasar del tamaño máximo de petición (~50 KB por partida).
      for (let i = 0; i < snapshots.length; i += BATCH) {
        await call(snapshots.slice(i, i + BATCH)
          .map((s) => ['SET', KEY_PREFIX + s.code, JSON.stringify(s), 'EX', String(TTL_SECONDS)]));
      }
      const commands = [...saved].filter((code) => !codes.includes(code)).map((code) => ['DEL', KEY_PREFIX + code]);
      commands.push(['SET', INDEX_KEY, JSON.stringify(codes)]);
      await call(commands);
      saved = new Set(codes);
    },
  };
}
