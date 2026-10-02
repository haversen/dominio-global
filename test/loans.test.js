import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, pickCountry, tickGame, PICK_DURATION_MS } from '../server/game.js';
import { requestLoan, fundLoan, repayLoan, cancelLoan } from '../server/loans.js';
import { setRelation } from '../server/diplomacy.js';

const T0 = PICK_DURATION_MS;
function game() {
  const g = createGame({ countryAssignment: 'choose', gameSpeed: 'normal' }, ['a', 'b'], { now: 0 });
  pickCountry(g, 'a', 'ESP');
  pickCountry(g, 'b', 'JPN');
  tickGame(g, ['a', 'b'], T0);
  g.players.a.resources.money = 0;
  g.players.b.resources.money = 1000;
  return g;
}

test('préstamos: el prestatario elige interés y plazo, y se cobra solo al vencer', () => {
  const g = game();
  assert.match(requestLoan(g, 'a', { amount: 5, interest: 10, term: 10 }, T0).error, /de 10 a/);
  assert.match(requestLoan(g, 'a', { amount: 100, interest: 500, term: 10 }, T0).error, /interés/);
  assert.match(requestLoan(g, 'a', { amount: 100, interest: 10, term: 7 }, T0).error, /Plazo/);
  const { loan } = requestLoan(g, 'a', { amount: 300, interest: 20, term: 10 }, T0);
  assert.equal(loan.owed, 360);
  assert.match(fundLoan(g, 'a', loan.id, T0).error, /ti mismo/);
  assert.equal(fundLoan(g, 'b', loan.id, T0).error, undefined);
  assert.equal(g.players.a.resources.money, 300);
  assert.equal(g.players.b.resources.money, 700);

  // Gana dinero mientras tanto y al vencer se le cobra con intereses.
  g.players.a.resources.money = 500;
  const due = loan.dueAt;
  const before = g.players.b.resources.money;
  const res = tickGame(g, ['a', 'b'], due + 1);
  assert.ok(res.events.some((e) => e.type === 'loan-repaid'));
  assert.ok(g.players.b.resources.money >= before + 360 - 1, 'el prestamista recibe lo acordado');
  assert.equal(g.loans.find((l) => l.id === loan.id).status, 'repaid');
});

test('préstamos: si no puede pagar, paga lo que tiene y lo que falta sube un 10 %', () => {
  const g = game();
  const { loan } = requestLoan(g, 'a', { amount: 200, interest: 0, term: 5 }, T0);
  fundLoan(g, 'b', loan.id, T0);
  tickGame(g, ['a', 'b'], loan.dueAt - 1); // los ingresos de esos minutos ya cobrados
  g.players.a.resources = { money: 50, food: 0, oil: 0, industry: 0 };
  const res = tickGame(g, ['a', 'b'], loan.dueAt + 1);
  const late = res.events.find((e) => e.type === 'loan-late');
  assert.ok(late);
  assert.ok(late.paid >= 50);
  assert.equal(loan.owed, Math.ceil((200 - late.paid) * 1.1));
  assert.ok(loan.late);
});

test('préstamos: no se presta a un enemigo, se puede devolver antes y retirar la petición', () => {
  const g = game();
  const { loan } = requestLoan(g, 'a', { amount: 100, interest: 5, term: 10 }, T0);
  setRelation(g, 'a', 'b', 'war');
  assert.match(fundLoan(g, 'b', loan.id, T0).error, /guerra/);
  setRelation(g, 'a', 'b', 'peace');
  fundLoan(g, 'b', loan.id, T0);
  assert.match(repayLoan(g, 'a', loan.id).error, /Necesitas 105/);
  g.players.a.resources.money = 200;
  assert.equal(repayLoan(g, 'a', loan.id).error, undefined);
  assert.equal(g.players.a.resources.money, 95);
  const other = requestLoan(g, 'a', { amount: 100, interest: 5, term: 10 }, T0).loan;
  assert.equal(cancelLoan(g, 'a', other.id).error, undefined);
  assert.match(fundLoan(g, 'b', other.id, T0).error, /disponible/);
});
