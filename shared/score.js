// Puntuación y condiciones de victoria, compartidas por servidor y cliente.

export const VICTORY_REASONS = {
  domination: 'por dominación mundial',
  lastStanding: 'por ser el último en pie',
  time: 'por puntuación al acabar el tiempo',
  space: 'con la victoria científica: ¡ha llegado a la Luna!',
  mission: 'al cumplir su misión secreta',
  defeat: 'Las fuerzas neutrales han derrotado a todos los jugadores',
};

/**
 * Puntuación de un jugador. Valora territorio, desarrollo, tecnología, ejército y economía,
 * para que tanto la vía militar como la pacífica puedan ganar por tiempo.
 */
export function scoreOf({ areaPct, countries, development, techLevels, units, resources }) {
  return Math.round(
    areaPct * 10
    + countries * 5
    + development * 10
    + techLevels * 25
    + units
    + resources / 20,
  );
}
