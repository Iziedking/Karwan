import assert from 'node:assert/strict';
import test from 'node:test';
import { RESEARCH_PRICE, anglesFor, quoteResearch, researchFocusSchema } from './researchPricing.js';

/// The person's agent pays for research sized to what was asked (owner, 3 Nov
/// 2026): 0.007 USDC per fresh angle, 0.002 per angle already researched.

test('a search is sized to the question, not always the four angles', () => {
  assert.deepEqual(anglesFor('price'), ['pricing', 'marketplace-rates']);
  assert.deepEqual(anglesFor('demand'), ['demand']);
  assert.deepEqual(anglesFor('suppliers'), ['landscape']);
  assert.deepEqual(anglesFor('negotiation'), ['pricing', 'marketplace-rates', 'demand']);
  assert.deepEqual(anglesFor('full'), ['pricing', 'marketplace-rates', 'demand', 'landscape']);
});

test('the prices are the owner’s', () => {
  assert.equal(RESEARCH_PRICE.freshAngleUsdc, 0.007);
  assert.equal(RESEARCH_PRICE.cachedAngleUsdc, 0.002);
});

test('the quote is exact: fresh angles at the full price, cached ones cheaper', () => {
  assert.deepEqual(quoteResearch('full', new Set()), {
    focus: 'full',
    angles: ['pricing', 'marketplace-rates', 'demand', 'landscape'],
    fresh: 4,
    cached: 0,
    totalUsdc: 0.028,
  });
  const q = quoteResearch('price', new Set(['pricing', 'demand']));
  assert.equal(q.fresh, 1);
  assert.equal(q.cached, 1);
  assert.equal(q.totalUsdc, 0.009);
  assert.equal(quoteResearch('full', new Set(['pricing', 'marketplace-rates', 'demand', 'landscape'])).totalUsdc, 0.008);
});

test('an unknown focus is refused', () => {
  assert.equal(researchFocusSchema.safeParse('everything').success, false);
  assert.equal(researchFocusSchema.safeParse('price').success, true);
});
