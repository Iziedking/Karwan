import assert from 'node:assert/strict';
import { test } from 'node:test';
import { betaFor, FIRM_BETA, jitterFor, LAST_PRICE_EXCHANGE, MAX_EXCHANGES, nextMove, nextSellerMove, scheduledPrice, STEADY_BETA, type ConcessionInput, type MoveInput } from './concession.js';

/// The concession schedule (view 41): firm early, steadier late or with
/// competition, one step per move from the other side, never under the floor.
///
///   npx tsx --test src/agents/concession.test.ts

const base: ConcessionInput = {
  opening: 100,
  floor: 80,
  current: 100,
  timeUsed: 0.1,
  exchanges: 0,
  competitors: 0,
  theirPrice: 70,
  theirMoved: true,
  seed: '0xseller:0xjob',
  agreeInsideLimits: false,
};

test('the schedule follows f + (o - f) × (1 - t^(1/β)), firm early and steady late or with competition', () => {
  assert.equal(betaFor(0.2, 0), FIRM_BETA);
  assert.equal(betaFor(0.6, 0), STEADY_BETA);
  assert.equal(betaFor(0.2, 3), STEADY_BETA);
  assert.equal(scheduledPrice(100, 80, 0, FIRM_BETA), 100);
  assert.equal(scheduledPrice(100, 80, 1, FIRM_BETA), 80);
  // Firm: at half the time the price has barely moved; steady: it is half way.
  assert.ok(scheduledPrice(100, 80, 0.5, FIRM_BETA) > 97, String(scheduledPrice(100, 80, 0.5, FIRM_BETA)));
  assert.equal(scheduledPrice(100, 80, 0.5, STEADY_BETA), 90);
  assert.equal(scheduledPrice(80, 80, 0.5, STEADY_BETA), 80);
});

test('no step without a move from the other side, and never under the floor', () => {
  assert.deepEqual(nextSellerMove({ ...base, theirMoved: false }), { kind: 'hold', price: 100 });
  const late = nextSellerMove({ ...base, timeUsed: 0.99, exchanges: 2, current: 82, theirPrice: 60 });
  assert.equal(late.kind, 'step');
  assert.ok((late as { price: number }).price >= 80, String((late as { price: number }).price));
  const steps = nextSellerMove({ ...base, timeUsed: 0.6, exchanges: 1, theirPrice: 60 });
  assert.equal(steps.kind, 'step');
  assert.ok((steps as { price: number }).price < 100 && (steps as { price: number }).price >= 80);
});

test('the jitter is within 5 percent, stable per seed and different between sellers', () => {
  const a = jitterFor('0xa:0xjob');
  const b = jitterFor('0xb:0xjob');
  assert.ok(Math.abs(a) <= 0.05 && Math.abs(b) <= 0.05);
  assert.equal(a, jitterFor('0xa:0xjob'));
  assert.notEqual(a, b);
  const stepA = nextSellerMove({ ...base, timeUsed: 0.6, exchanges: 1, theirPrice: 60, seed: '0xa:0xjob' });
  const stepB = nextSellerMove({ ...base, timeUsed: 0.6, exchanges: 1, theirPrice: 60, seed: '0xb:0xjob' });
  assert.notEqual((stepA as { price: number }).price, (stepB as { price: number }).price);
});

test('the fourth exchange is the last price; past the fifth the agent asks its person', () => {
  const last = nextSellerMove({ ...base, exchanges: LAST_PRICE_EXCHANGE - 1, theirPrice: 60 });
  assert.equal(last.kind, 'last-price');
  assert.equal(nextSellerMove({ ...base, exchanges: MAX_EXCHANGES, theirPrice: 60 }).kind, 'ask');
});

test('a time trade comes before crossing to the floor, once', () => {
  const nearFloor = { ...base, current: 81, timeUsed: 1, exchanges: 2, theirPrice: 60, tradeDays: 7 };
  assert.deepEqual(nextSellerMove(nearFloor), { kind: 'trade', price: 81, days: 7 });
  assert.equal(nextSellerMove({ ...nearFloor, traded: true }).kind, 'step');
  assert.equal(nextSellerMove({ ...nearFloor, tradeDays: null }).kind, 'step');
});

test('meeting the standing price is agreed; a price inside the limits at the next step is taken only with Agree for me, else asked', () => {
  assert.deepEqual(nextSellerMove({ ...base, theirPrice: 100 }), { kind: 'accept', price: 100 });
  assert.deepEqual(nextSellerMove({ ...base, theirPrice: 120, agreeInsideLimits: true }), { kind: 'accept', price: 100 });
  const inside = { ...base, timeUsed: 0.9, exchanges: 2, theirPrice: 92 };
  assert.equal(nextSellerMove(inside).kind, 'ask');
  assert.deepEqual(nextSellerMove({ ...inside, agreeInsideLimits: true }), { kind: 'accept', price: 92 });
  // Under the floor is never accepted by the schedule, whatever the mode.
  const under = nextSellerMove({ ...base, timeUsed: 0.9, exchanges: 2, theirPrice: 70, agreeInsideLimits: true });
  assert.notEqual(under.kind, 'accept');
});

// View 73 (spec S6, S8, S9, S10): the same schedule for the buyer, mirrored.
const buyer: MoveInput = {
  role: 'buyer',
  opening: 150,
  limit: 222,
  current: 150,
  timeUsed: 0.1,
  exchanges: 0,
  competitors: 0,
  theirPrice: 230,
  theirMoved: true,
  seed: '0xbuyer:0xjob',
  agreeInsideLimits: false,
  midpointUsed: false,
  budgetUsdc: 222,
  betterOffer: false,
};

test('the buyer steps up after the seller moves, never past budget plus leeway', () => {
  const m = nextMove(buyer);
  assert.equal(m.kind, 'step');
  if (m.kind === 'step') assert.ok(m.price > 150 && m.price <= 222, String(m.price));
  for (const exchanges of [1, 2]) {
    const late = nextMove({ ...buyer, exchanges, timeUsed: 1, current: 200 });
    assert.ok(late.kind !== 'ask' && late.price <= 222 && late.price >= 200, JSON.stringify(late));
  }
});

test('the buyer holds when the seller did not move', () => {
  assert.deepEqual(nextMove({ ...buyer, theirMoved: false }), { kind: 'hold', price: 150 });
});

test('the buyer agrees when the seller meets its price', () => {
  assert.deepEqual(nextMove({ ...buyer, theirPrice: 149 }), { kind: 'accept', price: 150 });
});

test("the buyer's fourth answer is a last price", () => {
  const m = nextMove({ ...buyer, exchanges: LAST_PRICE_EXCHANGE - 1 });
  assert.equal(m.kind, 'last-price');
  if (m.kind === 'last-price') assert.ok(m.price > 150 && m.price <= 222);
  assert.deepEqual(nextMove({ ...buyer, exchanges: MAX_EXCHANGES }), { kind: 'ask' });
});

test('a better offer makes the seller step steadier', () => {
  const seller: MoveInput = { ...base, role: 'seller', limit: base.floor, midpointUsed: true, budgetUsdc: null, betterOffer: false };
  const plain = nextMove(seller);
  const pressed = nextMove({ ...seller, betterOffer: true });
  assert.ok(plain.kind === 'step' && pressed.kind === 'step');
  if (plain.kind === 'step' && pressed.kind === 'step') assert.ok(pressed.price < plain.price, `${pressed.price} < ${plain.price}`);
});

test('meet in the middle once, after three exchanges, under five percent', () => {
  const close = { ...buyer, current: 215, theirPrice: 222, theirMoved: false, exchanges: 3 };
  assert.deepEqual(nextMove(close), { kind: 'midpoint', price: 218.5 });
  assert.equal(nextMove({ ...close, midpointUsed: true }).kind, 'hold');
  assert.equal(nextMove({ ...close, exchanges: 2 }).kind, 'hold');
  assert.equal(nextMove({ ...close, current: 200 }).kind, 'hold', 'a gap of 5 percent or more is bargained, not split');
  assert.equal(nextMove({ ...close, budgetUsdc: null }).kind, 'hold');
  const seller: MoveInput = { ...close, role: 'seller', limit: 200, current: 230, theirPrice: 222, seed: '0xs' };
  assert.deepEqual(nextMove(seller), { kind: 'midpoint', price: 226 });
  assert.equal(nextMove({ ...seller, limit: 228 }).kind, 'hold', 'never past the lowest of the side that splits');
});

test('the buyer offers more days once before a last price', () => {
  assert.deepEqual(nextMove({ ...buyer, exchanges: LAST_PRICE_EXCHANGE - 1, tradeDays: 4 }), { kind: 'trade', price: 150, days: 4 });
  assert.equal(nextMove({ ...buyer, exchanges: LAST_PRICE_EXCHANGE - 1, tradeDays: 4, traded: true }).kind, 'last-price');
});
