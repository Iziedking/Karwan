import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeliveryQuestions, deliveryQuestionText, reachGate, runDeliverySweep, type QuestionRecord } from './deliveryQuestions.js';

/// "I found some customers in Ghana. Do you ship there?" asked once a day at
/// most, and an agent that does not know yet stays out of the deal meanwhile.
///
///   npx tsx --test src/location/deliveryQuestions.test.ts

const HOUR = 60 * 60 * 1000;
const NOW = 1_760_000_000_000;
const lagos = { country: 'NG', city: 'Lagos', area: null, reach: {} };

function setup() {
  const store = new Map<string, QuestionRecord>();
  let now = NOW;
  const q = createDeliveryQuestions({
    now: () => now,
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => {
      store.set(k, v);
    },
    list: async () => [...store.entries()].map(([key, data]) => ({ key, data })),
  });
  return { q, advance: (ms: number) => (now += ms) };
}

test('an unknown country queues one question and skips the bid', async () => {
  assert.equal(reachGate({ kind: 'goods', where: { scope: 'near' }, seller: lagos, buyerCountry: 'GH', now: NOW }), 'ask');
  const s = setup();
  await s.q.queue('0xada', 'GH');
  await s.q.queue('0xada', 'GH');
  assert.deepEqual(await s.q.due(), [{ seller: '0xada', countries: ['GH'] }]);
});

test('the gate bids at home, skips after a no and lets remote work through', () => {
  const near = { scope: 'near' as const };
  assert.equal(reachGate({ kind: 'goods', where: near, seller: lagos, buyerCountry: 'NG', now: NOW }), 'bid');
  const said = { ...lagos, reach: { GH: { ships: false, days: null, answeredAt: NOW } } };
  assert.equal(reachGate({ kind: 'goods', where: near, seller: said, buyerCountry: 'GH', now: NOW }), 'skip');
  assert.equal(reachGate({ kind: 'remote', where: near, seller: lagos, buyerCountry: 'GH', now: NOW }), 'bid');
});

test('questions batch to one message a day per seller', async () => {
  const s = setup();
  await s.q.queue('0xada', 'GH');
  await s.q.queue('0xada', 'TG');
  assert.deepEqual(await s.q.due(), [{ seller: '0xada', countries: ['GH', 'TG'] }]);
  await s.q.sent('0xada', ['GH', 'TG']);
  await s.q.queue('0xada', 'BJ');
  assert.deepEqual(await s.q.due(), []);
  s.advance(24 * HOUR + 1);
  assert.deepEqual(await s.q.due(), [{ seller: '0xada', countries: ['BJ'] }]);
});

test('the question names the countries in plain words', () => {
  assert.equal(
    deliveryQuestionText(['GH', 'TG']),
    'I found some customers in Ghana and Togo. Do you ship there? Tell me which, and roughly how many days.',
  );
});

test('a seller with no location set still bids at home and abroad', () => {
  assert.equal(reachGate({ kind: 'goods', where: { scope: 'near' }, seller: null, buyerCountry: 'NG', now: NOW }), 'bid');
});

test('a request without where, or for anywhere, is never gated', () => {
  assert.equal(reachGate({ kind: 'goods', where: undefined, seller: lagos, buyerCountry: 'GH', now: NOW }), 'bid');
  assert.equal(reachGate({ kind: 'goods', where: { scope: 'anywhere' }, seller: lagos, buyerCountry: 'GH', now: NOW }), 'bid');
});

test('a country request is checked against the country asked for, not the buyer\'s home', () => {
  const accra = { country: 'GH', city: 'Accra', area: null, reach: {} };
  assert.equal(reachGate({ kind: 'goods', where: { scope: 'country', country: 'GH' }, seller: accra, buyerCountry: 'NG', now: NOW }), 'bid');
  assert.equal(reachGate({ kind: 'goods', where: { scope: 'country', country: 'TG' }, seller: accra, buyerCountry: 'NG', now: NOW }), 'ask');
});

test('a seller who never answers is asked about a country again only after 30 days', async () => {
  const s = setup();
  await s.q.queue('0xada', 'GH');
  await s.q.sent('0xada', ['GH']);
  s.advance(25 * HOUR);
  await s.q.queue('0xada', 'GH');
  assert.deepEqual(await s.q.due(), []);
  s.advance(30 * 24 * HOUR);
  await s.q.queue('0xada', 'GH');
  assert.deepEqual(await s.q.due(), [{ seller: '0xada', countries: ['GH'] }]);
});

test('a question queued while a batch is sending is kept', async () => {
  const s = setup();
  await s.q.queue('0xada', 'GH');
  const batch = await s.q.due();
  await s.q.queue('0xada', 'TG');
  await s.q.sent('0xada', batch[0]!.countries);
  s.advance(24 * HOUR + 1);
  assert.deepEqual(await s.q.due(), [{ seller: '0xada', countries: ['TG'] }]);
});

test('a seller who cannot be reached is marked, so the gate lets them bid', async () => {
  const s = setup();
  await s.q.queue('0xweb', 'GH');
  await s.q.unreachable('0xweb');
  assert.equal(await s.q.isUnreachable('0xweb'), true);
  assert.deepEqual(await s.q.due(), []);
});

test('one failing send never stops the others', async () => {
  const s = setup();
  await s.q.queue('0xa', 'GH');
  await s.q.queue('0xb', 'GH');
  const told: string[] = [];
  await runDeliverySweep(s.q, async (seller) => {
    if (seller === '0xa') throw new Error('telegram down');
    told.push(seller);
    return true;
  }, async () => {});
  assert.deepEqual(told, ['0xb']);
});

test('the question is kept in the seller\'s chat history so the agent understands the answer', async () => {
  const s = setup();
  await s.q.queue('0xada', 'GH');
  const noted: string[] = [];
  await runDeliverySweep(s.q, async () => true, async (_seller, text) => {
    noted.push(text);
  });
  assert.match(noted[0]!, /Ghana/);
});
