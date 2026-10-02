// Diplomacia, comercio, tecnología y clasificación: ventana modal, propuestas sobre el mapa y avisos.

import { $, h, toast, guardTaps, durationText, avatarEl } from './dom.js';
import { leaderBonus, PRESIDENTS } from '/shared/leaders.js';
import { request, socket } from './net.js';
import { RELATIONS, PROPOSALS, relationOf, declareWarError, proposalError } from '/shared/diplomacy.js';
import {
  TECHS, TECH_TYPES, TECH_MAX_LEVEL, techCost, techMs, TECH_TREE, TREE_NODES, TREE_BRANCHES, nodeError,
  DOCTRINE_BRANCH, MAX_RANK,
} from '/shared/tech.js';
import { UNITS, WEAPONS, unitSpeed } from '/shared/military.js';
import { RESOURCES, RESOURCE_INFO, canAfford } from '/shared/economy.js';
import { play } from './sound.js';
import {
  WORLD_EVENTS, UN_RESOLUTIONS, MISSIONS, SPACE_STAGES, fill as fillText,
} from '/shared/world.js';
import { REGIONS, eraOf } from '/shared/scenarios.js';
import { sameTeam, TEAM_ICONS } from '/shared/teams.js';
import { weaponAllowed, spaceAllowed } from '/shared/eras.js';
import {
  MARKET_GOODS, MARKET_FEE, MAX_TRADE, MAX_OFFER_AMOUNT, MAX_OFFERS_PER_PLAYER, BASE_PRICES, quote,
} from '/shared/market.js';

const fmt = new Intl.NumberFormat('es-ES');

const fill = (el, ...children) => el.replaceChildren(...children.flat().filter((c) => c != null && c !== false));

const clock = (ms) => {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
};

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

// Lo que muestra cada nodo: la unidad o el arma que desbloquea, o la propia modificación.
const nodeInfo = (id) => {
  const node = TECH_TREE[id];
  if (!node.unlocks) return { label: node.label, icon: node.icon };
  return node.unlocks.unit ? UNITS[node.unlocks.unit] : WEAPONS[node.unlocks.weapon];
};

const offerText = (side) => `${fmt.format(side.amount)} ${RESOURCE_INFO[side.resource].icon} ${RESOURCE_INFO[side.resource].label.toLowerCase()}`;
const resIcon = (r) => h('i', { class: 'res-icon' }, RESOURCE_INFO[r].icon);
const fmtPrice = (p) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p);

// Mini gráfica con la evolución del precio (la línea discontinua es el precio normal).
function sparkline(values, base) {
  const W = 120;
  const H = 30;
  const NS = 'http://www.w3.org/2000/svg';
  const min = Math.min(base, ...values) * 0.95;
  const max = Math.max(base, ...values) * 1.05;
  const y = (v) => H - ((v - min) / (max - min || 1)) * H;
  const x = (i) => (values.length < 2 ? W : (i / (values.length - 1)) * W);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('preserveAspectRatio', 'none');
  const baseLine = document.createElementNS(NS, 'line');
  Object.entries({ x1: 0, x2: W, y1: y(base), y2: y(base), class: 'spark-base' }).forEach(([k, v]) => baseLine.setAttribute(k, v));
  const line = document.createElementNS(NS, 'polyline');
  line.setAttribute('points', values.map((v, i) => `${x(i)},${y(v)}`).join(' '));
  line.setAttribute('class', 'spark-line');
  svg.append(baseLine, line);
  return svg;
}

// Titular con los nombres de jugadores y países ya puestos.
function newsText(n, players) {
  const v = n.vars ?? {};
  const pname = (id) => players.get(id)?.name ?? 'un jugador';
  return fillText(n.text, {
    player: pname(v.player), target: pname(v.target), a: pname(v.a), b: pname(v.b),
    country: v.country ? worldNames.get(v.country) ?? v.country : 'un país',
  });
}
let worldNames = new Map();
export const setWorldNames = (world) => { worldNames = new Map(world.countries.map((c) => [c.id, c.name])); };

const resourcesText = (obj) => Object.entries(obj ?? {}).filter(([, v]) => v)
  .map(([r, v]) => `${fmt.format(v)} ${RESOURCE_INFO[r].icon}`).join(' + ') || 'nada';

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
    this.seenOffers = null;
    // Lo que se está rellenando en el mercado (sobrevive a los redibujados).
    this.market = { good: 'food', amount: 50, give: { resource: 'oil', amount: 50 }, want: { resource: 'money', amount: 100 } };

    $('#btn-diplomacy').addEventListener('click', () => this.open('diplomacy'));
    $('#btn-tech').addEventListener('click', () => this.open('tech'));
    $('#btn-market').addEventListener('click', () => this.open('market'));
    $('#btn-world').addEventListener('click', () => this.open('world'));
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

    socket.on('market:filled', ({ offer, by }) => {
      const name = this.getCtx()?.players.get(by)?.name ?? 'Alguien';
      toast(`📈 ${name} ha aceptado tu oferta: recibes ${fmt.format(offer.want.amount)} ${RESOURCE_INFO[offer.want.resource].label.toLowerCase()}`, 'success', 5000);
      play('notify');
    });

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
    $('#modal .modal-box').classList.toggle('wide', tab === 'tech');
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
    this.seenOffers = null;
    this.seenNews = null;
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
    // En el mercado tampoco mientras se escribe una cantidad (en el móvil se cerraría el teclado).
    const typing = document.activeElement?.matches?.('#modal input, #modal select');
    if (this.tab && ((!this.tradeWith && !this.dmWith && !typing) || force)) this.#renderModal(ctx);
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

    // Titulares nuevos del Diario Global.
    const news = this.getCtx()?.game.world?.news ?? [];
    const lastNews = news.length ? news[news.length - 1].id : 0;
    if (this.seenNews !== undefined && this.seenNews !== null) {
      for (const n of news) {
        if (n.id <= this.seenNews) continue;
        toast(`📰 ${n.icon} ${n.headline} — ${newsText(n, players)}`, 'news', 8000);
        play('notify');
      }
    }
    this.seenNews = lastNews;

    const offers = (this.getCtx()?.game.market?.offers ?? []).filter((o) => o.from !== me);
    if (this.seenOffers) {
      for (const o of offers) {
        if (this.seenOffers.has(o.id)) continue;
        toast(`📈 ${players.get(o.from)?.name ?? 'Alguien'} ofrece ${offerText(o.give)} por ${offerText(o.want)}`, 'info', 4500);
      }
    }
    this.seenOffers = new Set(offers.map((o) => o.id));
  }

  #renderButtons({ self, me, game }) {
    // 🌐 Mundo: avisa si hay una votación abierta en la que todavía no has votado.
    const session = game.world?.session;
    const pendingVote = session && !session.voted?.includes(me) && !game.eliminated?.[me] ? 1 : 0;
    const worldCount = $('#world-count');
    worldCount.textContent = '🗳';
    worldCount.classList.toggle('hidden', !pendingVote);

    const offers = (game.market?.offers ?? []).filter((o) => o.from !== me).length;
    const marketCount = $('#market-count');
    marketCount.textContent = offers;
    marketCount.classList.toggle('hidden', offers === 0);

    const unread = Object.values(this.unread).reduce((a, b) => a + b, 0);
    const incoming = self.proposals.filter((p) => p.to === me).length + unread;
    const count = $('#diplo-count');
    count.textContent = incoming;
    count.classList.toggle('hidden', incoming === 0);

    // Cuántas ramas están investigando ahora mismo (y lo que le falta a la más próxima).
    const active = Object.values(self.research ?? {});
    const progress = $('#tech-progress');
    progress.classList.toggle('hidden', active.length === 0);
    if (active.length) {
      const next = Math.min(...active.map((r) => r.readyAt)) - this.serverNow();
      progress.textContent = active.length > 1 ? `${active.length} · ${clock(next)}` : clock(next);
    }

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
        avatarEl(from),
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
    if (this.tab === 'market') return fill(body, this.#marketView(ctx));
    if (this.tab === 'world') return fill(body, this.#worldView(ctx));
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
              avatarEl(p),
              h('strong', {}, p.name),
              presidentTag(game, p.id),
              h('span', { class: 'muted small' }, out ? 'eliminado' : `${counts[p.id] ?? 0} países${p.connected ? '' : ' · desconectado'}`)),
            h('span', { class: `relation-badge rel-${rel.state}` },
              `${RELATIONS[rel.state].icon} ${RELATIONS[rel.state].label}`,
              rel.state === 'nap' && h('small', {}, ` · ${clock(rel.until - now)}`)),
            h('div', { class: 'relation-actions' },
              !p.bot && h('button', {
                class: `btn btn-xs ${this.unread[p.id] ? 'btn-primary' : ''}`,
                onClick: () => { this.dmWith = p.id; this.unread[p.id] = 0; this.render(true); },
              }, `💬 Mensaje${this.unread[p.id] ? ` (${this.unread[p.id]})` : ''}`),
              !out && !iAmOut && (sameTeam(game.teams, me, p.id)
                ? h('span', { class: 'chip' }, '🤝 Compañero de equipo')
                : this.#relationActions(p, rel, now))),
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
          resIcon(r),
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
        avatarEl(partner),
        h('strong', {}, `Conversación privada con ${partner?.name ?? '?'}`)),
      list,
      h('form', { class: 'chat-form', onSubmit: send }, input, h('button', { class: 'btn btn-sm', type: 'submit' }, 'Enviar')),
    ];
  }

  // ---------- Mundo: ONU, noticias, eventos y misión secreta ----------

  #worldView(ctx) {
    const { game, players, me, self } = ctx;
    const w = game.world;
    const now = this.serverNow();
    const name = (id) => players.get(id)?.name ?? 'un jugador';
    const sections = [];

    // Votación de la ONU
    if (w?.un) {
      const s = w.session;
      let body;
      if (s) {
        const spec = UN_RESOLUTIONS[s.type];
        const vars = { target: name(s.target), a: name(s.a), b: name(s.b) };
        const myVote = self.vote;
        const vote = (v) => async () => {
          const res = await request('un:vote', { vote: v });
          if (!res.ok) return toast(res.error, 'error');
          toast(v === 'yes' ? '🇺🇳 Has votado a favor' : '🇺🇳 Has votado en contra', 'success');
        };
        body = h('div', { class: 'un-session' },
          h('div', { class: 'un-title' }, h('span', {}, spec.icon), h('strong', {}, fillText(spec.title, vars)),
            h('b', { class: 'proposal-timer' }, clock(s.endsAt - now))),
          h('p', { class: 'muted small' }, fillText(spec.text, vars)),
          h('p', { class: 'small' }, `Han votado: ${s.voted.length ? s.voted.map(name).join(', ') : 'nadie todavía'}. Cada voto pesa tantos países como controle quien vota.`),
          !game.eliminated?.[me] && h('div', { class: 'un-votes' },
            h('button', { class: `btn ${myVote === 'yes' ? 'btn-primary' : ''}`, onClick: vote('yes') }, '👍 A favor'),
            h('button', { class: `btn ${myVote === 'no' ? 'btn-danger' : ''}`, onClick: vote('no') }, '👎 En contra')));
      } else {
        body = h('p', { class: 'muted small' }, 'No hay ninguna votación abierta. La Asamblea se reúne cada pocos minutos: sanciones, altos el fuego, ayuda humanitaria o prohibir las nucleares.');
      }
      const sanctioned = Object.entries(w.sanctions ?? {}).filter(([, until]) => until > now);
      sections.push(h('section', { class: 'modal-section' },
        h('h4', { class: 'panel-sub' }, '🇺🇳 Naciones Unidas'),
        body,
        sanctioned.length > 0 && h('p', { class: 'small danger-text' }, `🚫 Sancionados: ${sanctioned.map(([id, until]) => `${name(id)} (${clock(until - now)})`).join(', ')}`),
        w.nukeBanUntil > now && h('p', { class: 'small' }, `☢️ Armas nucleares prohibidas durante ${clock(w.nukeBanUntil - now)}`)));
    }

    // Misión secreta
    if (self.mission) {
      const m = self.mission;
      const text = fillText(MISSIONS[m.type].text, { region: m.region ? REGIONS[m.region].label : '', target: name(m.target) });
      const p = m.progress;
      sections.push(h('section', { class: 'modal-section' },
        h('h4', { class: 'panel-sub' }, '🎯 Tu misión secreta'),
        h('div', { class: `mission${m.done ? ' done' : ''}` },
          h('strong', {}, `${MISSIONS[m.type].icon} ${text}`),
          p && h('div', { class: 'progress' },
            h('div', { class: 'progress-bar', style: { width: `${Math.min(100, (p.have / p.need) * 100)}%` } }),
            h('span', {}, m.done ? '✓ Cumplida' : `${p.have} / ${p.need}`)),
          h('small', { class: 'muted' }, game.victory?.mission
            ? 'Si la cumples, ganas la partida. Nadie más sabe cuál es.'
            : 'Si la cumples, ganas 250 puntos y se revela a todos. Nadie más sabe cuál es.'))));
    }

    // Eventos en curso
    const active = (w?.active ?? []).filter((e) => e.until > now);
    if (active.length) {
      sections.push(h('section', { class: 'modal-section' },
        h('h4', { class: 'panel-sub' }, '🌍 Eventos en curso'),
        active.map((e) => h('p', { class: 'small world-event' },
          `${WORLD_EVENTS[e.type].icon} ${WORLD_EVENTS[e.type].headline} · ${clock(e.until - now)} — ${WORLD_EVENTS[e.type].text}`))));
    }

    // Diario Global
    const news = [...(w?.news ?? [])].reverse();
    sections.push(h('section', { class: 'modal-section newspaper' },
      h('header', { class: 'newspaper-head' },
        h('span', { class: 'newspaper-name' }, 'EL DIARIO GLOBAL'),
        h('small', {}, 'Edición especial · noticias del mundo en guerra')),
      news.length ? news.map((n) => h('article', { class: 'news-item' },
        h('h5', {}, `${n.icon} ${n.headline}`),
        h('p', {}, newsText(n, players)),
        h('time', {}, new Date(n.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))))
        : h('p', { class: 'muted small' }, game.world?.events
          ? 'Todavía no hay noticias. Los eventos mundiales llegan cada pocos minutos.'
          : 'Los eventos mundiales están desactivados en esta partida.')));
    return sections;
  }

  // ---------- Mercado ----------

  #marketView(ctx) {
    const { game, self } = ctx;
    const market = game.market;
    if (!market) return h('p', { class: 'muted' }, 'El mercado abre cuando empieza la partida.');
    const active = game.phase === 'active' && !game.eliminated?.[ctx.me];
    return [
      h('section', { class: 'modal-section' },
        h('h4', { class: 'panel-sub' }, 'Bolsa de materiales'),
        h('p', { class: 'muted small' }, 'Vende lo que te sobra o compra lo que te falta a cambio de dinero. Si muchos compran, el precio sube; si muchos venden, baja. Después vuelve poco a poco a su valor normal.'),
        h('div', { class: 'market-goods' }, MARKET_GOODS.map((g) => this.#goodCard(g, market, self))),
        active && this.#tradeBox(market, self)),
      h('section', { class: 'modal-section' },
        h('h4', { class: 'panel-sub' }, 'Ofertas entre jugadores'),
        this.#offerList(ctx, active),
        active && this.#offerForm(ctx)),
    ];
  }

  #goodCard(g, market, self) {
    const price = market.prices[g];
    const history = market.history[g] ?? [price];
    const first = history[0];
    const trend = price > first * 1.02 ? 'up' : price < first * 0.98 ? 'down' : 'flat';
    const selected = this.market.good === g;
    return h('button', {
      class: `market-good res-${g}${selected ? ' active' : ''}`,
      onClick: () => { this.market.good = g; this.render(true); },
    },
    h('span', { class: 'market-good-name' }, resIcon(g), RESOURCE_INFO[g].label),
    h('strong', { class: `market-price trend-${trend}` },
      `${fmtPrice(price)} 💰`, h('small', {}, trend === 'up' ? ' ▲' : trend === 'down' ? ' ▼' : ' ●')),
    sparkline(history, BASE_PRICES[g]),
    h('small', { class: 'muted' }, `Tienes ${fmt.format(self.resources[g])}`));
  }

  #tradeBox(market, self) {
    const g = this.market.good;
    const fee = leaderBonus(self.president).noMarketFee ? 0 : MARKET_FEE;
    const amount = this.market.amount;
    const buy = quote(g, market.prices[g], 'buy', amount, fee);
    const sell = quote(g, market.prices[g], 'sell', amount, fee);
    const label = RESOURCE_INFO[g].label.toLowerCase();

    const input = h('input', {
      type: 'number', min: '1', max: String(MAX_TRADE), step: '1', inputmode: 'numeric', value: String(amount),
      onChange: () => {
        this.market.amount = Math.min(MAX_TRADE, Math.max(1, Math.floor(Number(input.value) || 1)));
        input.blur();
        this.render(true);
      },
    });
    const preset = (n) => h('button', {
      class: `btn btn-xs${amount === n ? ' btn-primary' : ''}`,
      onClick: () => { this.market.amount = n; this.render(true); },
    }, String(n));
    const go = (side) => async (e) => {
      e.currentTarget.disabled = true;
      const res = await request('market:trade', { good: g, side, amount });
      if (!res.ok) return toast(res.error, 'error');
      toast(side === 'buy'
        ? `Has comprado ${fmt.format(amount)} ${label} por ${fmt.format(res.total)} de dinero`
        : `Has vendido ${fmt.format(amount)} ${label} por ${fmt.format(res.total)} de dinero`, 'success');
      play('recruit');
    };

    return h('div', { class: 'trade-box' },
      h('div', { class: 'trade-amount' },
        h('span', {}, `Cantidad de ${label}:`),
        h('div', { class: 'presets' }, [10, 50, 100, 250].map(preset)),
        input),
      h('div', { class: 'trade-buttons' },
        h('button', {
          class: 'btn btn-primary',
          disabled: self.resources.money < buy.total,
          onClick: go('buy'),
        }, `Comprar ${fmt.format(amount)}`, h('small', {}, `pagas ${fmt.format(buy.total)} 💰`)),
        h('button', {
          class: 'btn',
          disabled: self.resources[g] < amount,
          onClick: go('sell'),
        }, `Vender ${fmt.format(amount)}`, h('small', {}, `recibes ${fmt.format(sell.total)} 💰`))),
      h('p', { class: 'muted small' }, fee
        ? `La bolsa cobra una comisión del ${Math.round(fee * 100)} %. Con el presidente Mercader no hay comisión.`
        : '🤵 Tu presidente Mercader opera sin comisión.'));
  }

  #offerList({ game, players, me, self }, active) {
    const now = this.serverNow();
    const offers = game.market.offers;
    if (!offers.length) return h('p', { class: 'muted small' }, 'No hay ofertas publicadas. ¡Publica la primera!');
    return h('div', { class: 'offers' }, offers.map((o) => {
      const p = players.get(o.from);
      const mine = o.from === me;
      const atWar = !mine && relationOf(game.relations, me, o.from).state === 'war';
      let error = null;
      if (atWar) error = 'Estáis en guerra: no podéis comerciar';
      else if (!mine && self.resources[o.want.resource] < o.want.amount) error = 'No tienes lo que pide';
      return h('div', { class: `offer${mine ? ' mine' : ''}` },
        h('div', { class: 'offer-who' },
          h('span', { class: 'swatch', style: { background: p?.color } }), avatarEl(p),
          h('strong', {}, mine ? 'Tu oferta' : p?.name ?? '?'),
          h('small', { class: 'muted' }, clock(o.expiresAt - now))),
        h('div', { class: 'offer-deal' },
          h('span', { class: `offer-res res-${o.give.resource}` }, `Da ${offerText(o.give)}`),
          h('span', { class: 'offer-arrow' }, '⇄'),
          h('span', { class: `offer-res res-${o.want.resource}` }, `Pide ${offerText(o.want)}`)),
        active && (mine
          ? h('button', {
              class: 'btn btn-ghost btn-xs',
              onClick: async () => {
                const res = await request('market:cancel', { offerId: o.id });
                if (!res.ok) toast(res.error, 'error');
                else toast('Oferta retirada: se te devuelve lo reservado');
              },
            }, 'Retirar')
          : h('button', {
              class: 'btn btn-primary btn-xs',
              disabled: Boolean(error),
              title: error ?? '',
              onClick: async (e) => {
                e.currentTarget.disabled = true;
                const res = await request('market:accept', { offerId: o.id });
                if (!res.ok) return toast(res.error, 'error');
                toast(`Trato hecho: recibes ${offerText(o.give)}`, 'success');
                play('notify');
              },
            }, error ? '✕' : 'Aceptar')));
    }));
  }

  #offerForm({ self, game, me }) {
    const form = this.market;
    const mineCount = game.market.offers.filter((o) => o.from === me).length;
    const side = (key, title) => {
      const select = h('select', {
        onChange: () => { form[key].resource = select.value; select.blur(); this.render(true); },
      }, RESOURCES.map((r) => h('option', { value: r }, `${RESOURCE_INFO[r].icon} ${RESOURCE_INFO[r].label}`)));
      select.value = form[key].resource;
      const input = h('input', {
        type: 'number', min: '1', max: String(MAX_OFFER_AMOUNT), step: '1', inputmode: 'numeric', value: String(form[key].amount),
        onChange: () => {
          form[key].amount = Math.min(MAX_OFFER_AMOUNT, Math.max(1, Math.floor(Number(input.value) || 1)));
          input.blur();
          this.render(true);
        },
      });
      return h('label', { class: 'offer-side' }, h('span', { class: 'muted small' }, title), select, input);
    };
    let error = null;
    if (form.give.resource === form.want.resource) error = 'Ofrece y pide materiales distintos';
    else if (self.resources[form.give.resource] < form.give.amount) error = 'No tienes tanto para ofrecer';
    else if (mineCount >= MAX_OFFERS_PER_PLAYER) error = `Máximo ${MAX_OFFERS_PER_PLAYER} ofertas a la vez`;

    return h('div', { class: 'offer-form' },
      h('h4', { class: 'panel-sub' }, 'Publicar una oferta'),
      h('div', { class: 'offer-sides' }, side('give', 'Doy'), h('span', { class: 'offer-arrow' }, '⇄'), side('want', 'A cambio de')),
      h('button', {
        class: 'btn btn-primary btn-block',
        disabled: Boolean(error),
        title: error ?? '',
        onClick: async (e) => {
          e.currentTarget.disabled = true;
          const res = await request('market:offer', { give: { ...form.give }, want: { ...form.want } });
          if (!res.ok) return toast(res.error, 'error');
          toast('Oferta publicada: todos los jugadores la verán', 'success');
        },
      }, error ?? 'Publicar oferta'),
      h('p', { class: 'muted small' }, 'Lo que ofreces queda reservado hasta que alguien acepte o retires la oferta. Las ofertas caducan a los 10 minutos y se te devuelve todo.'));
  }

  // ---------- Tecnología (árbol estilo War Thunder) ----------

  #techView(ctx) {
    const { self, game } = ctx;
    const now = this.serverNow();
    const busy = Object.keys(self.research ?? {}).length;
    return [
      h('p', { class: 'muted small' },
        `Cada rama investiga por su cuenta: puedes tener una investigación en marcha en cada columna a la vez (ahora: ${busy} de ${TREE_BRANCHES.length + 1}). `
        + 'Las tropas de rango I vienen de serie; las modificaciones mejoran a las tropas de su rama.'),
      h('div', { class: 'wt-tree' },
        h('div', { class: 'wt-ranks' }, h('div', { class: 'wt-head-spacer' }),
          Array.from({ length: MAX_RANK }, (_, i) => h('div', { class: 'wt-rank' }, `Rango ${ROMAN[i + 1]}`))),
        TREE_BRANCHES.map((branch) => this.#branchColumn(branch, self, game, now))),
      spaceAllowed(eraOf(ctx.game.scenario)) && this.#spaceView(ctx, now),
      h('h4', { class: 'panel-sub' }, `${DOCTRINE_BRANCH.icon} ${DOCTRINE_BRANCH.label}`),
      this.#slotStatus(self.research?.[DOCTRINE_BRANCH.id], game, now, self),
      this.#doctrines(self, game, now),
    ];
  }

  // Carrera espacial: satélite, estación y Luna (con su propio hueco de investigación).
  #spaceView({ self, game, players, me }, now) {
    const stage = game.space?.[me] ?? 0;
    const r = self.research?.space;
    const rivals = Object.entries(game.space ?? {}).filter(([id, st]) => st > 0 && id !== me);
    return h('section', { class: 'modal-section' },
      h('h4', { class: 'panel-sub' }, '🚀 Carrera espacial'),
      h('div', { class: 'space-stages' }, SPACE_STAGES.map((st, i) => {
        const done = stage > i;
        const current = stage === i;
        let action = null;
        if (done) action = h('span', { class: 'tree-done' }, '✓ Completado');
        else if (current && r) {
          const total = (st.ms * leaderBonus(self.president).researchMs * (stage >= 2 ? 0.8 : 1)) / game.speed;
          const left = r.readyAt - now;
          action = h('div', { class: 'progress' },
            h('div', { class: 'progress-bar', style: { width: `${Math.min(100, (1 - left / total) * 100)}%` } }),
            h('span', {}, clock(left)));
        } else if (current) {
          const missingReq = st.requires.some((id) => !self.unlocked?.includes(id));
          action = h('button', {
            class: 'btn btn-xs btn-block',
            disabled: missingReq || !canAfford(self.resources, st.cost),
            title: missingReq ? 'Requiere Bombarderos (Aviación II) y Misil balístico (Bombas II)' : '',
            onClick: async () => {
              const res = await request('game:space');
              if (!res.ok) return toast(res.error, 'error');
              toast(`🚀 Programa espacial: ${st.label} en marcha`, 'success');
            },
          }, `Lanzar · ${clock((st.ms * leaderBonus(self.president).researchMs * (stage >= 2 ? 0.8 : 1)) / game.speed)}`);
        }
        return h('div', { class: `tree-node space-node${done ? ' done' : ''}${current && r ? ' active' : ''}${!done && !current ? ' locked' : ''}` },
          h('div', { class: 'tree-name' }, h('span', { class: 'tech-icon' }, st.icon), h('strong', {}, st.label)),
          h('small', { class: 'muted' }, st.effect),
          !done && h('small', { class: 'tree-cost' }, resourcesText(st.cost)),
          action);
      })),
      h('p', { class: 'muted small' }, `${stage === 0 ? 'Requiere bombarderos (Aviación II) y misil balístico (Bombas II). ' : ''}La Luna exige controlar al menos 6 países. ${game.victory?.space ? 'Quien llegue primero gana la partida.' : 'Llegar a la Luna da 500 puntos.'}`),
      rivals.length > 0 && h('p', { class: 'small' }, `Rivales: ${rivals.map(([id, st]) => `${players.get(id)?.name ?? '?'} ${SPACE_STAGES[st - 1].icon}`).join(' · ')}`));
  }

  // Estado del hueco de investigación de una rama.
  #slotStatus(r, game, now, self) {
    if (!r) return h('div', { class: 'wt-slot free' }, '🔓 Libre: elige qué investigar');
    const label = r.node ? nodeInfo(r.node).label : `${TECHS[r.tech].label} ${ROMAN[r.toLevel] ?? r.toLevel}`;
    const totalMs = (r.node ? TECH_TREE[r.node].ms : techMs(r.toLevel)) * leaderBonus(self.president).researchMs / game.speed;
    const left = r.readyAt - now;
    return h('div', { class: 'wt-slot busy' },
      h('div', { class: 'progress' },
        h('div', { class: 'progress-bar', style: { width: `${Math.min(100, (1 - left / totalMs) * 100)}%` } }),
        h('span', {}, `🔬 ${label} · ${clock(left)}`)));
  }

  #branchColumn(branch, self, game, now) {
    // Lo que no existe en la época del mapa (la bomba nuclear en la antigua Grecia) no aparece.
    const era = eraOf(game.scenario);
    const nodes = TREE_NODES.filter((id) => TECH_TREE[id].branch === branch.id
      && (!TECH_TREE[id].unlocks?.weapon || weaponAllowed(TECH_TREE[id].unlocks.weapon, era)));
    const done = nodes.filter((id) => self.unlocked?.includes(id)).length;
    return h('div', { class: 'wt-col' },
      h('div', { class: 'wt-head' },
        h('div', { class: 'wt-title' }, h('span', { class: 'tech-icon' }, branch.icon), h('strong', {}, branch.label),
          h('small', { class: 'muted' }, `${done}/${nodes.length}`)),
        this.#slotStatus(self.research?.[branch.id], game, now, self)),
      Array.from({ length: MAX_RANK }, (_, i) => {
        const rank = i + 1;
        const here = nodes.filter((id) => TECH_TREE[id].rank === rank);
        return h('div', { class: 'wt-cell' },
          rank > 1 && h('div', { class: `wt-arrow${here.some((id) => self.unlocked?.includes(id)) ? ' on' : ''}` }),
          here.map((id) => this.#treeNode(id, self, game, now)));
      }));
  }

  #treeNode(id, self, game, now) {
    const node = TECH_TREE[id];
    const info = nodeInfo(id);
    const isMod = !node.unlocks;
    const done = self.unlocked?.includes(id);
    const researching = self.research?.[node.branch]?.node === id;
    const blockedBy = done ? null : nodeError(self.unlocked ?? [], id);
    let error = blockedBy;
    if (!error && !done && self.research?.[node.branch]) error = 'Esta rama ya está investigando otra cosa';
    if (!error && !done && !canAfford(self.resources, node.cost)) error = 'No tienes recursos suficientes';
    const ms = (node.ms ?? 0) * leaderBonus(self.president).researchMs / game.speed;

    let detail;
    if (isMod) detail = node.desc;
    else if (node.unlocks.unit) detail = `⚔ ${info.attack} · 🛡 ${info.defense} · ➤ ${unitSpeed(node.unlocks.unit, eraOf(game.scenario))} km/h`;
    else detail = `alcance ${info.range} · destruye ${Math.round(info.kill * 100)} %`;

    let action;
    if (done) {
      action = h('span', { class: 'tree-done' }, node.free ? '✓ De serie' : '✓ Investigado');
    } else if (researching) {
      const left = self.research[node.branch].readyAt - now;
      action = h('div', { class: 'progress' },
        h('div', { class: 'progress-bar', style: { width: `${Math.min(100, (1 - left / ms) * 100)}%` } }),
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
      }, blockedBy ? '🔒 Bloqueado' : `Investigar · ${clock(ms)}`);
    }

    return h('div', {
      class: `tree-node${isMod ? ' mod' : ''}${done ? ' done' : ''}${researching ? ' active' : ''}${blockedBy && !done ? ' locked' : ''}`,
      title: error && !done ? error : '',
    },
    h('div', { class: 'tree-name' }, h('span', { class: 'tech-icon' }, info.icon), h('strong', {}, info.label)),
    isMod && h('span', { class: 'tree-kind' }, 'Modificación'),
    h('small', { class: 'muted' }, detail),
    !done && node.cost && h('small', { class: 'tree-cost' }, resourcesText(node.cost)),
    action);
  }

  #doctrines(self, game, now) {
    const r = self.research?.[DOCTRINE_BRANCH.id];
    return h('div', { class: 'tech-grid' }, TECH_TYPES.map((t) => {
      const level = self.tech[t];
      const next = level + 1;
      const researching = r?.tech === t;
      const cost = next <= TECH_MAX_LEVEL ? techCost(next) : null;
      let error = null;
      if (!cost) error = 'Nivel máximo';
      else if (r) error = 'Ya hay una doctrina en investigación';
      else if (!canAfford(self.resources, cost)) error = 'No tienes recursos suficientes';

      let progress = null;
      if (researching) {
        const total = (techMs(r.toLevel) * leaderBonus(self.president).researchMs) / game.speed;
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

// Presidente de un jugador en la partida (con su ventaja en el título).
function presidentTag(game, playerId) {
  const pres = PRESIDENTS[game.presidents?.[playerId]];
  if (!pres) return null;
  return h('span', { class: 'president-tag', title: `${pres.name} — ${pres.perk}` }, `${pres.portrait} ${pres.title}`);
}

// ---------- Clasificación ----------

/** Objetivos de victoria y tabla de puntuaciones (también se usa en la pantalla final). */
export function rankingTable(standings, players, me, teams = null) {
  return h('table', { class: 'ranking' },
    h('thead', {}, h('tr', {},
      h('th', {}, '#'), h('th', {}, 'Jugador'), h('th', {}, 'Países'), h('th', {}, '% mundo'),
      h('th', {}, 'Tropas'), h('th', {}, 'Tecn.'), h('th', {}, 'Batallas'), h('th', {}, 'Puntos'))),
    h('tbody', {}, standings.map((r, i) => {
      const p = players.get(r.id);
      return h('tr', { class: `${r.id === me ? 'me' : ''}${r.eliminated ? ' out' : ''}` },
        h('td', {}, r.eliminated ? '☠' : String(i + 1)),
        h('td', {}, h('span', { class: 'swatch', style: { background: p?.color } }),
          teams?.[r.id] && h('span', { class: 'chip-team' }, TEAM_ICONS[(teams[r.id] - 1) % TEAM_ICONS.length]),
          p && avatarEl(p), p?.name ?? 'Jugador retirado', r.id === me && h('em', {}, ' (tú)')),
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
      h('span', { class: 'muted' }, `Tiempo restante: ${durationText(game.startedAt + timeLimitMs - now)}`)));
  }

  return [
    h('section', { class: 'modal-section' },
      h('h4', { class: 'panel-sub' }, 'Condiciones de victoria'),
      goals.length ? goals : h('p', { class: 'muted' }, 'Partida libre: no hay condiciones de victoria activas.')),
    h('section', { class: 'modal-section' },
      h('h4', { class: 'panel-sub' }, 'Clasificación'),
      rankingTable(table, players, me, game.teams),
      h('p', { class: 'muted small' }, 'La puntuación valora territorio, número de países, desarrollo, tecnología, tropas y recursos: se puede ganar por la vía militar o por la pacífica.')),
  ];
}
