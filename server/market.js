// Mercado de materiales de una partida: bolsa con precios dinámicos y tablón de ofertas entre jugadores.

import { RESOURCES, RESOURCE_INFO } from '../shared/economy.js';
import {
  MARKET_GOODS, BASE_PRICES, MARKET_FEE, SAMPLE_MS, HISTORY_SIZE, OFFER_TTL_MS, MAX_OFFERS_PER_PLAYER,
  MAX_OFFER_AMOUNT, quote, tradeError, recoverPrice,
} from '../shared/market.js';
import { leaderBonus } from '../shared/leaders.js';
import { relationOf } from './diplomacy.js';

export function createMarket(now) {
  return {
    prices: { ...BASE_PRICES },
    history: Object.fromEntries(MARKET_GOODS.map((g) => [g, [BASE_PRICES[g]]])),
    offers: [],   // [{ id, from, give: {resource, amount}, want: {resource, amount}, expiresAt }]
    nextSample: now + SAMPLE_MS,
  };
}

const activePlayer = (game, pid) => {
  const p = game.players[pid];
  return p && !p.eliminated ? p : null;
};

/** Compra o venta en la bolsa. Devuelve { error } o { total, price }. */
export function trade(game, playerId, good, side, amount) {
  if (game.phase !== 'active') return { error: 'La partida todavía no está en marcha' };
  const player = activePlayer(game, playerId);
  if (!player) return { error: 'Jugador no válido' };
  const error = tradeError(good, side, amount);
  if (error) return { error };

  const fee = leaderBonus(player.president).noMarketFee ? 0 : MARKET_FEE;
  const { total, after } = quote(good, game.market.prices[good], side, amount, fee);
  if (side === 'buy') {
    if (player.resources.money < total) return { error: 'No tienes dinero suficiente' };
    player.resources.money -= total;
    player.resources[good] += amount;
  } else {
    if (player.resources[good] < amount) return { error: `No tienes tanto: ${RESOURCE_INFO[good].label.toLowerCase()}` };
    player.resources[good] -= amount;
    player.resources.money += total;
  }
  game.market.prices[good] = after;
  return { total, price: after };
}

function parseSide(raw) {
  const resource = raw?.resource;
  const amount = raw?.amount;
  if (!RESOURCES.includes(resource)) return null;
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_OFFER_AMOUNT) return null;
  return { resource, amount };
}

/** Publica una oferta: los materiales ofrecidos quedan reservados hasta que alguien la acepte. */
export function postOffer(game, playerId, rawGive, rawWant, now = Date.now()) {
  if (game.phase !== 'active') return { error: 'La partida todavía no está en marcha' };
  const player = activePlayer(game, playerId);
  if (!player) return { error: 'Jugador no válido' };
  const give = parseSide(rawGive);
  const want = parseSide(rawWant);
  if (!give || !want) return { error: `Las cantidades deben ser de 1 a ${MAX_OFFER_AMOUNT}` };
  if (give.resource === want.resource) return { error: 'Ofrece y pide materiales distintos' };
  if (game.market.offers.filter((o) => o.from === playerId).length >= MAX_OFFERS_PER_PLAYER) {
    return { error: `Puedes tener como mucho ${MAX_OFFERS_PER_PLAYER} ofertas a la vez` };
  }
  if (player.resources[give.resource] < give.amount) return { error: 'No tienes tanto para ofrecer' };

  player.resources[give.resource] -= give.amount;
  const offer = { id: ++game.seq, from: playerId, give, want, expiresAt: now + OFFER_TTL_MS };
  game.market.offers.push(offer);
  return { offer };
}

export function acceptOffer(game, playerId, offerId) {
  if (game.phase !== 'active') return { error: 'La partida todavía no está en marcha' };
  const player = activePlayer(game, playerId);
  if (!player) return { error: 'Jugador no válido' };
  const offer = game.market.offers.find((o) => o.id === offerId);
  if (!offer) return { error: 'Esa oferta ya no está disponible' };
  if (offer.from === playerId) return { error: 'No puedes aceptar tu propia oferta' };
  if (relationOf(game.relations, playerId, offer.from).state === 'war') {
    return { error: 'No se puede comerciar con un jugador con el que estás en guerra' };
  }
  if (player.resources[offer.want.resource] < offer.want.amount) return { error: 'No tienes lo que pide la oferta' };

  const seller = game.players[offer.from];
  player.resources[offer.want.resource] -= offer.want.amount;
  player.resources[offer.give.resource] += offer.give.amount;
  seller.resources[offer.want.resource] += offer.want.amount;
  game.market.offers = game.market.offers.filter((o) => o !== offer);
  return { offer };
}

export function cancelOffer(game, playerId, offerId) {
  const offer = game.market.offers.find((o) => o.id === offerId);
  if (!offer || offer.from !== playerId) return { error: 'Esa oferta ya no está disponible' };
  refund(game, offer);
  game.market.offers = game.market.offers.filter((o) => o !== offer);
  return {};
}

function refund(game, offer) {
  const seller = game.players[offer.from];
  if (seller) seller.resources[offer.give.resource] += offer.give.amount;
}

/** Recupera precios, guarda el historial y retira ofertas caducadas. Devuelve true si cambió algo. */
export function tickMarket(game, now) {
  const market = game.market;
  if (!market) return false;
  let changed = false;
  const expired = market.offers.filter((o) => o.expiresAt <= now);
  if (expired.length) {
    for (const o of expired) refund(game, o);
    market.offers = market.offers.filter((o) => o.expiresAt > now);
    changed = true;
  }
  if (now >= market.nextSample) {
    // Si el servidor estuvo dormido mucho tiempo no hace falta recuperar muestra a muestra.
    market.nextSample = Math.max(market.nextSample + SAMPLE_MS, now);
    for (const g of MARKET_GOODS) {
      market.prices[g] = recoverPrice(g, market.prices[g]);
      market.history[g].push(Math.round(market.prices[g] * 100) / 100);
      if (market.history[g].length > HISTORY_SIZE) market.history[g].shift();
    }
    changed = true;
  }
  return changed;
}

/** Un jugador se va o es eliminado: sus ofertas desaparecen (devolviendo lo reservado si sigue). */
export function forgetOffers(game, playerId) {
  if (!game.market) return;
  for (const o of game.market.offers) if (o.from === playerId) refund(game, o);
  game.market.offers = game.market.offers.filter((o) => o.from !== playerId);
}

export function publicMarket(market) {
  if (!market) return null;
  return {
    prices: Object.fromEntries(MARKET_GOODS.map((g) => [g, Math.round(market.prices[g] * 1000) / 1000])),
    history: market.history,
    offers: market.offers,
  };
}
