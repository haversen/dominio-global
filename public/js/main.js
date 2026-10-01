import { SETTINGS_SCHEMA, optionLabel } from '/shared/settings.js';
import { socket, request } from './net.js';
import { $, h, toast, copyText } from './dom.js';
import { GameView, loadWorld } from './game-ui.js';
import { play, isMuted, setMuted } from './sound.js';
import { decodeCountries } from '/shared/wire.js';

const NAME_KEY = 'dg.name';

// Estado local: solo es un reflejo de lo que dice el servidor.
const state = {
  me: null,    // id público de este jugador
  room: null,  // última instantánea de la sala
  self: null,  // datos privados de la partida (recursos, ingresos, informe)
};

// ================= Pantallas =================

function showScreen(name) {
  for (const el of document.querySelectorAll('.screen')) {
    el.classList.toggle('active', el.id === `screen-${name}`);
  }
}

const gameView = new GameView(() => state);

function render() {
  const { room } = state;
  if (!room) return showScreen('menu');
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
  state.me = res.you;
  state.self = res.self ?? null;
  resetChat(res.chat);
  setRoom(res.room);
  history.replaceState(null, '', `?code=${res.room.code}`);
}

function exitToMenu(message, kind = 'info') {
  state.room = null;
  state.me = null;
  state.self = null;
  gameView.reset();
  history.replaceState(null, '', location.pathname);
  render();
  if (message) toast(message, kind);
}

// ================= Menú principal =================

const nameInput = $('#input-name');
const codeInput = $('#input-code');
nameInput.value = localStorage.getItem(NAME_KEY) ?? '';

function readName() {
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
    const res = await request('room:create', { name });
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
    const res = await request('room:join', { name, code });
    if (!res.ok) return toast(res.error, 'error');
    enterRoom(res);
  });
});

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

  return h('li', { class: `player${p.connected ? '' : ' offline'}${isMe ? ' me' : ''}` },
    h('span', { class: 'swatch', style: { background: p.color } }),
    h('span', { class: 'player-name' }, p.name, isMe ? h('em', {}, ' (tú)') : null),
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
$('#btn-leave').addEventListener('click', leaveRoom);
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
  // Tras una recarga o un corte de red, recupera la partida en la que estábamos.
  const hadRoom = Boolean(state.room);
  const res = await request('session:resume');
  if (res.ok && res.restored) {
    enterRoom(res);
    if (!hadRoom) toast(`Reconectado a la sala ${res.room.code}`, 'success');
  } else if (hadRoom) {
    exitToMenu('La partida ya no existe', 'error');
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

buildSettingsForm();
render();
loadWorld().catch(() => {}); // precarga el mapa mientras se está en el menú
