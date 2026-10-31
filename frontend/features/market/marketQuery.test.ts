import assert from 'node:assert/strict';
import test from 'node:test';
import { marketViewHref, parseMarketQuery, YOUR_TRADES_HREF } from './marketQuery';

/// The market's view and filter come from the address, so old links and the
/// agent's links land in the right place.
///
///   npx tsx --test features/market/marketQuery.test.ts

test('the market opens on Find with no filter', () => {
  assert.deepEqual(parseMarketQuery(new URLSearchParams('')), { view: 'find', scope: 'all', list: 'all' });
});

test('old links land on the right view and filter', () => {
  assert.deepEqual(parseMarketQuery(new URLSearchParams('view=yours&list=offers')), { view: 'yours', scope: 'all', list: 'offers' });
  assert.deepEqual(parseMarketQuery(new URLSearchParams('scope=business')), { view: 'find', scope: 'business', list: 'all' });
});

test('unknown values never break the page', () => {
  assert.deepEqual(parseMarketQuery(new URLSearchParams('view=x&scope=y&list=z')), { view: 'find', scope: 'all', list: 'all' });
});

test('links to each view are plain addresses', () => {
  assert.equal(marketViewHref('find'), '/market');
  assert.equal(marketViewHref('yours'), '/market?view=yours');
  assert.equal(marketViewHref('yours', 'requests'), '/market?view=yours&list=requests');
});

test('not-found states send people to their own trades', () => {
  assert.equal(YOUR_TRADES_HREF, '/market?view=yours');
});
