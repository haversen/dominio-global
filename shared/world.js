// Eventos mundiales, Naciones Unidas, misiones secretas y carrera espacial (datos para servidor y cliente).

// ---------- Eventos mundiales ----------
// duration: minutos de juego que dura el efecto (0 = instantáneo).
export const WORLD_EVENTS = {
  oilCrisis: {
    icon: '🛢️', duration: 4, headline: 'CRISIS DEL PETRÓLEO',
    text: 'Los pozos de medio mundo se paralizan: la producción de petróleo cae a la mitad y su precio se dispara.',
    income: { oil: 0.5 },
  },
  harvest: {
    icon: '🌾', duration: 4, headline: 'COSECHA HISTÓRICA',
    text: 'Un clima perfecto llena los graneros: la producción de alimentos sube un 50 %.',
    income: { food: 1.5 },
  },
  boom: {
    icon: '📈', duration: 4, headline: 'BOOM ECONÓMICO MUNDIAL',
    text: 'Las bolsas baten récords: todos los países ganan un 25 % más de dinero.',
    income: { money: 1.25 },
  },
  pandemic: {
    icon: '🦠', duration: 3, headline: 'PANDEMIA GLOBAL',
    text: 'Un virus se extiende por los cuarteles: entrenar tropas tarda un 50 % más.',
    train: 1.5,
  },
  storms: {
    icon: '🌀', duration: 4, headline: 'TEMPORADA DE HURACANES',
    text: 'Tormentas en todos los océanos: las flotas tardan un 50 % más en llegar.',
    sea: 1.5,
  },
  earthquake: {
    icon: '🌋', duration: 0, headline: 'TERREMOTO DEVASTADOR',
    text: 'Un gran terremoto destruye infraestructuras en {country}.',
  },
  coup: {
    icon: '🎖️', duration: 0, headline: 'GOLPE DE ESTADO',
    text: 'Los militares toman el poder en {country}: la población está en las calles.',
  },
  breakthrough: {
    icon: '🔬', duration: 0, headline: 'AVANCE CIENTÍFICO',
    text: 'Los laboratorios de {player} logran un avance: sus investigaciones en curso se aceleran.',
  },
  goldRush: {
    icon: '💰', duration: 0, headline: 'FIEBRE DEL ORO',
    text: 'Descubren un enorme yacimiento de oro en {country}: {player} recibe 150 de dinero.',
  },
};
export const WORLD_EVENT_IDS = Object.keys(WORLD_EVENTS);
export const EVENT_EVERY_MS = 5 * 60_000; // a velocidad normal
export const FIRST_EVENT_MS = 3 * 60_000;

// ---------- Naciones Unidas ----------
export const UN_RESOLUTIONS = {
  sanctions: {
    icon: '🚫', title: 'Sanciones contra {target}',
    text: 'Si se aprueba, {target} no podrá usar el mercado y sus ingresos bajarán un 20 % durante 5 minutos.',
  },
  ceasefire: {
    icon: '🕊️', title: 'Alto el fuego entre {a} y {b}',
    text: 'Si se aprueba, {a} y {b} firman la paz con un pacto de no agresión obligatorio.',
  },
  aid: {
    icon: '🤲', title: 'Ayuda humanitaria para {target}',
    text: 'Si se aprueba, {target} recibe 150 💰, 60 🌾, 40 🛢️ y 40 🏭 del fondo internacional.',
  },
  nukeBan: {
    icon: '☢️', title: 'Prohibición de armas nucleares',
    text: 'Si se aprueba, nadie podrá lanzar bombas nucleares durante 8 minutos.',
  },
};
export const UN_EVERY_MS = 8 * 60_000;     // a velocidad normal
export const UN_FIRST_MS = 6 * 60_000;
export const UN_VOTE_MS = 90_000;          // tiempo para votar (tiempo real)
export const SANCTION_MS = 5 * 60_000;
export const NUKE_BAN_MS = 8 * 60_000;

// ---------- Misiones secretas ----------
export const MISSIONS = {
  continent: { icon: '🗺️', text: 'Controla al menos la mitad de los países de {region}' },
  builder: { icon: '🏗️', text: 'Ten 12 niveles de edificios en total' },
  developer: { icon: '🏙️', text: 'Ten 3 países con desarrollo de nivel 4 o más' },
  hunter: { icon: '🎯', text: 'Que {target} quede eliminado (y tú sigas en pie)' },
  admiral: { icon: '⚓', text: 'Controla 8 países con costa y ten 10 barcos' },
  spymaster: { icon: '🕵️', text: 'Completa con éxito 5 misiones de espionaje' },
  tycoon: { icon: '💰', text: 'Acumula 2.500 de dinero a la vez' },
  strategist: { icon: '💎', text: 'Controla países con uranio, tierras raras y caucho' },
};
export const MISSION_BONUS = 250; // puntos por cumplirla

// ---------- Carrera espacial ----------
export const SPACE_STAGES = [
  {
    id: 'satellite', icon: '🛰️', label: 'Satélite espía', ms: 120_000,
    cost: { money: 400, industry: 200, oil: 80 }, requires: ['air2', 'bomb2'],
    effect: 'Ves todo el mapa: la niebla de guerra desaparece para ti',
  },
  {
    id: 'station', icon: '🏗️', label: 'Estación espacial', ms: 180_000,
    cost: { money: 700, industry: 350, oil: 150 }, requires: [],
    effect: 'Todas tus investigaciones son un 20 % más rápidas',
  },
  {
    id: 'moon', icon: '🌕', label: 'Llegada a la Luna', ms: 240_000,
    cost: { money: 1200, industry: 600, oil: 250 }, requires: [], minCountries: 6,
    effect: 'Victoria científica (si está activada) o +500 puntos',
  },
];
export const SPACE_BONUS = [0, 150, 300, 500];

export const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');
