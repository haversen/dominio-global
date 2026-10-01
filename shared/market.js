// Mercado de materiales, compartido por servidor y cliente.
//   · Bolsa: se compran y venden alimentos, petróleo e industria a cambio de dinero.
//     El precio sube cuando se compra y baja cuando se vende, y vuelve poco a poco a su valor base.
//   · Ofertas: un jugador publica «doy X a cambio de Y» y cualquier otro puede aceptarla.

export const MARKET_GOODS = ['food', 'oil', 'industry'];
export const BASE_PRICES = { food: 1, oil: 2, industry: 2 }; // dinero por unidad
export const MARKET_FEE = 0.1;           // comisión de la bolsa (10 %)
export const PRICE_IMPACT = 0.003;       // cada unidad comprada sube el precio un 0,3 %
export const PRICE_MIN = 0.25;           // límites respecto al precio base
export const PRICE_MAX = 5;
export const PRICE_RECOVERY = 0.1;       // fracción que vuelve hacia el precio base en cada muestra
export const SAMPLE_MS = 10_000;         // cada cuánto se registra el precio (y se recupera)
export const HISTORY_SIZE = 30;
export const MAX_TRADE = 500;

export const OFFER_TTL_MS = 10 * 60_000;
export const MAX_OFFERS_PER_PLAYER = 3;
export const MAX_OFFER_AMOUNT = 2000;

const clamp = (good, price) => Math.min(BASE_PRICES[good] * PRICE_MAX, Math.max(BASE_PRICES[good] * PRICE_MIN, price));

/**
 * Cuánto cuesta (compra) o cuánto se cobra (venta) por `amount` unidades al precio actual.
 * Se paga el precio medio entre el actual y el que queda después, más la comisión.
 */
export function quote(good, price, side, amount, fee = MARKET_FEE) {
  const after = clamp(good, side === 'buy'
    ? price * (1 + PRICE_IMPACT * amount)
    : price / (1 + PRICE_IMPACT * amount));
  const avg = (price + after) / 2;
  const total = side === 'buy'
    ? Math.ceil(amount * avg * (1 + fee))
    : Math.floor(amount * avg * (1 - fee));
  return { total, after };
}

/** Error de validación de una orden de bolsa, o null. */
export function tradeError(good, side, amount) {
  if (!MARKET_GOODS.includes(good)) return 'Ese material no se vende en la bolsa';
  if (side !== 'buy' && side !== 'sell') return 'Operación desconocida';
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_TRADE) return `Puedes operar de 1 a ${MAX_TRADE} unidades`;
  return null;
}

export function recoverPrice(good, price) {
  const base = BASE_PRICES[good];
  const next = price + (base - price) * PRICE_RECOVERY;
  return Math.abs(next - base) < 0.005 ? base : next;
}

export { clamp as clampPrice };
