import assert from 'node:assert/strict';
import test from 'node:test';
import { assessBuyer, type BuyerCheck } from './buyerCheck.js';
import type { RecordOutcome, RecordReadBody } from '../reputation/recordRead.js';

const outcome = (over: Partial<RecordOutcome>): RecordOutcome => ({
  endedAt: 1_700_000_000,
  success: true,
  onTime: null,
  valueBand: '50to250',
  role: 'buyer',
  counterparty: '0xaa',
  ...over,
});

const read = (over: Partial<RecordReadBody> = {}): RecordReadBody => ({
  version: 'karwan-record-v1',
  issuer: '0xissuer',
  subject: { tag: 'tunde', address: '0xbuyer' },
  level: 'person_verified',
  score: 55,
  tier: 'ESTABLISHED',
  counts: { completed: 4, onTimeRate: null, disputesWon: 0, disputesLost: 0, cancelled: 0 },
  outcomes: [
    outcome({ counterparty: '0xaa' }),
    outcome({ counterparty: '0xaa' }),
    outcome({ counterparty: '0xbb', valueBand: '250to1000' }),
    outcome({ counterparty: '0xcc', role: 'seller', onTime: true }),
  ],
  issuedAt: 1,
  expiresAt: 2,
  ...over,
});

const paid = { paidUsdc: 0.01, receipt: 'settle-1', checkedAt: 1000 };

test('a buyer with a clean record as a buyer gets a bid', () => {
  const c = assessBuyer(read(), 120, paid) as BuyerCheck;
  assert.equal(c.verdict, 'bid');
  assert.equal(c.reason, 'record-ok');
  assert.deepEqual(c.asBuyer, { completed: 3, unsuccessful: 0, repeatSellers: 1, largestBand: '250to1000' });
  assert.equal(c.score, 55);
  assert.equal(c.receipt, 'settle-1');
  assert.equal(c.paidUsdc, 0.01);
});

test('only deals where the subject was the buyer count as buying history', () => {
  const c = assessBuyer(read({ outcomes: [outcome({ role: 'seller' }), outcome({ role: 'seller' })] }), 40, paid);
  assert.equal(c.asBuyer.completed, 0);
  assert.equal(c.asBuyer.largestBand, null);
});

test('a buyer who lost more disputes than they completed is passed on', () => {
  const c = assessBuyer(read({ counts: { completed: 1, onTimeRate: null, disputesWon: 0, disputesLost: 2, cancelled: 0 } }), 120, paid);
  assert.equal(c.verdict, 'pass');
  assert.equal(c.reason, 'disputes');
});

test('a buyer with no finished buys on a request of 250 USDC or more goes to the seller for review', () => {
  const c = assessBuyer(read({ outcomes: [] }), 400, paid);
  assert.equal(c.verdict, 'review');
  assert.equal(c.reason, 'new-buyer-large');
});

test('a buyer who never bought at this size goes to review on a large request', () => {
  const small = read({ outcomes: [outcome({ valueBand: 'lt50' }), outcome({ valueBand: '50to250' })] });
  const c = assessBuyer(small, 1500, paid);
  assert.equal(c.verdict, 'review');
  assert.equal(c.reason, 'first-at-this-size');
});

test('a small request from a new buyer is still a bid', () => {
  const c = assessBuyer(read({ outcomes: [] }), 80, paid);
  assert.equal(c.verdict, 'bid');
});

test('more failed buys than finished ones goes to review', () => {
  const c = assessBuyer(
    read({ outcomes: [outcome({ success: false }), outcome({ success: false }), outcome({ success: true })] }),
    80,
    paid,
  );
  assert.equal(c.verdict, 'review');
  assert.equal(c.reason, 'mixed-record');
  assert.equal(c.asBuyer.unsuccessful, 2);
});

test('repeat sellers count each seller who came back at least once', () => {
  const c = assessBuyer(
    read({
      outcomes: [
        outcome({ counterparty: '0x1' }),
        outcome({ counterparty: '0x1' }),
        outcome({ counterparty: '0x1' }),
        outcome({ counterparty: '0x2' }),
        outcome({ counterparty: '0x2' }),
        outcome({ counterparty: '0x3' }),
        outcome({ counterparty: '0x3', success: false }),
      ],
    }),
    80,
    paid,
  );
  assert.equal(c.asBuyer.repeatSellers, 2);
});
