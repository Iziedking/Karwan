import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRecordRead, countsFor, counterpartyHash, valueBand, MAX_OUTCOMES, RECORD_READ_TTL_MS } from './recordRead.js';

const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';
const C = '0x00000000000000000000000000000000000000cc';
const day = 86_400_000;

function deal(over: Record<string, unknown>) {
  return { buyer: B, seller: A, settledAt: 10 * day, deliveredAt: 9 * day, deadlineUnix: (10 * day) / 1000, dealAmountUsdc: 80, ...over };
}

test('value bands split at 50, 250 and 1000', () => {
  assert.equal(valueBand(49.99), 'lt50');
  assert.equal(valueBand(50), '50to250');
  assert.equal(valueBand(250), '250to1000');
  assert.equal(valueBand(1000), 'gte1000');
});

test('counterparty hash is stable per pair, order free, and hides the address', () => {
  const h1 = counterpartyHash('pep', A, B);
  assert.equal(h1, counterpartyHash('pep', B, A));
  assert.notEqual(h1, counterpartyHash('pep', A, C));
  assert.notEqual(h1, counterpartyHash('other', A, B));
  assert.ok(!h1.includes(B.slice(2)));
});

test('on-time rate is null under three timed deliveries', () => {
  const c = countsFor([deal({}), deal({})], A);
  assert.equal(c.completed, 2);
  assert.equal(c.onTimeRate, null);
});

test('counts completed, on time, disputes and cancels', () => {
  const deals = [
    deal({}),
    deal({}),
    deal({ deliveredAt: 11 * day }),
    deal({ disputeLoser: 'seller' }),
    deal({ disputeLoser: 'buyer' }),
    deal({ settledAt: undefined, cancelledAt: 5 * day }),
  ];
  const c = countsFor(deals, A);
  assert.equal(c.completed, 5);
  assert.equal(c.onTimeRate, 80);
  assert.equal(c.disputesLost, 1);
  assert.equal(c.disputesWon, 1);
  assert.equal(c.cancelled, 1);
});

test('read carries the 0-100 score, a 24h expiry and at most 50 outcomes, newest first', () => {
  const deals = Array.from({ length: 60 }, (_, i) => deal({ settledAt: (i + 1) * day }));
  const r = buildRecordRead({ issuer: C, subject: A, tag: 'ada', level: 'work_verified', engineScore: 817, tier: 'STRONG', deals, pepper: 'pep', now: 100 * day });
  assert.equal(r.version, 'karwan-record-v1');
  assert.equal(r.score, 82);
  assert.equal(r.expiresAt - r.issuedAt, RECORD_READ_TTL_MS);
  assert.equal(r.outcomes.length, MAX_OUTCOMES);
  assert.equal(r.outcomes[0]!.endedAt, Math.floor((60 * day) / 1000));
  assert.ok(r.outcomes.every((o) => o.role === 'seller' && o.valueBand === '50to250'));
  assert.ok(!JSON.stringify(r).includes(B.slice(2)));
});
