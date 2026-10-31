import assert from 'node:assert/strict';
import test from 'node:test';

import type { DirectDeal } from '@/core/api';
import { classifyDirectDeal, homeDealsPreview, orderDeals, type Orderable } from './dealsList';

const BUYER = `0x${'22'.repeat(20)}`;
const SELLER = `0x${'33'.repeat(20)}`;

const item = (o: Partial<Orderable> & { id: string }) => ({
  yourMove: false,
  finished: false,
  dueUnix: null,
  updatedAtMs: 0,
  ...o,
});

function deal(fields: Partial<DirectDeal>): DirectDeal {
  return {
    jobId: `0x${'11'.repeat(32)}`,
    buyer: BUYER,
    seller: SELLER,
    dealAmountUsdc: '100',
    terms: 'Test terms',
    firstReleasePct: 50,
    delivered: false,
    disputed: false,
    createdAt: 1,
    updatedAt: 1,
    onChain: null,
    ...fields,
  } as DirectDeal;
}

test('what needs you comes first, then active, then finished', () => {
  const g = orderDeals([item({ id: 'a' }), item({ id: 'f', finished: true }), item({ id: 'n', yourMove: true })]);
  assert.deepEqual([g.needsYou, g.active, g.finished].map((l) => l.map((x) => x.id)), [['n'], ['a'], ['f']]);
});

test('sooner due first, undated last; finished newest first', () => {
  const g = orderDeals([
    item({ id: 'late', yourMove: true, dueUnix: 300 }),
    item({ id: 'none', yourMove: true }),
    item({ id: 'soon', yourMove: true, dueUnix: 100 }),
    item({ id: 'old', finished: true, updatedAtMs: 1 }),
    item({ id: 'new', finished: true, updatedAtMs: 9 }),
  ]);
  assert.deepEqual(g.needsYou.map((x) => x.id), ['soon', 'late', 'none']);
  assert.deepEqual(g.finished.map((x) => x.id), ['new', 'old']);
});

test('same due date: the one that moved last comes first', () => {
  const g = orderDeals([
    item({ id: 'quiet', dueUnix: 100, updatedAtMs: 1 }),
    item({ id: 'moved', dueUnix: 100, updatedAtMs: 5 }),
  ]);
  assert.deepEqual(g.active.map((x) => x.id), ['moved', 'quiet']);
});

test('a finished deal never needs you, even if flagged', () => {
  const g = orderDeals([item({ id: 'x', finished: true, yourMove: true })]);
  assert.deepEqual(g.needsYou, []);
  assert.deepEqual(g.finished.map((x) => x.id), ['x']);
});

test('a disputed deal stays active; settled and cancelled are finished', () => {
  const disputed = classifyDirectDeal(deal({ acceptedAt: 3, disputed: true }), BUYER);
  assert.deepEqual({ finished: disputed.finished, yourMove: disputed.yourMove }, { finished: false, yourMove: false });
  assert.equal(classifyDirectDeal(deal({ settledAt: 9 }), BUYER).finished, true);
  assert.equal(classifyDirectDeal(deal({ cancelledAt: 9 }), BUYER).finished, true);
});

test('your move follows the side you are on', () => {
  const awaitingFunding = deal({ sellerApprovedAt: 2 });
  assert.equal(classifyDirectDeal(awaitingFunding, BUYER).yourMove, true);
  assert.equal(classifyDirectDeal(awaitingFunding, SELLER).yourMove, false);
  assert.equal(classifyDirectDeal(awaitingFunding, BUYER.toUpperCase().replace('0X', '0x')).isBuyer, true);
});

test('Home shows two that need you, else the next active one, else nothing', () => {
  assert.deepEqual(homeDealsPreview({ needsYou: [1, 2, 3], active: [4], finished: [] }), { title: 'needsYou', items: [1, 2] });
  assert.deepEqual(homeDealsPreview({ needsYou: [], active: [4, 5], finished: [] }), { title: 'active', items: [4] });
  assert.deepEqual(homeDealsPreview({ needsYou: [], active: [], finished: [6] }), { title: null, items: [] });
});
