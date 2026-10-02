// Épocas históricas: un mapa de otra época cambia el nombre, el icono y la velocidad de las tropas,
// las armas, los materiales, los edificios y el árbol tecnológico. Las reglas del combate son las mismas.

import { UNITS, WEAPONS } from './military.js';
import { RESOURCE_INFO } from './economy.js';
import { STRATEGIC } from './strategic.js';
import { BUILDINGS } from './buildings.js';
import { TREE_BRANCHES, DOCTRINE_BRANCH, TECH_TREE, TECHS } from './tech.js';
import { WORLD_EVENTS, UN_RESOLUTIONS, MISSIONS } from './world.js';

export const ERAS = {
  greece: {
    label: 'Antigua Grecia',
    // Las velocidades de la época están en shared/military.js (ERA_SPEEDS).
    units: {
      infantry: { label: 'Hoplitas', icon: '🛡️' },
      mech: { label: 'Falange macedonia', icon: '🔱' },
      specops: { label: 'Espartanos de élite', icon: '⚔️' },
      tank: { label: 'Caballería', icon: '🐎' },
      heavytank: { label: 'Carros de guerra', icon: '🛞' },
      mbt: { label: 'Elefantes de guerra', icon: '🐘' },
      aircraft: { label: 'Arqueros', icon: '🏹' },
      bomber: { label: 'Catapultas', icon: '🪨' },
      jet: { label: 'Balistas', icon: '🎯' },
      navy: { label: 'Trirremes', icon: '⛵' },
      submarine: { label: 'Birremes de abordaje', icon: '🚣' },
      carrier: { label: 'Quinquerremes', icon: '🚢' },
    },
    // En la Antigüedad no hay bomba nuclear ni carrera espacial.
    weapons: {
      bombing: { label: 'Flechas incendiarias', icon: '🔥' },
      missile: { label: 'Fuego griego', icon: '🌋' },
    },
    noWeapons: ['nuke'],
    noSpace: true,
    resources: {
      money: { label: 'Dracmas', short: 'Dracm.', icon: '🪙' },
      food: { label: 'Trigo', short: 'Trigo', icon: '🌾' },
      oil: { label: 'Aceite de oliva', short: 'Aceite', icon: '🫒' },
      industry: { label: 'Bronce', short: 'Bronce', icon: '🔨' },
    },
    strategic: {
      rubber: { label: 'Madera', icon: '🪵' },
      rareEarths: { label: 'Hierro', icon: '⛏️' },
      uranium: { label: 'Nafta', icon: '🧪' },
    },
    buildings: {
      factory: { label: 'Taller de bronce', icon: '🔨', desc: '+6 🔨 bronce por minuto y nivel' },
      oilwell: { label: 'Olivar', icon: '🫒', desc: '+5 🫒 aceite por minuto y nivel' },
      farm: { label: 'Campos de trigo', icon: '🌾', desc: '+6 🌾 trigo por minuto y nivel' },
      bank: { label: 'Tesoro', icon: '🏛️', desc: '+8 🪙 dracmas por minuto y nivel' },
      barracks: { label: 'Gimnasio', icon: '🤼', desc: 'Las tropas se entrenan un 20 % más rápido por nivel' },
      bunker: { label: 'Murallas', icon: '🧱', desc: '+15 % de defensa del país por nivel' },
    },
    branches: {
      infantry: { label: 'Infantería', icon: '🛡️' },
      armor: { label: 'Caballería', icon: '🐎' },
      air: { label: 'Arqueros y asedio', icon: '🏹' },
      naval: { label: 'Flota', icon: '⛵' },
      bombs: { label: 'Fuego', icon: '🔥' },
      doctrine: { label: 'Saber', icon: '📜' },
    },
    tree: {
      infA: { label: 'Entrenamiento espartano', icon: '🎯' },
      infB: { label: 'Levas ciudadanas', icon: '⏱' },
      infC: { label: 'Escudos de bronce', icon: '🛡' },
      armA: { label: 'Corazas para caballos', icon: '🛡', desc: '+15 % de defensa de la caballería' },
      armB: { label: 'Herraduras', icon: '🧲', desc: 'La caballería avanza un 25 % más rápido' },
      armC: { label: 'Lanzas de hierro', icon: '🎯', desc: '+20 % de ataque de la caballería' },
      airA: { label: 'Vigías en las torres', icon: '🗼', desc: 'Tus defensas interceptan un 50 % más de proyectiles' },
      airB: { label: 'Arqueros veteranos', icon: '🎖', desc: '+15 % de ataque de arqueros y asedio' },
      airC: { label: 'Arcos compuestos', icon: '🏹', desc: 'Arqueros y asedio avanzan un 30 % más rápido' },
      seaA: { label: 'Remeros expertos', icon: '🚣' },
      seaB: { label: 'Desembarco de hoplitas', icon: '⛵' },
      seaC: { label: 'Espolón de bronce', icon: '🔱' },
      bombA: { label: 'Brea y azufre', icon: '💥', desc: 'Tus ataques de fuego destruyen un 10 % más de tropas' },
      bombB: { label: 'Muro de escudos', icon: '🛡', desc: 'Tus defensas interceptan un 50 % más de proyectiles' },
    },
    // Eventos del Diario Global con sabor de la época (mismos efectos).
    events: {
      oilCrisis: { icon: '🫒', headline: 'PLAGA EN LOS OLIVARES', text: 'Una plaga arrasa los olivares: la producción de aceite cae a la mitad y su precio se dispara.' },
      harvest: { icon: '🌾', headline: 'DEMÉTER BENDICE LOS CAMPOS', text: 'Un año perfecto llena los graneros: la producción de trigo sube un 50 %.' },
      boom: { icon: '⚖️', headline: 'AUGE DEL COMERCIO', text: 'Las rutas del Egeo rebosan de mercantes: todos ganan un 25 % más de dracmas.' },
      pandemic: { icon: '🦠', headline: 'LA PESTE', text: 'Una plaga se extiende por los campamentos: entrenar tropas tarda un 50 % más.' },
      storms: { icon: '🌊', headline: 'LA IRA DE POSEIDÓN', text: 'Tormentas en el Egeo: las flotas tardan un 50 % más en llegar.' },
      earthquake: { icon: '🌋', headline: 'TERREMOTO DEVASTADOR', text: 'Un gran terremoto derrumba templos y murallas en {country}.' },
      coup: { icon: '🗡️', headline: 'UN TIRANO TOMA EL PODER', text: 'Un tirano se hace con el poder en {country}: el pueblo se levanta.' },
      breakthrough: { icon: '📜', headline: 'LOS FILÓSOFOS ILUMINAN', text: 'Los sabios de {player} logran un avance: sus investigaciones en curso se aceleran.' },
      goldRush: { icon: '🪙', headline: 'VETA DE PLATA', text: 'Descubren una veta de plata en {country}: {player} recibe 150 dracmas.' },
    },
    resolutions: {
      aid: { text: 'Si se aprueba, {target} recibe 150 🪙, 60 🌾, 40 🫒 y 40 🔨 del tesoro común.' },
    },
    missions: {
      strategist: { text: 'Controla países con nafta, hierro y madera' },
      tycoon: { text: 'Acumula 2.500 dracmas a la vez' },
    },
    doctrines: {
      economy: { label: 'Comercio', icon: '⚖️' },
      military: { label: 'Estrategia', icon: '⚔' },
      defense: { label: 'Fortificaciones', icon: '🧱' },
      logistics: { label: 'Calzadas', icon: '🛤️' },
    },
  },
};

export const weaponAllowed = (weapon, era) => !ERAS[era]?.noWeapons?.includes(weapon);
export const spaceAllowed = (era) => !ERAS[era]?.noSpace;

/** Nombre de una unidad o arma en una época (para los mensajes del servidor). */
export const unitLabel = (type, era) => ERAS[era]?.units?.[type]?.label ?? UNITS[type].label;
export const weaponLabel = (weapon, era) => ERAS[era]?.weapons?.[weapon]?.label ?? WEAPONS[weapon].label;
export const weaponIcon = (weapon, era) => ERAS[era]?.weapons?.[weapon]?.icon ?? WEAPONS[weapon].icon;
/** Evento mundial con los textos de la época. */
export const eventSpec = (type, era) => ({ ...WORLD_EVENTS[type], ...(ERAS[era]?.events?.[type] ?? {}) });
/** Recurso estratégico con el nombre de la época. */
export const strategicSpec = (type, era) => ({ ...STRATEGIC[type], ...(ERAS[era]?.strategic?.[type] ?? {}) });

// ---------- Cliente: cambia los textos de toda la interfaz a la época de la partida ----------

const TARGETS = () => [
  ['units', UNITS], ['weapons', WEAPONS], ['resources', RESOURCE_INFO], ['strategic', STRATEGIC],
  ['buildings', BUILDINGS], ['tree', TECH_TREE], ['doctrines', TECHS],
  ['events', WORLD_EVENTS], ['resolutions', UN_RESOLUTIONS], ['missions', MISSIONS],
  ['branches', Object.fromEntries([...TREE_BRANCHES, DOCTRINE_BRANCH].map((b) => [b.id, b]))],
];
const DISPLAY_KEYS = ['label', 'short', 'icon', 'desc', 'headline', 'text', 'title'];
let originals = null;
let current = null;

/**
 * Solo en el navegador (una partida a la vez): reescribe nombres e iconos de las tablas compartidas.
 * applyEra(null) devuelve los nombres de siempre. Las velocidades no se tocan: las da unitSpeed() de military.js.
 */
export function applyEra(era) {
  era = ERAS[era] ? era : null;
  if (era === current) return false;
  if (!originals) {
    originals = TARGETS().map(([key, table]) => [key, table, Object.fromEntries(Object.entries(table)
      .map(([id, item]) => [id, Object.fromEntries(DISPLAY_KEYS.filter((k) => k in item).map((k) => [k, item[k]]))]))]);
  }
  for (const [key, table, saved] of originals) {
    for (const [id, values] of Object.entries(saved)) Object.assign(table[id], values);
    if (!era) continue;
    for (const [id, values] of Object.entries(ERAS[era][key] ?? {})) {
      if (table[id]) Object.assign(table[id], Object.fromEntries(DISPLAY_KEYS.filter((k) => k in values).map((k) => [k, values[k]])));
    }
  }
  current = era;
  return true;
}

export const currentEra = () => current;
