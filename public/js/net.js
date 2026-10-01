// Conexión con el servidor. `io` lo expone /socket.io/socket.io.js.

const TOKEN_KEY = 'dg.token';

// sessionStorage: cada pestaña es un jugador distinto (útil para probar en local)
// y el token sobrevive a recargas, lo que permite reconectar a la misma partida.
// crypto.getRandomValues funciona también por http en la red local (randomUUID no).
function getToken() {
  let token = sessionStorage.getItem(TOKEN_KEY);
  if (!token || !/^[a-f0-9]{32}$/.test(token)) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

export const socket = io({ auth: { token: getToken() } });

/** Envía una acción y espera la respuesta del servidor: { ok, error?, ... }. */
export function request(event, payload = {}, timeoutMs = 6000) {
  return new Promise((resolve) => {
    socket.timeout(timeoutMs).emit(event, payload, (err, res) => {
      if (err) resolve({ ok: false, error: 'El servidor no responde' });
      else resolve(res ?? { ok: false, error: 'Respuesta vacía del servidor' });
    });
  });
}
