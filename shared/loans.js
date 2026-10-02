// Reglas de los préstamos entre jugadores (servidor y cliente).

export const LOAN_MIN = 10;
export const LOAN_MAX = 5000;
export const LOAN_MAX_INTEREST = 100; // %
export const LOAN_TERMS = [5, 10, 20, 30, 60]; // minutos de juego hasta devolverlo
export const LOAN_REQUEST_TTL_MS = 5 * 60_000; // una petición sin respuesta caduca
export const LOAN_MAX_OPEN = 3;
export const LOAN_LATE_PENALTY = 0.1; // recargo si no se puede pagar a tiempo
export const LOAN_RETRY_MS = 60_000; // se vuelve a intentar cobrar cada minuto de juego

/** Lo que hay que devolver: cantidad más el interés (redondeado hacia arriba). */
export const owedFor = (amount, interest) => Math.ceil(amount * (1 + interest / 100));
