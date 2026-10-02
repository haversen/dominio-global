import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createGameServer } from '../server/app.js';
import { validSubscription, addSubscription } from '../server/push.js';

const sent = [];
const fakePush = { publicKey: 'clave-publica', send: async (subs, payload) => { sent.push({ subs, payload }); return []; } };
const server = createGameServer({ push: fakePush });
await new Promise((resolve) => server.server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.server.address().port}`;
const clients = [];
after(async () => {
  for (const c of clients) c.disconnect();
  await server.close();
});

let n = 1;
function client() {
  const socket = connect(url, { auth: { token: (n++).toString(16).padStart(32, 'e') }, transports: ['websocket'], reconnection: false });
  clients.push(socket);
  return new Promise((resolve) => socket.once('connect', () => resolve(socket)));
}
const req = (s, ev, p = {}) => s.timeout(3000).emitWithAck(ev, p);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SUB = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } };

test('suscripciones: se validan y no se duplican', () => {
  assert.equal(validSubscription(SUB), true);
  assert.equal(validSubscription({ endpoint: 'http://inseguro', keys: SUB.keys }), false);
  assert.equal(validSubscription({ endpoint: SUB.endpoint }), false);
  assert.equal(addSubscription(addSubscription([], SUB), SUB).length, 1);
});

test('avisos: solo llegan a quien no está mirando la partida', async () => {
  const a = await client();
  const b = await client();
  assert.equal((await req(b, 'push:key')).publicKey, 'clave-publica');
  assert.equal((await req(b, 'push:subscribe', { subscription: SUB })).ok, true);
  const { room } = await req(a, 'room:create', { name: 'Ana' });
  const joined = await req(b, 'room:join', { name: 'Beto', code: room.code });

  // b está conectado: no recibe aviso del mensaje privado.
  await req(a, 'dm:send', { playerId: joined.you, text: 'hola' });
  await wait(100);
  assert.equal(sent.length, 0);

  // b cierra el juego: ahora sí le llega.
  b.disconnect();
  await wait(150);
  await wait(500); // el límite de mensajes de chat es de 0,5 s
  assert.equal((await req(a, 'dm:send', { playerId: joined.you, text: '¿sigues ahí?' })).ok, true);
  await wait(100);
  assert.equal(sent.length, 1);
  assert.match(sent[0].payload.title, /Ana/);
  assert.equal(sent[0].payload.body, '¿sigues ahí?');
  assert.equal(sent[0].subs[0].endpoint, SUB.endpoint);
  assert.ok(sent[0].payload.url.includes(room.code));
});
