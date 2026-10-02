// Tutorial de la primera partida: una ficha con pasos que señala cada parte de la pantalla.

import { $, h } from './dom.js';

const DONE_KEY = 'dg.tutorialDone';

const STEPS = [
  {
    title: '🎖️ Bienvenido, comandante',
    text: 'Tu país está marcado con ★ en el mapa (el botón ★ te lleva a él). Tócalo para abrir su panel con todo lo que puedes hacer.',
    target: '#btn-zoom-home',
  },
  {
    title: '🪖 Recluta tropas',
    text: 'En el panel de tu país escribe cuántas tropas quieres y pulsa «Reclutar», o usa «Max» para entrenar todas las que puedas pagar. Los lotes grandes tardan más.',
    target: '.recruit-list',
  },
  {
    title: '⚔ Ataca a tus vecinos',
    text: 'En «Enviar tropas» elige cuántas unidades mandar y pulsa un país vecino. Las tropas tardan en llegar según la distancia real. Con barcos llegas a cualquier costa del mundo.',
    target: '.targets',
  },
  {
    title: '🏗️ Construye tu economía',
    text: 'En «Construcciones» levanta fábricas, granjas, bancos o búnkeres. Desarrollar el país te da más espacio para construir.',
    target: '.build-grid',
  },
  {
    title: '🔬 Investiga',
    text: 'Abre ☰ Menú → 🔬 Tecnología. Cada rama del árbol investiga a la vez: tropas nuevas, bombas y la carrera espacial.',
    target: '#btn-game-menu',
  },
  {
    title: '🤝 Diplomacia y 🌐 Mundo',
    text: 'En ☰ Menú están 🤝 Diplomacia (alianzas y mensajes), 📈 Mercado (comercio y préstamos) y 🌐 Mundo (noticias, la ONU y tu misión secreta).',
    target: '#btn-game-menu',
  },
  {
    title: '★ ¡Protege tu capital!',
    text: 'Si te conquistan la capital, quedas eliminado. En ☰ Menú puedes activar 🔔 los avisos al móvil para saber cuándo te atacan. ¡Suerte!',
    target: '#btn-game-menu',
  },
];

let step = -1;
let card = null;

function clearHighlight() {
  for (const el of document.querySelectorAll('.tutorial-highlight')) el.classList.remove('tutorial-highlight');
}

function show() {
  clearHighlight();
  const s = STEPS[step];
  if (!s) return finish();
  for (const el of document.querySelectorAll(s.target)) el.classList.add('tutorial-highlight');
  const last = step === STEPS.length - 1;
  card.replaceChildren(
    h('div', { class: 'tutorial-head' },
      h('strong', {}, s.title),
      h('small', { class: 'muted' }, `${step + 1} / ${STEPS.length}`)),
    h('p', {}, s.text),
    h('div', { class: 'tutorial-actions' },
      !last && h('button', { class: 'btn btn-ghost btn-xs', onClick: finish }, 'Saltar'),
      h('button', { class: 'btn btn-primary btn-xs', onClick: () => { step += 1; show(); } }, last ? '¡A jugar!' : 'Siguiente →')));
  card.classList.remove('hidden');
}

function finish() {
  clearHighlight();
  step = -1;
  card?.classList.add('hidden');
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch { /* sin almacenamiento */ }
}

export function startTutorial() {
  card ??= $('#tutorial');
  step = 0;
  show();
}

/** Se muestra solo la primera vez que se juega. */
export function maybeStartTutorial() {
  try {
    if (localStorage.getItem(DONE_KEY)) return;
  } catch {
    return;
  }
  if (step === -1) startTutorial();
}

/** Vuelve a marcar los elementos (el panel se redibuja a menudo). */
export function refreshTutorialHighlight() {
  if (step < 0 || !STEPS[step]) return;
  for (const el of document.querySelectorAll(STEPS[step].target)) el.classList.add('tutorial-highlight');
}
