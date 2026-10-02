import { generateCode, normalizeCode, randomId, sanitizeName, sanitizeChat } from './utils.js';
import { defaultSettings, applySettingsPatch } from '../shared/settings.js';
import {
  createGame, pickCountry, allPicked, finishPicking, releasePlayer, tickGame, publicGame,
  privateGameWithStandings, developCountry, recruit, moveArmy, research, researchNode, launchStrike, build, spy,
  checkEnd, currentStandings, COUNTRIES,
} from './game.js';
import { trade, postOffer, acceptOffer, cancelOffer } from './market.js';
import { AVATARS, DEFAULT_AVATAR, PRESIDENTS, DEFAULT_PRESIDENT } from '../shared/leaders.js';
import { inScenario, scenarioOf } from '../shared/scenarios.js';
import { WEAPONS } from '../shared/military.js';
import { pairKey } from '../shared/diplomacy.js';
import { VICTORY_REASONS } from '../shared/score.js';
import { declareWar, propose, respond, cancelProposal } from './diplomacy.js';

export const PLAYER_COLORS = [
  '#e4572e', '#2e86de', '#f2c14e', '#17bebb',
  '#a05cde', '#76b041', '#ff8fab', '#d9d9d9',
];

// En el lobby, un jugador desconectado conserva su plaza este tiempo antes de ser expulsado.
export const LOBBY_RECONNECT_GRACE_MS = 30_000;
// Los jugadores con cuenta pueden salir al menú: en el lobby conservan la plaza más tiempo.
export const ACCOUNT_LOBBY_GRACE_MS = 30 * 60_000;
// Una sala sin nadie conectado se borra tras este tiempo (según su estado).
// Una partida en marcha aguanta días sin nadie conectado: se puede jugar a lo largo de una semana.
export const EMPTY_ROOM_TTL_MS = {
  lobby: 2 * 60_000,
  playing: 8 * 24 * 60 * 60_000,
  finished: 60_000,
};
const CHAT_HISTORY_SIZE = 50;
const DM_HISTORY_SIZE = 50;
const CHAT_COOLDOWN_MS = 500;

export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Gestiona todas las salas en memoria. No sabe nada de sockets:
 * index.js traduce los eventos de red a llamadas a esta clase.
 *
 * Cada jugador se identifica por un token secreto (generado por su navegador)
 * y tiene además un id público que es el que ven los demás.
 */
export class RoomManager {
  constructor({ onChat = () => {}, onNotify = () => {} } = {}) {
    this.rooms = new Map();   // code -> room
    this.tokens = new Map();  // token -> { code, playerId }
    this.onChat = onChat;     // (room, message) => void, para difundir mensajes de sistema
    this.onNotify = onNotify; // (room, playerId, { title, body, tag }) => void, avisos al móvil
  }

  #notify(room, playerId, title, body, tag) {
    if (!playerId) return;
    this.onNotify(room, playerId, { title, body, tag: `${room.code}-${tag}`, url: `/?code=${room.code}` });
  }

  // ---------- Consulta ----------

  getByToken(token) {
    const ref = this.tokens.get(token);
    if (!ref) return null;
    const room = this.rooms.get(ref.code);
    const player = room?.players.get(ref.playerId);
    if (!player) {
      this.tokens.delete(token);
      return null;
    }
    return { room, player };
  }

  /** Estado público de la sala tal como lo ve un jugador (con niebla de guerra si está activa). */
  toPublic(room, viewerId = null) {
    return {
      code: room.code,
      state: room.state,
      hostId: room.hostId,
      settings: room.settings,
      startedAt: room.startedAt,
      serverTime: Date.now(),
      game: room.game ? publicGame(room.game, viewerId) : null,
      players: [...room.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        ready: p.ready,
        connected: p.connected,
        avatar: p.avatar,
        president: p.president,
        country: p.country,
        isHost: p.id === room.hostId,
      })),
    };
  }

  // ---------- Entrar / salir ----------

  /** opts.persistent: plaza de una cuenta (puede salir al menú y volver más tarde). */
  createRoom(token, rawName, avatar, opts = {}) {
    const name = requireName(rawName);
    this.leave(token);

    let code;
    do code = generateCode(); while (this.rooms.has(code));

    const room = {
      code,
      state: 'lobby',
      hostId: null,
      settings: defaultSettings(),
      players: new Map(),
      chat: [],
      createdAt: Date.now(),
      startedAt: null,
      emptySince: null,
      game: null,
      dms: new Map(), // conversaciones privadas: 'a|b' -> [mensajes]
    };
    this.rooms.set(code, room);

    const player = this.#addPlayer(room, token, name, avatar, opts);
    room.hostId = player.id;
    this.#system(room, `${name} ha creado la partida`);
    return { room, player };
  }

  joinRoom(token, rawName, rawCode, avatar, opts = {}) {
    const name = requireName(rawName);
    const code = normalizeCode(rawCode);
    const room = this.rooms.get(code);

    if (!room) throw new GameError('NOT_FOUND', 'No existe ninguna partida con ese código');
    if (room.state !== 'lobby') throw new GameError('STARTED', 'Esa partida ya ha empezado');
    if (room.players.size >= room.settings.maxPlayers) {
      throw new GameError('FULL', 'La partida está llena');
    }
    const lower = name.toLowerCase();
    if ([...room.players.values()].some((p) => p.name.toLowerCase() === lower)) {
      throw new GameError('NAME_TAKEN', 'Ya hay un jugador con ese nombre en la sala');
    }

    this.leave(token);
    const player = this.#addPlayer(room, token, name, avatar, opts);
    this.#system(room, `${name} se ha unido`);
    return { room, player };
  }

  /** Devuelve la sala que se ha abandonado (o null), y si se ha borrado por quedar vacía. */
  leave(token) {
    const ref = this.getByToken(token);
    if (!ref) return null;
    const { room, player } = ref;
    const deleted = this.#removePlayer(room, player, `${player.name} ha abandonado la partida`);
    return { room, deleted };
  }

  // ---------- Conexión / reconexión ----------

  /** Asocia un socket al jugador. Devuelve el socket anterior (si había) y si estaba desconectado. */
  attachSocket(token, socketId) {
    const ref = this.getByToken(token);
    if (!ref) return null;
    const { room, player } = ref;
    const previousSocketId = player.socketId;
    const wasDisconnected = player.disconnectedAt !== null;

    player.socketId = socketId;
    player.connected = true;
    player.disconnectedAt = null;
    room.emptySince = null;

    if (wasDisconnected) this.#system(room, `${player.name} se ha reconectado`);
    return { room, player, previousSocketId };
  }

  /** Marca al jugador como desconectado si el socket que cae es el suyo actual. */
  detachSocket(token, socketId) {
    const ref = this.getByToken(token);
    if (!ref || ref.player.socketId !== socketId) return null;
    const { room, player } = ref;

    player.socketId = null;
    player.connected = false;
    player.disconnectedAt = Date.now();
    if (![...room.players.values()].some((p) => p.connected)) room.emptySince = Date.now();

    this.#system(room, `${player.name} se ha desconectado`);
    return { room, player };
  }

  // ---------- Lobby ----------

  updateSettings(room, player, patch) {
    this.#requireHost(room, player);
    this.#requireLobby(room);

    const { settings, error } = applySettingsPatch(room.settings, patch);
    if (error) throw new GameError('INVALID_SETTINGS', error);
    if (settings.maxPlayers < room.players.size) {
      throw new GameError('INVALID_SETTINGS', 'Ya hay más jugadores en la sala que ese máximo');
    }

    room.settings = settings;
    // Con otro mapa, los países elegidos que ya no están en él se olvidan.
    for (const p of room.players.values()) {
      if (p.country && !inScenario(settings.mapScenario, p.country)) p.country = null;
    }
    // Si cambian las reglas, los demás tienen que volver a confirmar.
    for (const p of room.players.values()) if (p.id !== room.hostId) p.ready = false;
  }

  /** Avatar, presidente y país elegidos en la sala. Solo cambia lo que venga en `patch`. */
  setProfile(room, player, patch = {}) {
    this.#requireLobby(room);
    if ('avatar' in patch) {
      if (!AVATARS.includes(patch.avatar)) throw new GameError('INVALID', 'Avatar no válido');
      player.avatar = patch.avatar;
    }
    if ('president' in patch) {
      if (!PRESIDENTS[patch.president]) throw new GameError('INVALID', 'Presidente no válido');
      player.president = patch.president;
    }
    if ('country' in patch) {
      const id = patch.country;
      if (id === null) {
        player.country = null;
      } else {
        if (!COUNTRIES.has(id)) throw new GameError('INVALID', 'Ese país no existe');
        if (!inScenario(room.settings.mapScenario, id)) throw new GameError('INVALID', 'Ese país no está en el mapa elegido');
        const neighborsOk = scenarioOf(room.settings.mapScenario).allowNeighbors;
        for (const other of room.players.values()) {
          if (other.id === player.id || !other.country) continue;
          if (other.country === id) throw new GameError('TAKEN', `${other.name} ya ha elegido ese país`);
          if (!neighborsOk && COUNTRIES.get(other.country).neighbors.includes(id)) {
            throw new GameError('TAKEN', `Ese país limita con el de ${other.name}; elige otro más lejos`);
          }
        }
        player.country = id;
      }
    }
  }

  setReady(room, player, ready) {
    this.#requireLobby(room);
    player.ready = Boolean(ready);
  }

  kick(room, player, targetId) {
    this.#requireHost(room, player);
    this.#requireLobby(room);
    const target = room.players.get(targetId);
    if (!target) throw new GameError('NOT_FOUND', 'Ese jugador ya no está en la sala');
    if (target.id === player.id) throw new GameError('INVALID', 'No puedes expulsarte a ti mismo');

    this.#removePlayer(room, target, `${target.name} ha sido expulsado`);
    return target;
  }

  start(room, player) {
    this.#requireHost(room, player);
    this.#requireLobby(room);

    const others = [...room.players.values()].filter((p) => p.id !== room.hostId);
    if (others.some((p) => !p.connected)) {
      throw new GameError('NOT_READY', 'Hay jugadores reconectándose; espera un momento');
    }
    if (others.some((p) => !p.ready)) {
      throw new GameError('NOT_READY', 'Todos los jugadores deben estar listos');
    }

    room.state = 'playing';
    room.startedAt = Date.now();
    const profiles = Object.fromEntries([...room.players.values()]
      .map((p) => [p.id, { president: p.president, country: p.country }]));
    room.game = createGame(room.settings, [...room.players.keys()], { profiles });
    this.#system(room, '¡La partida ha comenzado!');
    for (const p of room.players.values()) this.#notify(room, p.id, '🎮 ¡La partida ha comenzado!', `Sala ${room.code}: entra a elegir tu estrategia.`, 'start');
    if (room.game.phase === 'picking') {
      this.#system(room, 'Elegid vuestro país en el mapa antes de que acabe el tiempo');
    } else {
      this.#announceHomes(room);
    }
  }

  // ---------- Partida ----------

  pickCountry(room, player, countryId) {
    this.#requirePlaying(room);
    const error = pickCountry(room.game, player.id, countryId);
    if (error) throw new GameError('INVALID_PICK', error);

    this.#system(room, `${player.name} ha elegido ${COUNTRIES.get(countryId).name}`);
    if (allPicked(room.game, [...room.players.keys()])) {
      finishPicking(room.game, [...room.players.keys()]);
      this.#announceHomes(room);
    }
  }

  developCountry(room, player, countryId) {
    this.#requirePlaying(room);
    const error = developCountry(room.game, player.id, countryId);
    if (error) throw new GameError('INVALID_ACTION', error);
  }

  build(room, player, countryId, type) {
    this.#requirePlaying(room);
    const error = build(room.game, player.id, countryId, type);
    if (error) throw new GameError('INVALID_ACTION', error);
  }

  recruit(room, player, countryId, type, count) {
    this.#requirePlaying(room);
    const error = recruit(room.game, player.id, countryId, type, count);
    if (error) throw new GameError('INVALID_ACTION', error);
  }

  moveArmy(room, player, from, to, units) {
    this.#requirePlaying(room);
    const { error, army } = moveArmy(room.game, player.id, from, to, units);
    if (error) throw new GameError('INVALID_ACTION', error);
    const target = room.game.countries[to].owner;
    if (target && target !== player.id) {
      const mins = Math.max(1, Math.round((army.arriveAt - Date.now()) / 60_000));
      this.#notify(room, target, `⚔ ¡Te atacan en ${COUNTRIES.get(to).name}!`,
        `${player.name} envía tropas desde ${COUNTRIES.get(from).name}. Llegan en unos ${mins} min.`, `attack-${to}`);
    }
    return army;
  }

  research(room, player, tech) {
    this.#requirePlaying(room);
    const error = research(room.game, player.id, tech);
    if (error) throw new GameError('INVALID_ACTION', error);
  }

  researchNode(room, player, nodeId) {
    this.#requirePlaying(room);
    const error = researchNode(room.game, player.id, nodeId);
    if (error) throw new GameError('INVALID_ACTION', error);
  }

  launchStrike(room, player, weapon, targetId) {
    this.#requirePlaying(room);
    const { error, strike } = launchStrike(room.game, player.id, weapon, targetId);
    if (error) throw new GameError('INVALID_ACTION', error);
    if (weapon === 'nuke') {
      this.#system(room, `☢ ¡ALERTA! ${player.name} ha lanzado una bomba nuclear contra ${COUNTRIES.get(targetId).name}`);
    }
    return strike;
  }

  // ---------- Espionaje ----------

  spy(room, player, mission, countryId) {
    this.#requirePlaying(room);
    const result = spy(room.game, player.id, mission, countryId);
    if (result.error) throw new GameError('INVALID_ACTION', result.error);
    if (result.event) this.#announceEvent(room, result.event);
    return result;
  }

  // ---------- Mercado ----------

  trade(room, player, good, side, amount) {
    this.#requirePlaying(room);
    const { error, total } = trade(room.game, player.id, good, side, amount);
    if (error) throw new GameError('INVALID_ACTION', error);
    return total;
  }

  postOffer(room, player, give, want) {
    this.#requirePlaying(room);
    const { error, offer } = postOffer(room.game, player.id, give, want);
    if (error) throw new GameError('INVALID_ACTION', error);
    return offer;
  }

  /** Devuelve la oferta aceptada (para avisar a quien la publicó). */
  acceptOffer(room, player, offerId) {
    this.#requirePlaying(room);
    const { error, offer } = acceptOffer(room.game, player.id, offerId);
    if (error) throw new GameError('INVALID_ACTION', error);
    return offer;
  }

  cancelOffer(room, player, offerId) {
    this.#requirePlaying(room);
    const { error } = cancelOffer(room.game, player.id, offerId);
    if (error) throw new GameError('INVALID_ACTION', error);
  }

  // ---------- Mensajes privados ----------

  sendDirect(room, player, targetId, rawText) {
    const target = room.players.get(targetId);
    if (!target || target.id === player.id) throw new GameError('INVALID', 'Ese jugador no está en la sala');
    const text = sanitizeChat(rawText);
    if (!text) throw new GameError('INVALID', 'Mensaje vacío');
    const now = Date.now();
    if (now - player.lastChatAt < CHAT_COOLDOWN_MS) {
      throw new GameError('RATE_LIMIT', 'Estás enviando mensajes demasiado rápido');
    }
    player.lastChatAt = now;

    const key = pairKey(player.id, target.id);
    const thread = room.dms.get(key) ?? [];
    const msg = { id: randomId(), from: player.id, to: target.id, text, ts: now };
    this.#notify(room, target.id, `💬 ${player.name}`, text, `dm-${player.id}`);
    thread.push(msg);
    if (thread.length > DM_HISTORY_SIZE) thread.shift();
    room.dms.set(key, thread);
    return { msg, target };
  }

  /** Todas las conversaciones privadas en las que participa un jugador. */
  directHistory(room, playerId) {
    const out = [];
    for (const [key, thread] of room.dms) if (key.split('|').includes(playerId)) out.push(...thread);
    return out.sort((a, b) => a.ts - b.ts);
  }

  // ---------- Diplomacia ----------

  declareWar(room, player, targetId) {
    this.#requirePlaying(room);
    const { error, betrayal } = declareWar(room.game, player.id, targetId);
    if (error) throw new GameError('INVALID_ACTION', error);
    const target = room.players.get(targetId)?.name;
    this.#system(room, betrayal
      ? `🗡 ${player.name} rompe su alianza y declara la guerra a ${target}`
      : `⚔ ${player.name} declara la guerra a ${target}`);
  }

  propose(room, player, targetId, type, payload) {
    this.#requirePlaying(room);
    const { error, proposal } = propose(room.game, player.id, targetId, type, payload);
    if (error) throw new GameError('INVALID_ACTION', error);
    this.#notify(room, targetId, '🤝 Propuesta diplomática', `${player.name} te ha enviado una propuesta. Caduca en 1 minuto.`, 'proposal');
    return proposal;
  }

  respondProposal(room, player, proposalId, accept) {
    this.#requirePlaying(room);
    const { error, proposal, accepted } = respond(room.game, player.id, proposalId, accept);
    if (error) throw new GameError('INVALID_ACTION', error);
    if (!accepted) return { proposal, accepted };
    const a = room.players.get(proposal.from)?.name;
    const b = player.name;
    // Los tratos comerciales son privados; los acuerdos políticos se anuncian.
    if (proposal.type === 'peace') this.#system(room, `☮ ${a} y ${b} firman la paz`);
    if (proposal.type === 'nap') this.#system(room, `📜 ${a} y ${b} firman un pacto de no agresión`);
    if (proposal.type === 'alliance') this.#system(room, `🤝 ${a} y ${b} forman una alianza`);
    return { proposal, accepted };
  }

  cancelProposal(room, player, proposalId) {
    this.#requirePlaying(room);
    const { error } = cancelProposal(room.game, player.id, proposalId);
    if (error) throw new GameError('INVALID_ACTION', error);
  }

  privateState(room, playerId, table = null) {
    return room.game ? privateGameWithStandings(room.game, playerId, table) : null;
  }

  standings(room) {
    return room.game && !room.game.result ? currentStandings(room.game) : null;
  }

  /** Avanza el reloj de las partidas. Devuelve las salas cuyo estado público ha cambiado. */
  tick(now = Date.now()) {
    const changed = [];
    for (const room of this.rooms.values()) {
      // La partida sigue aunque no haya nadie conectado: el mundo no se detiene
      // (así se puede jugar a lo largo de varios días, entrando y saliendo).
      if (room.state !== 'playing' || !room.game) continue;
      const result = tickGame(room.game, [...room.players.keys()], now);
      if (result.picked) this.#announceHomes(room);
      for (const event of result.events) this.#announceEvent(room, event);
      if (result.ended) this.#finish(room);
      if (result.changed) changed.push(room);
    }
    return changed;
  }

  /** Tras el final, el anfitrión devuelve a todos al lobby para jugar otra partida. */
  backToLobby(room, player) {
    this.#requireHost(room, player);
    if (room.state !== 'finished') throw new GameError('INVALID', 'La partida no ha terminado');
    room.state = 'lobby';
    room.game = null;
    room.startedAt = null;
    for (const p of room.players.values()) p.ready = false;
    this.#system(room, `${player.name} ha vuelto al lobby. ¡Preparad la revancha!`);
  }

  // ---------- Chat ----------

  addChat(room, player, rawText) {
    const text = sanitizeChat(rawText);
    if (!text) throw new GameError('INVALID', 'Mensaje vacío');

    const now = Date.now();
    if (now - player.lastChatAt < CHAT_COOLDOWN_MS) {
      throw new GameError('RATE_LIMIT', 'Estás enviando mensajes demasiado rápido');
    }
    player.lastChatAt = now;

    return this.#pushChat(room, {
      id: randomId(),
      playerId: player.id,
      name: player.name,
      color: player.color,
      avatar: player.avatar,
      text,
      ts: now,
    });
  }

  // ---------- Limpieza periódica ----------

  /** Expulsa a desconectados del lobby y borra salas abandonadas. */
  sweep(now = Date.now()) {
    const changed = new Set();
    const deleted = [];

    for (const room of [...this.rooms.values()]) {
      if (room.state === 'lobby') {
        for (const p of [...room.players.values()]) {
          const grace = p.persistent ? ACCOUNT_LOBBY_GRACE_MS : LOBBY_RECONNECT_GRACE_MS;
          if (!p.connected && now - p.disconnectedAt > grace) {
            const roomGone = this.#removePlayer(room, p, `${p.name} no ha vuelto y deja su plaza`);
            if (roomGone) break;
            changed.add(room);
          }
        }
      }

      if (!this.rooms.has(room.code)) {
        deleted.push(room.code);
        changed.delete(room);
        continue;
      }

      const ttl = room.state === 'lobby' && [...room.players.values()].some((p) => p.persistent)
        ? ACCOUNT_LOBBY_GRACE_MS : EMPTY_ROOM_TTL_MS[room.state];
      if (room.emptySince && now - room.emptySince > ttl) {
        this.#deleteRoom(room);
        deleted.push(room.code);
        changed.delete(room);
      }
    }
    return { changed: [...changed], deleted };
  }

  /** Resumen de una partida para el menú «Mis partidas». */
  summaryFor(token) {
    const ref = this.getByToken(token);
    if (!ref) return null;
    const { room, player } = ref;
    const game = room.game;
    const country = game?.homes[player.id] ?? game?.picks?.[player.id] ?? player.country;
    return {
      code: room.code,
      state: room.state,
      phase: game?.phase ?? null,
      isHost: room.hostId === player.id,
      scenario: room.settings.mapScenario,
      maxPlayers: room.settings.maxPlayers,
      startedAt: room.startedAt,
      players: [...room.players.values()].map((p) => ({ name: p.name, avatar: p.avatar, color: p.color, connected: p.connected })),
      you: {
        name: player.name,
        color: player.color,
        avatar: player.avatar,
        country: country ?? null,
        eliminated: Boolean(game?.players[player.id]?.eliminated),
        won: game?.result ? game.result.winner === player.id : null,
        countries: game ? Object.values(game.countries).filter((c) => c.owner === player.id).length : 0,
      },
    };
  }

  // ---------- Guardado (para sobrevivir a reinicios del servidor) ----------

  /** Copia serializable de las partidas en marcha (y de las salas de espera de jugadores con cuenta). */
  serialize() {
    return [...this.rooms.values()]
      .filter((room) => (room.state === 'playing' && room.game)
        || (room.state === 'lobby' && [...room.players.values()].some((p) => p.persistent)))
      .map((room) => ({
        code: room.code,
        state: room.state,
        hostId: room.hostId,
        settings: room.settings,
        createdAt: room.createdAt,
        startedAt: room.startedAt,
        chat: room.chat,
        dms: [...room.dms],
        game: room.game,
        players: [...room.players.values()].map((p) => ({
          id: p.id, token: p.token, name: p.name, color: p.color, avatar: p.avatar,
          president: p.president, country: p.country, persistent: p.persistent, account: p.account ?? null,
        })),
      }));
  }

  /** Recupera partidas guardadas. Todos empiezan desconectados hasta que vuelvan a entrar. */
  restore(snapshots, now = Date.now()) {
    let count = 0;
    for (const snap of snapshots ?? []) {
      const lobby = snap?.state === 'lobby';
      if (!snap?.code || this.rooms.has(snap.code) || (!snap.game && !lobby)) continue;
      const room = {
        code: snap.code,
        state: lobby ? 'lobby' : 'playing',
        hostId: snap.hostId,
        settings: { ...defaultSettings(), ...snap.settings },
        players: new Map(),
        chat: snap.chat ?? [],
        createdAt: snap.createdAt ?? now,
        startedAt: lobby ? null : snap.startedAt ?? now,
        emptySince: now,
        game: lobby ? null : snap.game,
        dms: new Map(snap.dms ?? []),
      };
      for (const p of snap.players ?? []) {
        if (this.tokens.has(p.token)) continue;
        room.players.set(p.id, {
          ...p,
          avatar: p.avatar ?? DEFAULT_AVATAR,
          president: p.president ?? DEFAULT_PRESIDENT,
          country: p.country ?? null,
          ready: !lobby,
          connected: false,
          socketId: null,
          disconnectedAt: now,
          lastChatAt: 0,
        });
        this.tokens.set(p.token, { code: room.code, playerId: p.id });
      }
      if (room.players.size === 0) continue;
      if (!room.players.has(room.hostId)) room.hostId = room.players.keys().next().value;
      this.rooms.set(room.code, room);
      count++;
    }
    return count;
  }

  // ---------- Internos ----------

  #addPlayer(room, token, name, avatar, { persistent = false, account = null } = {}) {
    const usedColors = new Set([...room.players.values()].map((p) => p.color));
    const player = {
      id: randomId(),
      token,
      name,
      color: PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? PLAYER_COLORS[0],
      ready: false,
      avatar: AVATARS.includes(avatar) ? avatar : DEFAULT_AVATAR,
      president: DEFAULT_PRESIDENT,
      country: null,    // país elegido en la sala (null = el que toque)
      persistent,       // jugador con cuenta: conserva su plaza aunque salga al menú
      account,          // nombre de la cuenta (en minúsculas) para enviarle avisos
      connected: false, // pasa a true cuando se asocia el socket
      socketId: null,
      disconnectedAt: null,
      lastChatAt: 0,
    };
    room.players.set(player.id, player);
    this.tokens.set(token, { code: room.code, playerId: player.id });
    return player;
  }

  /** Devuelve true si la sala se ha borrado por quedar vacía. */
  #removePlayer(room, player, reason) {
    room.players.delete(player.id);
    this.tokens.delete(player.token);
    if (room.game) releasePlayer(room.game, player.id);

    if (room.players.size === 0) {
      this.#deleteRoom(room);
      return true;
    }
    this.#system(room, reason);
    if (room.hostId === player.id) this.#migrateHost(room);
    // Si su marcha deja un ganador (p. ej. último en pie), la partida termina.
    if (room.game?.phase === 'active' && checkEnd(room.game)) this.#finish(room);
    // Si solo faltaba por elegir el que se ha ido, se cierra la elección.
    if (room.game?.phase === 'picking' && allPicked(room.game, [...room.players.keys()])) {
      finishPicking(room.game, [...room.players.keys()]);
      this.#announceHomes(room);
    }
    if (![...room.players.values()].some((p) => p.connected)) room.emptySince ??= Date.now();
    return false;
  }

  #migrateHost(room) {
    const players = [...room.players.values()];
    const next = players.find((p) => p.connected) ?? players[0];
    room.hostId = next.id;
    next.ready = false;
    this.#system(room, `${next.name} es ahora el anfitrión`);
  }

  #finish(room) {
    room.state = 'finished';
    const { winner, reason } = room.game.result;
    const name = room.players.get(winner)?.name;
    this.#system(room, winner
      ? `🏆 ${name} gana la partida ${VICTORY_REASONS[reason]}`
      : `☠ ${VICTORY_REASONS.defeat}`);
  }

  #requirePlaying(room) {
    if (room.state !== 'playing' || !room.game) {
      throw new GameError('NOT_PLAYING', 'La partida no ha empezado');
    }
  }

  #announceEvent(room, event) {
    const name = (pid) => (pid ? room.players.get(pid)?.name ?? 'Un jugador' : 'las fuerzas neutrales');
    // Avisos al móvil para quien no está mirando.
    if (event.type === 'eliminated') this.#notify(room, event.player, '☠ Has sido eliminado', event.reason === 'capital' ? `${name(event.by)} ha tomado tu capital.` : 'Has perdido todos tus países.', 'eliminated');
    if (event.type === 'battle' && event.defender && event.attackerWins && !event.capitalTaken) {
      this.#notify(room, event.defender, `🏴 Has perdido ${COUNTRIES.get(event.country).name}`, `${name(event.attacker)} lo ha conquistado.`, `lost-${event.country}`);
    }
    if (event.type === 'strike' && event.defender && !event.intercepted) {
      this.#notify(room, event.defender, `💣 Bombardeo en ${COUNTRIES.get(event.country).name}`, `${name(event.attacker)} ha alcanzado tu país.`, `strike-${event.country}`);
    }
    if (event.type === 'revolt') {
      this.#notify(room, event.player, `✊ Revuelta en ${COUNTRIES.get(event.country).name}`, 'La población se ha sublevado y has perdido el país.', `revolt-${event.country}`);
      this.#system(room, `✊ ¡Revuelta! ${COUNTRIES.get(event.country).name} se subleva contra ${name(event.player)} y se declara independiente`);
      return;
    }
    if (event.type === 'spy') {
      const country = COUNTRIES.get(event.country).name;
      if (event.caught) {
        this.#system(room, `🕵️ Un espía de ${name(event.by)} ha sido capturado en ${country}`);
      } else if (event.success && event.owner) {
        const what = { sabotage: `sabotaje (${event.damage})`, steal: 'robo de planos tecnológicos', incite: 'agitadores que fomentan la revuelta' }[event.mission];
        this.#notify(room, event.owner, `🕵️ Espionaje en ${country}`, `Un espía desconocido: ${what}.`, `spy-${event.country}`);
        this.#system(room, `🕵️ Espionaje en ${country}: ${what}. Nadie sabe quién ha sido`);
      }
      return;
    }
    if (event.type === 'eliminated') {
      this.#system(room, event.reason === 'capital'
        ? `☠ ${name(event.by)} ha tomado la capital de ${name(event.player)}: ${name(event.player)} queda eliminado y sus países pasan a ser neutrales`
        : `☠ ${name(event.player)} ha sido eliminado`);
      return;
    }
    if (event.type === 'pact-ended') {
      this.#system(room, `📜 Termina el pacto de no agresión entre ${name(event.players[0])} y ${name(event.players[1])}`);
      return;
    }
    if (event.type === 'reinforce') {
      this.#system(room, `🤝 ${name(event.from)} envía refuerzos a ${COUNTRIES.get(event.country).name}`);
      return;
    }
    if (event.type === 'strike') {
      const spec = WEAPONS[event.weapon];
      const target = COUNTRIES.get(event.country).name;
      this.#system(room, event.intercepted
        ? `🛡 Las defensas de ${target} interceptan un ${spec.label.toLowerCase()} de ${name(event.attacker)}`
        : `${spec.icon} ${name(event.attacker)} alcanza ${target} con: ${spec.label.toLowerCase()}`);
      return;
    }
    if (event.type !== 'battle') return; // p. ej. investigación: es privada
    const country = COUNTRIES.get(event.country).name;
    if (event.attacker === null) {
      this.#system(room, event.attackerWins
        ? `🏴 Las fuerzas neutrales recuperan ${country}`
        : `🛡 ${country} resiste un contraataque neutral`);
      return;
    }
    if (event.attackerWins) {
      this.#system(room, `⚔ ${name(event.attacker)} conquista ${country}${event.capitalTaken ? ` (capital de ${name(event.defender)})` : ''}`);
    } else {
      this.#system(room, `🛡 ${country} resiste el ataque de ${name(event.attacker)}`);
    }
  }

  #announceHomes(room) {
    const list = Object.entries(room.game.homes)
      .map(([pid, cid]) => `${room.players.get(pid)?.name}: ${COUNTRIES.get(cid).name}`)
      .join(' · ');
    this.#system(room, `Países asignados — ${list}`);
  }

  #deleteRoom(room) {
    for (const p of room.players.values()) this.tokens.delete(p.token);
    this.rooms.delete(room.code);
  }

  #requireHost(room, player) {
    if (room.hostId !== player.id) {
      throw new GameError('NOT_HOST', 'Solo el anfitrión puede hacer eso');
    }
  }

  #requireLobby(room) {
    if (room.state !== 'lobby') throw new GameError('STARTED', 'La partida ya ha empezado');
  }

  #system(room, text) {
    const msg = this.#pushChat(room, { id: randomId(), system: true, text, ts: Date.now() });
    this.onChat(room, msg);
  }

  #pushChat(room, msg) {
    room.chat.push(msg);
    if (room.chat.length > CHAT_HISTORY_SIZE) room.chat.shift();
    return msg;
  }
}

function requireName(raw) {
  const name = sanitizeName(raw);
  if (!name) throw new GameError('INVALID_NAME', 'El nombre debe tener entre 2 y 16 caracteres');
  return name;
}
