// Notificaciones al móvil (Web Push): llegan aunque el juego esté cerrado, si el jugador las activó.
// Las claves VAPID identifican a este servidor ante los servicios de avisos de Google, Apple y Mozilla.

import webpush from 'web-push';

const SUBJECT = 'https://github.com/haversen/dominio-global';
const THROTTLE_MS = 20_000; // como mucho un aviso del mismo tipo cada 20 s por jugador
const MAX_SUBS = 5;

export function generateKeys() {
  return webpush.generateVAPIDKeys();
}

/** Comprueba que una suscripción del navegador tiene la forma esperada (y no es enorme). */
export function validSubscription(sub) {
  return Boolean(sub && typeof sub.endpoint === 'string' && sub.endpoint.startsWith('https://')
    && sub.endpoint.length < 1000 && typeof sub.keys?.p256dh === 'string' && typeof sub.keys?.auth === 'string'
    && sub.keys.p256dh.length < 200 && sub.keys.auth.length < 100);
}

/** Añade una suscripción a una lista (sin duplicados, como mucho 5 dispositivos). */
export function addSubscription(list, sub) {
  const clean = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
  const out = (list ?? []).filter((s) => s.endpoint !== clean.endpoint);
  out.push(clean);
  return out.slice(-MAX_SUBS);
}

export function createPush(keys) {
  webpush.setVapidDetails(SUBJECT, keys.publicKey, keys.privateKey);
  const recent = new Map(); // `${destino}|${tipo}` -> momento del último aviso
  return {
    publicKey: keys.publicKey,
    /**
     * Envía un aviso a todas las suscripciones de un jugador.
     * Devuelve las que ya no son válidas (el navegador las anuló) para borrarlas.
     */
    async send(subs, payload, throttleKey) {
      if (!subs?.length) return [];
      const now = Date.now();
      if (throttleKey) {
        if (now - (recent.get(throttleKey) ?? 0) < THROTTLE_MS) return [];
        recent.set(throttleKey, now);
        if (recent.size > 5000) recent.clear();
      }
      const gone = [];
      await Promise.all(subs.map(async (sub) => {
        try {
          await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) gone.push(sub.endpoint);
          else console.error('[avisos]', err.statusCode ?? '', err.message);
        }
      }));
      return gone;
    },
  };
}
