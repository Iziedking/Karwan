import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPassport, isOwnerView, sealedFactsFor, type SealedDeal } from './passport.js';
import { PASSPORT_KEYS, assertOnlyKeys } from './allowlist.js';

const ME = '0x1111111111111111111111111111111111111111';
const A = '0x2222222222222222222222222222222222222222';
const B = '0x3333333333333333333333333333333333333333';

const deals: SealedDeal[] = [
  // Settled as seller, delivered before the deadline, World ID verified as seller.
  { buyer: A, seller: ME, settledAt: 10, deliveredAt: 1_000, deadlineUnix: 2, highSignalVerification: { seller: { status: 'verified' } } },
  // Settled as seller, delivered late.
  { buyer: B, seller: ME, settledAt: 20, deliveredAt: 5_000, deadlineUnix: 2 },
  // Settled as buyer.
  { buyer: ME, seller: A, settledAt: 30 },
  // Cancelled: never counts.
  { buyer: B, seller: ME, settledAt: 40, cancelledAt: 41 },
  // In flight: never counts.
  { buyer: A, seller: ME },
];

test('facts count settled deals in both roles, timing only as seller', () => {
  assert.deepEqual(sealedFactsFor(deals, ME, 0), {
    settled: 3,
    distinctCounterparties: 2,
    onTime: 1,
    withDeadline: 2,
    disputesLost: 0,
    personVerified: true,
  });
});

test('subject matching ignores letter case', () => {
  assert.equal(sealedFactsFor(deals, ME.toUpperCase().replace('0X', '0x'), 0).settled, 3);
});

test('a person with no deals and no profile still gets a passport', () => {
  const passport = buildPassport({
    address: ME, displayName: null, tag: null, tier: 'NEW', memberSince: null,
    facts: sealedFactsFor([], ME, 0),
  });
  assert.deepEqual(passport.reasons, ['NEW_ON_KARWAN']);
  assert.equal(passport.displayName, null);
});

test('the passport carries exactly the allowed fields and no record numbers', () => {
  const passport = buildPassport({
    address: ME, displayName: 'Ada', tag: 'ada', tier: 'STRONG', memberSince: 1_700_000_000_000,
    facts: sealedFactsFor(deals, ME, 0),
  });
  assert.deepEqual(Object.keys(passport).sort(), [...PASSPORT_KEYS].sort());
  assertOnlyKeys(passport, PASSPORT_KEYS);
  const json = JSON.stringify({ ...passport, address: '', memberSince: null });
  assert.ok(!/\d/.test(json), `passport leaked a number: ${json}`);
});

test('assertOnlyKeys rejects an extra field', () => {
  assert.throws(() => assertOnlyKeys({ sealed: true, score: 640 }, PASSPORT_KEYS), /score/);
});

test('owner view compares addresses without case and refuses no session', () => {
  assert.equal(isOwnerView(ME.toUpperCase().replace('0X', '0x'), ME), true);
  assert.equal(isOwnerView(A, ME), false);
  assert.equal(isOwnerView(null, ME), false);
  assert.equal(isOwnerView(undefined, ME), false);
});
