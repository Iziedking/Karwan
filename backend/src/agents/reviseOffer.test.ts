import assert from 'node:assert/strict';
import test from 'node:test';
import { reviseStandingOffer, type ReviseDeps } from './reviseOffer.js';

const JOB = '0xjob';
const SELLER = '0x00000000000000000000000000000000000000aa';

function deps(over: Partial<ReviseDeps> = {}) {
  const calls = { submitted: [] as Array<{ price: number; deadline: number }>, withdrawn: 0, saved: [] as number[] };
  const d: ReviseDeps = {
    standing: async () => ({ priceUsdc: 142.71, deadlineUnix: 9_999, budgetUsdc: 120, floorUsdc: 110 }),
    handOffer: async () => false,
    revisionsSoFar: async () => 0,
    saveRevisions: async (n) => { calls.saved.push(n); },
    submit: async (price, deadline) => { calls.submitted.push({ price, deadline }); },
    withdraw: () => { calls.withdrawn += 1; },
    random: () => 0.5,
    ...over,
  };
  return { d, calls };
}

test('lowers with a new submitBid at a lower price and counts the revision', async () => {
  const { d, calls } = deps();
  assert.equal(await reviseStandingOffer(JOB, SELLER, 'request-changed', d), 'lowered');
  assert.equal(calls.submitted.length, 1);
  assert.ok(calls.submitted[0]!.price < 142.71 && calls.submitted[0]!.price >= 120);
  assert.equal(calls.submitted[0]!.deadline, 9_999, 'the offer stays acceptable for the whole request');
  assert.deepEqual(calls.saved, [1]);
});

test('withdraws the way stopping an agent does, when the seller cannot fit', async () => {
  const { d, calls } = deps({ standing: async () => ({ priceUsdc: 400, deadlineUnix: 9_999, budgetUsdc: 120, floorUsdc: 370 }) });
  assert.equal(await reviseStandingOffer(JOB, SELLER, 'request-changed', d), 'withdrawn');
  assert.equal(calls.withdrawn, 1);
  assert.equal(calls.submitted.length, 0);
});

test('stops at three revisions', async () => {
  const { d, calls } = deps({ revisionsSoFar: async () => 3 });
  assert.equal(await reviseStandingOffer(JOB, SELLER, 'request-changed', d), 'kept');
  assert.equal(calls.submitted.length, 0);
});

test('leaves alone a seller who offered by hand, and a seller with no standing offer', async () => {
  const hand = deps({ handOffer: async () => true });
  assert.equal(await reviseStandingOffer(JOB, SELLER, 'request-changed', hand.d), 'skipped');
  assert.equal(hand.calls.submitted.length, 0);
  const none = deps({ standing: async () => null });
  assert.equal(await reviseStandingOffer(JOB, SELLER, 'request-changed', none.d), 'skipped');
});

test('best and final carries the lowest other offer to the decision, never on the wire', async () => {
  const { d, calls } = deps({ standing: async () => ({ priceUsdc: 118, deadlineUnix: 9_999, budgetUsdc: 120, floorUsdc: 105 }) });
  assert.equal(await reviseStandingOffer(JOB, SELLER, 'best-and-final', d, 100), 'lowered');
  assert.ok(calls.submitted[0]!.price < 118 && calls.submitted[0]!.price >= 105);
});
