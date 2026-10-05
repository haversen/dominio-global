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
    // La asamblea de la época ocupa el lugar de la ONU.
    un: { name: 'Liga Anfictiónica', the: 'la Anfictionía', icon: '🏛️' },
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
  sengoku: {
    label: 'Japón samurái',
    units: {
      infantry: { label: 'Ashigaru', icon: '🎌' },
      mech: { label: 'Samuráis', icon: '⚔️' },
      specops: { label: 'Ninjas', icon: '🥷' },
      tank: { label: 'Caballería samurái', icon: '🐎' },
      heavytank: { label: 'Jinetes con lanza', icon: '🏇' },
      mbt: { label: 'Guardia del daimyō', icon: '👹' },
      aircraft: { label: 'Arqueros (yumi)', icon: '🏹' },
      bomber: { label: 'Arcabuceros (teppō)', icon: '🔫' },
      jet: { label: 'Cañones', icon: '🧨' },
      navy: { label: 'Kobaya', icon: '⛵' },
      submarine: { label: 'Sekibune', icon: '🚣' },
      carrier: { label: 'Atakebune', icon: '🚢' },
    },
    weapons: {
      bombing: { label: 'Flechas de fuego', icon: '🔥' },
      missile: { label: 'Hōroku (granadas)', icon: '💣' },
    },
    noWeapons: ['nuke'],
    noSpace: true,
    un: { name: 'Corte Imperial de Kioto', the: 'la Corte Imperial', icon: '⛩️' },
    resources: {
      money: { label: 'Mon', short: 'Mon', icon: '🪙' },
      food: { label: 'Arroz', short: 'Arroz', icon: '🍚' },
      oil: { label: 'Pólvora', short: 'Pólv.', icon: '🧨' },
      industry: { label: 'Acero', short: 'Acero', icon: '⚒️' },
    },
    strategic: {
      rubber: { label: 'Madera', icon: '🪵' },
      rareEarths: { label: 'Plata', icon: '🥈' },
      uranium: { label: 'Azufre', icon: '🌋' },
    },
    buildings: {
      factory: { label: 'Forja', icon: '⚒️', desc: '+6 ⚒️ acero por minuto y nivel' },
      oilwell: { label: 'Taller de pólvora', icon: '🧨', desc: '+5 🧨 pólvora por minuto y nivel' },
      farm: { label: 'Arrozales', icon: '🍚', desc: '+6 🍚 arroz por minuto y nivel' },
      bank: { label: 'Mercado', icon: '🏮', desc: '+8 🪙 mon por minuto y nivel' },
      barracks: { label: 'Dojo', icon: '🥋', desc: 'Las tropas se entrenan un 20 % más rápido por nivel' },
      bunker: { label: 'Castillo', icon: '🏯', desc: '+15 % de defensa del país por nivel' },
    },
    branches: {
      infantry: { label: 'Infantería', icon: '🎌' },
      armor: { label: 'Caballería', icon: '🐎' },
      air: { label: 'Arcos y arcabuces', icon: '🏹' },
      naval: { label: 'Flota', icon: '⛵' },
      bombs: { label: 'Fuego', icon: '🔥' },
      doctrine: { label: 'Bushidō', icon: '📜' },
    },
    tree: {
      infA: { label: 'Disciplina samurái', icon: '🎯' },
      infB: { label: 'Levas de campesinos', icon: '⏱' },
      infC: { label: 'Armadura lacada', icon: '🛡' },
      armA: { label: 'Bardas para caballos', icon: '🛡', desc: '+15 % de defensa de la caballería' },
      armB: { label: 'Caballos de Kai', icon: '🐴', desc: 'La caballería avanza un 25 % más rápido' },
      armC: { label: 'Cargas de caballería', icon: '🎯', desc: '+20 % de ataque de la caballería' },
      airA: { label: 'Torres de vigía', icon: '🗼', desc: 'Tus defensas interceptan un 50 % más de proyectiles' },
      airB: { label: 'Fuego por descargas', icon: '🎖', desc: '+15 % de ataque de arcos y arcabuces' },
      airC: { label: 'Arcabuces portugueses', icon: '🔫', desc: 'Arcos y arcabuces avanzan un 30 % más rápido' },
      seaA: { label: 'Remeros expertos', icon: '🚣' },
      seaB: { label: 'Desembarco samurái', icon: '⛵' },
      seaC: { label: 'Barcos acorazados', icon: '🔱' },
      bombA: { label: 'Brea y azufre', icon: '💥', desc: 'Tus ataques de fuego destruyen un 10 % más de tropas' },
      bombB: { label: 'Muros de escudos', icon: '🛡', desc: 'Tus defensas interceptan un 50 % más de proyectiles' },
    },
    events: {
      oilCrisis: { icon: '🧨', headline: 'ESCASEZ DE PÓLVORA', text: 'Los barcos portugueses no llegan: la producción de pólvora cae a la mitad y su precio se dispara.' },
      harvest: { icon: '🍚', headline: 'COSECHA DE ARROZ HISTÓRICA', text: 'Las lluvias llegan a tiempo: la producción de arroz sube un 50 %.' },
      boom: { icon: '⚖️', headline: 'AUGE DEL COMERCIO NANBAN', text: 'Llegan los barcos negros cargados de mercancías: todos ganan un 25 % más de mon.' },
      pandemic: { icon: '🦠', headline: 'EPIDEMIA DE VIRUELA', text: 'La enfermedad se extiende por los campamentos: entrenar tropas tarda un 50 % más.' },
      storms: { icon: '🌀', headline: 'KAMIKAZE: EL VIENTO DIVINO', text: 'Tifones en todos los mares: las flotas tardan un 50 % más en llegar.' },
      earthquake: { icon: '🌋', headline: 'TERREMOTO DEVASTADOR', text: 'Un gran terremoto derrumba templos y castillos en {country}.' },
      coup: { icon: '🗡️', headline: 'GEKOKUJŌ: TRAICIÓN', text: 'Un vasallo se rebela contra su señor en {country}: el pueblo se levanta.' },
      breakthrough: { icon: '🔫', headline: 'LLEGAN LOS PORTUGUESES', text: 'Los artesanos de {player} copian sus armas: sus investigaciones en curso se aceleran.' },
      goldRush: { icon: '🥈', headline: 'NUEVA MINA DE PLATA', text: 'Descubren una veta de plata en {country}: {player} recibe 150 mon.' },
    },
    resolutions: {
      aid: { text: 'Si se aprueba, {target} recibe 150 🪙, 60 🍚, 40 🧨 y 40 ⚒️ del tesoro común.' },
    },
    missions: {
      strategist: { text: 'Controla países con azufre, plata y madera' },
      tycoon: { text: 'Acumula 2.500 mon a la vez' },
    },
    doctrines: {
      economy: { label: 'Comercio Nanban', icon: '⚖️' },
      military: { label: 'El arte de la guerra', icon: '⚔' },
      defense: { label: 'Castillos', icon: '🏯' },
      logistics: { label: 'Caminos (Tōkaidō)', icon: '🛤️' },
    },
  },
  rome: {
    label: 'Imperio romano',
    units: {
      infantry: { label: 'Legionarios', icon: '🛡️' },
      mech: { label: 'Cohortes pretorianas', icon: '🦅' },
      specops: { label: 'Speculatores (exploradores)', icon: '🗡️' },
      tank: { label: 'Caballería auxiliar', icon: '🐎' },
      heavytank: { label: 'Catafractos', icon: '🏇' },
      mbt: { label: 'Elefantes de guerra', icon: '🐘' },
      aircraft: { label: 'Sagitarios (arqueros)', icon: '🏹' },
      bomber: { label: 'Onagros', icon: '🪨' },
      jet: { label: 'Escorpiones', icon: '🎯' },
      navy: { label: 'Liburnas', icon: '⛵' },
      submarine: { label: 'Trirremes', icon: '🚣' },
      carrier: { label: 'Quinquerremes', icon: '🚢' },
    },
    weapons: {
      bombing: { label: 'Flechas incendiarias', icon: '🔥' },
      missile: { label: 'Proyectiles de nafta', icon: '🌋' },
    },
    noWeapons: ['nuke'],
    noSpace: true,
    un: { name: 'Senado romano', the: 'el Senado', icon: '🏛️' },
    resources: {
      money: { label: 'Denarios', short: 'Den.', icon: '🪙' },
      food: { label: 'Trigo', short: 'Trigo', icon: '🌾' },
      oil: { label: 'Aceite de oliva', short: 'Aceite', icon: '🫒' },
      industry: { label: 'Hierro', short: 'Hierro', icon: '⚒️' },
    },
    strategic: {
      rubber: { label: 'Madera', icon: '🪵' },
      rareEarths: { label: 'Oro', icon: '🥇' },
      uranium: { label: 'Nafta', icon: '🧪' },
    },
    buildings: {
      factory: { label: 'Fragua', icon: '⚒️', desc: '+6 ⚒️ hierro por minuto y nivel' },
      oilwell: { label: 'Olivar', icon: '🫒', desc: '+5 🫒 aceite por minuto y nivel' },
      farm: { label: 'Latifundio', icon: '🌾', desc: '+6 🌾 trigo por minuto y nivel' },
      bank: { label: 'Erario', icon: '🏛️', desc: '+8 🪙 denarios por minuto y nivel' },
      barracks: { label: 'Castra (campamento)', icon: '⛺', desc: 'Las tropas se entrenan un 20 % más rápido por nivel' },
      bunker: { label: 'Murallas y limes', icon: '🧱', desc: '+15 % de defensa del país por nivel' },
    },
    branches: {
      infantry: { label: 'Legiones', icon: '🛡️' },
      armor: { label: 'Caballería', icon: '🐎' },
      air: { label: 'Arqueros y asedio', icon: '🏹' },
      naval: { label: 'Flota', icon: '⛵' },
      bombs: { label: 'Fuego', icon: '🔥' },
      doctrine: { label: 'Ingeniería', icon: '📐' },
    },
    tree: {
      infA: { label: 'Formación en testudo', icon: '🐢' },
      infB: { label: 'Reformas de Mario', icon: '⏱' },
      infC: { label: 'Lorica segmentata', icon: '🛡' },
      armA: { label: 'Corazas para caballos', icon: '🛡', desc: '+15 % de defensa de la caballería' },
      armB: { label: 'Hiposandalias', icon: '🧲', desc: 'La caballería avanza un 25 % más rápido' },
      armC: { label: 'Lanzas de caballería (contus)', icon: '🎯', desc: '+20 % de ataque de la caballería' },
      airA: { label: 'Torres de vigía del limes', icon: '🗼', desc: 'Tus defensas interceptan un 50 % más de proyectiles' },
      airB: { label: 'Arqueros sirios', icon: '🎖', desc: '+15 % de ataque de arqueros y asedio' },
      airC: { label: 'Arcos compuestos', icon: '🏹', desc: 'Arqueros y asedio avanzan un 30 % más rápido' },
      seaA: { label: 'Remeros expertos', icon: '🚣' },
      seaB: { label: 'Desembarco de legiones', icon: '⛵' },
      seaC: { label: 'Corvus (puente de abordaje)', icon: '🔱' },
      bombA: { label: 'Brea y azufre', icon: '💥', desc: 'Tus ataques de fuego destruyen un 10 % más de tropas' },
      bombB: { label: 'Muro de escudos', icon: '🛡', desc: 'Tus defensas interceptan un 50 % más de proyectiles' },
    },
    events: {
      oilCrisis: { icon: '🫒', headline: 'HELADA EN LOS OLIVARES', text: 'Una helada arrasa los olivares de la Bética: la producción de aceite cae a la mitad y su precio se dispara.' },
      harvest: { icon: '🌾', headline: 'EL NILO SE DESBORDA A TIEMPO', text: 'La crecida del Nilo llena los graneros: la producción de trigo sube un 50 %.' },
      boom: { icon: '⚖️', headline: 'PAX ROMANA', text: 'Las calzadas y el Mare Nostrum rebosan de mercaderes: todos ganan un 25 % más de denarios.' },
      pandemic: { icon: '🦠', headline: 'LA PESTE', text: 'Una plaga se extiende por los campamentos: entrenar tropas tarda un 50 % más.' },
      storms: { icon: '🌊', headline: 'TEMPORAL EN EL MARE NOSTRUM', text: 'Tormentas en todos los mares: las flotas tardan un 50 % más en llegar.' },
      earthquake: { icon: '🌋', headline: 'TERREMOTO DEVASTADOR', text: 'Un gran terremoto derrumba templos y murallas en {country}.' },
      coup: { icon: '🗡️', headline: 'LAS LEGIONES PROCLAMAN UN USURPADOR', text: 'Un general se proclama emperador en {country}: el pueblo se levanta.' },
      breakthrough: { icon: '📐', headline: 'LOS INGENIEROS ASOMBRAN A TODOS', text: 'Los ingenieros de {player} logran un avance: sus investigaciones en curso se aceleran.' },
      goldRush: { icon: '🥇', headline: 'NUEVA MINA DE ORO', text: 'Descubren una veta de oro en {country}: {player} recibe 150 denarios.' },
    },
    resolutions: {
      aid: { text: 'Si se aprueba, {target} recibe 150 🪙, 60 🌾, 40 🫒 y 40 ⚒️ del tesoro común.' },
    },
    missions: {
      strategist: { text: 'Controla países con nafta, oro y madera' },
      tycoon: { text: 'Acumula 2.500 denarios a la vez' },
    },
    doctrines: {
      economy: { label: 'Comercio', icon: '⚖️' },
      military: { label: 'Disciplina legionaria', icon: '⚔' },
      defense: { label: 'Limes', icon: '🧱' },
      logistics: { label: 'Calzadas', icon: '🛤️' },
    },
  },
  vikings: {
    label: 'Era vikinga',
    units: {
      infantry: { label: 'Guerreros', icon: '🪓' },
      mech: { label: 'Muro de escudos', icon: '🛡️' },
      specops: { label: 'Berserkers', icon: '🐻' },
      tank: { label: 'Jinetes', icon: '🐎' },
      heavytank: { label: 'Caballería franca', icon: '🏇' },
      mbt: { label: 'Huscarles', icon: '⚔️' },
      aircraft: { label: 'Arqueros', icon: '🏹' },
      bomber: { label: 'Lanzadores de jabalinas', icon: '🎯' },
      jet: { label: 'Máquinas de asedio', icon: '🪨' },
      navy: { label: 'Karvis', icon: '⛵' },
      submarine: { label: 'Snekkjas', icon: '🚣' },
      carrier: { label: 'Drakkars', icon: '🐉' },
    },
    weapons: {
      bombing: { label: 'Lluvia de flechas', icon: '🏹' },
      missile: { label: 'Saqueo e incendio', icon: '🔥' },
    },
    noWeapons: ['nuke'],
    noSpace: true,
    un: { name: 'Gran Thing', the: 'el Thing', icon: '🪨' },
    resources: {
      money: { label: 'Plata', short: 'Plata', icon: '🪙' },
      food: { label: 'Grano y pescado', short: 'Comida', icon: '🐟' },
      oil: { label: 'Brea', short: 'Brea', icon: '🪣' },
      industry: { label: 'Hierro', short: 'Hierro', icon: '⚒️' },
    },
    strategic: {
      rubber: { label: 'Madera de roble', icon: '🪵' },
      rareEarths: { label: 'Oro', icon: '🥇' },
      uranium: { label: 'Ámbar', icon: '🟠' },
    },
    buildings: {
      factory: { label: 'Herrería', icon: '⚒️', desc: '+6 ⚒️ hierro por minuto y nivel' },
      oilwell: { label: 'Taller de brea', icon: '🪣', desc: '+5 🪣 brea por minuto y nivel' },
      farm: { label: 'Granjas y pesquerías', icon: '🐟', desc: '+6 🐟 comida por minuto y nivel' },
      bank: { label: 'Mercado', icon: '⚖️', desc: '+8 🪙 plata por minuto y nivel' },
      barracks: { label: 'Salón de hidromiel', icon: '🍺', desc: 'Las tropas se entrenan un 20 % más rápido por nivel' },
      bunker: { label: 'Empalizada', icon: '🪵', desc: '+15 % de defensa del país por nivel' },
    },
    branches: {
      infantry: { label: 'Guerreros', icon: '🪓' },
      armor: { label: 'Jinetes', icon: '🐎' },
      air: { label: 'Arqueros y asedio', icon: '🏹' },
      naval: { label: 'Flota', icon: '⛵' },
      bombs: { label: 'Fuego', icon: '🔥' },
      doctrine: { label: 'Sagas', icon: '📜' },
    },
    tree: {
      infA: { label: 'Furia berserker', icon: '🐻' },
      infB: { label: 'Leva del leidang', icon: '⏱' },
      infC: { label: 'Cotas de malla', icon: '🛡' },
      armA: { label: 'Bardas para caballos', icon: '🛡', desc: '+15 % de defensa de los jinetes' },
      armB: { label: 'Caballos de las estepas', icon: '🐴', desc: 'Los jinetes avanzan un 25 % más rápido' },
      armC: { label: 'Lanzas de jinete', icon: '🎯', desc: '+20 % de ataque de los jinetes' },
      airA: { label: 'Vigías en los fiordos', icon: '🗼', desc: 'Tus defensas interceptan un 50 % más de proyectiles' },
      airB: { label: 'Arqueros veteranos', icon: '🎖', desc: '+15 % de ataque de arqueros y asedio' },
      airC: { label: 'Arcos largos de tejo', icon: '🏹', desc: 'Arqueros y asedio avanzan un 30 % más rápido' },
      seaA: { label: 'Remeros expertos', icon: '🚣' },
      seaB: { label: 'Desembarco en la playa', icon: '⛵' },
      seaC: { label: 'Quillas de roble', icon: '🔱' },
      bombA: { label: 'Brea y azufre', icon: '💥', desc: 'Tus ataques de fuego destruyen un 10 % más de tropas' },
      bombB: { label: 'Muro de escudos', icon: '🛡', desc: 'Tus defensas interceptan un 50 % más de proyectiles' },
    },
    events: {
      oilCrisis: { icon: '🪣', headline: 'ESCASEZ DE BREA', text: 'Los bosques de pinos no dan para más: la producción de brea cae a la mitad y su precio se dispara.' },
      harvest: { icon: '🐟', headline: 'BANCOS DE ARENQUE', text: 'Los mares rebosan de arenques y la cosecha es buena: la comida sube un 50 %.' },
      boom: { icon: '⚖️', headline: 'AUGE EN BIRKA Y HEDEBY', text: 'Los mercaderes llegan de Bizancio y del califato: todos ganan un 25 % más de plata.' },
      pandemic: { icon: '🦠', headline: 'FIEBRE EN LOS CAMPAMENTOS', text: 'Una plaga se extiende entre los guerreros: entrenar tropas tarda un 50 % más.' },
      storms: { icon: '🌊', headline: 'LA IRA DE NJORD', text: 'Temporales en el mar del Norte: las flotas tardan un 50 % más en llegar.' },
      earthquake: { icon: '🔥', headline: 'INCENDIO DEVASTADOR', text: 'Un gran incendio arrasa los salones y las empalizadas de {country}.' },
      coup: { icon: '🗡️', headline: 'UN JARL SE REBELA', text: 'Un jarl desafía a su rey en {country}: el pueblo se levanta.' },
      breakthrough: { icon: '🐦', headline: 'LOS CUERVOS DE ODÍN', text: 'Hugin y Munin traen sabiduría a {player}: sus investigaciones en curso se aceleran.' },
      goldRush: { icon: '🪙', headline: 'TESORO DE PLATA', text: 'Desentierran un tesoro de plata en {country}: {player} recibe 150 de plata.' },
    },
    resolutions: {
      aid: { text: 'Si se aprueba, {target} recibe 150 🪙, 60 🐟, 40 🪣 y 40 ⚒️ del tesoro común.' },
    },
    missions: {
      strategist: { text: 'Controla países con ámbar, oro y madera de roble' },
      tycoon: { text: 'Acumula 2.500 de plata a la vez' },
    },
    doctrines: {
      economy: { label: 'Comercio (Birka y Hedeby)', icon: '⚖️' },
      military: { label: 'El arte de la incursión', icon: '⚔' },
      defense: { label: 'Empalizadas', icon: '🪵' },
      logistics: { label: 'Rutas de los ríos', icon: '🛶' },
    },
  },
};

export const weaponAllowed = (weapon, era) => !ERAS[era]?.noWeapons?.includes(weapon);
export const spaceAllowed = (era) => !ERAS[era]?.noSpace;
/** La asamblea de votaciones de la época (la ONU en los mapas modernos). */
export const unInfo = (era) => ERAS[era]?.un ?? { name: 'Naciones Unidas', the: 'la ONU', icon: '🇺🇳' };

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
