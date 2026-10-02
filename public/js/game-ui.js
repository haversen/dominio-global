// Pantalla de partida (tiempo real): mapa, recursos, ejércitos, jugadores y panel del país seleccionado.

import { WorldMap } from './map.js';
import { $, h, toast, guardTaps, durationText, avatarEl } from './dom.js';
import { leaderBonus, discountCost } from '/shared/leaders.js';
import { inScenario, scenarioOf, eraOf } from '/shared/scenarios.js';
import { applyEra, weaponAllowed } from '/shared/eras.js';
import { teamName, TEAM_ICONS } from '/shared/teams.js';
import { STRATEGIC, strategicOf, needOf, hasAccess } from '/shared/strategic.js';
import { SPY_MISSIONS, SPY_MISSION_IDS } from '/shared/espionage.js';
import {
  BUILDINGS, BUILDING_TYPES, MAX_BUILDING_LEVEL, buildingSlots, usedSlots, buildingCost, buildingMs, buildingIncome, trainFactor,
  buildError,
} from '/shared/buildings.js';
import { request } from './net.js';
import {
  RESOURCES, RESOURCE_INFO, MAX_LEVEL, countryIncome, developCost, canAfford,
} from '/shared/economy.js';
import {
  UNITS, UNIT_TYPES, TERRAIN_INFO, terrainOf, totalUnits, moveError, travelMs, emptyUnits, domainCount, isNavalRoute,
  WEAPONS, WEAPON_TYPES, MAX_RECRUIT, BATCH_TIME_STEP,
} from '/shared/military.js';
import { RELATIONS, relationOf } from '/shared/diplomacy.js';
import { techBonus, isUnlocked, treeBonus } from '/shared/tech.js';
import { DiplomacyView, rankingTable, setWorldNames } from './diplomacy-ui.js';
import { VICTORY_REASONS } from '/shared/score.js';
import { play } from './sound.js';
import { startTutorial, maybeStartTutorial, refreshTutorialHighlight } from './tutorial.js';

const NEUTRAL_COLOR = '#8d8c85';
const NEUTRAL_BADGE = '#4a4a45';
const fmt = new Intl.NumberFormat('es-ES');
const fmt1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

let world = null;
let worldPromise = null;

// Como replaceChildren, pero ignorando los hijos condicionales que valen false/null.
const fill = (el, ...children) => el.replaceChildren(...children.filter((c) => c != null && c !== false));

const costText = (cost) => Object.entries(cost)
  .map(([r, v]) => `${fmt.format(v)} ${RESOURCE_INFO[r].icon}`).join(' + ');

// Tiempos de llegada: segundos, minutos, horas o días (las tropas pueden ir al ritmo de la vida real).
const secondsText = (ms) => {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  if (secs < 60) return `${secs} s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const hours = Math.floor(secs / 3600);
  if (hours < 24) return `${hours} h ${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
};

const playable = (game, id) => inScenario(game.scenario, id);
const playableNeighbors = (game, c) => c.neighbors.filter((id) => playable(game, id));

export function loadWorld() {
  worldPromise ??= fetch('/shared/world.json')
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      world = data;
      world.byId = new Map(data.countries.map((c) => [c.id, c]));
      setWorldNames(world);
      return world;
    });
  return worldPromise;
}

export class GameView {
  constructor(getState) {
    this.getState = getState;
    this.map = null;
    this.selected = null;
    this.clockOffset = 0;
    this.centeredHome = false;
    this.lastRoom = null;
    this.lastEventId = null;
    this.shownResources = null;
    this.sendUnits = null; // unidades elegidas para enviar desde el país seleccionado
    this.#buildResourceBar();
    this.diplo = new DiplomacyView({ getCtx: () => this.#ctx(), serverNow: () => this.#serverNow() });
    this.endShownFor = null; // resultado ya mostrado (para no reabrirlo en cada actualización)
    this.seenArmies = null;  // ejércitos ya vistos, para avisar de ataques nuevos
    // Tras el final ya no llegan actualizaciones periódicas: la ventana y el aviso se alternan aquí.
    const showResults = (visible) => {
      $('#end-screen').classList.toggle('hidden', !visible);
      $('#ended-banner').classList.toggle('hidden', visible);
    };
    this.showResults = showResults;
    $('#btn-show-results').addEventListener('click', () => showResults(true));

    $('#btn-zoom-in').addEventListener('click', () => this.map?.zoomBy(1.6));
    $('#btn-zoom-out').addEventListener('click', () => this.map?.zoomBy(1 / 1.6));
    $('#btn-zoom-reset').addEventListener('click', () => this.map?.reset());
    $('#btn-tutorial').addEventListener('click', () => startTutorial());
    // ☰ Menú de la partida: se abre y se cierra al pulsar fuera, con Esc o al elegir una opción.
    const menu = $('#game-menu');
    const menuBtn = $('#btn-game-menu');
    const setMenu = (open) => {
      menu.classList.toggle('hidden', !open);
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.classList.toggle('active', open);
    };
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setMenu(menu.classList.contains('hidden'));
    });
    menu.addEventListener('click', (e) => {
      // Sonido, avisos y gráficos se cambian sin cerrar el menú; lo demás lo cierra.
      const btn = e.target.closest('button');
      if (btn && !btn.matches('.btn-mute, .btn-notify, #btn-gfx')) setMenu(false);
    });
    document.addEventListener('pointerdown', (e) => {
      if (!menu.classList.contains('hidden') && !menu.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    $('#btn-gfx').addEventListener('click', () => {
      if (!this.map) return;
      this.map.setLowGraphics(!this.map.lowGfx);
      $('#btn-gfx').classList.toggle('on', this.map.lowGfx);
      toast(this.map.lowGfx ? '⚡ Gráficos ligeros: el mapa irá más fluido' : '✨ Gráficos completos');
    });
    $('#btn-zoom-home').addEventListener('click', () => {
      const ctx = this.#ctx();
      const target = ctx && (ctx.game.homes[ctx.me] ?? this.#myCountries(ctx)[0]);
      if (target) this.#focus(target);
      else toast('No tienes ningún país');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.map && document.activeElement?.tagName !== 'INPUT') this.#focus(null);
    });
    // Mientras se pulsa dentro del panel no se redibuja, para que ningún toque se pierda.
    this.panelGuard = guardTaps($('#country-panel'), () => this.#renderPanel());
    // En el móvil, el panel es una hoja que se desliza desde abajo.
    $('#sheet-handle').addEventListener('click', () => this.#setSheet(!$('#side-panel').classList.contains('open')));
    // Cuentas atrás y reloj de partida.
    setInterval(() => this.#tickClock(), 250);
  }

  async show() {
    try {
      await loadWorld();
    } catch {
      toast('No se pudo cargar el mapa. Recarga la página.', 'error');
      return;
    }
    if (!this.map) {
      this.map = new WorldMap({
        svgEl: $('#map'),
        minimapEl: $('#minimap'),
        tooltipEl: $('#map-tooltip'),
        world,
        now: () => this.#serverNow(),
        onSelect: (id) => this.#select(id),
        onContext: (id) => this.#quickMove(id),
        tooltipText: (id) => this.#tooltip(id),
      });
      $('#btn-gfx').classList.toggle('on', this.map.lowGfx);
    }
    this.render();
  }

  /** Al salir de la partida, se olvida la selección y la vista. */
  reset() {
    this.selected = null;
    this.centeredHome = false;
    this.lastRoom = null;
    this.lastEventId = null;
    this.shownResources = null;
    this.sendUnits = null;
    this.seenArmies = null;
    this.map?.select(null);
    this.map?.setArmies([]);
    this.map?.reset();
    this.diplo.reset();
    this.endShownFor = null;
    $('#end-screen').classList.add('hidden');
  }

  render() {
    const ctx = this.#ctx();
    if (!ctx || !this.map) return;
    const { room, game, me } = ctx;
    // Solo cuando llega un estado público nuevo: reloj, mapa, jugadores y batallas.
    if (room !== this.lastRoom) {
      this.lastRoom = room;
      this.clockOffset = room.serverTime - Date.now();
      // Mapa elegido: los países de fuera se apagan y la cámara se centra en la región.
      const scopeKey = `${room.code}:${room.startedAt}:${game.scenario}`;
      if (this.scopeKey !== scopeKey) {
        this.scopeKey = scopeKey;
        const scenario = scenarioOf(game.scenario);
        const focusIds = (scenario.countries ?? []).filter((id) => !scenario.areas?.[id]);
        // Tropas, materiales y tecnología con los nombres de la época del mapa.
        if (applyEra(eraOf(game.scenario))) this.#buildResourceBar();
        this.map.setEra(eraOf(game.scenario));
        this.map.setScope((id) => playable(game, id), focusIds);
        if (game.phase === 'picking' || !game.homes[me]) this.map.showHome();
      }
      this.#renderPlayers(ctx);
      this.#renderMap(ctx);
      this.#handleEvents(ctx);
      this.#warnIncoming(ctx);
    }

    $('#game-code').textContent = room.code;
    this.#renderResources();

    const picking = game.phase === 'picking';
    $('#pick-banner').classList.toggle('hidden', !picking);
    if (picking) {
      const done = Object.keys(game.picks).length;
      $('#pick-status').textContent = `${done} de ${ctx.players.size} han elegido`;
    }
    const ended = game.phase === 'ended';
    $('#eliminated-banner').classList.toggle('hidden', !game.eliminated?.[me] || ended);
    $('#ended-banner').classList.toggle('hidden', !ended || !$('#end-screen').classList.contains('hidden'));
    if (ended) this.#renderEnd(ctx);

    // Al empezar la partida, la cámara viaja a tu país.
    const home = game.homes[me];
    if (game.phase === 'active' && home && !this.centeredHome) {
      this.centeredHome = true;
      this.#focus(home, 3);
      toast(`Tu país: ${world.byId.get(home).name}`, 'success');
      maybeStartTutorial(); // la primera vez que se juega
    }

    this.#renderPanel();
    this.diplo.render();
    this.#tickClock();
    refreshTutorialHighlight();
  }

  // ---------- Datos derivados ----------

  #ctx() {
    const { room, me, self } = this.getState();
    if (!room?.game || !world) return null;
    return { room, game: room.game, me, self, players: new Map(room.players.map((p) => [p.id, p])) };
  }

  #serverNow() {
    return Date.now() + this.clockOffset;
  }

  #myCountries({ game, me }) {
    return Object.entries(game.countries).filter(([, c]) => c.owner === me).map(([id]) => id);
  }

  /** Igual que en el servidor: ocupado por otro jugador o vecino de uno de sus países. */
  #blockedFor(game, playerId, countryId) {
    if (!playable(game, countryId)) return true;
    const neighborsOk = scenarioOf(game.scenario).allowNeighbors;
    for (const [pid, taken] of Object.entries({ ...game.picks, ...game.homes })) {
      if (pid === playerId) continue;
      if (taken === countryId) return true;
      if (!neighborsOk && world.byId.get(taken).neighbors.includes(countryId)) return true;
    }
    return false;
  }

  #ownerOf(game, players, countryId) {
    return players.get(game.countries[countryId]?.owner) ?? null;
  }

  #pickerOf(game, players, countryId) {
    const entry = Object.entries(game.picks).find(([, cid]) => cid === countryId);
    return entry ? players.get(entry[0]) ?? null : null;
  }

  // ---------- Mapa y barra de jugadores ----------

  #renderPlayers({ game, players, me }) {
    const counts = {};
    for (const c of Object.values(game.countries)) if (c.owner) counts[c.owner] = (counts[c.owner] ?? 0) + 1;

    $('#game-players').replaceChildren(...[...players.values()].map((p) => h('button', {
      class: `player-chip${p.connected ? '' : ' offline'}${p.id === me ? ' me' : ''}${game.eliminated?.[p.id] ? ' eliminated' : ''}`,
      title: game.eliminated?.[p.id] ? `${p.name} ha sido eliminado` : `Ir al país de ${p.name}`,
      onClick: () => {
        const target = game.homes[p.id] ?? game.picks[p.id]
          ?? Object.entries(game.countries).find(([, c]) => c.owner === p.id)?.[0];
        if (target) this.#focus(target);
      },
    },
    h('span', { class: 'swatch', style: { background: p.color } }),
    game.teams?.[p.id] && h('span', { class: 'chip-team', title: teamName(this.getState().room.settings, game.teams[p.id], game.scenario) }, TEAM_ICONS[(game.teams[p.id] - 1) % TEAM_ICONS.length]),
    avatarEl(p),
    h('span', { class: 'chip-name' }, p.name),
    p.id !== me && game.phase === 'active' && (() => {
      const rel = relationOf(game.relations, me, p.id).state;
      return h('span', { class: `chip-rel rel-${rel}`, title: RELATIONS[rel].label }, RELATIONS[rel].icon);
    })(),
    h('b', { title: 'Países' }, String(counts[p.id] ?? 0)))));
  }

  #renderMap(ctx) {
    const { game, players, me } = ctx;
    const colors = {};
    const markers = [];
    const dimmed = new Set();
    const classes = {};
    const badges = [];

    for (const [countryId, c] of Object.entries(game.countries)) {
      if (!playable(game, countryId)) continue;
      const owner = players.get(c.owner);
      if (owner) colors[countryId] = { fill: owner.color, classes: ['owned', c.owner === me ? 'mine' : ''] };
      if (c.hidden) (classes[countryId] ??= []).push('fogged');
      if (c.owner === me && c.stability < 25) (classes[countryId] ??= []).push('unstable');
      if (game.phase === 'active' && c.hidden) {
        // Con niebla, de los países enemigos solo se sabe que existen: «?».
        if (owner) badges.push({ countryId, text: '?', color: owner.color, always: true, capital: game.homes[owner.id] === countryId });
      } else if (game.phase === 'active') {
        const total = totalUnits(c.units);
        const capital = Boolean(owner && game.homes[owner.id] === countryId);
        if (total > 0 || owner) {
          badges.push({ countryId, text: total, color: owner?.color ?? NEUTRAL_BADGE, always: Boolean(owner), capital });
        }
      }
    }

    if (game.phase === 'picking') {
      for (const [playerId, countryId] of Object.entries(game.picks)) {
        const p = players.get(playerId);
        if (!p) continue;
        colors[countryId] = { fill: p.color, classes: ['reserved', playerId === me ? 'mine' : ''] };
        markers.push({ countryId, color: p.color, kind: 'pick' });
      }
      for (const c of world.countries) {
        if (game.picks[me] !== c.id && this.#blockedFor(game, me, c.id)) dimmed.add(c.id);
      }
    }

    // Con un país propio seleccionado, se marcan los vecinos a los que se puede enviar tropas.
    const sel = this.selected && game.countries[this.selected];
    if (game.phase === 'active' && sel?.owner === me) {
      for (const n of playableNeighbors(game, world.byId.get(this.selected))) {
        const owner = game.countries[n].owner;
        const rel = owner && owner !== me ? relationOf(game.relations, me, owner).state : null;
        if (owner === me || rel === 'alliance') classes[n] = ['target-own'];
        else if (!rel || rel === 'war') classes[n] = ['target-enemy'];
      }
      // Destino de la expedición naval elegida.
      if (this.navalTarget && playable(game, this.navalTarget)) (classes[this.navalTarget] ??= []).push('target-naval');
    }

    const now = this.#serverNow();
    for (const [countryId, c] of Object.entries(game.countries)) {
      if (c.contaminatedUntil > now) (classes[countryId] ??= []).push('contaminated');
    }

    this.map.update({ colors, markers, dimmed, classes, badges });
    this.map.setArmies([
      ...game.armies.map((a) => ({
        ...a,
        sea: world.byId.get(a.from)?.sea.includes(a.to) || !world.byId.get(a.from)?.neighbors.includes(a.to),
        color: players.get(a.owner)?.color ?? NEUTRAL_COLOR,
        count: totalUnits(a.units),
        mine: a.owner === me,
      })),
      ...(game.strikes ?? []).map((s) => ({
        ...s,
        color: '#ff4d3d',
        count: WEAPONS[s.weapon].icon,
        mine: s.owner === me,
        kind: 'strike',
      })),
    ]);
  }

  // Batallas nuevas: destello en el mapa y aviso si nos afectan.
  #handleEvents({ game, players, me }) {
    const events = game.events ?? [];
    const latest = events.length ? events[events.length - 1].id : 0;
    if (this.lastEventId === null) {
      this.lastEventId = latest; // al entrar no repetimos batallas antiguas
      return;
    }
    for (const e of events) {
      if (e.id <= this.lastEventId) continue;
      if (e.type === 'strike') {
        this.#strikeEvent(e, players, me);
        continue;
      }
      if (e.type === 'eliminated') {
        const name = players.get(e.player)?.name ?? 'Un jugador';
        if (e.player === me) play('defeat');
        toast(e.player === me ? 'Has sido eliminado' : `${name} ha sido eliminado`, e.player === me ? 'error' : 'info', 5000);
        continue;
      }
      if (e.type === 'revolt') {
        this.map.flash(e.country, 'conquest');
        if (e.player === me) {
          play('lost');
          toast(`✊ ¡Revuelta! ${world.byId.get(e.country).name} se ha sublevado y lo has perdido`, 'error', 6000);
        }
        continue;
      }
      if (e.type === 'spy') {
        if (e.owner === me && (e.success || e.caught)) {
          toast(e.caught ? `🕵️ Has capturado a un espía de ${players.get(e.by)?.name ?? 'alguien'} en ${world.byId.get(e.country).name}`
            : `🕵️ Espionaje enemigo en ${world.byId.get(e.country).name}: ${e.damage ?? (e.mission === 'steal' ? 'te han robado planos' : 'agitadores en las calles')}`,
          e.caught ? 'success' : 'error', 6000);
        }
        continue;
      }
      if (e.type !== 'battle') continue;
      this.map.flash(e.country, e.attackerWins ? 'conquest' : 'repelled');
      const country = world.byId.get(e.country).name;
      const attacker = players.get(e.attacker)?.name ?? 'Alguien';
      if (e.attacker === me) play(e.attackerWins ? 'conquest' : 'battle');
      else if (e.defender === me) play(e.attackerWins ? 'lost' : 'battle');
      if (e.attacker === null && e.defender === me) {
        toast(e.attackerWins ? `🏴 Las fuerzas neutrales han recuperado ${country}` : `🛡 Has rechazado un contraataque neutral en ${country}`,
          e.attackerWins ? 'error' : 'success', 5000);
      } else if (e.attacker === me) {
        toast(e.attackerWins ? `⚔ Has conquistado ${country}` : `Tu ataque a ${country} ha fracasado`,
          e.attackerWins ? 'success' : 'error', 4500);
      } else if (e.defender === me) {
        toast(e.attackerWins ? `¡${attacker} ha conquistado ${country}!` : `🛡 Has rechazado el ataque de ${attacker} a ${country}`,
          e.attackerWins ? 'error' : 'success', 5000);
      }
    }
    this.lastEventId = latest;
  }

  #strikeEvent(e, players, me) {
    const spec = WEAPONS[e.weapon];
    const country = world.byId.get(e.country).name;
    this.map.flash(e.country, e.intercepted ? 'repelled' : e.weapon === 'nuke' ? 'nuke' : 'conquest');
    if (!e.intercepted) play(e.weapon === 'nuke' ? 'lost' : 'battle');
    const losses = totalUnits(e.losses);
    if (e.attacker === me) {
      toast(e.intercepted ? `Tu ${spec.label.toLowerCase()} sobre ${country} ha sido interceptado`
        : `${spec.icon} Impacto en ${country}: ${losses} unidades destruidas`, e.intercepted ? 'error' : 'success', 4500);
    } else if (e.defender === me) {
      const who = players.get(e.attacker)?.name ?? 'Alguien';
      toast(e.intercepted ? `🛡 Tus defensas interceptan el ataque de ${who} sobre ${country}`
        : `${spec.icon} ${who} ha bombardeado ${country}: pierdes ${losses} unidades`, e.intercepted ? 'success' : 'error', 5000);
    }
  }

  // Alerta en tiempo real: un ejército ajeno se dirige a uno de tus países.
  #warnIncoming({ game, players, me }) {
    const first = this.seenArmies === null;
    this.seenArmies ??= new Set();
    let alarm = false;
    const incoming = [...game.armies, ...(game.strikes ?? [])];
    for (const a of incoming) {
      if (this.seenArmies.has(a.id)) continue;
      this.seenArmies.add(a.id);
      if (first || a.owner === me || game.countries[a.to]?.owner !== me) continue;
      if (a.owner && relationOf(game.relations, me, a.owner).state === 'alliance') continue; // refuerzo aliado
      const who = a.owner ? players.get(a.owner)?.name ?? 'Un jugador' : 'Las fuerzas neutrales';
      const secs = Math.max(1, Math.round((a.arriveAt - this.#serverNow()) / 1000));
      const target = world.byId.get(a.to).name;
      toast(a.weapon
        ? `${WEAPONS[a.weapon].icon} ¡${who} ha lanzado ${WEAPONS[a.weapon].label.toLowerCase()} contra ${target}! Impacto en ${secs} s`
        : `⚠ ${who} avanza hacia ${target} con ${totalUnits(a.units)} unidades · llega en ${secs} s`, 'error', 5000);
      alarm = true;
    }
    if (alarm) play('alarm');
    // Olvida los ejércitos y bombas que ya llegaron.
    const live = new Set(incoming.map((a) => a.id));
    for (const id of this.seenArmies) if (!live.has(id)) this.seenArmies.delete(id);
  }

  // ---------- Panel lateral ----------

  #setSheet(open) {
    $('#side-panel').classList.toggle('open', open);
  }

  #select(id) {
    if (id !== this.selected) this.sendUnits = null;
    this.selected = id;
    $('#sheet-title').textContent = id ? world.byId.get(id).name : 'Panel y chat';
    if (id) this.#setSheet(true);
    const ctx = this.#ctx();
    if (ctx) this.#renderMap(ctx); // resalta los vecinos del nuevo país
    this.#renderPanel();
  }

  #focus(id, minZoom) {
    this.map.select(id);
    if (id) this.map.centerOn(id, minZoom);
    this.#select(id);
  }

  #renderPanel() {
    const ctx = this.#ctx();
    if (!ctx || this.panelGuard.isPressed()) return;
    // No redibujar mientras se elige en una lista (en el móvil se cerraría).
    if (document.activeElement?.matches?.('#country-panel select, #country-panel input')) return;
    const { game, players, me, self } = ctx;
    const panel = $('#country-panel');
    const picking = game.phase === 'picking';
    const c = this.selected && world.byId.get(this.selected);

    if (!c) {
      const mine = this.#myCountries(ctx).map((id) => world.byId.get(id));
      fill(panel,
        h('span', { class: 'eyebrow' }, 'Inteligencia'),
        h('h3', { class: 'country-title' }, picking ? 'Elige tu país' : 'Selecciona un país'),
        h('p', { class: 'muted' }, picking
          ? 'Haz clic en un país del mapa y confírmalo. No puedes elegir uno ocupado ni vecino de otro jugador (aparecen oscurecidos). Si se acaba el tiempo, se te asignará uno.'
          : 'Selecciona uno de tus países para reclutar tropas y enviarlas a sus vecinos. Con un país tuyo seleccionado, clic derecho sobre un vecino envía las tropas al instante.'),
        mine.length > 0 && h('h4', { class: 'panel-sub' }, 'Tus territorios'),
        mine.length > 0 && h('div', { class: 'chips' }, mine.map((m) => this.#countryChip(m, ctx))),
        self?.weariness > 0 && h('p', { class: 'weariness' }, `😓 Cansancio de guerra: tus ingresos bajan un ${self.weariness} %. Se recupera poco a poco sin perder tropas.`),
        self && h('h4', { class: 'panel-sub' }, 'Balance por minuto'),
        self && this.#resourceGrid(Object.fromEntries(RESOURCES.map((r) => [r, self.income[r] - self.upkeep[r]])), true),
      );
      return;
    }

    const state = game.countries[c.id];
    const owner = this.#ownerOf(game, players, c.id);
    const picker = picking ? this.#pickerOf(game, players, c.id) : null;
    const homeOf = [...players.values()].find((p) => game.homes[p.id] === c.id);
    const isMine = owner?.id === me && game.phase === 'active';
    const swatchColor = owner?.color ?? picker?.color ?? NEUTRAL_COLOR;
    const now = this.#serverNow();

    let status;
    if (owner) status = `Controlado por ${owner.name}${owner.id === me ? ' (tú)' : ''}`;
    else if (picker) status = `Elegido por ${picker.name}${picker.id === me ? ' (tú)' : ''}`;
    else status = 'Neutral · controlado por la IA';

    const terrain = TERRAIN_INFO[terrainOf(c.id)];
    fill(panel,
      h('div', { class: 'panel-top' },
        h('span', { class: 'eyebrow' }, 'País seleccionado'),
        h('button', { class: 'btn btn-ghost btn-xs', title: 'Cerrar (Esc)', onClick: () => this.#focus(null) }, '✕')),
      h('h3', { class: 'country-title' }, h('span', { class: 'swatch', style: { background: swatchColor } }), c.name),
      h('p', { class: 'country-status' }, status),
      owner && owner.id !== me && game.phase === 'active' && this.#relationLine(owner, ctx),
      homeOf && h('span', { class: 'badge badge-host', title: 'Si cae la capital, su dueño queda eliminado' },
        homeOf.id === me ? '★ Tu capital · si cae, quedas eliminado' : `★ Capital de ${homeOf.name} · si cae, queda eliminado`),
      h('dl', { class: 'stats' },
        h('dt', {}, 'Superficie'), h('dd', {}, `${fmt.format(c.area)} km²`),
        h('dt', {}, 'Terreno'), h('dd', { title: `Defensa ×${terrain.defense}` }, `${terrain.label}${c.coastal ? ' · costa' : ''}`),
        h('dt', {}, 'Desarrollo'), h('dd', {}, this.#levelPips(state.level)),
        state.developing && h('dt', {}, 'En obras'),
        state.developing && h('dd', {}, `nivel ${state.developing.toLevel} en ${secondsText(state.developing.readyAt - now)}`),
        state.contaminatedUntil > now && h('dt', { class: 'danger-text' }, '☢ Contaminado'),
        state.contaminatedUntil > now && h('dd', { class: 'danger-text' }, `sin producción ${secondsText(state.contaminatedUntil - now)}`)),
      strategicOf(c.id).length > 0 && h('p', { class: 'strategic-line' }, 'Recursos estratégicos: ',
        strategicOf(c.id).map((r) => h('span', { class: 'chip', title: 'Necesario para tropas y armas avanzadas' }, `${STRATEGIC[r].icon} ${STRATEGIC[r].label}`))),
      owner && game.phase === 'active' && (owner.id === me || !state.hidden) && this.#stabilityLine(state),
      game.phase === 'active' && this.#armySection(state, now),
      this.#movesSection(c, ctx, now),
      isMine && this.#recruitSection(c, ctx),
      isMine && this.#sendSection(c, state, ctx),
      !isMine && game.phase === 'active' && this.#attackFromSection(c, ctx),
      !isMine && game.phase === 'active' && this.#strikeSection(c, ctx, now),
      !isMine && game.phase === 'active' && !game.eliminated?.[me] && this.#spySection(c, ctx, now),
      h('h4', { class: 'panel-sub' }, 'Producción por minuto'),
      this.#resourceGrid(this.#countryProduction(c, state, Boolean(homeOf))),
      (homeOf || usedSlots(state.buildings) > 0) && h('p', { class: 'muted small' },
        [homeOf && 'Incluye la bonificación de capital.', usedSlots(state.buildings) > 0 && 'Incluye lo que producen sus edificios.']
          .filter(Boolean).join(' ')),
      isMine && this.#developAction(c, state, ctx),
      game.phase === 'active' && this.#buildingsSection(c, state, ctx, isMine, now),
      picking && this.#pickAction(c, ctx),
      h('h4', { class: 'panel-sub' }, 'Países vecinos'),
      h('div', { class: 'chips' }, playableNeighbors(game, c).map((id) => this.#countryChip(world.byId.get(id), ctx))),
    );
  }

  #relationLine(owner, { game, me }) {
    const rel = relationOf(game.relations, me, owner.id).state;
    return h('div', { class: 'relation-line' },
      h('span', { class: `relation-badge rel-${rel}` }, `${RELATIONS[rel].icon} ${RELATIONS[rel].label}`),
      h('button', { class: 'btn btn-ghost btn-xs', onClick: () => this.diplo.open('diplomacy') }, 'Diplomacia'));
  }

  #armySection(state, now) {
    if (state.hidden) {
      return h('div', { class: 'fog-note' },
        h('h4', { class: 'panel-sub' }, 'Ejército'),
        h('p', { class: 'muted small' }, '🌫️ Niebla de guerra: no sabes cuántas tropas hay aquí. Lo verás si conquistas un país vecino, si un aliado está cerca o si envías un espía.'));
    }
    const training = {};
    for (const t of state.training) {
      training[t.type] ??= { count: 0, next: Infinity };
      training[t.type].count += t.count;
      training[t.type].next = Math.min(training[t.type].next, t.readyAt);
    }
    return h('div', {},
      h('h4', { class: 'panel-sub' }, `Ejército · ${totalUnits(state.units)} unidades`),
      totalUnits(state.units) === 0 && !state.training.length && h('p', { class: 'muted small' }, 'Sin tropas.'),
      h('div', { class: 'unit-grid' }, UNIT_TYPES.filter((t) => state.units[t] > 0 || training[t]).map((t) => h('div', {
        class: 'unit',
        title: `${UNITS[t].label}: ataque ${UNITS[t].attack}, defensa ${UNITS[t].defense}`,
      },
      h('span', { class: 'unit-icon' }, UNITS[t].icon),
      h('span', { class: 'unit-name' }, UNITS[t].label),
      h('b', {}, String(state.units[t])),
      training[t] && h('em', { title: 'En entrenamiento' }, `+${training[t].count} · ${secondsText(training[t].next - now)}`)))));
  }

  #movesSection(c, { game, players, me }, now) {
    const moves = game.armies.filter((a) => a.to === c.id || a.from === c.id);
    if (!moves.length) return null;
    return h('div', {},
      h('h4', { class: 'panel-sub' }, 'Movimientos'),
      h('ul', { class: 'moves' }, moves.map((a) => {
        const who = a.owner === me ? 'Tus tropas' : `${players.get(a.owner)?.name ?? '?'}`;
        const dir = a.to === c.id ? `llegan desde ${world.byId.get(a.from).name}` : `van hacia ${world.byId.get(a.to).name}`;
        const hostile = a.to === c.id && game.countries[c.id].owner !== a.owner;
        return h('li', { class: hostile ? 'hostile' : '' },
          h('span', { class: 'swatch', style: { background: players.get(a.owner)?.color ?? NEUTRAL_COLOR } }),
          h('span', {}, `${who}: ${totalUnits(a.units)} ${dir}`),
          h('b', {}, secondsText(a.arriveAt - now)));
      })));
  }

  #recruitSection(c, { self }) {
    const available = UNIT_TYPES.filter((t) => isUnlocked(self?.unlocked, { unit: t }));
    const locked = UNIT_TYPES.length - available.length;
    return h('div', {},
      h('h4', { class: 'panel-sub' }, 'Reclutar'),
      locked > 0 && h('p', { class: 'muted small' }, `🔬 Investiga en Tecnología para desbloquear ${locked} tipos de tropa más.`),
      h('div', { class: 'recruit-list' }, available.map((t) => {
        const unit = UNITS[t];
        const blocked = unit.domain === 'sea' && !c.coastal;
        const missing = this.#missingStrategic(this.#ctx(), { unit: t });
        const unitCost = discountCost(unit.cost, leaderBonus(self?.president).cost);
        // Lo máximo que se puede pagar ahora mismo (sin pasar del límite por orden).
        const max = blocked || missing || !self ? 0 : Math.min(MAX_RECRUIT,
          ...Object.entries(unitCost).map(([r, v]) => (v > 0 ? Math.floor((self.resources[r] ?? 0) / v) : MAX_RECRUIT)));
        this.recruitQty ??= {};
        const qty = Math.max(1, Math.min(MAX_RECRUIT, this.recruitQty[t] ?? 1));
        const recruit = async (n, btn) => {
          if (!n) return;
          btn.disabled = true;
          const res = await request('game:recruit', { countryId: c.id, type: t, count: n });
          if (!res.ok) toast(res.error, 'error');
          else {
            play('recruit');
            toast(`${unit.icon} ${n} × ${unit.label} en entrenamiento`, 'success', 2000);
          }
          document.activeElement?.blur?.();
          this.#renderPanel();
        };
        const reason = blocked ? 'requiere costa'
          : missing ? `falta ${STRATEGIC[missing].icon} ${STRATEGIC[missing].label.toLowerCase()}` : null;
        const input = h('input', {
          type: 'number', min: 1, max: MAX_RECRUIT, step: 1, value: qty, inputmode: 'numeric',
          class: 'recruit-qty', 'aria-label': `Cantidad de ${unit.label}`, disabled: Boolean(reason),
          onInput: (e) => { this.recruitQty[t] = Math.floor(Number(e.target.value)) || 1; },
          onKeydown: (e) => { if (e.key === 'Enter') recruit(Math.floor(Number(e.target.value)) || 0, e.target); },
          onBlur: () => setTimeout(() => this.#renderPanel(), 0),
        });
        const time = secondsText(this.#trainMs(c, t, qty));
        return h('div', { class: 'recruit-row recruit-unit' },
          h('span', { class: 'unit-icon' }, unit.icon),
          h('span', { class: 'recruit-name' }, unit.label, h('small', {}, reason ?? `${costText(unitCost)} c/u`)),
          input,
          h('button', {
            class: 'btn btn-xs btn-primary',
            disabled: Boolean(reason) || qty > max,
            title: qty > max ? 'No tienes recursos suficientes para tantas' : `Coste: ${costText(Object.fromEntries(Object.entries(unitCost).map(([r, v]) => [r, v * qty])))} · ${time}`,
            onClick: (e) => recruit(Math.floor(Number(input.value)) || 0, e.currentTarget),
          }, 'Reclutar'),
          h('div', { class: 'recruit-extra' },
            h('button', {
              class: 'btn btn-ghost btn-xs recruit-max',
              disabled: max < 1,
              title: max < 1 ? 'No te llega para ninguna' : `Reclutar ${max} (todo lo que puedes pagar)`,
              onClick: (e) => recruit(max, e.currentTarget),
            }, `Max · ${max}`),
            h('small', { class: 'muted' }, `⏱ ${qty} en ${time}`)));
      })));
  }

  // Tiempo de entrenamiento de un lote (como en el servidor: los lotes grandes tardan más).
  #trainMs(c, type, count) {
    const { game, self } = this.#ctx();
    const state = game.countries[c.id];
    return (UNITS[type].trainMs * (1 + (count - 1) * BATCH_TIME_STEP) * trainFactor(state?.buildings)
      * (treeBonus(self?.unlocked).train[UNITS[type].class] ?? 1)) / game.speed;
  }

  // Espionaje contra un país ajeno.
  #spySection(c, { game, self }, now) {
    const owner = game.countries[c.id].owner;
    return h('div', {},
      h('h4', { class: 'panel-sub' }, '🕵️ Espionaje'),
      h('div', { class: 'recruit-list' }, SPY_MISSION_IDS.map((id) => {
        const m = SPY_MISSIONS[id];
        const cooldown = (self?.cooldowns?.[`spy:${id}`] ?? 0) - now;
        let error = null;
        if (m.needsPlayer && !owner) error = 'Solo contra otro jugador';
        else if (cooldown > 0) error = `Preparando: ${secondsText(cooldown)}`;
        else if (!self || !canAfford(self.resources, m.cost)) error = 'No tienes recursos suficientes';
        return h('div', { class: 'recruit-row', title: m.desc },
          h('span', { class: 'unit-icon' }, m.icon),
          h('span', { class: 'recruit-name' }, m.label,
            h('small', {}, error ?? `${costText(m.cost)} · éxito ${Math.round(m.success * 100)} %`)),
          h('button', {
            class: 'btn btn-xs',
            disabled: Boolean(error),
            onClick: async (e) => {
              e.currentTarget.disabled = true;
              const res = await request('game:spy', { mission: id, countryId: c.id });
              if (!res.ok) return toast(res.error, 'error');
              toast(`${res.success ? '🕵️' : '⚠'} ${res.text}`, res.success ? 'success' : 'error', 5000);
              play(res.success ? 'notify' : 'battle');
            },
          }, 'Enviar'));
      })),
      h('p', { class: 'muted small' }, 'Si una misión falla, tu espía puede ser capturado y todos sabrán que has sido tú.'));
  }

  // Estabilidad de un país propio (riesgo de revuelta).
  #stabilityLine(state) {
    if (state.stability === undefined) return null;
    const v = state.stability;
    const level = v < 25 ? 'danger' : v < 50 ? 'warn' : 'ok';
    return h('div', { class: `stability stability-${level}`, title: 'Sube con el tiempo y con al menos 5 tropas dentro. Por debajo del 25 % puede haber revueltas.' },
      h('span', {}, `✊ Estabilidad ${v} %`),
      h('div', { class: 'stability-bar' }, h('i', { style: { width: `${v}%` } })),
      v < 25 && h('small', {}, '⚠ Riesgo de revuelta: deja tropas en el país'),
      v < 100 && v >= 25 && h('small', { class: 'muted' }, `Produce al ${Math.round(50 + v / 2)} %`));
  }

  // Bombas disponibles contra un país ajeno.
  #strikeSection(c, { game, me, self, players }, now) {
    const era = eraOf(game.scenario);
    const weapons = WEAPON_TYPES.filter((w) => isUnlocked(self?.unlocked, { weapon: w }) && weaponAllowed(w, era));
    if (!weapons.length) return null;
    const owner = game.countries[c.id].owner;
    const rel = owner ? relationOf(game.relations, me, owner).state : 'war';
    const hops = this.#hopsToMine(game, me, c.id);

    return h('div', {},
      h('h4', { class: 'panel-sub' }, era ? 'Atacar a distancia' : 'Bombardear'),
      h('div', { class: 'recruit-list' }, weapons.map((w) => {
        const spec = WEAPONS[w];
        const cooldown = (self.cooldowns?.[w] ?? 0) - now;
        let error = null;
        if (rel !== 'war') error = `No estás en guerra con ${players.get(owner)?.name}`;
        else if (hops > spec.range) error = `Fuera de alcance (máx. ${spec.range} países)`;
        else if (cooldown > 0) error = `Recargando: ${secondsText(cooldown)}`;
        else if (this.#missingStrategic({ game, me }, { weapon: w })) {
          const need = STRATEGIC[this.#missingStrategic({ game, me }, { weapon: w })];
          error = `Falta ${need.icon} ${need.label.toLowerCase()}`;
        } else if (!canAfford(self.resources, spec.cost)) error = 'No tienes recursos suficientes';
        return h('div', { class: 'recruit-row' },
          h('span', { class: 'unit-icon' }, spec.icon),
          h('span', { class: 'recruit-name' }, spec.label,
            h('small', {}, error ?? `${costText(spec.cost)} · destruye ${Math.round(spec.kill * 100)} %`)),
          h('button', {
            class: `btn btn-xs ${w === 'nuke' ? 'btn-danger' : ''}`,
            disabled: Boolean(error),
            onClick: async () => {
              if (w === 'nuke' && !confirm(`¿Lanzar una bomba nuclear contra ${c.name}? Todos los jugadores serán avisados.`)) return;
              const res = await request('game:strike', { weapon: w, countryId: c.id });
              if (!res.ok) return toast(res.error, 'error');
              play('march');
              toast(`${spec.icon} Lanzado contra ${c.name} · impacto en ${secondsText(res.arriveAt - this.#serverNow())}`);
            },
          }, 'Lanzar'));
      })));
  }

  // Distancia en fronteras desde el país propio más cercano.
  #hopsToMine(game, me, targetId) {
    const seen = new Set([targetId]);
    let frontier = [targetId];
    for (let hops = 0; frontier.length && hops < 10; hops++) {
      if (frontier.some((id) => game.countries[id].owner === me)) return hops;
      const next = [];
      for (const id of frontier) {
        for (const n of playableNeighbors(game, world.byId.get(id))) {
          if (!seen.has(n)) {
            seen.add(n);
            next.push(n);
          }
        }
      }
      frontier = next;
    }
    return Infinity;
  }

  #defaultSend(units) {
    // Por defecto se envía todo salvo una infantería, que se queda defendiendo.
    const send = { ...units };
    if (send.infantry > 0 && totalUnits(units) > 1) send.infantry -= 1;
    return send;
  }

  // Recurso estratégico que falta para una unidad o arma (o null).
  #missingStrategic({ game, me }, what) {
    const need = needOf(what);
    if (!need) return null;
    const friends = new Set([me, ...Object.keys(game.eliminated ?? {})
      .filter((pid) => pid !== me && relationOf(game.relations, me, pid).state === 'alliance')]);
    return hasAccess(need, (id) => game.countries[id]?.owner, friends, (id) => playable(game, id)) ? null : need;
  }

  // Tiempo de viaje como lo calcula el servidor (ritmo, logística y modificaciones del árbol).
  #eta(from, to, units, { game, self }) {
    const speed = game.speed * (game.pace ?? 1800) * techBonus.speed(self?.tech);
    return travelMs(from, to, units, speed, treeBonus(self?.unlocked).speed);
  }

  // Error de una orden de movimiento (reglas de movimiento + diplomacia).
  #moveProblem(from, to, units, { game, me, players }) {
    const error = moveError(from, to, units);
    if (error) return error;
    const ownerId = game.countries[to.id].owner;
    const rel = ownerId && ownerId !== me ? relationOf(game.relations, me, ownerId).state : null;
    if (rel && rel !== 'war' && rel !== 'alliance') {
      return `${RELATIONS[rel].label} con ${players.get(ownerId)?.name}: declárale la guerra primero`;
    }
    return null;
  }

  // Expedición naval: con barcos se puede zarpar hacia cualquier país con costa del mapa.
  #navalSection(c, state, chosen, ctx) {
    const { game, players } = ctx;
    if (!c.coastal || domainCount(state.units, 'sea') === 0) return null;
    const options = world.countries
      .filter((x) => x.coastal && playable(game, x.id) && isNavalRoute(c, x))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (!options.some((o) => o.id === this.navalTarget)) this.navalTarget = null;
    const select = h('select', {
      class: 'naval-select',
      onChange: () => {
        this.navalTarget = select.value || null;
        select.blur();
        this.#renderPanel();
        this.#renderMap(this.#ctx());
      },
    },
    h('option', { value: '' }, '— Elige un destino al otro lado del mar —'),
    options.map((x) => {
      const owner = players.get(game.countries[x.id].owner);
      return h('option', { value: x.id }, `${x.name}${owner ? ` · ${owner.name}` : ''}`);
    }));
    select.value = this.navalTarget ?? '';

    let action = null;
    if (this.navalTarget) {
      const target = world.byId.get(this.navalTarget);
      const error = this.#moveProblem(c, target, chosen, ctx);
      const own = game.countries[target.id].owner === ctx.me;
      action = h('button', {
        class: `btn btn-block ${error ? '' : 'btn-primary'}`,
        disabled: Boolean(error),
        onClick: () => this.#sendTroops(c.id, target.id),
      }, error ? `✕ ${error}` : `🚢 ${own ? 'Navegar' : 'Desembarcar'} en ${target.name} · ${secondsText(this.#eta(c, target, chosen, ctx))}`);
    }
    return h('div', { class: 'naval' },
      h('h4', { class: 'panel-sub' }, '🚢 Expedición naval'),
      h('p', { class: 'muted small' }, `Con al menos un barco en la expedición puedes llegar a cualquier país con costa del mapa, llevando también ${eraOf(game.scenario) ? 'tus tropas' : 'tropas y aviones'}. El desembarco cuenta como ataque anfibio.`),
      select,
      action);
  }

  #sendSection(c, state, { game, me, self, players }) {
    const ctxOf = { game, me, self, players };
    const available = state.units;
    if (totalUnits(available) === 0) {
      return h('p', { class: 'muted small' }, 'No hay tropas aquí para enviar.');
    }
    this.sendUnits ??= this.#defaultSend(available);
    for (const t of UNIT_TYPES) this.sendUnits[t] = Math.min(this.sendUnits[t], available[t]);
    const chosen = this.sendUnits;

    const stepper = (t) => {
      const set = (v) => {
        chosen[t] = Math.max(0, Math.min(available[t], v));
        this.#renderPanel();
      };
      return h('div', { class: 'stepper' },
        h('span', { class: 'unit-icon', title: UNITS[t].label }, UNITS[t].icon),
        h('button', { class: 'btn btn-xs', disabled: chosen[t] <= 0, onClick: () => set(chosen[t] - 1) }, '−'),
        h('b', {}, `${chosen[t]}/${available[t]}`),
        h('button', { class: 'btn btn-xs', disabled: chosen[t] >= available[t], onClick: () => set(chosen[t] + 1) }, '+'),
        h('button', { class: 'btn btn-ghost btn-xs', onClick: () => set(chosen[t] >= available[t] ? 0 : available[t]) },
          chosen[t] >= available[t] ? 'Nada' : 'Todo'));
    };

    // Dividir el ejército por porcentaje: de cada tipo se manda ese % redondeado hacia abajo
    // (con 15,6 tropas salen 15). Así siempre se queda algo de guarnición.
    const byPercent = (pct) => {
      this.sendPct = pct;
      for (const t of UNIT_TYPES) chosen[t] = Math.floor((available[t] * pct) / 100);
      this.#renderPanel();
    };
    const pctOf = UNIT_TYPES.every((t) => chosen[t] === Math.floor((available[t] * (this.sendPct ?? -1)) / 100)) ? this.sendPct : null;
    const percentBar = h('div', { class: 'send-percent' },
      h('span', { class: 'small muted' }, 'Dividir:'),
      [10, 25, 50, 75, 100].map((pct) => h('button', {
        class: `btn btn-xs ${pctOf === pct ? 'btn-primary' : ''}`,
        title: `Enviar el ${pct} % de cada tipo de tropa (redondeando hacia abajo)`,
        onClick: () => byPercent(pct),
      }, `${pct} %`)),
      h('input', {
        type: 'range', min: 0, max: 100, step: 5, value: pctOf ?? Math.round((totalUnits(chosen) / totalUnits(available)) * 100),
        'aria-label': 'Porcentaje de tropas a enviar',
        onInput: (e) => { e.target.nextSibling.textContent = `${e.target.value} %`; },
        onChange: (e) => {
          e.target.blur(); // con el control enfocado el panel no se redibuja
          byPercent(Number(e.target.value));
        },
      }),
      h('b', { class: 'send-percent-value' }, `${pctOf ?? Math.round((totalUnits(chosen) / totalUnits(available)) * 100)} %`));

    return h('div', {},
      h('h4', { class: 'panel-sub' }, `Enviar tropas · ${totalUnits(chosen)} seleccionadas`),
      percentBar,
      h('div', { class: 'steppers' }, UNIT_TYPES.filter((t) => available[t] > 0).map(stepper)),
      h('div', { class: 'targets' }, playableNeighbors(game, c).map((id) => {
        const target = world.byId.get(id);
        const ownerId = game.countries[id].owner;
        const rel = ownerId && ownerId !== me ? relationOf(game.relations, me, ownerId).state : null;
        const own = ownerId === me || rel === 'alliance';
        let error = moveError(c, target, chosen);
        if (!error && rel && rel !== 'war' && rel !== 'alliance') {
          error = `${RELATIONS[rel].label} con ${players.get(ownerId)?.name}: declárale la guerra primero`;
        }
        const eta = error ? '' : secondsText(this.#eta(c, target, chosen, ctxOf));
        const defenders = game.countries[id].hidden ? '?' : totalUnits(game.countries[id].units);
        let detail = `${defenders} def. · ${eta}`;
        if (own) detail = `${rel === 'alliance' ? 'aliado' : 'refuerzo'} · ${eta}`;
        if (error) detail = rel && rel !== 'war' && rel !== 'alliance' ? RELATIONS[rel].label.toLowerCase() : 'no disponible';
        return h('button', {
          class: `target ${own ? 'own' : 'enemy'}`,
          disabled: Boolean(error),
          title: error ?? `${own ? 'Reforzar' : 'Atacar'} ${target.name} · llegada en ${eta}`,
          onClick: () => this.#sendTroops(c.id, id),
        },
        h('span', {}, `${own ? '➜' : '⚔'} ${target.name}`),
        h('small', {}, detail));
      })),
      this.#navalSection(c, state, chosen, ctxOf),
      h('p', { class: 'muted small hint-desktop' }, 'Atajo: clic derecho sobre un país en el mapa para enviar las tropas elegidas.'));
  }

  // En un país ajeno: desde qué países tuyos puedes atacarlo.
  #attackFromSection(c, ctx) {
    const { game, me } = ctx;
    const mine = playableNeighbors(game, c).filter((id) => game.countries[id].owner === me);
    // Puertos propios con barcos desde los que se puede llegar por mar.
    const ports = c.coastal ? world.countries.filter((x) => x.coastal && isNavalRoute(x, c)
      && game.countries[x.id]?.owner === me && domainCount(game.countries[x.id].units, 'sea') > 0) : [];
    if (!mine.length && !ports.length) return null;
    return h('div', {},
      mine.length > 0 && h('h4', { class: 'panel-sub' }, 'Atacar desde'),
      mine.length > 0 && h('div', { class: 'chips' }, mine.map((id) => h('button', {
        class: 'chip',
        onClick: () => this.#focus(id),
      }, `${world.byId.get(id).name} · ${totalUnits(game.countries[id].units)}`))),
      ports.length > 0 && h('h4', { class: 'panel-sub' }, '🚢 Atacar por mar desde'),
      ports.length > 0 && h('div', { class: 'chips' }, ports.map((x) => {
        const units = game.countries[x.id].units;
        return h('button', {
          class: 'chip',
          title: 'Abre ese país con este destino ya elegido',
          onClick: () => {
            this.navalTarget = c.id;
            this.sendUnits = null;
            this.#focus(x.id);
          },
        }, `${x.name} · ${domainCount(units, 'sea')} 🚢 · ${secondsText(this.#eta(x, c, units, ctx))}`);
      })));
  }

  async #sendTroops(from, to) {
    const units = { ...(this.sendUnits ?? emptyUnits()) };
    if (totalUnits(units) === 0) return toast('Elige al menos una unidad', 'error');
    const res = await request('game:move', { from, to, units });
    if (!res.ok) return toast(res.error, 'error');
    play('march');
    this.sendUnits = null;
    toast(`Tropas en marcha hacia ${world.byId.get(to).name} · llegan en ${secondsText(res.arriveAt - this.#serverNow())}`);
  }

  // Clic derecho en el mapa: envía las tropas elegidas del país seleccionado a ese vecino.
  #quickMove(targetId) {
    const ctx = this.#ctx();
    if (!ctx || ctx.game.phase !== 'active') return;
    const from = this.selected;
    if (!from || ctx.game.countries[from]?.owner !== ctx.me) {
      toast('Selecciona primero uno de tus países');
      return;
    }
    this.sendUnits ??= this.#defaultSend(ctx.game.countries[from].units);
    const error = moveError(world.byId.get(from), world.byId.get(targetId), this.sendUnits);
    if (error) {
      toast(error, 'error');
      return;
    }
    this.#sendTroops(from, targetId);
  }

  #countryProduction(c, state, isCapital) {
    const total = countryIncome(c, state.level, isCapital);
    for (const [r, v] of Object.entries(buildingIncome(state.buildings))) total[r] += v;
    return total;
  }

  // Construcciones: fábricas, pozos, granjas, bancos, cuarteles y búnkeres.
  #buildingsSection(c, state, { self }, isMine, now) {
    const buildings = state.buildings ?? {};
    if (!isMine) {
      const built = BUILDING_TYPES.filter((t) => buildings[t]);
      if (!built.length) return null;
      return h('div', {},
        h('h4', { class: 'panel-sub' }, '🏗️ Construcciones'),
        h('div', { class: 'chips' }, built.map((t) => h('span', { class: 'chip' }, `${BUILDINGS[t].icon} ${BUILDINGS[t].label} ${buildings[t]}`))));
    }
    const used = usedSlots(buildings);
    const slots = buildingSlots(state.level);
    const discount = leaderBonus(self?.president).cost;
    const work = state.constructing;
    return h('div', {},
      h('h4', { class: 'panel-sub' }, `🏗️ Construcciones · espacio ${used}/${slots}`),
      used >= slots && !work && h('p', { class: 'muted small' }, 'Sin espacio libre: desarrolla el país para poder construir más.'),
      h('div', { class: 'build-grid' }, BUILDING_TYPES.map((t) => {
        const b = BUILDINGS[t];
        const level = buildings[t] ?? 0;
        const toLevel = level + 1;
        const building = work?.type === t;
        let action;
        if (building) {
          const total = buildingMs(work.toLevel) / this.getState().room.game.speed;
          const left = work.readyAt - now;
          action = h('div', { class: 'progress' },
            h('div', { class: 'progress-bar', style: { width: `${Math.min(100, (1 - left / total) * 100)}%` } }),
            h('span', {}, `Nivel ${work.toLevel} · ${secondsText(left)}`));
        } else if (level >= MAX_BUILDING_LEVEL) {
          action = h('span', { class: 'tree-done' }, '✓ Nivel máximo');
        } else {
          const cost = discountCost(buildingCost(t, toLevel), discount);
          const error = buildError(state, t) ?? (!self || !canAfford(self.resources, cost) ? 'No tienes recursos suficientes' : null);
          action = h('button', {
            class: 'btn btn-xs btn-block',
            disabled: Boolean(error),
            title: error ?? `Coste: ${costText(cost)}`,
            onClick: async (e) => {
              e.currentTarget.disabled = true;
              const res = await request('game:build', { countryId: c.id, type: t });
              if (!res.ok) toast(res.error, 'error');
              else {
                toast(`${b.icon} Construyendo ${b.label.toLowerCase()} en ${c.name}`, 'success');
                play('click');
              }
            },
          }, level ? `Mejorar a nivel ${toLevel}` : 'Construir', h('small', {}, costText(cost)));
        }
        return h('div', { class: `build-card${level ? ' built' : ''}${building ? ' active' : ''}` },
          h('div', { class: 'build-head' },
            h('span', { class: 'build-icon' }, b.icon),
            h('strong', {}, b.label),
            h('span', { class: 'pips' }, Array.from({ length: MAX_BUILDING_LEVEL }, (_, i) => h('i', { class: i < level ? 'on' : '' })))),
          h('small', { class: 'muted' }, b.desc),
          action);
      })));
  }

  #developAction(c, state, { self }) {
    if (state.level >= MAX_LEVEL) return h('p', { class: 'muted small' }, 'Desarrollo al nivel máximo.');
    if (state.developing) return null;

    const cost = discountCost(developCost(state.level), leaderBonus(self?.president).cost);
    const reason = !self || !canAfford(self.resources, cost) ? 'No tienes recursos suficientes.' : null;
    return h('div', { class: 'develop' },
      h('button', {
        class: 'btn btn-block',
        disabled: Boolean(reason),
        onClick: async (e) => {
          e.currentTarget.disabled = true;
          const res = await request('game:develop', { countryId: c.id });
          if (!res.ok) toast(res.error, 'error');
          else {
            toast(`Obras iniciadas en ${c.name}`, 'success');
            play('click');
          }
        },
      }, `Desarrollar a nivel ${state.level + 1}`),
      h('p', { class: 'muted small' }, reason ?? `Coste: ${costText(cost)}. +25 % de producción y +5 % de defensa.`));
  }

  #pickAction(c, { game, me }) {
    if (game.picks[me] === c.id) {
      return h('button', { class: 'btn btn-lg btn-block', disabled: true }, 'Tu elección actual');
    }
    if (this.#blockedFor(game, me, c.id)) {
      return h('div', {},
        h('button', { class: 'btn btn-lg btn-block', disabled: true }, 'No disponible'),
        h('p', { class: 'muted small' }, 'Está ocupado o limita con el país de otro jugador.'));
    }
    return h('button', {
      class: 'btn btn-primary btn-lg btn-block',
      onClick: async (e) => {
        e.currentTarget.disabled = true;
        const res = await request('game:pick', { countryId: c.id });
        if (!res.ok) {
          toast(res.error, 'error');
          this.#renderPanel();
        }
      },
    }, game.picks[me] ? 'Cambiar a este país' : 'Elegir como país inicial');
  }

  #resourceGrid(values, signed = false) {
    return h('div', { class: 'prod-grid' }, RESOURCES.map((r) => {
      const v = Math.round(values[r] * 10) / 10;
      return h('div', { class: `prod res-${r}` },
        h('i', { class: 'res-icon' }, RESOURCE_INFO[r].icon),
        h('span', {}, RESOURCE_INFO[r].label),
        h('b', { class: signed && v < 0 ? 'neg' : '' }, `${v >= 0 ? '+' : ''}${fmt1.format(v)}`));
    }));
  }

  #levelPips(level) {
    return h('span', { class: 'pips', title: `Nivel ${level} de ${MAX_LEVEL}` },
      Array.from({ length: MAX_LEVEL }, (_, i) => h('i', { class: i < level ? 'on' : '' })));
  }

  #countryChip(c, { game, players }) {
    const owner = this.#ownerOf(game, players, c.id);
    return h('button', { class: 'chip', onClick: () => this.#focus(c.id) },
      h('span', { class: 'swatch', style: { background: owner?.color ?? NEUTRAL_COLOR } }),
      c.name);
  }

  #tooltip(id) {
    const ctx = this.#ctx();
    const c = world.byId.get(id);
    const state = ctx?.game.countries[id];
    const owner = ctx && this.#ownerOf(ctx.game, ctx.players, id);
    const picker = ctx?.game.phase === 'picking' && this.#pickerOf(ctx.game, ctx.players, id);
    const who = owner ? owner.name : picker ? `Elegido por ${picker.name}` : 'Neutral';
    const troops = ctx?.game.phase === 'active' && state?.hidden ? '🌫️ Tropas desconocidas' : ctx?.game.phase === 'active' && state
      ? UNIT_TYPES.filter((t) => state.units[t]).map((t) => `${UNITS[t].icon} ${state.units[t]}`).join('   ') || 'Sin tropas'
      : null;
    const built = BUILDING_TYPES.filter((t) => state?.buildings?.[t]).map((t) => `${BUILDINGS[t].icon}${state.buildings[t]}`).join(' ');
    return [
      h('strong', {}, c.name),
      h('span', { style: { color: owner?.color ?? picker?.color ?? '' } }, who),
      troops && h('span', { class: 'muted' }, troops),
      built && h('span', { class: 'muted' }, built),
    ].filter(Boolean);
  }

  // ---------- Fin de partida ----------

  #renderEnd({ room, game, players, me }) {
    const result = game.result;
    if (!result) return;
    const firstTime = this.endShownFor !== result.endedAt;
    if (firstTime) {
      this.endShownFor = result.endedAt;
      $('#end-screen').classList.remove('hidden');
      play((result.winners ?? [result.winner]).includes(me) ? 'victory' : 'defeat');
    }
    if (!firstTime && this.renderedEndFor === `${result.endedAt}:${room.hostId}`) return;
    this.renderedEndFor = `${result.endedAt}:${room.hostId}`;

    const winner = players.get(result.winner);
    const won = (result.winners ?? [result.winner]).includes(me);
    const title = result.reason === 'defeat' ? 'DERROTA' : won ? 'VICTORIA' : 'FIN DE LA PARTIDA';
    const winnerName = result.team ? teamName(room.settings, result.team, game.scenario) : winner?.name ?? 'Un jugador';
    const subtitle = result.reason === 'defeat'
      ? VICTORY_REASONS.defeat
      : `${won ? (result.team ? `¡Tu equipo gana! ${winnerName}` : 'Has ganado') : `${winnerName} gana`} ${VICTORY_REASONS[result.reason]}`;
    const minutes = Math.round(result.duration / 60_000);
    const isHost = room.hostId === me;

    fill($('#end-box'),
      h('div', { class: `end-title ${won ? 'won' : result.reason === 'defeat' ? 'lost' : ''}` },
        h('span', { class: 'eyebrow' }, `Partida terminada · ${minutes} min`),
        h('h2', {}, title),
        h('p', {}, subtitle)),
      rankingTable(result.standings, players, me, game.teams),
      h('div', { class: 'end-actions' },
        h('button', { class: 'btn btn-ghost', onClick: () => this.showResults(false) }, 'Ver el mapa'),
        h('button', { class: 'btn btn-ghost', onClick: () => $('#btn-leave-game').click() }, 'Salir'),
        isHost
          ? h('button', {
              class: 'btn btn-primary',
              onClick: async () => {
                const res = await request('room:backToLobby');
                if (!res.ok) toast(res.error, 'error');
              },
            }, 'Volver al lobby (revancha)')
          : h('span', { class: 'muted' }, 'Esperando a que el anfitrión vuelva al lobby…')));
    // Al cerrar o reabrir la ventana se actualiza el aviso del mapa.
    $('#ended-banner').classList.toggle('hidden', !$('#end-screen').classList.contains('hidden'));
  }

  // ---------- Recursos y reloj ----------

  #buildResourceBar() {
    $('#resources').replaceChildren(...RESOURCES.map((r) => h('span', {
      class: `res res-${r}`,
      'data-res': r,
      title: RESOURCE_INFO[r].label,
    }, h('i', { class: 'res-icon' }, RESOURCE_INFO[r].icon), h('span', { class: 'res-label' }, RESOURCE_INFO[r].label), h('b', {}, '—'), h('em', {}))));
  }

  #renderResources() {
    const self = this.getState().self;
    if (!self) return;
    for (const r of RESOURCES) {
      const el = $(`#resources [data-res="${r}"]`);
      const value = self.resources[r];
      const net = Math.round((self.income[r] - self.upkeep[r]) * 10) / 10;
      const empty = value <= 0 && net <= 0;
      el.querySelector('b').textContent = fmt.format(value);
      const em = el.querySelector('em');
      const shown = Math.abs(net) >= 10 ? Math.round(net) : net; // decimales solo en cifras pequeñas
      em.textContent = `${net >= 0 ? '+' : ''}${fmt1.format(shown)}`;
      em.classList.toggle('neg', net < 0);
      el.classList.toggle('empty', empty);
      el.title = `${RESOURCE_INFO[r].label}: ${value}\nIngresos: +${fmt1.format(self.income[r])}/min\nMantenimiento: −${fmt1.format(self.upkeep[r])}/min`
        + (empty ? '\n¡Sin suministro! Las tropas que dependen de este recurso rinden a la mitad.' : '');

      // Animación solo para cambios bruscos (gastos), no para el goteo continuo de ingresos.
      const prev = this.shownResources?.[r];
      const delta = prev == null ? 0 : value - prev;
      const drip = Math.abs(net) / 60 * 2 + 1;
      if (Math.abs(delta) > drip) {
        el.classList.remove('bump-up', 'bump-down');
        void el.offsetWidth; // reinicia la animación
        el.classList.add(delta > 0 ? 'bump-up' : 'bump-down');
        const float = h('span', { class: `res-float ${delta > 0 ? 'up' : 'down'}` }, `${delta > 0 ? '+' : ''}${fmt.format(delta)}`);
        el.append(float);
        setTimeout(() => float.remove(), 1400);
      }
    }
    this.shownResources = { ...self.resources };
  }

  #tickClock() {
    const game = this.getState().room?.game;
    if (!game) return;
    if (game.phase === 'picking' && game.pickDeadline) {
      const secs = Math.ceil(Math.max(0, game.pickDeadline - this.#serverNow()) / 1000);
      const el = $('#pick-timer');
      el.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      el.classList.toggle('urgent', secs <= 10);
    }
    // Con límite de tiempo, el reloj cuenta hacia atrás; si no, muestra el tiempo jugado.
    const limit = game.victory?.timeLimitMs;
    const end = game.result?.endedAt ?? this.#serverNow();
    const elapsed = game.startedAt ? Math.max(0, end - game.startedAt) : 0;
    const shown = limit ? Math.max(0, limit - elapsed) : elapsed;
    const secs = Math.floor(shown / 1000);
    const clockEl = $('#game-clock');
    clockEl.textContent = `${limit ? '⏳ ' : ''}${durationText(shown)}`;
    clockEl.classList.toggle('urgent', Boolean(limit) && secs <= 60 && !game.result);
  }
}
