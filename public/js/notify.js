// Avisos al móvil: registro del service worker y suscripción a las notificaciones.

import { request } from './net.js';
import { toast } from './dom.js';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  // Al tocar un aviso con el juego abierto, se va a esa partida.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open' && e.data.url) location.href = e.data.url;
  });
}

function keyToBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export const notificationsOn = () => supported() && Notification.permission === 'granted';

async function subscribe() {
  const { publicKey } = await request('push:key');
  if (!publicKey) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
  const res = await request('push:subscribe', { subscription: sub.toJSON() });
  return res.ok;
}

/** Pulsado el botón 🔔: pide permiso y se suscribe. */
export async function enableNotifications() {
  if (!supported()) {
    toast(isIos && !standalone()
      ? 'En iPhone: pulsa Compartir ⬆ → «Añadir a pantalla de inicio», abre el juego desde ese icono y vuelve a pulsar 🔔.'
      : 'Este navegador no admite avisos. Prueba con Chrome, Edge, Firefox o Safari actualizado.', 'error', 8000);
    return false;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    toast('Los avisos están bloqueados. Actívalos en los ajustes del navegador para este sitio.', 'error', 6000);
    return false;
  }
  try {
    if (await subscribe()) {
      toast('🔔 Avisos activados: te avisaremos si te atacan aunque tengas el juego cerrado.', 'success', 5000);
      return true;
    }
  } catch (err) {
    toast(`No se pudieron activar los avisos: ${err.message}`, 'error', 6000);
  }
  return false;
}

/** Al conectar: si ya había permiso, se vuelve a enviar la suscripción (p. ej. tras iniciar sesión). */
export async function syncNotifications() {
  if (!notificationsOn()) return;
  try {
    await subscribe();
  } catch {
    // sin conexión con el servicio de avisos: se reintentará en la próxima conexión
  }
}
