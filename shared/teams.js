// Partidas por equipos: los compañeros empiezan aliados, no pueden atacarse y ganan juntos.

export const TEAM_MODES = {
  none: { label: 'Todos contra todos' },
  pairs: { label: 'Equipos de 2', size: 2 },
  trios: { label: 'Equipos de 3', size: 3 },
  sides: { label: 'Dos bandos' },
};
export const TEAM_MODE_IDS = Object.keys(TEAM_MODES);

export const TEAM_ICONS = ['🟥', '🟦', '🟩', '🟨', '🟪', '🟧', '⬜', '🟫'];

// En los mapas históricos, los dos bandos llevan su nombre de la época.
const SIDE_NAMES = {
  ww1: ['Potencias Centrales', 'Entente'],
  ww2: ['Eje', 'Aliados'],
  pacific: ['Imperio del Japón', 'Aliados'],
  coldwar: ['Pacto de Varsovia', 'OTAN'],
  greece: ['Liga del Peloponeso', 'Liga de Delos'],
  sengoku: ['Ejército del Oeste', 'Ejército del Este'],
  rome: ['Imperio romano', 'Partos y bárbaros'],
};

// Países históricos de cada bando: quien no elija país recibe uno de los suyos.
const SIDE_COUNTRIES = {
  ww1: [['DEU', 'AUT', 'TUR', 'BGR'], ['FRA', 'GBR', 'RUS', 'ITA', 'SRB', 'BEL']],
  ww2: [['DEU', 'ITA', 'JPN', 'HUN', 'ROU', 'FIN'], ['GBR', 'FRA', 'USA', 'RUS', 'CHN', 'CAN', 'AUS', 'POL']],
  pacific: [['JPN', 'THA'], ['USA', 'CHN', 'AUS', 'IND', 'NZL', 'PHL']],
  coldwar: [['RUS', 'POL', 'CUB', 'VNM', 'PRK', 'ROU', 'HUN'], ['USA', 'GBR', 'FRA', 'DEU', 'ITA', 'CAN', 'TUR', 'KOR']],
  greece: [['G_ESP', 'G_COR', 'G_TEB', 'G_ELI', 'G_ACA', 'G_MES', 'G_ARC'], ['G_ATE', 'G_EUB', 'G_LES', 'G_SAM', 'G_CIC', 'G_ROD', 'G_ARG', 'G_COC']],
  sengoku: [['J_MOR', 'J_UKI', 'J_SHI', 'J_CHO', 'J_ASA', 'J_AZA', 'J_OTO'], ['J_TOK', 'J_DAT', 'J_ODA', 'J_HOJ', 'J_MOG', 'J_SAT', 'J_IMA']],
  rome: [['R_ROM', 'R_BIZ', 'R_ALE', 'R_CAR', 'R_ANT', 'R_LUG', 'R_LON', 'R_ATE', 'R_EFE', 'R_SAR'],
    ['R_CTE', 'R_PRS', 'R_ECB', 'R_HEC', 'R_ARM', 'R_BAC', 'R_MAR', 'R_GOT', 'R_SAM', 'R_CAL']],
};

/** Países del bando `team` en ese mapa (solo en «Dos bandos»). */
export const sideCountries = (mode, scenario, team) => (mode === 'sides' ? SIDE_COUNTRIES[scenario]?.[team - 1] ?? [] : []);

export const hasTeams = (settings) => TEAM_MODES[settings?.teams] && settings.teams !== 'none';

/** Cuántos equipos hay en la sala según el modo y el máximo de jugadores. */
export function teamCount(settings) {
  if (!hasTeams(settings)) return 0;
  const { size } = TEAM_MODES[settings.teams];
  return size ? Math.max(2, Math.ceil(settings.maxPlayers / size)) : 2;
}

/** Plazas de cada equipo. */
export function teamCapacity(settings) {
  const { size } = TEAM_MODES[settings.teams] ?? {};
  return size ?? Math.ceil(settings.maxPlayers / 2);
}

/** Nombre de un equipo (1, 2, ...) en el mapa elegido. */
export function teamName(settings, team, scenario = settings?.mapScenario) {
  const sides = settings?.teams === 'sides' && SIDE_NAMES[scenario];
  const name = sides ? sides[team - 1] : settings?.teams === 'sides' ? ['Bando Rojo', 'Bando Azul'][team - 1] : `Equipo ${team}`;
  return `${TEAM_ICONS[(team - 1) % TEAM_ICONS.length]} ${name}`;
}

/**
 * Reparte en equipos a quien no tenga (jugadores sin elegir y bots), llenando primero los más vacíos.
 * players: [{ id, team }]. Devuelve un mapa id -> equipo.
 */
export function assignTeams(settings, players) {
  const count = teamCount(settings);
  const capacity = teamCapacity(settings);
  const out = {};
  const size = Array(count + 1).fill(0);
  for (const p of players) {
    if (p.team >= 1 && p.team <= count && size[p.team] < capacity) {
      out[p.id] = p.team;
      size[p.team]++;
    }
  }
  for (const p of players) {
    if (out[p.id]) continue;
    let best = 1;
    for (let t = 2; t <= count; t++) if (size[t] < size[best]) best = t;
    out[p.id] = best;
    size[best]++;
  }
  return out;
}

/** ¿Son del mismo equipo? */
export const sameTeam = (teams, a, b) => Boolean(teams && a !== b && teams[a] && teams[a] === teams[b]);
