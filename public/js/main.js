import { SETTINGS_SCHEMA, optionLabel } from '/shared/settings.js';
import { socket, request, getSession, setSession } from './net.js';
import { $, h, toast, copyText, avatarEl } from './dom.js';
import { AVATARS, DEFAULT_AVATAR, PRESIDENTS, PRESIDENT_IDS } from '/shared/leaders.js';
import { scenarioOf, inScenario } from '/shared/scenarios.js';
import { GameView, loadWorld } from './game-ui.js';
import { play, isMuted, setMuted } from './sound.js';
import { decodeCountries } from '/shared/wire.js';

const NAME_KEY = 'dg.name';
const AVATAR_KEY = 'dg.avatar';
const PRESIDENT_KEY = 'dg.president';

const savedAvatar = () => {
  const a = localStorage.getItem(AVATAR_KEY);
  return AVATARS.includes(a) ? a : DEFAULT_AVATAR;
};

// Estado local: solo es un reflejo de lo que dice el servidor.
const state = {
  me: null,    // id público de este jugador
  room: null,  // última instantánea de la sala
  self: null,  // datos privados de la partida (recursos, ingresos, informe)
  account: null, // { username } si se ha iniciado sesión
  games: [],     // «Mis partidas» de la cuenta
};

// ================= Pantallas =================

function showScreen(name) {
  for (const el of document.querySelectorAll('.screen')) {
    el.classList.toggle('active', el.id === `screen-${name}`);
  }
}

const gameView = new GameView(() => state);
let worldData = null; // mapa (para elegir país en la sala)

function render() {
  const { room } = state;
  if (!room) {
    renderMenu();
    return showScreen('menu');
  }
  // El chat es el mismo panel en el lobby y en la partida: se mueve de sitio.
  const chatPanel = $('#chat-panel');
  if (room.state === 'lobby') {
    $('#lobby-chat-slot').append(chatPanel);
    renderLobby();
    showScreen('lobby');
  } else {
    $('#game-chat-slot').append(chatPanel);
    showScreen('game');
    gameView.show();
  }
}

function setRoom(room) {
  // Los países llegan en formato compacto; se expanden aquí una sola vez.
  if (room?.game?.countries) room.game.countries = decodeCountries(room.game.countries);
  const previous = state.room?.state;
  state.room = room;
  if (previous === 'lobby' && room?.state === 'playing') {
    toast('¡La partida ha comenzado!', 'success');
    play('start');
  }
  // Revancha: al volver al lobby se olvida todo lo de la partida anterior.
  if (previous && previous !== 'lobby' && room?.state === 'lobby') {
    state.self = null;
    gameView.reset();
  }
  render();
}

function enterRoom(res) {
  const fresh = state.room?.code !== res.room.code;
  state.me = res.you;
  state.self = res.self ?? null;
  gameView.diplo.loadDirect(res.dms);
  resetChat(res.chat);
  setRoom(res.room);
  history.replaceState(null, '', `?code=${res.room.code}`);
  // El presidente elegido la última vez se recuerda para la siguiente sala.
  const me = res.room.players.find((p) => p.id === res.you);
  const president = localStorage.getItem(PRESIDENT_KEY);
  if (fresh && res.room.state === 'lobby' && PRESIDENTS[president] && me?.president !== president) {
    request('room:profile', { president });
  }
}

function exitToMenu(message, kind = 'info') {
  state.room = null;
  state.me = null;
  state.self = null;
  gameView.reset();
  history.replaceState(null, '', location.pathname);
  render();
  if (message) toast(message, kind);
  if (state.account) refreshGames();
  else refreshGuestGame();
}

// ================= Menú principal =================

const nameInput = $('#input-name');
const codeInput = $('#input-code');
nameInput.value = localStorage.getItem(NAME_KEY) ?? '';

function readName() {
  if (state.account) return state.account.username;
  const name = nameInput.value.trim();
  if (name.length < 2) {
    toast('Escribe un nombre de al menos 2 caracteres', 'error');
    nameInput.focus();
    return null;
  }
  localStorage.setItem(NAME_KEY, name);
  return name;
}

function showJoin(visible) {
  $('#menu-main').classList.toggle('hidden', visible);
  $('#menu-join').classList.toggle('hidden', !visible);
  if (visible) codeInput.focus();
}

async function withBusy(button, fn) {
  button.disabled = true;
  try {
    await fn();
  } finally {
    button.disabled = false;
  }
}

$('#btn-create').addEventListener('click', (e) => {
  const name = readName();
  if (!name) return;
  withBusy(e.currentTarget, async () => {
    const res = await request('room:create', { name, avatar: savedAvatar() });
    if (!res.ok) return toast(res.error, 'error');
    enterRoom(res);
  });
});

$('#btn-show-join').addEventListener('click', () => showJoin(true));
$('#btn-cancel-join').addEventListener('click', () => showJoin(false));

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

$('#menu-join').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = readName();
  if (!name) return;
  const code = codeInput.value.trim();
  if (code.length !== 6) return toast('El código tiene 6 caracteres', 'error');
  withBusy($('#btn-join'), async () => {
    const res = await request('room:join', { name, code, avatar: savedAvatar() });
    if (!res.ok) return toast(res.error, 'error');
    enterRoom(res);
  });
});

// ================= Cuenta y «Mis partidas» =================

let authMode = 'login';
for (const tab of document.querySelectorAll('.account-tabs .tab')) {
  tab.addEventListener('click', () => {
    authMode = tab.dataset.mode;
    for (const t of document.querySelectorAll('.account-tabs .tab')) t.classList.toggle('active', t === tab);
    $('#btn-auth').textContent = authMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta';
    $('#auth-pass').setAttribute('autocomplete', authMode === 'login' ? 'current-password' : 'new-password');
    $('#auth-hint').textContent = authMode === 'login'
      ? 'Con una cuenta tus partidas se guardan y puedes jugar varias a la vez, desde cualquier dispositivo.'
      : 'Elige un usuario (3 a 16 letras o números) y una contraseña de al menos 6 caracteres. No la compartas.';
  });
}

function setAccount(account, games = []) {
  state.account = account;
  state.games = games;
  render();
}

$('#auth-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const username = $('#auth-user').value.trim();
  const password = $('#auth-pass').value;
  withBusy($('#btn-auth'), async () => {
    const res = await request(authMode === 'login' ? 'auth:login' : 'auth:register', { username, password });
    if (!res.ok) return toast(res.error, 'error');
    $('#auth-pass').value = '';
    setSession(res.session);
    setAccount(res.account, res.games);
    toast(authMode === 'login' ? `¡Hola de nuevo, ${res.account.username}!` : `Cuenta creada. ¡Bienvenido, ${res.account.username}!`, 'success');
  });
});

$('#btn-logout').addEventListener('click', async () => {
  await request('auth:logout', { session: getSession() });
  setSession(null);
  state.account = null;
  state.games = [];
  exitToMenu('Has cerrado la sesión');
});

async function refreshGames() {
  if (!state.account) return;
  const res = await request('account:games');
  if (res.ok) {
    state.games = res.games;
    if (!state.room) renderMenu();
  }
}
$('#btn-refresh-games').addEventListener('click', refreshGames);

// 🏠 Menú: vuelve al menú principal sin abandonar la partida.
for (const btn of document.querySelectorAll('.btn-my-games')) {
  btn.addEventListener('click', async () => {
    const res = await request('room:detach');
    if (!res.ok) return toast(res.error, 'error');
    exitToMenu('Has vuelto al menú. Tu partida sigue en marcha.');
  });
}

// Invitado: la partida a la que puede volver desde el menú.
let guestGame = null;
async function refreshGuestGame() {
  if (state.account) return;
  const res = await request('session:peek');
  guestGame = res.ok ? res.game : null;
  if (!state.room) renderMenu();
}

const STATE_LABEL = { lobby: '🕓 En la sala', playing: '⚔ En juego', finished: '🏁 Terminada' };

function renderMenu() {
  const logged = Boolean(state.account);
  $('#account-out').classList.toggle('hidden', logged);
  $('#account-in').classList.toggle('hidden', !logged);
  $('#guest-name').classList.toggle('hidden', logged);
  $('#my-games').classList.toggle('hidden', !logged);
  $('#guest-game').classList.toggle('hidden', logged || !guestGame);
  if (!logged) {
    if (guestGame) $('#guest-game-card').replaceChildren(gameCard(guestGame, true));
    return;
  }
  $('#account-name').textContent = state.account.username;
  const list = $('#games-list');
  if (!state.games.length) {
    list.replaceChildren(h('p', { class: 'muted' }, 'Todavía no tienes partidas. Crea una o únete con un código: aparecerán aquí y podrás volver a ellas cuando quieras.'));
    return;
  }
  list.replaceChildren(...state.games.map(gameCard));
}

function gameCard(g, guest = false) {
  const country = g.you.country && worldData?.byId.get(g.you.country)?.name;
  let status = STATE_LABEL[g.state] ?? g.state;
  if (g.state === 'playing' && g.phase === 'picking') status = '🗺 Eligiendo países';
  if (g.you.eliminated) status = '☠ Eliminado';
  if (g.you.won === true) status = '🏆 Has ganado';
  const enter = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const res = guest ? await request('session:resume') : await request('room:enter', { code: g.code });
    btn.disabled = false;
    if (!res.ok || (guest && !res.restored)) {
      toast(res.error ?? 'Esa partida ya no existe', 'error');
      return guest ? refreshGuestGame() : refreshGames();
    }
    enterRoom(res);
  };
  return h('article', { class: `game-card state-${g.state}${g.you.eliminated ? ' out' : ''}` },
    h('div', { class: 'game-card-head' },
      h('span', { class: 'game-card-code' }, g.code),
      h('span', { class: 'game-card-status' }, status),
      g.isHost && h('span', { class: 'badge badge-host' }, 'Anfitrión')),
    h('div', { class: 'game-card-info' },
      h('span', {}, scenarioOf(g.scenario).label),
      country && h('span', {}, `Tu país: ${country}${g.you.countries > 1 ? ` (+${g.you.countries - 1})` : ''}`),
      g.startedAt && h('span', { class: 'muted' }, `Empezó ${new Date(g.startedAt).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`)),
    h('div', { class: 'game-card-players' },
      g.players.map((p) => h('span', { class: `game-card-player${p.connected ? ' online' : ''}`, title: `${p.name}${p.connected ? ' · conectado' : ''}` },
        h('i', { style: { background: p.color } }), p.avatar, ' ', p.name)),
      h('small', { class: 'muted' }, `${g.players.length}/${g.maxPlayers}`)),
    h('button', { class: 'btn btn-primary btn-sm game-card-enter', onClick: enter }, g.state === 'lobby' ? 'Ir a la sala' : 'Entrar'));
}

// Enlace de invitación: /?code=XXXXXX abre directamente el formulario de unión.
const inviteCode = new URLSearchParams(location.search).get('code');
if (inviteCode) {
  codeInput.value = inviteCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  showJoin(true);
}

// ================= Lobby =================

const settingControls = new Map(); // key -> { row, control }

function buildSettingsForm() {
  const form = $('#settings-form');
  for (const [key, def] of Object.entries(SETTINGS_SCHEMA)) {
    const control = def.type === 'bool'
      ? h('input', { type: 'checkbox' })
      : h('select', {}, def.options.map((o) => h('option', { value: String(o) }, optionLabel(def, o))));

    control.addEventListener('change', () => {
      const value = def.type === 'bool'
        ? control.checked
        : def.options.find((o) => String(o) === control.value);
      changeSetting(key, value);
    });

    const row = h('label', { class: `setting-row${def.dependsOn ? ' nested' : ''}` },
      h('span', { class: 'setting-label' }, def.label),
      def.type === 'bool' ? h('span', { class: 'switch' }, control, h('span', { class: 'slider' })) : control,
    );
    form.append(row);
    settingControls.set(key, { row, control, def });
  }
}

async function changeSetting(key, value) {
  const res = await request('room:settings', { patch: { [key]: value } });
  if (!res.ok) {
    toast(res.error, 'error');
    renderLobby(); // vuelve a mostrar el valor real del servidor
  }
}

const isHost = () => state.room?.hostId === state.me;

function renderLobby() {
  const { room } = state;
  const host = isHost();
  const me = room.players.find((p) => p.id === state.me);

  $('#lobby-code').textContent = room.code;
  $('#lobby-count').textContent = `${room.players.length} / ${room.settings.maxPlayers}`;

  // Jugadores + huecos libres
  const list = $('#player-list');
  list.replaceChildren(
    ...room.players.map((p) => playerItem(p, host)),
    ...Array.from({ length: Math.max(0, room.settings.maxPlayers - room.players.length) }, () =>
      h('li', { class: 'player empty' }, h('span', { class: 'swatch' }), 'Esperando comandante…')),
  );

  // Ajustes: editables solo por el anfitrión
  $('#settings-hint').textContent = host ? 'Puedes modificarlos' : 'Solo el anfitrión puede cambiarlos';
  for (const [key, { row, control, def }] of settingControls) {
    const value = room.settings[key];
    if (def.type === 'bool') control.checked = value;
    else control.value = String(value);
    control.disabled = !host;
    row.classList.toggle('disabled', Boolean(def.dependsOn && !room.settings[def.dependsOn]));
  }

  // Barra de acciones
  const others = room.players.filter((p) => !p.isHost);
  const waiting = others.filter((p) => !p.ready || !p.connected);
  $('#btn-start').classList.toggle('hidden', !host);
  $('#btn-ready').classList.toggle('hidden', host);
  $('#btn-start').disabled = waiting.length > 0;
  $('#btn-ready').textContent = me?.ready ? 'Cancelar listo' : 'Estoy listo';
  $('#btn-ready').classList.toggle('btn-primary', !me?.ready);

  let hint;
  if (host) {
    hint = waiting.length > 0
      ? `Esperando a: ${waiting.map((p) => p.name).join(', ')}`
      : others.length === 0
        ? 'Puedes empezar solo contra la IA o esperar a tus amigos'
        : 'Todos listos. ¡A tus órdenes!';
  } else {
    hint = me?.ready ? 'Esperando a que el anfitrión empiece…' : 'Marca que estás listo cuando quieras';
  }
  $('#start-hint').textContent = hint;
  renderProfile(me);
}

// ---------- Tu mando: avatar, presidente y país ----------

async function setProfile(patch) {
  const res = await request('room:profile', patch);
  if (!res.ok) {
    toast(res.error, 'error');
    renderLobby();
  }
  return res.ok;
}

function renderProfile(me) {
  if (!me) return;
  $('#avatar-grid').replaceChildren(...AVATARS.map((a) => h('button', {
    class: `avatar-option${me.avatar === a ? ' active' : ''}`,
    title: 'Elegir este avatar',
    onClick: () => {
      localStorage.setItem(AVATAR_KEY, a);
      setProfile({ avatar: a });
    },
  }, a)));

  $('#president-list').replaceChildren(...PRESIDENT_IDS.map((id) => {
    const p = PRESIDENTS[id];
    return h('button', {
      class: `president-card${me.president === id ? ' active' : ''}`,
      onClick: () => {
        localStorage.setItem(PRESIDENT_KEY, id);
        setProfile({ president: id });
      },
    },
    h('span', { class: 'president-portrait' }, p.portrait),
    h('span', { class: 'president-text' },
      h('strong', {}, p.title),
      h('small', { class: 'muted' }, p.name),
      h('span', { class: 'president-perk' }, p.perk)));
  }));

  renderCountryPick(me);
}

const countrySelect = $('#country-select');
countrySelect.addEventListener('change', async () => {
  const value = countrySelect.value || null;
  await setProfile({ country: value });
});

function renderCountryPick(me) {
  const world = worldData;
  if (!world) {
    loadWorld().then((w) => { worldData = w; if (state.room?.state === 'lobby') renderLobby(); }).catch(() => {});
    return;
  }
  const scenarioId = state.room.settings.mapScenario;
  const scenario = scenarioOf(scenarioId);
  const featured = new Set(scenario.featured ?? []);
  const others = state.room.players.filter((p) => p.id !== me.id && p.country);
  const blockedBy = new Map();
  const taken = new Map();
  for (const o of others) {
    taken.set(o.country, o.name);
    if (scenario.allowNeighbors) continue;
    for (const n of world.byId.get(o.country)?.neighbors ?? []) if (!blockedBy.has(n)) blockedBy.set(n, o.name);
  }
  // Las opciones se construyen de nuevo solo si cambia el mapa; luego se actualiza cuáles están ocupadas.
  if (countrySelect.dataset.scenario !== scenarioId) {
    countrySelect.dataset.scenario = scenarioId;
    const sorted = world.countries.filter((c) => inScenario(scenarioId, c.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const option = (c) => h('option', { value: c.id }, c.name);
    countrySelect.replaceChildren(...[
      h('option', { value: '' }, '🎲 El que me toque'),
      featured.size > 0 && h('optgroup', { label: '⭐ Protagonistas de esta guerra' },
        sorted.filter((c) => featured.has(c.id)).map(option)),
      h('optgroup', { label: featured.size ? 'Todos los países' : `Países del mapa (${sorted.length})` },
        sorted.filter((c) => !featured.has(c.id)).map(option)),
    ].filter(Boolean));
  }
  for (const opt of countrySelect.querySelectorAll('option')) {
    if (!opt.value) continue;
    const name = world.byId.get(opt.value).name;
    const by = taken.get(opt.value);
    const near = blockedBy.get(opt.value);
    opt.disabled = Boolean(by || near);
    opt.textContent = `${featured.has(opt.value) ? '⭐ ' : ''}${name}${by ? ` (de ${by})` : near ? ` (cerca de ${near})` : ''}`;
  }
  if (document.activeElement !== countrySelect) countrySelect.value = me.country ?? '';

  $('#scenario-info').textContent = `${scenario.label} — ${scenario.description}`;
  const c = me.country ? world.byId.get(me.country) : null;
  $('#country-info').textContent = c
    ? `${c.coastal ? 'Con costa' : 'Sin costa'} · ${c.neighbors.length} vecinos · ${new Intl.NumberFormat('es-ES').format(Math.round(c.area / 1000))} mil km²`
    : state.room.settings.countryAssignment === 'choose'
      ? 'Si no eliges aquí, lo elegirás en el mapa al empezar.'
      : 'Si no eliges, recibirás un país al azar lejos de los demás.';
  drawPreview(c);
}

let previewId;
function drawPreview(c) {
  const svg = $('#country-preview');
  if ((c?.id ?? null) === previewId) return;
  previewId = c?.id ?? null;
  if (!c) {
    svg.replaceChildren();
    svg.removeAttribute('viewBox');
    svg.classList.add('empty');
    return;
  }
  svg.classList.remove('empty');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', c.d);
  svg.replaceChildren(path);
  requestAnimationFrame(() => {
    const b = path.getBBox();
    const pad = Math.max(b.width, b.height) * 0.08 + 1;
    svg.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`);
  });
}

function playerItem(p, viewerIsHost) {
  const isMe = p.id === state.me;
  const badges = [
    p.isHost && h('span', { class: 'badge badge-host' }, 'Anfitrión'),
    !p.isHost && h('span', { class: `badge ${p.ready ? 'badge-ready' : ''}` }, p.ready ? 'Listo' : 'No listo'),
    !p.connected && h('span', { class: 'badge badge-warn' }, 'Desconectado'),
  ];
  const kick = viewerIsHost && !isMe
    ? h('button', {
        class: 'btn btn-ghost btn-xs',
        title: `Expulsar a ${p.name}`,
        onClick: () => kickPlayer(p),
      }, 'Expulsar')
    : null;

  const pres = PRESIDENTS[p.president];
  const country = p.country && worldData?.byId.get(p.country)?.name;
  return h('li', { class: `player${p.connected ? '' : ' offline'}${isMe ? ' me' : ''}` },
    h('span', { class: 'swatch', style: { background: p.color } }),
    h('span', { class: 'player-avatar' }, p.avatar ?? DEFAULT_AVATAR),
    h('span', { class: 'player-name' }, p.name, isMe ? h('em', {}, ' (tú)') : null,
      h('small', { class: 'player-sub' }, `${pres ? `${pres.portrait} ${pres.title}` : ''} · ${country ?? '🎲 país al azar'}`)),
    h('span', { class: 'badges' }, badges),
    kick,
  );
}

async function kickPlayer(p) {
  if (!confirm(`¿Expulsar a ${p.name} de la sala?`)) return;
  const res = await request('room:kick', { playerId: p.id });
  if (!res.ok) toast(res.error, 'error');
}

$('#btn-ready').addEventListener('click', (e) => {
  const me = state.room?.players.find((p) => p.id === state.me);
  withBusy(e.currentTarget, async () => {
    const res = await request('room:ready', { ready: !me?.ready });
    if (!res.ok) toast(res.error, 'error');
  });
});

$('#btn-start').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  const res = await request('room:start');
  if (!res.ok) {
    toast(res.error, 'error');
    btn.disabled = false;
  }
});

async function leaveRoom() {
  await request('room:leave');
  exitToMenu('Has salido de la partida');
}
$('#btn-leave').addEventListener('click', () => {
  if (confirm('¿Abandonar la sala? Para volver al menú sin salir usa 🏠 Menú.')) leaveRoom();
});
$('#btn-leave-game').addEventListener('click', () => {
  if (confirm('¿Seguro que quieres abandonar la partida?')) leaveRoom();
});

$('#btn-copy-code').addEventListener('click', async () => {
  if (await copyText(state.room.code)) toast('Código copiado');
});
$('#btn-copy-link').addEventListener('click', async () => {
  const link = `${location.origin}/?code=${state.room.code}`;
  if (await copyText(link)) toast('Enlace de invitación copiado');
});

// ================= Chat =================

const chatLog = $('#chat-log');

function chatItem(msg) {
  const time = new Date(msg.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (msg.system) {
    return h('li', { class: 'chat-msg system' }, h('time', {}, time), h('span', {}, msg.text));
  }
  return h('li', { class: 'chat-msg' },
    h('time', {}, time),
    msg.avatar && avatarEl(msg),
    h('strong', { style: { color: msg.color } }, msg.name),
    h('span', {}, msg.text),
  );
}

function resetChat(messages = []) {
  chatLog.replaceChildren(...messages.map(chatItem));
  chatLog.scrollTop = chatLog.scrollHeight;
}

function appendChat(msg) {
  const nearBottom = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 40;
  chatLog.append(chatItem(msg));
  while (chatLog.children.length > 100) chatLog.firstChild.remove();
  if (nearBottom) chatLog.scrollTop = chatLog.scrollHeight;
}

$('#chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  const res = await request('chat:send', { text });
  if (!res.ok) {
    toast(res.error, 'error');
    input.value = text;
  }
});

// ================= Eventos del servidor =================

const connStatus = $('#conn-status');
function setConn(kind, label) {
  connStatus.dataset.state = kind;
  connStatus.querySelector('.label').textContent = label;
}

socket.on('connect', async () => {
  setConn('online', 'Conectado');
  const hadRoom = Boolean(state.room);
  const currentCode = state.room?.code ?? new URLSearchParams(location.search).get('code');

  // ¿Hay sesión de cuenta? Entonces se vuelve a la partida en la que estábamos (si es nuestra) o al menú.
  const me = await request('account:me');
  if (me.ok && me.account) {
    state.account = me.account;
    state.games = me.games;
    const mine = me.games.find((g) => g.code === currentCode);
    if (mine) {
      const res = await request('room:enter', { code: mine.code });
      if (res.ok) return enterRoom(res);
    }
    if (hadRoom) return exitToMenu('La partida ya no existe', 'error');
    return render();
  }
  if (getSession()) setSession(null); // sesión caducada o cerrada en otro sitio
  state.account = null;

  // Invitado: tras una recarga o un corte de red, recupera la partida en la que estábamos.
  const res = await request('session:resume');
  if (res.ok && res.restored) {
    enterRoom(res);
    if (!hadRoom) toast(`Reconectado a la sala ${res.room.code}`, 'success');
  } else if (hadRoom) {
    exitToMenu('La partida ya no existe', 'error');
  } else {
    render();
  }
});

socket.on('disconnect', () => setConn('offline', 'Reconectando…'));
socket.on('connect_error', () => setConn('offline', 'Sin conexión con el servidor'));

socket.on('room:state', (room) => {
  if (state.room && room.code !== state.room.code) return;
  if (!state.room && !state.me) return;
  setRoom(room);
});
socket.on('chat:message', appendChat);
socket.on('game:self', (self) => {
  if (!state.room) return;
  state.self = self;
  gameView.render();
});
socket.on('room:kicked', () => exitToMenu('El anfitrión te ha expulsado de la sala', 'error'));
socket.on('room:closed', () => exitToMenu('La sala se ha cerrado por inactividad', 'error'));
socket.on('session:replaced', () => {
  $('#overlay-title').textContent = 'Sesión abierta en otra pestaña';
  $('#overlay-text').textContent = 'Esta partida se está jugando desde otra ventana. Recarga para recuperarla aquí.';
  $('#overlay').classList.remove('hidden');
});
$('#overlay-btn').addEventListener('click', () => location.reload());

// ================= Sonido =================

function renderMute() {
  for (const btn of document.querySelectorAll('.btn-mute')) {
    btn.textContent = isMuted() ? '🔇' : '🔊';
    btn.title = isMuted() ? 'Activar el sonido' : 'Silenciar';
  }
}
for (const btn of document.querySelectorAll('.btn-mute')) {
  btn.addEventListener('click', () => {
    setMuted(!isMuted());
    renderMute();
    play('click');
  });
}
renderMute();

// ================= Inicio =================

// Alto real de la pantalla: en los móviles, 100vh incluye la barra del navegador
// y dejaría el panel inferior escondido debajo.
function setAppHeight() {
  document.documentElement.style.setProperty('--app-h', `${window.visualViewport?.height ?? window.innerHeight}px`);
}
window.addEventListener('resize', setAppHeight);
window.visualViewport?.addEventListener('resize', setAppHeight);
setAppHeight();

buildSettingsForm();
render();
// Precarga el mapa mientras se está en el menú (también da los nombres de países de «Mis partidas»).
loadWorld().then((w) => {
  worldData = w;
  if (!state.room) renderMenu();
}).catch(() => {});
