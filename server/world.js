// Eventos mundiales (con su noticiero) y Naciones Unidas.

import {
  WORLD_EVENTS, WORLD_EVENT_IDS, EVENT_EVERY_MS, FIRST_EVENT_MS,
  UN_RESOLUTIONS, UN_EVERY_MS, UN_FIRST_MS, UN_VOTE_MS, SANCTION_MS, NUKE_BAN_MS,
} from '../shared/world.js';
import { NAP_DURATION_MS, pairKey, relationOf } from '../shared/diplomacy.js';
import { addResources } from '../shared/economy.js';
import { setRelation } from './diplomacy.js';

const NEWS_SIZE = 30;

export function createWorld(settings, now) {
  return {
    events: settings.worldEvents === true,
    un: settings.unAssembly === true,
    nextEventAt: now + FIRST_EVENT_MS,
    active: [],          // eventos con efecto en curso: [{ type, until }]
    news: [],            // titulares del Diario Global
    nextSessionAt: now + UN_FIRST_MS,
    session: null,       // votación abierta en la ONU
    sanctions: {},       // jugador -> sancionado hasta
    nukeBanUntil: 0,
    offender: null,      // último jugador que lanzó una bomba nuclear
  };
}

/** Añade un titular al periódico. vars: { player, country, a, b, target } (ids que el cliente traduce a nombres). */
export function addNews(game, item) {
  const w = game.world;
  if (!w) return null;
  const news = { id: ++game.seq, ts: item.ts ?? Date.now(), ...item };
  w.news.push(news);
  if (w.news.length > NEWS_SIZE) w.news.shift();
  return news;
}

/** Multiplicadores que imponen los eventos en curso. */
export function worldEffects(game, now) {
  const fx = { income: { money: 1, food: 1, oil: 1, industry: 1 }, train: 1, sea: 1 };
  for (const e of game.world?.active ?? []) {
    if (e.until <= now) continue;
    const spec = WORLD_EVENTS[e.type];
    for (const [r, k] of Object.entries(spec.income ?? {})) fx.income[r] *= k;
    if (spec.train) fx.train *= spec.train;
    if (spec.sea) fx.sea *= spec.sea;
  }
  return fx;
}

export const isSanctioned = (game, playerId, now = Date.now()) => (game.world?.sanctions?.[playerId] ?? 0) > now;
export const nukesBanned = (game, now = Date.now()) => (game.world?.nukeBanUntil ?? 0) > now;

/** Avanza eventos y ONU. Devuelve los sucesos que hay que anunciar. */
export function tickWorld(game, now, rng, ctx) {
  const w = game.world;
  if (!w || game.phase !== 'active') return [];
  const out = [];
  const before = w.active.length;
  w.active = w.active.filter((e) => e.until > now);
  if (w.active.length !== before) out.push({ type: 'world-changed' });

  if (w.events && now >= w.nextEventAt) {
    w.nextEventAt = now + (EVENT_EVERY_MS * (0.7 + rng() * 0.6)) / game.speed;
    const happened = triggerEvent(game, now, rng, ctx);
    if (happened) out.push(happened);
  }
  if (w.un) out.push(...tickUN(game, now, rng, ctx));
  return out;
}

function triggerEvent(game, now, rng, { playable, alivePlayers, ownedBy, isCapital }) {
  const type = WORLD_EVENT_IDS[Math.floor(rng() * WORLD_EVENT_IDS.length)];
  const spec = WORLD_EVENTS[type];
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const vars = {};
  const countries = Object.keys(game.countries).filter(playable);

  if (type === 'earthquake') {
    const id = pick(countries);
    const c = game.countries[id];
    c.level = Math.max(1, c.level - 1);
    c.buildings = Object.fromEntries(Object.entries(c.buildings ?? {}).map(([t, n]) => [t, n - 1]).filter(([, n]) => n > 0));
    c.constructing = null;
    vars.country = id;
  } else if (type === 'coup') {
    // Golpe en un país de un jugador (no capital) o, si no hay, en uno neutral que se rearma.
    const owned = countries.filter((id) => game.countries[id].owner && !isCapital(id));
    const id = owned.length ? pick(owned) : pick(countries);
    const c = game.countries[id];
    if (c.owner) c.stability = Math.max(0, (c.stability ?? 100) - 45);
    else c.units.infantry += 6;
    vars.country = id;
  } else if (type === 'breakthrough') {
    const players = alivePlayers();
    if (!players.length) return null;
    const pid = pick(players);
    for (const r of Object.values(game.players[pid].research ?? {})) r.readyAt = now + (r.readyAt - now) / 2;
    vars.player = pid;
  } else if (type === 'goldRush') {
    const players = alivePlayers();
    if (!players.length) return null;
    const pid = pick(players);
    addResources(game.players[pid].resources, { money: 150 });
    const theirs = ownedBy(pid);
    vars.player = pid;
    vars.country = theirs.length ? pick(theirs) : null;
  } else {
    game.world.active.push({ type, until: now + (spec.duration * 60_000) / game.speed });
    if (type === 'oilCrisis' && game.market) game.market.prices.oil = Math.min(game.market.prices.oil * 2, 10);
  }
  const news = addNews(game, { ts: now, kind: 'event', event: type, icon: spec.icon, headline: spec.headline, text: spec.text, vars });
  return { type: 'world-event', news };
}


// ---------- Naciones Unidas ----------

function tickUN(game, now, rng, ctx) {
  const un = game.world;
  const out = [];
  if (un.session && now >= un.session.endsAt) {
    out.push(closeSession(game, now));
  }
  if (!un.session && now >= un.nextSessionAt) {
    un.nextSessionAt = now + UN_EVERY_MS / game.speed;
    const session = openSession(game, now, rng, ctx);
    if (session) out.push({ type: 'un-open', session });
  }
  return out;
}

function openSession(game, now, rng, { alivePlayers, standings }) {
  const alive = alivePlayers();
  if (alive.length < 2) return null;
  const un = game.world;
  let resolution = null;
  // 1. Quien ha usado una bomba nuclear se enfrenta a sanciones.
  if (un.offender && alive.includes(un.offender)) {
    resolution = { type: 'sanctions', target: un.offender };
    un.offender = null;
  }
  // 2. Si hay guerras, se propone un alto el fuego.
  if (!resolution) {
    const wars = [];
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        if (relationOf(game.relations, alive[i], alive[j]).state === 'war') wars.push([alive[i], alive[j]]);
      }
    }
    if (wars.length && rng() < 0.6) {
      const [a, b] = wars[Math.floor(rng() * wars.length)];
      resolution = { type: 'ceasefire', a, b };
    }
  }
  // 3. Un imperio demasiado grande preocupa al resto.
  const table = standings().filter((r) => !r.eliminated);
  if (!resolution && table.length >= 2 && table[0].areaPct >= table[1].areaPct * 1.6 && table[0].areaPct >= 8) {
    resolution = { type: 'sanctions', target: table[0].id };
  }
  // 4. Si no, ayuda al más débil o prohibir las nucleares.
  if (!resolution) {
    resolution = rng() < 0.6 && table.length
      ? { type: 'aid', target: table[table.length - 1].id }
      : { type: 'nukeBan' };
  }
  un.session = { id: ++game.seq, ...resolution, openedAt: now, endsAt: now + Math.max(45_000, UN_VOTE_MS / game.speed), votes: {} };
  return un.session;
}

/** Voto de un jugador en la sesión abierta. */
export function voteUN(game, playerId, vote) {
  const session = game.world?.session;
  if (!session) return 'No hay ninguna votación abierta en la ONU';
  if (!game.players[playerId] || game.players[playerId].eliminated) return 'Jugador no válido';
  if (vote !== 'yes' && vote !== 'no') return 'Voto no válido';
  session.votes[playerId] = vote;
  return null;
}

/** Peso del voto: los países que controla cada uno (mínimo 1). */
export function voteWeights(game) {
  const weights = {};
  for (const c of Object.values(game.countries)) if (c.owner) weights[c.owner] = (weights[c.owner] ?? 0) + 1;
  return weights;
}

function closeSession(game, now) {
  const un = game.world;
  const session = un.session;
  un.session = null;
  const weights = voteWeights(game);
  let yes = 0;
  let no = 0;
  for (const [pid, v] of Object.entries(session.votes)) {
    if (!game.players[pid] || game.players[pid].eliminated) continue;
    const wgt = Math.max(1, weights[pid] ?? 0);
    if (v === 'yes') yes += wgt;
    else no += wgt;
  }
  const passed = yes > no;
  if (passed) {
    if (session.type === 'sanctions' && game.players[session.target]) {
      un.sanctions[session.target] = now + SANCTION_MS / game.speed;
    } else if (session.type === 'ceasefire' && game.players[session.a] && game.players[session.b]) {
      setRelation(game, session.a, session.b, 'nap', now + NAP_DURATION_MS);
      game.proposals = game.proposals.filter((p) => pairKey(p.from, p.to) !== pairKey(session.a, session.b));
    } else if (session.type === 'aid' && game.players[session.target]) {
      addResources(game.players[session.target].resources, { money: 150, food: 60, oil: 40, industry: 40 });
    } else if (session.type === 'nukeBan') {
      un.nukeBanUntil = now + NUKE_BAN_MS / game.speed;
    }
  }
  const spec = UN_RESOLUTIONS[session.type];
  const news = addNews(game, {
    ts: now, kind: 'un', icon: '🇺🇳',
    headline: passed ? 'LA ONU APRUEBA UNA RESOLUCIÓN' : 'LA ONU RECHAZA UNA RESOLUCIÓN',
    text: `${spec.title}: ${passed ? 'aprobada' : 'rechazada'} (${yes} votos a favor, ${no} en contra).`,
    vars: { target: session.target, a: session.a, b: session.b },
  });
  return { type: 'un-result', session, passed, yes, no, news };
}
