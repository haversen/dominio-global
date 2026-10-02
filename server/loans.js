// Préstamos entre jugadores: quien pide dinero elige cuánto, a qué interés y en qué plazo lo devuelve.
// Cualquier otro jugador (también un bot) puede concederlo. Al vencer, el dinero se cobra solo;
// si el deudor no tiene suficiente, paga lo que puede y lo que falta sube un 10 % de recargo.

import { relationOf } from './diplomacy.js';
import {
  LOAN_MIN, LOAN_MAX, LOAN_MAX_INTEREST, LOAN_TERMS, LOAN_REQUEST_TTL_MS, LOAN_MAX_OPEN, LOAN_LATE_PENALTY,
  LOAN_RETRY_MS, owedFor,
} from '../shared/loans.js';

const activePlayer = (game, id) => {
  const p = game.players[id];
  return p && !p.eliminated ? p : null;
};
const findLoan = (game, id) => (game.loans ?? []).find((l) => l.id === id);

/** Pedir un préstamo: queda publicado hasta que alguien lo conceda o caduque. */
export function requestLoan(game, borrower, { amount, interest, term }, now = Date.now()) {
  if (game.phase !== 'active') return { error: 'La partida todavía no está en marcha' };
  if (!activePlayer(game, borrower)) return { error: 'Jugador no válido' };
  if (!Number.isInteger(amount) || amount < LOAN_MIN || amount > LOAN_MAX) {
    return { error: `Puedes pedir de ${LOAN_MIN} a ${LOAN_MAX} de dinero` };
  }
  if (!Number.isInteger(interest) || interest < 0 || interest > LOAN_MAX_INTEREST) {
    return { error: `El interés debe ser de 0 a ${LOAN_MAX_INTEREST} %` };
  }
  if (!LOAN_TERMS.includes(term)) return { error: 'Plazo no válido' };
  game.loans ??= [];
  const mine = game.loans.filter((l) => l.borrower === borrower && (l.status === 'open' || l.status === 'active'));
  if (mine.length >= LOAN_MAX_OPEN) return { error: `Puedes tener como mucho ${LOAN_MAX_OPEN} préstamos pedidos o sin devolver` };
  const loan = {
    id: ++game.seq, borrower, lender: null, amount, interest, term, status: 'open',
    createdAt: now, expiresAt: now + LOAN_REQUEST_TTL_MS, owed: owedFor(amount, interest),
  };
  game.loans.push(loan);
  return { loan };
}

/** Conceder un préstamo pedido por otro jugador: el dinero pasa al instante. */
export function fundLoan(game, lender, loanId, now = Date.now()) {
  if (game.phase !== 'active') return { error: 'La partida todavía no está en marcha' };
  const loan = findLoan(game, loanId);
  if (!loan || loan.status !== 'open') return { error: 'Ese préstamo ya no está disponible' };
  if (loan.borrower === lender) return { error: 'No puedes prestarte a ti mismo' };
  const from = activePlayer(game, lender);
  const to = activePlayer(game, loan.borrower);
  if (!from || !to) return { error: 'Jugador no válido' };
  if (relationOf(game.relations, lender, loan.borrower).state === 'war') {
    return { error: 'No se presta dinero a un enemigo en guerra' };
  }
  if (from.resources.money < loan.amount) return { error: 'No tienes tanto dinero para prestar' };
  from.resources.money -= loan.amount;
  to.resources.money += loan.amount;
  Object.assign(loan, { lender, status: 'active', fundedAt: now, dueAt: now + (loan.term * 60_000) / game.speed });
  return { loan };
}

export function cancelLoan(game, borrower, loanId) {
  const loan = findLoan(game, loanId);
  if (!loan || loan.borrower !== borrower || loan.status !== 'open') return { error: 'Ese préstamo ya no está disponible' };
  game.loans = game.loans.filter((l) => l !== loan);
  return {};
}

/** Devolver antes de tiempo (se paga lo acordado, con todo el interés). */
export function repayLoan(game, borrower, loanId) {
  const loan = findLoan(game, loanId);
  if (!loan || loan.borrower !== borrower || loan.status !== 'active') return { error: 'No tienes ese préstamo pendiente' };
  const player = game.players[borrower];
  if (player.resources.money < loan.owed) return { error: `Necesitas ${loan.owed} de dinero para devolverlo` };
  settle(game, loan, loan.owed);
  return { loan };
}

function settle(game, loan, pay) {
  game.players[loan.borrower].resources.money -= pay;
  if (game.players[loan.lender]) game.players[loan.lender].resources.money += pay;
  loan.owed -= pay;
  if (loan.owed <= 0) {
    loan.owed = 0;
    loan.status = 'repaid';
  }
}

/** Caducan las peticiones y se cobran los préstamos vencidos. Devuelve los sucesos que hay que anunciar. */
export function tickLoans(game, now) {
  if (!game.loans?.length) return [];
  const events = [];
  for (const loan of game.loans) {
    if (loan.status === 'open') {
      if (loan.expiresAt <= now || !activePlayer(game, loan.borrower)) loan.status = 'expired';
      continue;
    }
    if (loan.status !== 'active') continue;
    // Si cae el acreedor, la deuda se perdona; si cae el deudor, el dinero se pierde.
    if (!activePlayer(game, loan.lender) || !activePlayer(game, loan.borrower)) {
      loan.status = 'void';
      continue;
    }
    if (loan.dueAt > now) continue;
    const money = Math.max(0, Math.floor(game.players[loan.borrower].resources.money));
    const pay = Math.min(loan.owed, money);
    if (pay > 0) settle(game, loan, pay);
    if (loan.status === 'repaid') {
      events.push({ type: 'loan-repaid', loan, paid: pay });
    } else {
      // No le llega: lo que falta sube un recargo y se vuelve a cobrar en un rato.
      loan.owed = Math.ceil(loan.owed * (1 + LOAN_LATE_PENALTY));
      loan.dueAt = now + LOAN_RETRY_MS / game.speed;
      loan.late = true;
      events.push({ type: 'loan-late', loan, paid: pay });
    }
  }
  // Se olvidan los préstamos terminados (los pagados se quedan un rato para el historial).
  game.loans = game.loans.filter((l) => l.status === 'open' || l.status === 'active'
    || (l.status === 'repaid' && now - (l.dueAt ?? now) < 5 * 60_000));
  return events;
}

export function publicLoans(game) {
  return (game.loans ?? []).map(({ id, borrower, lender, amount, interest, term, status, expiresAt, dueAt, owed, late }) => (
    { id, borrower, lender, amount, interest, term, status, expiresAt, dueAt, owed, late: Boolean(late) }));
}
