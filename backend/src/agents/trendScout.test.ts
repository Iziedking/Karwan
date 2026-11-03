import assert from 'node:assert/strict';
import test from 'node:test';
import { sellersToNudge, sellerCategories } from './trendScout.js';

/// The daily nudge reads the one market store (view 48, step 4): a seller hears
/// of a rising category they serve, once in 72 hours.

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const design = { id: 'design' as const, name: 'Design', thisWeek: 3, lastWeek: 1, openOffers: 2, rising: true };

test('a seller serves the categories their skills and offers name', () => {
  assert.deepEqual([...sellerCategories(['logo', 'branding'], [])].sort(), ['design']);
  assert.deepEqual([...sellerCategories(['plumber'], ['tech'])].sort(), ['repairs', 'tech']);
  assert.equal(sellerCategories(['general help'], []).size, 0);
});

test('only sellers in a rising category are nudged, at most once in 72 hours', () => {
  const nudges = sellersToNudge(
    [design],
    [
      { user: '0xada', categories: new Set(['design']) },
      { user: '0xtunde', categories: new Set(['repairs']) },
      { user: '0xrecent', categories: new Set(['design']) },
    ],
    new Map([['0xrecent', NOW - 10 * HOUR]]),
    NOW,
  );
  assert.deepEqual(nudges, [{ user: '0xada', category: design }]);
});

test('nothing rising means nobody is nudged', () => {
  assert.deepEqual(sellersToNudge([], [{ user: '0xada', categories: new Set(['design']) }], new Map(), NOW), []);
});
