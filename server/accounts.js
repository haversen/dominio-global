// Cuentas de usuario: nombre + contraseña, sesiones y lista de partidas de cada jugador.
//
// La contraseña nunca se guarda: solo su huella con scrypt y una sal aleatoria.
// Las sesiones son claves aleatorias que guarda el navegador; aquí solo se guarda su hash.
// Cada partida de una cuenta tiene su propia «plaza» (seat): un token interno con el que el
// jugador está sentado en esa sala. Así una cuenta puede estar en varias partidas a la vez.

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 32;
const MAX_SESSIONS = 10;
const MAX_GAMES = 30;
const USERNAME = /^[\p{L}\p{N}_.-]{3,16}$/u;

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

export class AccountError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export class AccountStore {
  constructor({ onChange = () => {} } = {}) {
    this.users = new Map();     // nombre en minúsculas -> cuenta
    this.sessions = new Map();  // hash de la clave de sesión -> nombre en minúsculas
    this.onChange = onChange;   // para guardar en disco/base de datos
    this.failures = new Map();  // intentos fallidos por usuario (frena a quien prueba contraseñas)
  }

  static validate(username, password) {
    const name = typeof username === 'string' ? username.trim() : '';
    if (!USERNAME.test(name)) {
      throw new AccountError('INVALID', 'El usuario debe tener de 3 a 16 letras, números, puntos, guiones o guiones bajos');
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
      throw new AccountError('INVALID', 'La contraseña debe tener entre 6 y 72 caracteres');
    }
    return name;
  }

  async register(username, password) {
    const name = AccountStore.validate(username, password);
    const key = name.toLowerCase();
    if (this.users.has(key)) throw new AccountError('TAKEN', 'Ese nombre de usuario ya existe');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = (await scrypt(password, salt, KEY_LENGTH)).toString('hex');
    if (this.users.has(key)) throw new AccountError('TAKEN', 'Ese nombre de usuario ya existe');
    const account = { username: name, salt, hash, createdAt: Date.now(), sessions: [], games: [] };
    this.users.set(key, account);
    return { account, session: this.#newSession(account) };
  }

  async login(username, password) {
    const key = typeof username === 'string' ? username.trim().toLowerCase() : '';
    const fail = this.failures.get(key);
    if (fail && fail.count >= 5 && fail.until > Date.now()) {
      throw new AccountError('LOCKED', 'Demasiados intentos fallidos: espera un minuto');
    }
    const account = this.users.get(key);
    // Se calcula la huella aunque el usuario no exista, para no revelar qué nombres existen por el tiempo.
    const salt = account?.salt ?? 'x'.repeat(32);
    const hash = await scrypt(typeof password === 'string' ? password : '', salt, KEY_LENGTH);
    if (!account || !crypto.timingSafeEqual(hash, Buffer.from(account.hash, 'hex'))) {
      const count = (fail && fail.until > Date.now() ? fail.count : 0) + 1;
      this.failures.set(key, { count, until: Date.now() + 60_000 });
      throw new AccountError('WRONG', 'Usuario o contraseña incorrectos');
    }
    this.failures.delete(key);
    return { account, session: this.#newSession(account) };
  }

  bySession(sessionKey) {
    if (typeof sessionKey !== 'string' || sessionKey.length < 32) return null;
    const key = this.sessions.get(sha(sessionKey));
    return key ? this.users.get(key) ?? null : null;
  }

  logout(sessionKey) {
    const hashed = sha(String(sessionKey));
    const key = this.sessions.get(hashed);
    if (!key) return;
    this.sessions.delete(hashed);
    const account = this.users.get(key);
    if (account) account.sessions = account.sessions.filter((s) => s !== hashed);
    this.onChange();
  }

  // ---------- Partidas de la cuenta ----------

  seatFor(account, code) {
    return account.games.find((g) => g.code === code)?.seat ?? null;
  }

  addGame(account, code, seat) {
    account.games = account.games.filter((g) => g.code !== code);
    account.games.unshift({ code, seat, joinedAt: Date.now() });
    if (account.games.length > MAX_GAMES) account.games.length = MAX_GAMES;
    this.onChange();
  }

  removeGame(account, code) {
    const before = account.games.length;
    account.games = account.games.filter((g) => g.code !== code);
    if (account.games.length !== before) this.onChange();
  }

  /** Olvida las partidas que ya no existen (salas borradas o de las que te expulsaron). */
  prune(account, isAlive) {
    const before = account.games.length;
    account.games = account.games.filter((g) => isAlive(g.code, g.seat));
    if (account.games.length !== before) this.onChange();
  }

  // ---------- Guardado ----------

  serialize() {
    return [...this.users.values()];
  }

  restore(list) {
    for (const a of list ?? []) {
      if (!a?.username || !a.hash) continue;
      const account = { sessions: [], games: [], ...a };
      const key = account.username.toLowerCase();
      this.users.set(key, account);
      for (const s of account.sessions) this.sessions.set(s, key);
    }
    return this.users.size;
  }

  #newSession(account) {
    const sessionKey = crypto.randomBytes(24).toString('hex');
    const hashed = sha(sessionKey);
    account.sessions.push(hashed);
    while (account.sessions.length > MAX_SESSIONS) this.sessions.delete(account.sessions.shift());
    this.sessions.set(hashed, account.username.toLowerCase());
    this.onChange();
    return sessionKey;
  }
}
