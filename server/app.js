import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { RoomManager, GameError } from './rooms.js';
import { AccountStore, AccountError } from './accounts.js';
import { isValidToken, normalizeCode, randomId } from './utils.js';
import { makeDelta } from '../shared/delta.js';
import { validSubscription, addSubscription } from './push.js';

// El servidor avanza las partidas 4 veces por segundo; los recursos privados se envían cada segundo.
const TICK_INTERVAL_MS = 250;
const PRIVATE_EVERY_TICKS = 4;
const SWEEP_EVERY_TICKS = 20;
// Límite de acciones por jugador: ráfagas de hasta 20, recuperando 10 por segundo.
const RATE_BURST = 20;
const RATE_PER_SEC = 10;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Crea el servidor HTTP + Socket.IO sin ponerlo a escuchar.
 * El servidor es la única autoridad: los clientes solo envían acciones
 * y reciben instantáneas del estado.
 */
export function createGameServer({
  tickIntervalMs = TICK_INTERVAL_MS, accounts = new AccountStore(), storageInfo = () => null, push = null,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
    });
    next();
  });
  app.use(express.static(path.join(root, 'public')));
  app.use('/shared', express.static(path.join(root, 'shared')));

  // Estado del servidor: útil para el servicio de hosting y para la prueba de carga.
  const metrics = { ticks: 0, tickAvgMs: 0, tickMaxMs: 0 };
  app.get('/health', (_req, res) => {
    let players = 0;
    let playing = 0;
    for (const room of rooms.rooms.values()) {
      players += room.players.size;
      if (room.state === 'playing') playing++;
    }
    res.json({
      ok: true,
      rooms: rooms.rooms.size,
      playing,
      players,
      sockets: io.engine.clientsCount,
      memoryMB: Math.round(process.memoryUsage().rss / 1048576),
      tickAvgMs: Math.round(metrics.tickAvgMs * 100) / 100,
      tickMaxMs: Math.round(metrics.tickMaxMs * 100) / 100,
      uptimeSec: Math.round(process.uptime()),
      accounts: accounts.users.size,
      storage: storageInfo(), // dónde se guardan las partidas y si el último guardado fue bien
    });
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: 64 * 1024, // ningún mensaje del juego necesita más
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });

  // Suscripciones a avisos de los invitados (las de las cuentas se guardan en la cuenta).
  const guestSubs = new Map(); // token del navegador -> [suscripciones]
  const subsOf = (player) => (player.account ? accounts.users.get(player.account)?.push : guestSubs.get(player.token));
  const notify = (room, playerId, payload) => {
    const player = room.players.get(playerId);
    if (!push || !player || player.connected || player.bot) return; // solo a quien no está mirando
    const subs = subsOf(player);
    if (!subs?.length) return;
    push.send(subs, payload, `${playerId}|${payload.tag}`).then((gone) => {
      if (!gone.length) return;
      const keep = (list) => list.filter((x) => !gone.includes(x.endpoint));
      if (player.account) {
        const account = accounts.users.get(player.account);
        if (account) {
          account.push = keep(account.push ?? []);
          accounts.onChange();
        }
      } else guestSubs.set(player.token, keep(guestSubs.get(player.token) ?? []));
    }).catch((err) => console.error('[avisos]', err.message));
  };

  const rooms = new RoomManager({
    onChat: (room, msg) => io.to(room.code).emit('chat:message', msg),
    onNotify: notify,
  });

  // Estado privado (recursos) para cada jugador de la sala.
  const sendPrivate = (room) => {
    if (!room.game) return;
    const table = rooms.standings(room);
    for (const p of room.players.values()) {
      if (p.socketId) io.to(p.socketId).emit('game:self', rooms.privateState(room, p.id, table));
    }
  };
  // Los cambios se agrupan: cada sala envía su estado como mucho una vez por ciclo del reloj,
  // aunque sus jugadores hagan muchas acciones seguidas.
  const dirty = new Set();
  const broadcastRoom = (room) => dirty.add(room);
  // Lo último que se envió a cada conexión, para mandar solo las diferencias.
  const viewCache = new Map(); // socketId -> { cache, seq }
  const sendView = (room, player) => {
    const state = rooms.toPublic(room, player.id); // cada jugador ve su propia niebla de guerra
    const entry = viewCache.get(player.socketId);
    const { full, patch, cache } = makeDelta(entry?.cache, state);
    const seq = (entry?.seq ?? 0) + 1;
    viewCache.set(player.socketId, { cache, seq });
    if (full) io.to(player.socketId).emit('room:state', { ...state, seq });
    else io.to(player.socketId).emit('room:delta', { seq, patch });
  };
  const flush = () => {
    for (const room of dirty) {
      if (rooms.rooms.get(room.code) !== room) continue; // sala borrada entretanto
      for (const p of room.players.values()) if (p.socketId) sendView(room, p);
      sendPrivate(room);
    }
    const sent = new Set(dirty);
    dirty.clear();
    return sent;
  };

  // El cliente se identifica con un token secreto guardado en su navegador (invitado)
  // y, si ha iniciado sesión, con su clave de sesión (cuenta).
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!isValidToken(token)) return next(new Error('INVALID_TOKEN'));
    socket.data.token = token;
    socket.data.device = token;
    socket.data.account = accounts.bySession(socket.handshake.auth?.session);
    next();
  });

  io.on('connection', (socket) => {
    // Token con el que este socket está sentado en su sala actual: el del navegador (invitado)
    // o la plaza de la cuenta en esa partida.
    const tok = () => socket.data.token;
    const device = socket.data.device;
    const bucket = { tokens: RATE_BURST, last: Date.now() };
    const allow = () => {
      const now = Date.now();
      bucket.tokens = Math.min(RATE_BURST, bucket.tokens + ((now - bucket.last) / 1000) * RATE_PER_SEC);
      bucket.last = now;
      if (bucket.tokens < 1) return false;
      bucket.tokens -= 1;
      return true;
    };

    // Envuelve un manejador: limita la frecuencia, normaliza el payload, captura errores y responde por ack.
    const handle = (event, fn) => {
      socket.on(event, (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        if (!allow()) {
          reply({ ok: false, code: 'RATE_LIMIT', error: 'Demasiadas acciones seguidas; espera un momento' });
          return;
        }
        const data = payload && typeof payload === 'object' ? payload : {};
        // Los manejadores pueden ser síncronos o asíncronos (inicio de sesión).
        Promise.resolve()
          .then(() => fn(data))
          .then((res) => reply({ ok: true, ...(res ?? {}) }))
          .catch((err) => {
            if (err instanceof GameError || err instanceof AccountError) {
              reply({ ok: false, code: err.code, error: err.message });
            } else {
              console.error(`[${event}]`, err);
              reply({ ok: false, code: 'INTERNAL', error: 'Error interno del servidor' });
            }
          });
      });
    };

    const current = () => {
      const ref = rooms.getByToken(tok());
      if (!ref) throw new GameError('NO_ROOM', 'No estás en ninguna partida');
      return ref;
    };

    // Mete este socket en la sala de Socket.IO y devuelve lo que el cliente necesita.
    const enterRoom = () => {
      const { room, player, previousSocketId } = rooms.attachSocket(tok(), socket.id);

      // Si la misma sesión estaba abierta en otra pestaña, gana la más reciente.
      if (previousSocketId && previousSocketId !== socket.id) {
        const old = io.sockets.sockets.get(previousSocketId);
        if (old) {
          old.emit('session:replaced');
          old.disconnect(true);
        }
      }

      socket.join(room.code);
      socket.data.code = room.code;
      viewCache.delete(socket.id); // el próximo envío a esta conexión será completo
      broadcastRoom(room);
      return {
        you: player.id,
        room: rooms.toPublic(room, player.id),
        self: rooms.privateState(room, player.id),
        chat: room.chat,
        dms: rooms.directHistory(room, player.id),
      };
    };

    const leaveSocketRoom = () => {
      if (socket.data.code) socket.leave(socket.data.code);
      socket.data.code = null;
      viewCache.delete(socket.id);
    };

    // El cliente perdió un parche (no debería pasar): se le reenvía el estado completo.
    handle('room:resync', () => {
      viewCache.delete(socket.id);
      const ref = rooms.getByToken(tok());
      if (ref) broadcastRoom(ref.room);
    });
    const leaveCurrent = () => {
      const left = rooms.leave(tok());
      leaveSocketRoom();
      if (left && !left.deleted) broadcastRoom(left.room);
    };
    // Sale de la sala actual en esta conexión. Con cuenta solo se desconecta (la plaza se conserva);
    // como invitado se abandona, igual que antes.
    const exitCurrent = () => {
      if (socket.data.account && tok() !== device) {
        const detached = rooms.detachSocket(tok(), socket.id);
        if (detached) broadcastRoom(detached.room);
        leaveSocketRoom();
        socket.data.token = device;
        return;
      }
      if (socket.data.account) return; // con cuenta, el token del navegador no se usa para jugar
      leaveCurrent();
    };
    const requireAccount = () => {
      if (!socket.data.account) throw new GameError('NO_ACCOUNT', 'Inicia sesión para hacer eso');
      return socket.data.account;
    };
    const accountInfo = (account) => ({ username: account.username, createdAt: account.createdAt });
    const myGames = (account) => {
      accounts.prune(account, (code, seat) => rooms.getByToken(seat)?.room.code === code);
      return account.games.map((g) => rooms.summaryFor(g.seat)).filter(Boolean);
    };

    // ---------- Avisos al móvil ----------

    handle('push:key', () => ({ publicKey: push?.publicKey ?? null }));

    handle('push:subscribe', ({ subscription }) => {
      if (!push) throw new GameError('UNAVAILABLE', 'Los avisos no están disponibles en este servidor');
      if (!validSubscription(subscription)) throw new GameError('INVALID', 'Suscripción no válida');
      const account = socket.data.account;
      if (account) {
        account.push = addSubscription(account.push, subscription);
        accounts.onChange();
      } else {
        guestSubs.set(device, addSubscription(guestSubs.get(device), subscription));
      }
    });

    // ---------- Cuentas ----------

    handle('auth:register', async ({ username, password }) => {
      const { account, session } = await accounts.register(username, password);
      exitCurrent();
      socket.data.account = account;
      console.log(`Cuenta creada: ${account.username} (${accounts.users.size} en total)`);
      return { account: accountInfo(account), session, games: [] };
    });

    handle('auth:login', async ({ username, password }) => {
      const { account, session } = await accounts.login(username, password);
      exitCurrent();
      socket.data.account = account;
      return { account: accountInfo(account), session, games: myGames(account) };
    });

    handle('auth:logout', ({ session }) => {
      exitCurrent();
      if (session) accounts.logout(session);
      socket.data.account = null;
      socket.data.token = device;
    });

    handle('account:me', () => {
      const account = socket.data.account;
      return account ? { account: accountInfo(account), games: myGames(account) } : { account: null };
    });

    handle('account:games', () => ({ games: myGames(requireAccount()) }));

    // Entra en una de tus partidas (sin salir de las demás).
    handle('room:enter', ({ code }) => {
      const account = requireAccount();
      const clean = normalizeCode(code);
      const seat = accounts.seatFor(account, clean);
      if (!seat || rooms.getByToken(seat)?.room.code !== clean) {
        accounts.removeGame(account, clean);
        throw new GameError('NOT_FOUND', 'Esa partida ya no existe');
      }
      if (tok() !== seat) exitCurrent();
      socket.data.token = seat;
      return enterRoom();
    });

    // Vuelve al menú sin abandonar la partida (con cuenta o como invitado).
    handle('room:detach', () => {
      if (socket.data.account) return exitCurrent();
      // Se ha ido al menú a propósito: en la sala de espera conserva su plaza más tiempo.
      const ref = rooms.getByToken(tok());
      if (ref) ref.player.persistent = true;
      const detached = rooms.detachSocket(tok(), socket.id);
      if (detached) broadcastRoom(detached.room);
      leaveSocketRoom();
    });

    // Invitado en el menú: ¿sigue teniendo una partida a la que volver?
    handle('session:peek', () => ({
      game: socket.data.account ? null : rooms.summaryFor(device),
    }));

    // Al (re)conectar, el cliente pregunta si sigue dentro de alguna partida (invitados).
    handle('session:resume', () => {
      if (socket.data.account || !rooms.getByToken(tok())) return { restored: false };
      return { restored: true, ...enterRoom() };
    });

    handle('room:create', ({ name, avatar }) => {
      const account = socket.data.account;
      exitCurrent();
      if (account) {
        const seat = randomId(16);
        const { room } = rooms.createRoom(seat, account.username, avatar, { persistent: true, account: account.username.toLowerCase() });
        accounts.addGame(account, room.code, seat);
        socket.data.token = seat;
      } else {
        rooms.createRoom(tok(), name, avatar);
      }
      console.log(`Sala ${rooms.getByToken(tok()).room.code} creada (${rooms.rooms.size} activas)`);
      return enterRoom();
    });

    handle('room:join', ({ name, code, avatar }) => {
      const account = socket.data.account;
      if (!account) {
        leaveCurrent();
        rooms.joinRoom(tok(), name, code, avatar);
        return enterRoom();
      }
      // Con cuenta: si ya estás en esa partida, simplemente entras.
      const clean = normalizeCode(code);
      const existing = accounts.seatFor(account, clean);
      if (existing && rooms.getByToken(existing)?.room.code === clean) {
        if (tok() !== existing) exitCurrent();
        socket.data.token = existing;
        return enterRoom();
      }
      const seat = randomId(16);
      rooms.joinRoom(seat, account.username, clean, avatar, { persistent: true, account: account.username.toLowerCase() });
      exitCurrent();
      accounts.addGame(account, clean, seat);
      socket.data.token = seat;
      return enterRoom();
    });

    handle('room:leave', () => {
      const account = socket.data.account;
      const code = rooms.getByToken(tok())?.room.code;
      leaveCurrent();
      if (account && code) accounts.removeGame(account, code);
      if (account) socket.data.token = device;
    });

    handle('room:settings', ({ patch }) => {
      const { room, player } = current();
      rooms.updateSettings(room, player, patch);
      broadcastRoom(room);
    });

    handle('room:profile', ({ avatar, president, country }) => {
      const { room, player } = current();
      const patch = {};
      if (avatar !== undefined) patch.avatar = avatar;
      if (president !== undefined) patch.president = president;
      if (country !== undefined) patch.country = country;
      rooms.setProfile(room, player, patch);
      broadcastRoom(room);
    });

    handle('room:ready', ({ ready }) => {
      const { room, player } = current();
      rooms.setReady(room, player, ready);
      broadcastRoom(room);
    });

    handle('room:kick', ({ playerId }) => {
      const { room, player } = current();
      const target = rooms.kick(room, player, playerId);
      const targetSocket = target.socketId && io.sockets.sockets.get(target.socketId);
      if (targetSocket) {
        targetSocket.leave(room.code);
        targetSocket.data.code = null;
        targetSocket.data.token = targetSocket.data.device;
        targetSocket.emit('room:kicked');
      }
      broadcastRoom(room);
    });

    handle('room:start', () => {
      const { room, player } = current();
      rooms.start(room, player);
      console.log(`Sala ${room.code}: partida iniciada con ${room.players.size} jugador(es)`);
      broadcastRoom(room);
    });

    handle('game:pick', ({ countryId }) => {
      const { room, player } = current();
      rooms.pickCountry(room, player, countryId);
      broadcastRoom(room);
    });

    handle('game:develop', ({ countryId }) => {
      const { room, player } = current();
      rooms.developCountry(room, player, countryId);
      broadcastRoom(room);
    });

    handle('game:build', ({ countryId, type }) => {
      const { room, player } = current();
      rooms.build(room, player, countryId, type);
      broadcastRoom(room);
    });

    handle('game:recruit', ({ countryId, type, count }) => {
      const { room, player } = current();
      rooms.recruit(room, player, countryId, type, count);
      broadcastRoom(room);
    });

    handle('game:move', ({ from, to, units }) => {
      const { room, player } = current();
      const army = rooms.moveArmy(room, player, from, to, units);
      broadcastRoom(room);
      return { armyId: army.id, arriveAt: army.arriveAt };
    });

    handle('game:research', ({ tech }) => {
      const { room, player } = current();
      rooms.research(room, player, tech);
      broadcastRoom(room);
    });

    handle('game:researchNode', ({ node }) => {
      const { room, player } = current();
      rooms.researchNode(room, player, node);
      broadcastRoom(room);
    });

    handle('game:strike', ({ weapon, countryId }) => {
      const { room, player } = current();
      const strike = rooms.launchStrike(room, player, weapon, countryId);
      broadcastRoom(room);
      return { arriveAt: strike.arriveAt };
    });

    handle('market:trade', ({ good, side, amount }) => {
      const { room, player } = current();
      const total = rooms.trade(room, player, good, side, amount);
      broadcastRoom(room);
      return { total };
    });

    handle('market:offer', ({ give, want }) => {
      const { room, player } = current();
      const offer = rooms.postOffer(room, player, give, want);
      broadcastRoom(room);
      return { offerId: offer.id };
    });

    handle('market:accept', ({ offerId }) => {
      const { room, player } = current();
      const offer = rooms.acceptOffer(room, player, offerId);
      // Avisa a quien publicó la oferta.
      const seller = room.players.get(offer.from);
      if (seller?.socketId) io.to(seller.socketId).emit('market:filled', { offer, by: player.id });
      broadcastRoom(room);
    });

    handle('market:cancel', ({ offerId }) => {
      const { room, player } = current();
      rooms.cancelOffer(room, player, offerId);
      broadcastRoom(room);
    });

    // Mensaje privado: llega solo al destinatario (y al remitente, para su historial).
    handle('dm:send', ({ playerId, text }) => {
      const { room, player } = current();
      const { msg, target } = rooms.sendDirect(room, player, playerId, text);
      socket.emit('dm:message', msg);
      if (target.socketId) io.to(target.socketId).emit('dm:message', msg);
    });

    handle('diplo:war', ({ playerId }) => {
      const { room, player } = current();
      rooms.declareWar(room, player, playerId);
      broadcastRoom(room);
    });

    handle('diplo:propose', ({ playerId, type, trade }) => {
      const { room, player } = current();
      const proposal = rooms.propose(room, player, playerId, type, trade);
      broadcastRoom(room);
      return { proposalId: proposal.id };
    });

    handle('diplo:respond', ({ proposalId, accept }) => {
      const { room, player } = current();
      const { proposal, accepted } = rooms.respondProposal(room, player, proposalId, Boolean(accept));
      // Avisa a quien hizo la propuesta de la respuesta.
      const proposer = room.players.get(proposal.from);
      if (proposer?.socketId) {
        io.to(proposer.socketId).emit('diplo:answered', { type: proposal.type, accepted, by: player.id });
      }
      broadcastRoom(room);
      return { accepted };
    });

    handle('diplo:cancel', ({ proposalId }) => {
      const { room, player } = current();
      rooms.cancelProposal(room, player, proposalId);
      broadcastRoom(room);
    });

    handle('room:backToLobby', () => {
      const { room, player } = current();
      rooms.backToLobby(room, player);
      broadcastRoom(room);
    });

    handle('chat:send', ({ text }) => {
      const { room, player } = current();
      const msg = rooms.addChat(room, player, text);
      io.to(room.code).emit('chat:message', msg);
    });

    socket.on('disconnect', () => {
      viewCache.delete(socket.id);
      const detached = rooms.detachSocket(tok(), socket.id);
      if (detached) broadcastRoom(detached.room);
    });
  });

  // Reloj del servidor: avanza las partidas, envía recursos y limpia salas.
  let tickCount = 0;
  const tickTimer = setInterval(() => {
    const started = performance.now();
    try {
      tick();
    } catch (err) {
      console.error('[tick]', err); // un fallo en una partida no debe tumbar el servidor
    }
    const ms = performance.now() - started;
    metrics.ticks++;
    metrics.tickAvgMs = metrics.tickAvgMs * 0.95 + ms * 0.05;
    metrics.tickMaxMs = Math.max(metrics.tickMaxMs * 0.999, ms);
  }, tickIntervalMs);
  tickTimer.unref();

  function tick() {
    const now = Date.now();
    tickCount++;
    for (const room of rooms.tick(now)) dirty.add(room);
    const sent = flush();
    if (tickCount % PRIVATE_EVERY_TICKS === 0) {
      for (const room of rooms.rooms.values()) {
        if (room.state === 'playing' && !sent.has(room)) sendPrivate(room);
      }
    }
    if (tickCount % SWEEP_EVERY_TICKS !== 0) return;
    const { changed: swept, deleted } = rooms.sweep(now);
    for (const room of swept) broadcastRoom(room);
    for (const code of deleted) {
      io.to(code).emit('room:closed');
      io.in(code).socketsLeave(code);
      console.log(`Sala ${code} eliminada por inactividad (${rooms.rooms.size} activas)`);
    }
  }

  const close = () => new Promise((resolve) => {
    clearInterval(tickTimer);
    io.close(() => resolve());
  });

  return { app, server, io, rooms, accounts, close };
}
