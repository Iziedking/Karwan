import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '@/core/api';
import { dealRoute, routeTrack } from './dealRouteModel';

/// The deal's route (view 48): four stops for one payment, its own stops for
/// other kinds, and a status line instead of a route once a deal stops moving
/// forward.

const NOW = Date.UTC(2026, 10, 3);

function deal(over: Partial<DirectDeal> = {}): DirectDeal {
  return {
    jobId: `0x${'ab'.repeat(32)}`,
    buyer: '0x1111111111111111111111111111111111111111',
    seller: '0x2222222222222222222222222222222222222222',
    dealAmountUsdc: '600',
    firstReleasePct: 100,
    terms: 'Logo design',
    delivered: false,
    createdAt: NOW,
    updatedAt: NOW,
    onChain: null,
    ...over,
  } as DirectDeal;
}

const stops = (d: DirectDeal) => {
  const route = dealRoute(d);
  assert.equal(route.kind, 'route');
  return route.kind === 'route' ? route.stops.map((s) => `${s.key}${s.stage ?? ''}:${s.state}`) : [];
};
const status = (d: DirectDeal) => {
  const route = dealRoute(d);
  assert.equal(route.kind, 'status');
  return route.kind === 'status' ? route.status : null;
};

test('a one-payment deal walks Agreed, Paid in, Delivered, Paid out', () => {
  assert.deepEqual(stops(deal()), ['agreed:current', 'paidIn:upcoming', 'delivered:upcoming', 'paidOut:upcoming']);
  assert.deepEqual(stops(deal({ sellerApprovedAt: NOW, acceptedAt: NOW })), ['agreed:done', 'paidIn:done', 'delivered:current', 'paidOut:upcoming']);
  assert.deepEqual(stops(deal({ sellerApprovedAt: NOW, acceptedAt: NOW, delivered: true, settledAt: NOW })), ['agreed:done', 'paidIn:done', 'delivered:done', 'paidOut:done']);
});

test('kinds with their own steps keep their own stops', () => {
  assert.deepEqual(
    stops(deal({ firstReleasePct: 50, sellerApprovedAt: NOW, acceptedAt: NOW })),
    ['agreed:done', 'paidIn:done', 'stage1:current', 'stage2:upcoming'],
  );
  assert.deepEqual(
    stops(deal({ tradeType: 'goods', sellerApprovedAt: NOW, acceptedAt: NOW })),
    ['agreed:done', 'paidIn:done', 'onTheWay:current', 'arrived:upcoming', 'paidOut:upcoming'],
  );
});

test('a disputed, cancelled or refunded deal shows its status, never a route moving forward', () => {
  const paid = { sellerApprovedAt: NOW, acceptedAt: NOW };
  assert.equal(status(deal({ ...paid, disputed: true, disputedAt: NOW })), 'disputed');
  assert.equal(status(deal({ ...paid, delivered: true, dispute: { open: true, closesAt: NOW, otherSubmitted: false, statements: {} } })), 'disputed');
  assert.equal(status(deal({ cancelledAt: NOW, cancelKind: 'pre-accept' })), 'cancelled');
  assert.equal(status(deal({ ...paid, cancelledAt: NOW, cancelKind: 'mutual' })), 'refunding');
  assert.equal(status(deal({ ...paid, cancelledAt: NOW, cancelKind: 'refund-from-dispute', disputed: true, onChain: { state: 5 } as DirectDeal['onChain'] })), 'refunded');
  assert.equal(status(deal({ ...paid, disputed: true, cancelledAt: NOW, cancelKind: 'release-from-dispute' })), 'paidToSeller');
  assert.equal(status(deal({ ...paid, disputed: true, settledAt: NOW, cancelKind: 'resolved', resolvedSellerBps: 5000 })), 'split');
});

test('the track draws travelled stops solid, the current stop as a ring and the road ahead dashed', () => {
  const track = routeTrack([
    { key: 'agreed', state: 'done' },
    { key: 'paidIn', state: 'done' },
    { key: 'delivered', state: 'current' },
    { key: 'paidOut', state: 'upcoming' },
  ]);
  assert.deepEqual(track.map((s) => s.mark), ['passed', 'passed', 'here', 'next']);
  // The line into a stop is travelled when that stop is reached, ahead otherwise.
  assert.deepEqual(track.map((s) => s.lineBefore), [null, 'travelled', 'travelled', 'ahead']);
  assert.deepEqual(track.map((s) => s.lineAfter), ['travelled', 'travelled', 'ahead', null]);
  assert.deepEqual(track.map((s) => s.align), ['start', 'center', 'center', 'end']);
});

test('a finished route ends on a ring at Paid out', () => {
  const track = routeTrack([
    { key: 'agreed', state: 'done' },
    { key: 'paidIn', state: 'done' },
    { key: 'delivered', state: 'done' },
    { key: 'paidOut', state: 'done' },
  ], { finished: true });
  assert.deepEqual(track.map((s) => s.mark), ['passed', 'passed', 'passed', 'here']);
  assert.deepEqual(track.map((s) => s.lineBefore), [null, 'travelled', 'travelled', 'travelled']);
});
