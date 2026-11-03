import assert from 'node:assert/strict';
import test from 'node:test';
import { WATCH_DAYS, WATCH_MAX, checkWatch, newWatch, watchRefusal } from './watches.js';

/// watch_market (view 48, step 5): a standing ask on the person's agent.

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const demand = (rising: boolean) => [{ id: 'farm' as const, name: 'Farm produce', thisWeek: 4, lastWeek: 1, openOffers: 2, rising }];
const market = (opts: { rising?: boolean; mid?: number } = {}) => ({
  demand: demand(opts.rising ?? false),
  karwanPrices: opts.mid ? { farm: { low: opts.mid - 10, mid: opts.mid, high: opts.mid + 10, deals: 3 } } : {},
});

test('a new watch lasts 30 days, and a person keeps at most five', () => {
  const w = newWatch({ id: 'w1', owner: '0xA', kind: 'requests', category: 'farm', now: NOW });
  assert.equal(w.expiresAt, NOW + WATCH_DAYS * DAY);
  assert.equal(w.owner, '0xa');
  assert.equal(watchRefusal([], 'farm'), null);
  assert.match(watchRefusal(Array.from({ length: WATCH_MAX }, () => w), 'tech')!, /five/);
  assert.match(watchRefusal([w], 'farm', 'requests')!, /already/);
});

test('new requests in the category fire once, then the watch has seen them', () => {
  const w = newWatch({ id: 'w1', owner: '0xa', kind: 'requests', category: 'farm', now: NOW - DAY });
  const requests = [
    { jobId: '0x1', category: 'farm' as const, postedAt: NOW - 1000 },
    { jobId: '0x2', category: 'farm' as const, postedAt: NOW - 500 },
    { jobId: '0x3', category: 'tech' as const, postedAt: NOW - 500 },
    { jobId: '0x0', category: 'farm' as const, postedAt: NOW - 2 * DAY },
  ];
  const first = checkWatch(w, market(), requests, NOW);
  assert.deepEqual(first.hit, { kind: 'requests', count: 2, jobIds: ['0x1', '0x2'] });
  assert.equal(checkWatch(first.watch, market(), requests, NOW + 1000).hit, null);
});

test('a price watch sets where the price is, then fires on a move of 10% or more', () => {
  const w = newWatch({ id: 'w2', owner: '0xa', kind: 'price', category: 'farm', now: NOW });
  const set = checkWatch(w, market({ mid: 100 }), [], NOW);
  assert.equal(set.hit, null);
  assert.equal(checkWatch(set.watch, market({ mid: 105 }), [], NOW).hit, null);
  const moved = checkWatch(set.watch, market({ mid: 112 }), [], NOW);
  assert.deepEqual(moved.hit, { kind: 'price', fromUsdc: 100, toUsdc: 112 });
  assert.equal(checkWatch(moved.watch, market({ mid: 112 }), [], NOW).hit, null);
});

test('a rising watch fires when the category starts rising, not while it stays up', () => {
  const w = newWatch({ id: 'w3', owner: '0xa', kind: 'rising', category: 'farm', now: NOW });
  const quiet = checkWatch(w, market({ rising: false }), [], NOW);
  assert.equal(quiet.hit, null);
  const up = checkWatch(quiet.watch, market({ rising: true }), [], NOW);
  assert.deepEqual(up.hit, { kind: 'rising', requestsThisWeek: 4 });
  assert.equal(checkWatch(up.watch, market({ rising: true }), [], NOW).hit, null);
});

test('an ended watch never fires', () => {
  const w = newWatch({ id: 'w4', owner: '0xa', kind: 'rising', category: 'farm', now: NOW - 31 * DAY });
  assert.equal(checkWatch(w, market({ rising: true }), [], NOW).hit, null);
});
