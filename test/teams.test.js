import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../server/rooms.js';
import { createGame, checkEnd, PICK_DURATION_MS, tickGame } from '../server/game.js';
import { declareWar } from '../server/diplomacy.js';
import { relationOf } from '../shared/diplomacy.js';
import { assignTeams, teamCount, teamName } from '../shared/teams.js';

const tok = (n) => n.toString(16).padStart(32, '0');

test('equipos: se reparten llenando primero los más vacíos y respetan las plazas', () => {
  const settings = { teams: 'pairs', maxPlayers: 6 };
  assert.equal(teamCount(settings), 3);
  const out = assignTeams(settings, [{ id: 'a', team: 1 }, { id: 'b', team: 1 }, { id: 'c', team: 1 }, { id: 'd' }, { id: 'e' }]);
  assert.equal(out.a, 1);
  assert.equal(out.b, 1);
  assert.notEqual(out.c, 1, 'el equipo 1 ya tenía 2');
  assert.equal(Object.values(out).filter((t) => t === 1).length, 2);
  assert.match(teamName({ teams: 'sides', mapScenario: 'ww2' }, 1), /Eje/);
  assert.match(teamName({ teams: 'sides', mapScenario: 'ww2' }, 2), /Aliados/);
});

test('equipos en la sala: se elige equipo, los compañeros empiezan aliados y no pueden atacarse', () => {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(tok(1), 'Alemania');
  rm.attachSocket(tok(1), 's1');
  rm.updateSettings(room, host, { teams: 'pairs', maxPlayers: 4, mapScenario: 'ww2' });
  const names = ['Italia', 'Francia', 'Reino Unido'];
  const players = names.map((n, i) => {
    const { player } = rm.joinRoom(tok(i + 2), n, room.code);
    rm.attachSocket(tok(i + 2), `s${i + 2}`);
    rm.setReady(room, player, true);
    return player;
  });
  const [ita, fra, gbr] = players;
  rm.setProfile(room, host, { team: 1, country: 'DEU' });
  rm.setProfile(room, ita, { team: 1, country: 'ITA' });
  assert.throws(() => rm.setProfile(room, fra, { team: 1 }), { code: 'TAKEN' });
  rm.setProfile(room, fra, { team: 2, country: 'FRA' });
  rm.setProfile(room, gbr, { team: 2, country: 'GBR' });
  rm.start(room, host);

  const game = room.game;
  assert.equal(game.teams[host.id], 1);
  assert.equal(game.teams[gbr.id], 2);
  assert.equal(relationOf(game.relations, host.id, ita.id).state, 'alliance');
  assert.equal(relationOf(game.relations, fra.id, gbr.id).state, 'alliance');
  assert.equal(relationOf(game.relations, host.id, fra.id).state, 'peace');
  tickGame(game, [...room.players.keys()], (game.pickDeadline ?? Date.now()) + 1);
  assert.match(declareWar(game, host.id, ita.id).error, /mismo equipo/);
  assert.equal(declareWar(game, host.id, fra.id).error, undefined);

  // Si caen Francia y Reino Unido, gana el equipo entero (aunque Italia no haya hecho nada).
  game.victory = { lastStanding: true };
  game.players[fra.id].eliminated = true;
  game.players[gbr.id].eliminated = true;
  const result = checkEnd(game);
  assert.equal(result.team, 1);
  assert.deepEqual([...result.winners].sort(), [host.id, ita.id].sort());
});

test('equipos: no se puede empezar con todos en el mismo equipo; los bots rellenan el otro', () => {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(tok(10), 'Uno');
  rm.attachSocket(tok(10), 's10');
  rm.updateSettings(room, host, { teams: 'sides', maxPlayers: 4 });
  const { player: dos } = rm.joinRoom(tok(11), 'Dos', room.code);
  rm.attachSocket(tok(11), 's11');
  rm.setReady(room, dos, true);
  rm.setProfile(room, host, { team: 1 });
  rm.setProfile(room, dos, { team: 1 });
  assert.throws(() => rm.start(room, host), { code: 'NOT_READY' });
  assert.equal(room.players.size, 2);
  rm.updateSettings(room, host, { bots: 2 });
  rm.setReady(room, dos, true);
  rm.start(room, host);
  const teams = room.game.teams;
  assert.equal(Object.values(teams).filter((t) => t === 2).length, 2, 'los dos bots van al bando vacío');
});

test('equipos: victoria por dominación sumando los países de los compañeros', async () => {
  const { currentStandings, COUNTRIES } = await import('../server/game.js');
  const game = createGame({ countryAssignment: 'random', teams: 'pairs', maxPlayers: 4, winDomination: true, dominationPercent: 30 },
    ['a', 'b', 'c', 'd'], { now: 0, profiles: { a: { team: 1 }, b: { team: 1 }, c: { team: 2 }, d: { team: 2 } } });
  game.victory = { domination: 30 };
  // a y b se reparten países alternando hasta sumar algo más del 30 % entre los dos.
  const ids = Object.keys(game.countries).filter((id) => !id.includes('_')).sort((x, y) => COUNTRIES.get(y).area - COUNTRIES.get(x).area);
  let turn = 0;
  for (const id of ids) {
    const row = (pid) => currentStandings(game).find((r) => r.id === pid).areaPct;
    if (row('a') + row('b') >= 31) break;
    if (Object.values(game.homes).includes(id)) continue;
    game.countries[id].owner = turn++ % 2 ? 'a' : 'b';
  }
  const table = currentStandings(game);
  assert.ok(table.find((r) => r.id === 'a').areaPct < 30 && table.find((r) => r.id === 'b').areaPct < 30, 'ninguno llega solo');
  const result = checkEnd(game);
  assert.equal(result?.team, 1);
  assert.ok(result.winners.includes('a') && result.winners.includes('b'));
});

test('dos bandos en la Segunda Guerra Mundial: el Eje recibe países del Eje y los Aliados, aliados', () => {
  for (let i = 0; i < 5; i++) {
    const game = createGame({ countryAssignment: 'random', teams: 'sides', maxPlayers: 4, mapScenario: 'ww2' },
      ['a', 'b', 'c', 'd'], { profiles: { a: { team: 1 }, b: { team: 1 }, c: { team: 2 }, d: { team: 2 } } });
    for (const pid of ['a', 'b']) assert.ok(['DEU', 'ITA', 'JPN', 'HUN', 'ROU', 'FIN'].includes(game.homes[pid]), game.homes[pid]);
    for (const pid of ['c', 'd']) assert.ok(['GBR', 'FRA', 'USA', 'RUS', 'CHN', 'CAN', 'AUS', 'POL'].includes(game.homes[pid]), game.homes[pid]);
  }
});

test('equipos: no hay alianzas con el equipo contrario', async () => {
  const { propose } = await import('../server/diplomacy.js');
  const game = createGame({ teams: 'pairs', countryAssignment: 'random' }, ['a', 'b', 'c', 'd'], {
    now: 0, profiles: { a: { team: 1 }, b: { team: 1 }, c: { team: 2 }, d: { team: 2 } },
  });
  tickGame(game, ['a', 'b', 'c', 'd'], PICK_DURATION_MS);
  assert.match(propose(game, 'a', 'c', 'alliance', null, PICK_DURATION_MS).error, /equipos contrarios/);
  assert.equal(propose(game, 'a', 'c', 'nap', null, PICK_DURATION_MS).error, undefined, 'un pacto sí se puede');
});
