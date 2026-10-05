import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, COUNTRIES, createGame, moveArmy, launchStrike, currentStandings } from '../server/game.js';
import { RoomManager } from '../server/rooms.js';
import { SCENARIOS, inScenario } from '../shared/scenarios.js';
import { travelMs, distanceKm, emptyUnits, TROOP_PACES } from '../shared/military.js';

const tok = (n) => n.toString(16).padStart(32, '0');

test('mapas: todos existen, están conectados y sus protagonistas forman parte del mapa', () => {
  for (const [id, sc] of Object.entries(SCENARIOS)) {
    const ids = sc.countries ?? WORLD.countries.map((c) => c.id).filter((c) => inScenario(id, c));
    for (const c of ids) assert.ok(COUNTRIES.has(c), `${id}: ${c} no existe`);
    const set = new Set(ids);
    const seen = new Set([ids[0]]);
    const queue = [ids[0]];
    while (queue.length) {
      for (const n of COUNTRIES.get(queue.shift()).neighbors) {
        if (set.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
      }
    }
    assert.equal(seen.size, set.size, `${id}: hay países inalcanzables`);
    for (const f of sc.featured ?? []) assert.ok(set.has(f), `${id}: ${f} no está en el mapa`);
  }
});

test('mapa de Europa: solo se juega en Europa y la dominación se mide sobre Europa', () => {
  const game = createGame({ countryAssignment: 'random', mapScenario: 'europe' }, ['a', 'b'], { now: 0 });
  for (const home of Object.values(game.homes)) assert.ok(inScenario('europe', home), `${home} fuera de Europa`);
  assert.equal(game.countries.CHN.units.infantry, 0, 'los países de fuera quedan vacíos');

  // Desde Rusia no se puede entrar en China (fuera del mapa).
  game.countries.RUS.owner = 'a';
  game.countries.RUS.units = { ...emptyUnits(), infantry: 5 };
  assert.match(moveArmy(game, 'a', 'RUS', 'CHN', { infantry: 1 }).error, /mapa/);
  game.players.a.unlocked.push('bomb1');
  assert.match(launchStrike(game, 'a', 'bombing', 'KAZ').error, /mapa/);

  // Rusia cuenta solo su parte europea: no basta para dominar el mapa.
  const row = currentStandings(game).find((r) => r.id === 'a');
  assert.ok(row.areaPct > 20 && row.areaPct < 50, `Rusia europea = ${row.areaPct} %`);
});

test('escenarios históricos: reparten a los protagonistas y permiten empezar como vecinos', () => {
  const game = createGame({ countryAssignment: 'random', mapScenario: 'ww1' }, ['a', 'b', 'c'], { now: 0 });
  for (const home of Object.values(game.homes)) assert.ok(SCENARIOS.ww1.featured.includes(home), home);

  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(tok(1), 'Káiser');
  const { player: guest } = rm.joinRoom(tok(2), 'Mariscal', room.code);
  rm.updateSettings(room, host, { mapScenario: 'ww1' });
  rm.setProfile(room, host, { country: 'DEU' });
  rm.setProfile(room, guest, { country: 'FRA' }); // vecinos: permitido en la Gran Guerra
  assert.throws(() => rm.setProfile(room, guest, { country: 'CHN' }), { code: 'INVALID' });

  // Al cambiar a un mapa donde ese país no está, la elección se olvida.
  rm.updateSettings(room, host, { mapScenario: 'asia' });
  assert.equal(host.country, null);
  assert.equal(guest.country, null);
});

test('movimiento real: distancias en km y velocidades en km/h, con varios ritmos', () => {
  const esp = COUNTRIES.get('ESP');
  const fra = COUNTRIES.get('FRA');
  const km = distanceKm(esp, fra);
  assert.ok(km > 600 && km < 1300, `España-Francia ${km} km`);

  const infantry = { ...emptyUnits(), infantry: 1 };
  const jets = { ...emptyUnits(), jet: 1 };
  const realHours = travelMs(esp, fra, infantry, 1) / 3_600_000;
  assert.ok(realHours > 24 && realHours < 70, `a pie tarda ${realHours} h, como en la vida real`);
  assert.ok(travelMs(esp, fra, jets, 1) < travelMs(esp, fra, infantry, 1) / 10, 'los aviones son mucho más rápidos');

  const fast = travelMs(esp, fra, infantry, TROOP_PACES.fast.scale);
  assert.ok(Math.abs(fast - travelMs(esp, fra, infantry, 1) / TROOP_PACES.fast.scale) < 2, 'el ritmo escala el tiempo');

  const realistic = createGame({ countryAssignment: 'random', troopPace: 'realistic' }, ['a'], { now: 0 });
  const quick = createGame({ countryAssignment: 'random', troopPace: 'arcade' }, ['a'], { now: 0 });
  for (const g of [realistic, quick]) {
    g.countries.ESP.owner = 'a';
    g.countries.ESP.units = { ...emptyUnits(), infantry: 5 };
    g.relations = {};
  }
  const slowArmy = moveArmy(realistic, 'a', 'ESP', 'FRA', infantry, 0).army;
  const quickArmy = moveArmy(quick, 'a', 'ESP', 'FRA', infantry, 0).army;
  assert.ok(slowArmy.arriveAt > 24 * 3_600_000, 'realista: más de un día');
  assert.ok(quickArmy.arriveAt < 60_000, 'arcade: menos de un minuto');
});

test('mapa de la antigua Grecia: polis propias que solo se juegan en ese mapa', () => {
  const game = createGame({ countryAssignment: 'random', mapScenario: 'greece' }, ['a', 'b', 'c'], { now: 0 });
  for (const home of Object.values(game.homes)) assert.ok(SCENARIOS.greece.featured.includes(home), home);
  assert.ok(!inScenario('greece', 'GRC'), 'la Grecia actual no se juega');
  assert.ok(!inScenario('world', 'G_ATE') && !inScenario('ww2', 'G_ESP'), 'Atenas no aparece en los mapas actuales');
  const atenas = COUNTRIES.get('G_ATE');
  assert.ok(atenas.neighbors.includes('G_TEB') && atenas.coastal);
  assert.ok(COUNTRIES.get('G_CRE').coastal, 'Creta es una isla');
  for (const id of SCENARIOS.greece.countries) {
    for (const n of COUNTRIES.get(id).neighbors) assert.ok(inScenario('greece', n), `${id} linda con ${n}`);
  }
  const world = createGame({ countryAssignment: 'random', mapScenario: 'world' }, ['a', 'b', 'c', 'd'], { now: 0 });
  for (const home of Object.values(world.homes)) assert.ok(!home.startsWith('G_'), home);
});

test('antigua Grecia: tropas de la época, sin bomba nuclear ni carrera espacial', async () => {
  const { applyEra } = await import('../shared/eras.js');
  const { UNITS, WEAPONS, moveError } = await import('../shared/military.js');
  const { researchSpace, researchNode } = await import('../server/game.js');
  const atenas = COUNTRIES.get('G_ATE');
  const tebas = COUNTRIES.get('G_TEB');
  const hoplitas = { ...emptyUnits(), infantry: 1 };
  const hours = travelMs(atenas, tebas, hoplitas, 1) / 3_600_000;
  assert.ok(hours > 5 && hours < 30, `de Atenas a Tebas a pie: ${hours} h`);
  assert.ok(travelMs(atenas, tebas, { ...emptyUnits(), tank: 1 }, 1) < travelMs(atenas, tebas, hoplitas, 1), 'la caballería es más rápida');

  // Los arqueros no vuelan: para cruzar a Eubea hace falta barco.
  const eubea = COUNTRIES.get('G_EUB');
  assert.ok(atenas.sea.includes('G_EUB'));
  assert.match(moveError(atenas, eubea, { ...emptyUnits(), aircraft: 2 }), /barco/);
  assert.equal(moveError(atenas, eubea, { ...emptyUnits(), aircraft: 2, navy: 1 }), null);

  const game = createGame({ countryAssignment: 'random', mapScenario: 'greece', winSpace: true }, ['a', 'b'], { now: 0 });
  game.phase = 'active';
  assert.equal(game.victory.space, false);
  assert.match(researchSpace(game, 'a', 0), /época/);
  game.players.a.unlocked.push('bomb1', 'bomb2', 'air2');
  game.players.a.resources = { money: 9999, food: 9999, oil: 9999, industry: 9999 };
  assert.match(researchNode(game, 'a', 'bomb3', 0), /época/);
  assert.match(launchStrike(game, 'a', 'nuke', 'G_TEB', 0).error, /época/);

  // En el navegador los nombres cambian a los de la época y vuelven al salir.
  applyEra('greece');
  assert.equal(UNITS.infantry.label, 'Hoplitas');
  assert.equal(WEAPONS.bombing.label, 'Flechas incendiarias');
  applyEra(null);
  assert.equal(UNITS.infantry.label, 'Infantería');
  assert.equal(UNITS.infantry.speed, 20, 'las velocidades no se tocan');
});

test('la victoria científica solo existe en la Guerra Fría', async () => {
  const { applySettingsPatch, defaultSettings } = await import('../shared/settings.js');
  assert.equal(createGame({ countryAssignment: 'random', mapScenario: 'coldwar', winSpace: true }, ['a'], { now: 0 }).victory.space, true);
  for (const map of ['world', 'ww2', 'europe']) {
    assert.equal(createGame({ countryAssignment: 'random', mapScenario: map, winSpace: true }, ['a'], { now: 0 }).victory.space, false, map);
  }
  const onlySpace = { winDomination: false, winLastStanding: false, winTimeLimit: false, winMission: false, winSpace: true };
  const base = { ...defaultSettings(), mapScenario: 'world' };
  assert.ok(applySettingsPatch(base, onlySpace).error, 'fuera de la Guerra Fría no cuenta como victoria');
  assert.equal(applySettingsPatch({ ...base, mapScenario: 'coldwar' }, onlySpace).error, undefined);
});

test('mapa samurái: clanes, Joseon y Ming, con tropas de la época', async () => {
  const { applyEra } = await import('../shared/eras.js');
  const { UNITS } = await import('../shared/military.js');
  const game = createGame({ countryAssignment: 'random', mapScenario: 'sengoku' }, ['a', 'b', 'c', 'd'], { now: 0 });
  for (const home of Object.values(game.homes)) assert.ok(SCENARIOS.sengoku.featured.includes(home), home);
  assert.ok(!inScenario('sengoku', 'JPN') && !inScenario('world', 'J_ODA'));
  assert.ok(COUNTRIES.get('J_ODA').neighbors.includes('J_TOK'), 'Oda linda con Tokugawa');
  assert.ok(COUNTRIES.get('J_SOO').neighbors.includes('J_GYE'), 'Tsushima conecta Japón con Corea');
  for (const id of SCENARIOS.sengoku.countries) {
    for (const n of COUNTRIES.get(id).neighbors) assert.ok(inScenario('sengoku', n), `${id} linda con ${n}`);
  }
  // China cuenta poco para la dominación aunque sea enorme.
  game.countries.J_JUR.owner = 'a';
  assert.ok(currentStandings(game).find((r) => r.id === 'a').areaPct < 15);
  assert.match(launchStrike(game, 'a', 'nuke', 'J_ODA', 0).error, /época|marcha/);
  applyEra('sengoku');
  assert.equal(UNITS.specops.label, 'Ninjas');
  applyEra(null);
});

test('mapa del Imperio romano: de Roma a Persia, con tropas de la época', async () => {
  const { applyEra, unInfo } = await import('../shared/eras.js');
  const { UNITS } = await import('../shared/military.js');
  const { sideCountries } = await import('../shared/teams.js');
  const game = createGame({ countryAssignment: 'random', mapScenario: 'rome' }, ['a', 'b', 'c', 'd'], { now: 0 });
  for (const home of Object.values(game.homes)) assert.ok(SCENARIOS.rome.featured.includes(home), home);
  assert.ok(!inScenario('rome', 'ITA') && !inScenario('rome', 'G_ATE') && !inScenario('world', 'R_ROM'));
  for (const id of SCENARIOS.rome.countries) {
    for (const n of COUNTRIES.get(id).neighbors) assert.ok(inScenario('rome', n), `${id} linda con ${n}`);
  }
  assert.ok(COUNTRIES.get('R_ROM').neighbors.includes('R_CAP'), 'Roma linda con Capua');
  assert.ok(COUNTRIES.get('R_BIZ').neighbors.includes('R_FIL'), 'Bizancio linda con Filipópolis');
  assert.ok(COUNTRIES.get('R_SIR').sea.includes('R_REG'), 'el estrecho de Mesina se cruza en barco');
  assert.ok(!inScenario('rome', 'ESP') && !inScenario('rome', 'EGY'), 'ni Hispania ni Egipto están en el mapa');
  // Por las calzadas, de Roma a Capua se tarda menos de dos días a pie.
  const legion = { ...emptyUnits(), infantry: 1 };
  const hours = travelMs(COUNTRIES.get('R_ROM'), COUNTRIES.get('R_CAP'), legion, 1) / 3_600_000;
  assert.ok(hours > 5 && hours < 48, `de Roma a Capua: ${hours} h`);
  // Las enormes regiones de Persia no cuentan como media Europa para la dominación.
  game.countries.R_CRM.owner = 'a';
  assert.ok(currentStandings(game).find((r) => r.id === 'a').areaPct < 5);
  assert.match(launchStrike(game, 'a', 'nuke', 'R_ROM', 0).error, /época|marcha/);
  assert.deepEqual(sideCountries('sides', 'rome', 1).filter((id) => !inScenario('rome', id)), []);
  assert.deepEqual(sideCountries('sides', 'rome', 2).filter((id) => !inScenario('rome', id)), []);
  assert.match(unInfo('rome').name, /Senado/);
  applyEra('rome');
  assert.equal(UNITS.infantry.label, 'Legionarios');
  assert.equal(UNITS.carrier.label, 'Quinquerremes');
  applyEra(null);
});

test('mapa vikingo: Kattegat, Hedeby, Wessex y los demás, con tropas de la época', async () => {
  const { applyEra, unInfo } = await import('../shared/eras.js');
  const { UNITS } = await import('../shared/military.js');
  const { sideCountries } = await import('../shared/teams.js');
  const game = createGame({ countryAssignment: 'random', mapScenario: 'vikings' }, ['a', 'b', 'c', 'd'], { now: 0 });
  for (const home of Object.values(game.homes)) assert.ok(SCENARIOS.vikings.featured.includes(home), home);
  assert.ok(!inScenario('vikings', 'NOR') && !inScenario('vikings', 'R_ROM') && !inScenario('world', 'V_KAT'));
  for (const id of SCENARIOS.vikings.countries) {
    for (const n of COUNTRIES.get(id).neighbors) assert.ok(inScenario('vikings', n), `${id} linda con ${n}`);
  }
  assert.ok(COUNTRIES.get('V_KAT').coastal && COUNTRIES.get('V_KAT').neighbors.includes('V_ROG'), 'Kattegat, en los fiordos de Noruega');
  assert.ok(COUNTRIES.get('V_VEN').neighbors.includes('V_ARO'), 'Vendsyssel, al norte de Jutlandia');
  assert.ok(COUNTRIES.get('V_KEN').sea.includes('V_FLA'), 'de Kent a Flandes se cruza en barco');
  assert.ok(COUNTRIES.get('V_WES').neighbors.includes('V_MER'), 'Wessex linda con Mercia');
  // Por mar se va mucho más rápido que a pie: un drakkar llega antes que los guerreros andando.
  const kat = COUNTRIES.get('V_KAT');
  const wes = COUNTRIES.get('V_WES');
  assert.ok(travelMs(kat, wes, { ...emptyUnits(), infantry: 5, carrier: 1 }, 1) < travelMs(kat, COUNTRIES.get('V_HED'), { ...emptyUnits(), infantry: 5 }, 1) * 3);
  game.countries.V_SAP.owner = 'a';
  assert.ok(currentStandings(game).find((r) => r.id === 'a').areaPct < 5, 'las tierras de los samis no cuentan como medio mapa');
  assert.match(launchStrike(game, 'a', 'nuke', 'V_KAT', 0).error, /época|marcha/);
  for (const team of [1, 2]) assert.deepEqual(sideCountries('sides', 'vikings', team).filter((id) => !inScenario('vikings', id)), []);
  assert.match(unInfo('vikings').name, /Thing/);
  applyEra('vikings');
  assert.equal(UNITS.specops.label, 'Berserkers');
  assert.equal(UNITS.carrier.label, 'Drakkars');
  applyEra(null);
});

test('la ONU tiene el nombre de su época', async () => {
  const { unInfo } = await import('../shared/eras.js');
  assert.equal(unInfo(null).the, 'la ONU');
  assert.match(unInfo('greece').name, /Anfictiónica/);
  assert.match(unInfo('sengoku').name, /Corte Imperial/);
});

test('mapa de Europa: Rusia es solo su parte europea (hasta los Urales)', async () => {
  const { countriesFor } = await import('../server/game.js');
  const europe = countriesFor({ scenario: 'europe' }).get('RUS');
  const world = countriesFor({ scenario: 'world' }).get('RUS');
  assert.ok(europe.lon < 60 && europe.lon > 30, `centro en la Rusia europea (${europe.lon})`);
  assert.ok(world.lon > 80, 'en el mapa del mundo sigue siendo Rusia entera');
  assert.ok(WORLD.variants.europe.RUS.d.length < world.d.length, 'el contorno está recortado');
  assert.ok(WORLD.variants.europe.RUS.rest, 'el resto de Rusia se dibuja fuera del mapa');
  // De Rusia a Ucrania se tarda lo normal entre vecinos, no lo que se tardaría desde Siberia.
  const ukr = COUNTRIES.get('UKR');
  assert.ok(distanceKm(europe, ukr) < 1500, `${distanceKm(europe, ukr)} km`);
  assert.ok(distanceKm(world, ukr) > 3000);
});

test('los mapas históricos van en archivos aparte: el navegador solo baja el que se juega', async () => {
  const { readFileSync } = await import('node:fs');
  const { HISTORIC_MAPS } = await import('../shared/ancient.js');
  const base = JSON.parse(readFileSync(new URL('../shared/world.json', import.meta.url), 'utf8'));
  assert.ok(base.countries.every((c) => !c.era), 'shared/world.json solo trae los países actuales');
  for (const era of Object.keys(HISTORIC_MAPS)) {
    const { countries } = JSON.parse(readFileSync(new URL(`../shared/maps/${era}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(countries.map((c) => c.id).sort(), HISTORIC_MAPS[era].regions.map((r) => r.id).sort(), era);
    // El servidor las carga todas.
    for (const c of countries) assert.equal(COUNTRIES.get(c.id)?.era, era);
  }
});
