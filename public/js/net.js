// Conexión con el servidor. `io` lo expone /socket.io/socket.io.js.

const TOKEN_KEY = 'dg.token';

// localStorage: el token sobrevive a recargas y a cerrar el navegador, así que se puede
// volver a una partida larga días después desde el mismo dispositivo.
// Para probar con varios jugadores en un mismo ordenador, usa ventanas de incógnito.
// crypto.getRandomValues funciona también por http en la red local (randomUUID no).
const store = (() => {
  try {
    localStorage.setItem('dg.test', '1');
    return localStorage;
  } catch {
    return sessionStorage; // navegación privada antigua sin localStorage
  }
})();

function getToken() {
  let token = store.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
  if (!token || !/^[a-f0-9]{32}$/.test(token)) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    store.setItem(TOKEN_KEY, token);
  }
  return token;
}

// Sesión de la cuenta (si se ha iniciado sesión). Se envía al conectar y al reconectar.
const SESSION_KEY = 'dg.session';
export const getSession = () => store.getItem(SESSION_KEY);

export const socket = io({ auth: { token: getToken(), session: getSession() ?? undefined } });

export function setSession(key) {
  if (key) store.setItem(SESSION_KEY, key);
  else store.removeItem(SESSION_KEY);
  socket.auth.session = key ?? undefined;
}

/** Envía una acción y espera la respuesta del servidor: { ok, error?, ... }. */
export function request(event, payload = {}, timeoutMs = 6000) {
  return new Promise((resolve) => {
    socket.timeout(timeoutMs).emit(event, payload, (err, res) => {
      if (err) resolve({ ok: false, error: 'El servidor no responde' });
      else resolve(res ?? { ok: false, error: 'Respuesta vacía del servidor' });
    });
  });
}
