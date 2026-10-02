// Logros (medallas) de las cuentas y puntuación de la clasificación global.

export const ACHIEVEMENTS = {
  recruit: { icon: '🎖️', label: 'Recluta', desc: 'Termina tu primera partida' },
  veteran: { icon: '🪖', label: 'Veterano', desc: 'Termina 10 partidas' },
  firstWin: { icon: '🏆', label: 'Primera victoria', desc: 'Gana una partida' },
  champion: { icon: '👑', label: 'Campeón', desc: 'Gana 5 partidas' },
  conqueror: { icon: '⚔️', label: 'Conquistador', desc: 'Conquista 15 países en una partida' },
  survivor: { icon: '🛡️', label: 'Superviviente', desc: 'Llega al final sin ser eliminado en una partida de 3 o más' },
  nuke: { icon: '☢️', label: 'Destructor de mundos', desc: 'Lanza una bomba nuclear' },
  spy: { icon: '🕵️', label: 'Agente secreto', desc: 'Completa 5 misiones de espionaje en una partida' },
  astronaut: { icon: '🌕', label: 'Pequeño paso', desc: 'Llega a la Luna' },
  mission: { icon: '🎯', label: 'Agenda oculta', desc: 'Cumple tu misión secreta' },
  pacifist: { icon: '🕊️', label: 'Pacifista', desc: 'Gana sin conquistar ningún país de otro jugador' },
  builder: { icon: '🏗️', label: 'Arquitecto', desc: 'Ten 15 niveles de edificios a la vez' },
};
export const ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENTS);
export const START_RATING = 1000;

/**
 * Cambio de puntuación al acabar una partida.
 * place: 1 = ganador; players: número de jugadores (bots incluidos).
 */
export function ratingChange({ won, place, players, eliminated }) {
  if (won) return 25 + 5 * Math.max(0, players - 2);
  if (eliminated) return -12;
  // Por la mitad de arriba se gana algo; por la de abajo se pierde algo.
  const middle = (players + 1) / 2;
  return Math.round((middle - place) * 6);
}
