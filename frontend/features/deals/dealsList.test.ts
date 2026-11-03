import assert from 'node:assert/strict';
import test from 'node:test';

import type { DirectDeal } from '@/core/api';
import { amountStruck, classifyDirectDeal, dealState, homeDealsPreview, orderDeals, rowMove, type Orderable } from './dealsList';

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

test('Home shows the deal that needs you as a card, then up to three on the way, else nothing', () => {
  assert.deepEqual(homeDealsPreview({ needsYou: [1, 2, 3], active: [4], finished: [] }), { needsYou: 1, needsYouCount: 3, onTheWay: [4], empty: false });
  assert.deepEqual(homeDealsPreview({ needsYou: [], active: [4, 5, 6, 7], finished: [] }), { needsYou: null, needsYouCount: 0, onTheWay: [4, 5, 6], empty: false });
  assert.deepEqual(homeDealsPreview({ needsYou: [], active: [], finished: [6] }), { needsYou: null, needsYouCount: 0, onTheWay: [], empty: true });
});

const next = (action: NonNullable<DirectDeal['view']>['next']['action'], actor: 'you' | 'counterparty' = 'you') =>
  deal({ view: { stage: 'awaiting-first-release', money: { line: 'held' }, progress: [], next: { action, actor, amountUsdc: '100' }, automatic: null } });

test('a row that needs you names its move in one word, when it has one', () => {
  assert.equal(rowMove(next('release')), 'release');
  assert.equal(rowMove(next('accept')), 'approve');
  assert.equal(rowMove(next('fund')), 'pay');
  assert.equal(rowMove(next('deliver')), 'deliver');
  assert.equal(rowMove(next('claim')), 'claim');
  assert.equal(rowMove(next('respond-cancel')), null);
  assert.equal(rowMove(next('release', 'counterparty')), null);
  assert.equal(rowMove(next(null)), null);
  assert.equal(rowMove(deal({})), null);
});

/// The pill on every deal (owner notes, 3 Nov 2026): where a deal stands at a
/// glance, and ended deals each with their own state.
test('a deal says at a glance where it stands', () => {
  const at = Date.UTC(2026, 10, 3);
  const cases: Array<[Partial<DirectDeal>, { yourMove: boolean; finished: boolean }, string]> = [
    [{}, { yourMove: true, finished: false }, 'yourMove'],
    [{ acceptedAt: at }, { yourMove: false, finished: false }, 'active'],
    [{ acceptedAt: at, disputed: true }, { yourMove: true, finished: false }, 'disputed'],
    [{ acceptedAt: at, settledAt: at }, { yourMove: false, finished: true }, 'paidOut'],
    [{ cancelledAt: at }, { yourMove: false, finished: true }, 'cancelled'],
    [{ acceptedAt: at, cancelledAt: at }, { yourMove: false, finished: true }, 'refunding'],
    [{ acceptedAt: at, cancelledAt: at, onChain: { state: 5 } as DirectDeal['onChain'] }, { yourMove: false, finished: true }, 'refunded'],
    [{ acceptedAt: at, cancelledAt: at, cancelKind: 'resolved' } as Partial<DirectDeal>, { yourMove: false, finished: true }, 'split'],
    [{ acceptedAt: at, cancelledAt: at, cancelKind: 'release-from-dispute' } as Partial<DirectDeal>, { yourMove: false, finished: true }, 'paidOut'],
  ];
  for (const [fields, flags, want] of cases) assert.equal(dealState({ ...flags, deal: deal(fields) }), want, JSON.stringify(fields));
});

test('a row with no direct deal still has a state', () => {
  assert.equal(dealState({ yourMove: true, finished: false }), 'yourMove');
  assert.equal(dealState({ yourMove: false, finished: false }), 'active');
  assert.equal(dealState({ yourMove: false, finished: true }), 'ended');
});

test('money that never moved or came back is struck through; paid out is not', () => {
  assert.deepEqual((['paidOut', 'cancelled', 'refunding', 'refunded', 'split', 'ended'] as const).map(amountStruck), [false, true, true, true, false, false]);
});
