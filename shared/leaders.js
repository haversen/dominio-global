// Perfil de cada jugador antes de la partida: avatar y presidente (con su ventaja).

export const AVATARS = [
  '🪖', '🎖️', '🦅', '🐻', '🦁', '🐺', '🐉', '🦊',
  '🐯', '🦈', '🛡️', '⚓', '✈️', '🚀', '👑', '💀',
  '🌟', '🔥', '⚡', '🌍',
];
export const DEFAULT_AVATAR = AVATARS[0];

// Presidentes ficticios. Cada uno da una ventaja distinta durante toda la partida.
export const PRESIDENTS = {
  economist: {
    name: 'Elena Marquina', title: 'La Economista', portrait: '👩‍💼',
    perk: '+15 % de ingresos de todos los recursos',
  },
  general: {
    name: 'Gral. Bruno Stahl', title: 'El General', portrait: '🎖️',
    perk: '+12 % de ataque en todas las batallas',
  },
  marshal: {
    name: 'Mariscal Olga Varga', title: 'La Defensora', portrait: '💂',
    perk: '+15 % de defensa en tus países',
  },
  scientist: {
    name: 'Dra. Amara Okafor', title: 'La Científica', portrait: '👩‍🔬',
    perk: 'Investigación un 30 % más rápida',
  },
  merchant: {
    name: 'Rafael Costa', title: 'El Mercader', portrait: '🤵',
    perk: 'Compra y vende en la bolsa sin comisión',
  },
  industrialist: {
    name: 'Hana Kobayashi', title: 'La Industrial', portrait: '👷‍♀️',
    perk: 'Tropas y desarrollo un 15 % más baratos',
  },
};
export const PRESIDENT_IDS = Object.keys(PRESIDENTS);
export const DEFAULT_PRESIDENT = 'economist';

/** Multiplicadores que aplica cada presidente (1 = sin efecto). */
export function leaderBonus(presidentId) {
  return {
    income: presidentId === 'economist' ? 1.15 : 1,
    attack: presidentId === 'general' ? 1.12 : 1,
    defense: presidentId === 'marshal' ? 1.15 : 1,
    researchMs: presidentId === 'scientist' ? 0.7 : 1,
    noMarketFee: presidentId === 'merchant',
    cost: presidentId === 'industrialist' ? 0.85 : 1,
  };
}

/** Aplica un multiplicador a un coste, redondeando hacia arriba. */
export function discountCost(cost, factor) {
  if (factor === 1) return { ...cost };
  return Object.fromEntries(Object.entries(cost).map(([r, v]) => [r, Math.ceil(v * factor)]));
}
