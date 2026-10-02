import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { RoomManager, GameError } from './rooms.js';
import { isValidToken } from './utils.js';

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
export function createGameServer({ tickIntervalMs = TICK_INTERVAL_MS } = {}) {
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
    });
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: 64 * 1024, // ningún mensaje del juego necesita más
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });

  const rooms = new RoomManager({
    onChat: (room, msg) => io.to(room.code).emit('chat:message', msg),
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
  const flush = () => {
    for (const room of dirty) {
      if (rooms.rooms.get(room.code) !== room) continue; // sala borrada entretanto
      io.to(room.code).emit('room:state', rooms.toPublic(room));
      sendPrivate(room);
    }
    const sent = new Set(dirty);
    dirty.clear();
    return sent;
  };

  // El cliente se identifica con un token secreto guardado en su pestaña.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!isValidToken(token)) return next(new Error('INVALID_TOKEN'));
    socket.data.token = token;
    next();
  });

  io.on('connection', (socket) => {
    const token = socket.data.token;
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
        try {
          const data = payload && typeof payload === 'object' ? payload : {};
          reply({ ok: true, ...(fn(data) ?? {}) });
        } catch (err) {
          if (err instanceof GameError) {
            reply({ ok: false, code: err.code, error: err.message });
          } else {
            console.error(`[${event}]`, err);
            reply({ ok: false, code: 'INTERNAL', error: 'Error interno del servidor' });
          }
        }
      });
    };

    const current = () => {
      const ref = rooms.getByToken(token);
      if (!ref) throw new GameError('NO_ROOM', 'No estás en ninguna partida');
      return ref;
    };

    // Mete este socket en la sala de Socket.IO y devuelve lo que el cliente necesita.
    const enterRoom = () => {
      const { room, player, previousSocketId } = rooms.attachSocket(token, socket.id);

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
      broadcastRoom(room);
      return {
        you: player.id,
        room: rooms.toPublic(room),
        self: rooms.privateState(room, player.id),
        chat: room.chat,
        dms: rooms.directHistory(room, player.id),
      };
    };

    const leaveCurrent = () => {
      const left = rooms.leave(token);
      if (socket.data.code) socket.leave(socket.data.code);
      socket.data.code = null;
      if (left && !left.deleted) broadcastRoom(left.room);
    };

    // Al (re)conectar, el cliente pregunta si sigue dentro de alguna partida.
    handle('session:resume', () => {
      if (!rooms.getByToken(token)) return { restored: false };
      return { restored: true, ...enterRoom() };
    });

    handle('room:create', ({ name, avatar }) => {
      leaveCurrent();
      const { room } = rooms.createRoom(token, name, avatar);
      console.log(`Sala ${room.code} creada (${rooms.rooms.size} activas)`);
      return enterRoom();
    });

    handle('room:join', ({ name, code, avatar }) => {
      leaveCurrent();
      rooms.joinRoom(token, name, code, avatar);
      return enterRoom();
    });

    handle('room:leave', () => {
      leaveCurrent();
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
      const detached = rooms.detachSocket(token, socket.id);
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

  return { app, server, io, rooms, close };
}
