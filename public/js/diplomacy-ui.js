// Diplomacia, comercio, tecnología y clasificación: ventana modal, propuestas sobre el mapa y avisos.

import { $, h, toast, guardTaps } from './dom.js';
import { request, socket } from './net.js';
import { RELATIONS, PROPOSALS, relationOf, declareWarError, proposalError } from '/shared/diplomacy.js';
import {
  TECHS, TECH_TYPES, TECH_MAX_LEVEL, techCost, techMs, TECH_TREE, TREE_NODES, TREE_BRANCHES, nodeError,
} from '/shared/tech.js';
import { UNITS, WEAPONS } from '/shared/military.js';
import { RESOURCES, RESOURCE_INFO, canAfford } from '/shared/economy.js';
import { play } from './sound.js';

const fmt = new Intl.NumberFormat('es-ES');

const fill = (el, ...children) => el.replaceChildren(...children.flat().filter((c) => c != null && c !== false));

const clock = (ms) => {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
};

const ROMAN = ['', 'I', 'II', 'III'];

const nodeInfo = (id) => {
  const { unit, weapon } = TECH_TREE[id].unlocks;
  return unit ? UNITS[unit] : WEAPONS[weapon];
};

const resourcesText = (obj) => Object.entries(obj ?? {})
  .map(([r, v]) => `${fmt.format(v)} ${RESOURCE_INFO[r].label.toLowerCase()}`).join(', ') || 'nada';

export class DiplomacyView {
  /** getCtx() devuelve { game, players, me, self }; serverNow() el reloj del servidor. */
  constructor({ getCtx, serverNow }) {
    this.getCtx = getCtx;
    this.serverNow = serverNow;
    this.tab = null;
    this.tradeWith = null;
    this.seenProposals = null;
    this.lastTech = null;
    this.lastUnlocked = null;
    this.dms = [];       // mensajes privados (enviados y recibidos)
    this.unread = {};    // jugador -> mensajes sin leer
    this.dmWith = null;  // conversación abierta

    $('#btn-diplomacy').addEventListener('click', () => this.open('diplomacy'));
    $('#btn-tech').addEventListener('click', () => this.open('tech'));
    $('#btn-ranking').addEventListener('click', () => this.open('ranking'));
    $('#modal-close').addEventListener('click', () => this.close());
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') this.close(); });
    for (const tab of document.querySelectorAll('#modal .tab')) {
      tab.addEventListener('click', () => this.open(tab.dataset.tab));
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.tab) this.close(); });

    // Mientras se pulsa un botón no se redibuja (el estado llega cada segundo).
    const guards = [$('#modal'), $('#proposals')].map((el) => guardTaps(el, () => this.render()));
    Object.defineProperty(this, 'pressed', { get: () => guards.some((g) => g.isPressed()) });

    socket.on('dm:message', (msg) => this.#onDirect(msg));

    socket.on('diplo:answered', ({ type, accepted, by }) => {
      const name = this.getCtx()?.players.get(by)?.name ?? 'El otro jugador';
      const what = PROPOSALS[type]?.label.toLowerCase() ?? 'propuesta';
      toast(accepted ? `${name} ha aceptado: ${what}` : `${name} ha rechazado: ${what}`, accepted ? 'success' : 'error', 4500);
      play('notify');
    });
  }

  open(tab) {
    this.tab = tab;
    this.tradeWith = null;
    this.dmWith = null;
    $('#modal').classList.remove('hidden');
    this.render(true);
  }

  close() {
    this.tab = null;
    this.tradeWith = null;
    this.dmWith = null;
    $('#modal').classList.add('hidden');
  }

  reset() {
    this.close();
    this.seenProposals = null;
    this.lastTech = null;
    this.lastUnlocked = null;
    this.dms = [];
    this.unread = {};
  }

  /** Historial de mensajes privados al entrar o reconectar (se dan por leídos). */
  loadDirect(messages) {
    this.dms = messages ?? [];
    this.unread = {};
  }

  render(force = false) {
    const ctx = this.getCtx();
    if (!ctx?.self) return;
    this.#notify(ctx);
    this.#renderButtons(ctx);
    if (this.pressed && !force) return;
    this.#renderStack(ctx);
    // Ni el comercio ni las conversaciones se redibujan solos, para no borrar lo que se está escribiendo.
    if (this.tab && ((!this.tradeWith && !this.dmWith) || force)) this.#renderModal(ctx);
  }

  // ---------- Avisos ----------

  #notify({ self, players, me }) {
    const incoming = self.proposals.filter((p) => p.to === me);
    if (this.seenProposals === null) {
      this.seenProposals = new Set(incoming.map((p) => p.id));
    } else {
      for (const p of incoming) {
        if (this.seenProposals.has(p.id)) continue;
        this.seenProposals.add(p.id);
        toast(`${players.get(p.from)?.name ?? 'Alguien'} ${PROPOSALS[p.type].verb}`, 'info', 4500);
        play('notify');
      }
    }

    if (this.lastTech) {
      for (const t of TECH_TYPES) {
        if (self.tech[t] > this.lastTech[t]) {
          toast(`Investigación completada: ${TECHS[t].label} nivel ${self.tech[t]}`, 'success', 4500);
          play('notify');
        }
      }
    }
    this.lastTech = { ...self.tech };

    if (this.lastUnlocked) {
      for (const id of self.unlocked ?? []) {
        if (!this.lastUnlocked.includes(id)) {
          toast(`Investigación completada: ${nodeInfo(id).label} desbloqueado`, 'success', 4500);
          play('notify');
        }
      }
    }
    this.lastUnlocked = [...(self.unlocked ?? [])];
  }

  #renderButtons({ self, me }) {
    const unread = Object.values(this.unread).reduce((a, b) => a + b, 0);
    const incoming = self.proposals.filter((p) => p.to === me).length + unread;
    const count = $('#diplo-count');
    count.textContent = incoming;
    count.classList.toggle('hidden', incoming === 0);

    const progress = $('#tech-progress');
    progress.classList.toggle('hidden', !self.research);
    if (self.research) progress.textContent = clock(self.research.readyAt - this.serverNow());

    for (const tab of document.querySelectorAll('#modal .tab')) {
      tab.classList.toggle('active', tab.dataset.tab === this.tab);
    }
  }

  // Propuestas recibidas, siempre visibles sobre el mapa.
  #renderStack({ self, players, me }) {
    const now = this.serverNow();
    const incoming = self.proposals.filter((p) => p.to === me);
    fill($('#proposals'), incoming.map((p) => this.#proposalCard(p, players, now)));
  }

  #proposalCard(p, players, now) {
    const from = players.get(p.from);
    return h('div', { class: 'proposal' },
      h('div', { class: 'proposal-head' },
        h('span', { class: 'swatch', style: { background: from?.color } }),
        h('strong', {}, from?.name ?? '?'),
        h('span', { class: 'muted' }, PROPOSALS[p.type].verb),
        h('b', { class: 'proposal-timer' }, clock(p.expiresAt - now))),
      p.trade && h('p', { class: 'small' }, `Te da: ${resourcesText(p.trade.give)} · Pide: ${resourcesText(p.trade.receive)}`),
      h('div', { class: 'proposal-actions' },
        h('button', { class: 'btn btn-primary btn-xs', onClick: () => this.#respond(p, true) }, 'Aceptar'),
        h('button', { class: 'btn btn-ghost btn-xs', onClick: () => this.#respond(p, false) }, 'Rechazar')));
  }

  async #respond(p, accept) {
    const res = await request('diplo:respond', { proposalId: p.id, accept });
    if (!res.ok) toast(res.error, 'error');
    else if (accept && p.type === 'trade') toast('Intercambio completado', 'success');
  }

  // ---------- Ventana modal ----------

  #renderModal(ctx) {
    const body = $('#modal-body');
    if (this.tab === 'tech') return fill(body, this.#techView(ctx));
    if (this.tab === 'ranking') return fill(body, rankingView(ctx, this.serverNow()));
    if (this.tradeWith) return fill(body, this.#tradeForm(ctx));
    if (this.dmWith) return fill(body, this.#dmView(ctx));
    fill(body, this.#diplomacyView(ctx));
  }

  #diplomacyView(ctx) {
    const { game, players, me, self } = ctx;
    const now = this.serverNow();
    const counts = {};
    for (const c of Object.values(game.countries)) if (c.owner) counts[c.owner] = (counts[c.owner] ?? 0) + 1;
    const incoming = self.proposals.filter((p) => p.to === me);
    const others = [...players.values()].filter((p) => p.id !== me);
    const iAmOut = game.eliminated?.[me] || game.phase !== 'active';

    return [
      incoming.length > 0 && h('section', { class: 'modal-section' },
        h('h4', { class: 'panel-sub' }, 'Propuestas recibidas'),
        incoming.map((p) => this.#proposalCard(p, players, now))),
      h('section', { class: 'modal-section' },
        h('h4', { class: 'panel-sub' }, 'Relaciones'),
        others.length === 0 && h('p', { class: 'muted' }, 'No hay más jugadores en la partida.'),
        h('div', { class: 'relations' }, others.map((p) => {
          const rel = relationOf(game.relations, me, p.id);
          const out = game.eliminated?.[p.id];
          const pending = self.proposals.filter((x) => x.from === me && x.to === p.id);
          return h('div', { class: `relation-row rel-${rel.state}${out ? ' out' : ''}` },
            h('div', { class: 'relation-who' },
              h('span', { class: 'swatch', style: { background: p.color } }),
              h('strong', {}, p.name),
              h('span', { class: 'muted small' }, out ? 'eliminado' : `${counts[p.id] ?? 0} países${p.connected ? '' : ' · desconectado'}`)),
            h('span', { class: `relation-badge rel-${rel.state}` },
              `${RELATIONS[rel.state].icon} ${RELATIONS[rel.state].label}`,
              rel.state === 'nap' && h('small', {}, ` · ${clock(rel.until - now)}`)),
            h('div', { class: 'relation-actions' },
              h('button', {
                class: `btn btn-xs ${this.unread[p.id] ? 'btn-primary' : ''}`,
                onClick: () => { this.dmWith = p.id; this.unread[p.id] = 0; this.render(true); },
              }, `💬 Mensaje${this.unread[p.id] ? ` (${this.unread[p.id]})` : ''}`),
              !out && !iAmOut && this.#relationActions(p, rel, now)),
            pending.length > 0 && h('div', { class: 'pending' }, pending.map((x) => h('span', { class: 'chip' },
              `${PROPOSALS[x.type].label} enviada · ${clock(x.expiresAt - now)}`,
              h('button', { class: 'btn btn-ghost btn-xs', onClick: () => this.#cancel(x) }, 'Cancelar')))));
        }))),
      h('p', { class: 'muted small' },
        'La guerra se declara al instante. La paz, los pactos (5 min sin poder atacaros), las alianzas y el comercio necesitan que el otro jugador acepte. Las propuestas caducan en 1 minuto. Los mensajes privados solo los ve el destinatario.'),
    ];
  }

  #relationActions(p, rel, now) {
    const actions = [];
    const button = (label, cls, onClick, error) => h('button', {
      class: `btn btn-xs ${cls}`,
      disabled: Boolean(error),
      title: error ?? '',
      onClick,
    }, label);

    const propose = (type) => async () => {
      const res = await request('diplo:propose', { playerId: p.id, type });
      if (!res.ok) toast(res.error, 'error');
      else toast(`${PROPOSALS[type].label}: propuesta enviada a ${p.name}`);
    };
    const war = async () => {
      const betrayal = rel.state === 'alliance';
      if (!confirm(betrayal ? `¿Romper la alianza y declarar la guerra a ${p.name}?` : `¿Declarar la guerra a ${p.name}?`)) return;
      const res = await request('diplo:war', { playerId: p.id });
      if (!res.ok) toast(res.error, 'error');
    };

    if (rel.state === 'war') actions.push(button('☮ Proponer paz', 'btn-primary', propose('peace')));
    if (rel.state !== 'war') {
      if (rel.state !== 'alliance') actions.push(button('🤝 Alianza', '', propose('alliance')));
      if (rel.state === 'peace') actions.push(button('📜 Pacto', '', propose('nap'), proposalError('nap', rel, now)));
      actions.push(button('⇄ Comerciar', '', () => { this.tradeWith = p.id; this.render(true); }));
      actions.push(button(rel.state === 'alliance' ? '🗡 Romper alianza' : '⚔ Declarar guerra', 'btn-danger', war, declareWarError(rel, now)));
    }
    return actions;
  }

  async #cancel(proposal) {
    const res = await request('diplo:cancel', { proposalId: proposal.id });
    if (!res.ok) toast(res.error, 'error');
  }

  #tradeForm({ players, self }) {
    const partner = players.get(this.tradeWith);
    const inputs = { give: {}, receive: {} };
    const column = (side, title) => h('div', { class: 'trade-col' },
      h('h4', { class: 'panel-sub' }, title),
      RESOURCES.map((r) => {
        const input = h('input', { type: 'number', min: '0', step: '1', value: '0', inputmode: 'numeric' });
        inputs[side][r] = input;
        return h('label', { class: `trade-row res-${r}` },
          h('i'),
          h('span', {}, RESOURCE_INFO[r].label, side === 'give' && h('small', {}, ` (tienes ${fmt.format(self.resources[r])})`)),
          input);
      }));

    const send = async (e) => {
      e.preventDefault();
      const read = (side) => Object.fromEntries(RESOURCES.map((r) => [r, Math.max(0, Math.floor(Number(inputs[side][r].value) || 0))]));
      const trade = { give: read('give'), receive: read('receive') };
      if (!canAfford(this.getCtx().self.resources, trade.give)) return toast('No tienes lo que ofreces', 'error');
      const res = await request('diplo:propose', { playerId: partner.id, type: 'trade', trade });
      if (!res.ok) return toast(res.error, 'error');
      toast(`Oferta enviada a ${partner.name}`);
      this.tradeWith = null;
      this.render(true);
    };

    return h('form', { class: 'trade-form', onSubmit: send },
      h('h3', { class: 'country-title' },
        h('span', { class: 'swatch', style: { background: partner?.color } }), `Comerciar con ${partner?.name ?? '?'}`),
      h('div', { class: 'trade-cols' }, column('give', 'Ofreces'), column('receive', 'Pides a cambio')),
      h('p', { class: 'muted small' }, 'Deja «Pides» a cero para hacer un regalo. Los recursos se intercambian cuando el otro jugador acepta.'),
      h('div', { class: 'trade-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => { this.tradeWith = null; this.render(true); } }, 'Volver'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Enviar oferta')));
  }

  // ---------- Mensajes privados ----------

  #onDirect(msg) {
    this.dms.push(msg);
    const ctx = this.getCtx();
    const me = ctx?.me;
    const other = msg.from === me ? msg.to : msg.from;
    const open = this.tab === 'diplomacy' && this.dmWith === other;
    if (open) {
      const list = $('#dm-thread');
      if (list) {
        list.append(this.#dmItem(msg, me, ctx.players));
        list.scrollTop = list.scrollHeight;
      }
    } else if (msg.from !== me) {
      this.unread[other] = (this.unread[other] ?? 0) + 1;
      const name = ctx?.players.get(msg.from)?.name ?? 'Alguien';
      toast(`💬 ${name}: ${msg.text}`, 'info', 5000);
      play('notify');
      if (this.tab === 'diplomacy' && !this.tradeWith && !this.dmWith && ctx) this.render(true);
    }
    if (ctx?.self) this.#renderButtons(ctx);
  }

  #dmItem(msg, me, players) {
    const mine = msg.from === me;
    const time = new Date(msg.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    return h('li', { class: `dm ${mine ? 'mine' : 'theirs'}` },
      h('span', { class: 'dm-text' }, msg.text),
      h('time', {}, `${mine ? 'Tú' : players.get(msg.from)?.name ?? '?'} · ${time}`));
  }

  #dmView({ players, me }) {
    const partner = players.get(this.dmWith);
    const thread = this.dms.filter((m) => (m.from === me && m.to === this.dmWith) || (m.from === this.dmWith && m.to === me));
    const input = h('input', { type: 'text', maxlength: '200', placeholder: `Escribe a ${partner?.name ?? '?'}…`, autocomplete: 'off' });
    const list = h('ol', { id: 'dm-thread', class: 'dm-thread' },
      thread.length ? thread.map((m) => this.#dmItem(m, me, players))
        : h('li', { class: 'muted small dm-empty' }, 'Todavía no hay mensajes. Solo vosotros dos veréis esta conversación.'));
    const send = async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      list.querySelector('.dm-empty')?.remove();
      const res = await request('dm:send', { playerId: this.dmWith, text });
      if (!res.ok) {
        toast(res.error, 'error');
        input.value = text;
      }
    };
    setTimeout(() => {
      list.scrollTop = list.scrollHeight;
      if (window.matchMedia('(hover: hover)').matches) input.focus();
    }, 0);
    return [
      h('div', { class: 'dm-head' },
        h('button', { class: 'btn btn-ghost btn-xs', onClick: () => { this.dmWith = null; this.render(true); } }, '← Volver'),
        h('span', { class: 'swatch', style: { background: partner?.color } }),
        h('strong', {}, `Conversación privada con ${partner?.name ?? '?'}`)),
      list,
      h('form', { class: 'chat-form', onSubmit: send }, input, h('button', { class: 'btn btn-sm', type: 'submit' }, 'Enviar')),
    ];
  }

  // ---------- Tecnología ----------

  #techView({ self, game }) {
    const now = this.serverNow();
    return [
      h('p', { class: 'muted' }, 'Investiga cada rama para desbloquear tropas y bombas más poderosas, como en un árbol de investigación. Solo se puede investigar una cosa a la vez.'),
      h('div', { class: 'tree' }, TREE_BRANCHES.map((branch) => {
        const nodes = TREE_NODES.filter((id) => TECH_TREE[id].branch === branch.id)
          .sort((a, b) => TECH_TREE[a].tier - TECH_TREE[b].tier);
        return h('div', { class: 'tree-row' },
          h('div', { class: 'tree-branch' }, h('span', { class: 'tech-icon' }, branch.icon), h('span', {}, branch.label)),
          nodes.flatMap((id, i) => [
            i > 0 && h('div', { class: `tree-link${self.unlocked?.includes(id) ? ' on' : ''}` }),
            this.#treeNode(id, self, game, now),
          ]));
      })),
      h('h4', { class: 'panel-sub' }, 'Doctrinas'),
      this.#doctrines(self, game, now),
    ];
  }

  #treeNode(id, self, game, now) {
    const node = TECH_TREE[id];
    const info = nodeInfo(id);
    const done = self.unlocked?.includes(id);
    const researching = self.research?.node === id;
    const blockedBy = done ? null : nodeError(self.unlocked ?? [], id);
    let error = blockedBy;
    if (!error && !done && self.research) error = 'Ya hay una investigación en curso';
    if (!error && !done && !canAfford(self.resources, node.cost)) error = 'No tienes recursos suficientes';

    const stats = node.unlocks.unit
      ? `⚔ ${info.attack} · 🛡 ${info.defense} · ➤ ${info.speed}`
      : `alcance ${info.range} · destruye ${Math.round(info.kill * 100)} %`;

    let action;
    if (done) {
      action = h('span', { class: 'tree-done' }, node.free ? '✓ De serie' : '✓ Investigado');
    } else if (researching) {
      const total = node.ms / game.speed;
      const left = self.research.readyAt - now;
      action = h('div', { class: 'progress' },
        h('div', { class: 'progress-bar', style: { width: `${Math.min(100, (1 - left / total) * 100)}%` } }),
        h('span', {}, clock(left)));
    } else {
      action = h('button', {
        class: 'btn btn-xs btn-block',
        disabled: Boolean(error),
        title: error ?? '',
        onClick: async () => {
          const res = await request('game:researchNode', { node: id });
          if (!res.ok) toast(res.error, 'error');
          else toast(`Investigando: ${info.label}`);
        },
      }, blockedBy ? '🔒 Bloqueado' : `Investigar · ${clock(node.ms / game.speed)}`);
    }

    return h('div', {
      class: `tree-node${done ? ' done' : ''}${researching ? ' active' : ''}${blockedBy && !done ? ' locked' : ''}`,
      title: node.cost && !done ? `Coste: ${resourcesText(node.cost)}` : '',
    },
    h('span', { class: 'tree-tier' }, ROMAN[node.tier]),
    h('div', { class: 'tree-name' }, h('span', { class: 'tech-icon' }, info.icon), h('strong', {}, info.label)),
    h('small', { class: 'muted' }, stats),
    !done && node.cost && h('small', { class: 'tree-cost' }, resourcesText(node.cost)),
    action);
  }

  #doctrines(self, game, now) {
    const r = self.research;
    return h('div', { class: 'tech-grid' }, TECH_TYPES.map((t) => {
      const level = self.tech[t];
      const next = level + 1;
      const researching = r?.tech === t;
      const cost = next <= TECH_MAX_LEVEL ? techCost(next) : null;
      let error = null;
      if (!cost) error = 'Nivel máximo';
      else if (r) error = 'Ya hay una investigación en curso';
      else if (!canAfford(self.resources, cost)) error = 'No tienes recursos suficientes';

      let progress = null;
      if (researching) {
        const total = techMs(r.toLevel) / game.speed;
        const left = r.readyAt - now;
        progress = h('div', { class: 'progress' },
          h('div', { class: 'progress-bar', style: { width: `${Math.min(100, (1 - left / total) * 100)}%` } }),
          h('span', {}, `Investigando nivel ${r.toLevel} · ${clock(left)}`));
      }

      return h('div', { class: `tech-card${researching ? ' active' : ''}` },
        h('div', { class: 'tech-head' },
          h('span', { class: 'tech-icon' }, TECHS[t].icon),
          h('strong', {}, TECHS[t].label),
          h('span', { class: 'pips' }, Array.from({ length: TECH_MAX_LEVEL }, (_, i) => h('i', { class: i < level ? 'on' : '' })))),
        h('p', { class: 'muted small' }, TECHS[t].effect),
        progress ?? h('button', {
          class: 'btn btn-sm btn-block',
          disabled: Boolean(error),
          title: error ?? '',
          onClick: async () => {
            const res = await request('game:research', { tech: t });
            if (!res.ok) toast(res.error, 'error');
            else toast(`Investigación iniciada: ${TECHS[t].label}`);
          },
        }, cost ? `Investigar nivel ${next} · ${resourcesText(cost)}` : 'Completada'));
    }));
  }
}

// ---------- Clasificación ----------

/** Objetivos de victoria y tabla de puntuaciones (también se usa en la pantalla final). */
export function rankingTable(standings, players, me) {
  return h('table', { class: 'ranking' },
    h('thead', {}, h('tr', {},
      h('th', {}, '#'), h('th', {}, 'Jugador'), h('th', {}, 'Países'), h('th', {}, '% mundo'),
      h('th', {}, 'Tropas'), h('th', {}, 'Tecn.'), h('th', {}, 'Batallas'), h('th', {}, 'Puntos'))),
    h('tbody', {}, standings.map((r, i) => {
      const p = players.get(r.id);
      return h('tr', { class: `${r.id === me ? 'me' : ''}${r.eliminated ? ' out' : ''}` },
        h('td', {}, r.eliminated ? '☠' : String(i + 1)),
        h('td', {}, h('span', { class: 'swatch', style: { background: p?.color } }), p?.name ?? 'Jugador retirado', r.id === me && h('em', {}, ' (tú)')),
        h('td', {}, String(r.countries)),
        h('td', {}, `${fmt.format(r.areaPct)} %`),
        h('td', {}, String(r.units)),
        h('td', {}, String(r.techLevels)),
        h('td', { title: 'Ganadas / perdidas' }, r.stats ? `${r.stats.battlesWon}/${r.stats.battlesLost}` : '—'),
        h('td', {}, h('b', {}, fmt.format(r.score))));
    })));
}

function rankingView({ game, players, me, self }, now) {
  const table = self.standings ?? [];
  const mine = table.find((r) => r.id === me);
  const leader = table.find((r) => !r.eliminated);
  const alive = table.filter((r) => !r.eliminated).length;
  const { domination, lastStanding, timeLimitMs } = game.victory ?? {};
  const goals = [];

  if (domination) {
    const pct = Math.min(100, ((mine?.areaPct ?? 0) / domination) * 100);
    goals.push(h('div', { class: 'goal' },
      h('strong', {}, `🌍 Dominación: controla el ${domination} % del mundo`),
      h('div', { class: 'progress' },
        h('div', { class: 'progress-bar', style: { width: `${pct}%` } }),
        h('span', {}, `Tú: ${fmt.format(mine?.areaPct ?? 0)} % · líder: ${players.get(leader?.id)?.name ?? '—'}`))));
  }
  if (lastStanding && game.startPlayers >= 2) {
    goals.push(h('div', { class: 'goal' },
      h('strong', {}, '⚔ Último en pie'),
      h('span', { class: 'muted' }, `Quedan ${alive} de ${game.startPlayers} jugadores.`)));
  }
  if (timeLimitMs && game.startedAt) {
    goals.push(h('div', { class: 'goal' },
      h('strong', {}, '⏱ Límite de tiempo: gana la mayor puntuación'),
      h('span', { class: 'muted' }, `Tiempo restante: ${clock(game.startedAt + timeLimitMs - now)}`)));
  }

  return [
    h('section', { class: 'modal-section' },
      h('h4', { class: 'panel-sub' }, 'Condiciones de victoria'),
      goals.length ? goals : h('p', { class: 'muted' }, 'Partida libre: no hay condiciones de victoria activas.')),
    h('section', { class: 'modal-section' },
      h('h4', { class: 'panel-sub' }, 'Clasificación'),
      rankingTable(table, players, me),
      h('p', { class: 'muted small' }, 'La puntuación valora territorio, número de países, desarrollo, tecnología, tropas y recursos: se puede ganar por la vía militar o por la pacífica.')),
  ];
}
