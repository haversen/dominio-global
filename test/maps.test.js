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
