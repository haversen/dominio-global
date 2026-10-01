import crypto from 'node:crypto';

// Sin caracteres ambiguos (0/O, 1/I/L) para que el código se pueda dictar en voz alta.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

export function generateCode(length = CODE_LENGTH) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export function randomId(bytes = 6) {
  return crypto.randomBytes(bytes).toString('hex');
}

// Token de sesión generado por el cliente: 32 caracteres hexadecimales.
export function isValidToken(token) {
  return typeof token === 'string' && /^[a-f0-9]{32}$/.test(token);
}

const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

export function sanitizeName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 16) return null;
  return name;
}

export function sanitizeChat(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(CONTROL_CHARS, ' ').trim().slice(0, 200);
  return text.length > 0 ? text : null;
}
