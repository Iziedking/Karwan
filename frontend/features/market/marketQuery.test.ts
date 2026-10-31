import assert from 'node:assert/strict';
import test from 'node:test';
import { marketHref, marketViewHref, parseMarketQuery, YOUR_TRADES_HREF } from './marketQuery';

/// The market's view and filter come from the address, so old links and the
/// agent's links land in the right place.
///
///   npx tsx --test features/market/marketQuery.test.ts

const OPEN = { side: 'buy', category: 'all', q: '' } as const;

test('the market opens on Find with no filter', () => {
  assert.deepEqual(parseMarketQuery(new URLSearchParams('')), { view: 'find', scope: 'all', list: 'all', ...OPEN });
});

test('old links land on the right view and filter', () => {
  assert.deepEqual(parseMarketQuery(new URLSearchParams('view=yours&list=offers')), { view: 'yours', scope: 'all', list: 'offers', ...OPEN });
  assert.deepEqual(parseMarketQuery(new URLSearchParams('scope=business')), { view: 'find', scope: 'business', list: 'all', ...OPEN });
});

test('unknown values never break the page', () => {
  assert.deepEqual(parseMarketQuery(new URLSearchParams('view=x&scope=y&list=z&side=w&category=cars')), { view: 'find', scope: 'all', list: 'all', ...OPEN });
});

test('side, category and search live in the address', () => {
  const q = parseMarketQuery(new URLSearchParams('side=sell&category=phones&q=%20iphone%20'));
  assert.deepEqual({ side: q.side, category: q.category, q: q.q }, { side: 'sell', category: 'phones', q: 'iphone' });
  assert.equal(parseMarketQuery(new URLSearchParams(`q=${'x'.repeat(200)}`)).q.length, 120);
  assert.equal(marketHref({ side: 'buy', category: 'all', q: '' }), '/market');
  assert.equal(marketHref({ side: 'sell', category: 'all', q: '' }), '/market?side=sell');
  assert.equal(marketHref({ side: 'buy', category: 'phones', q: 'iphone 13' }), '/market?category=phones&q=iphone+13');
});

test('links to each view are plain addresses', () => {
  assert.equal(marketViewHref('find'), '/market');
  assert.equal(marketViewHref('yours'), '/market?view=yours');
  assert.equal(marketViewHref('yours', 'requests'), '/market?view=yours&list=requests');
});

test('not-found states send people to their own trades', () => {
  assert.equal(YOUR_TRADES_HREF, '/market?view=yours');
});
