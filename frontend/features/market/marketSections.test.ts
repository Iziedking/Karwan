import assert from 'node:assert/strict';
import test from 'node:test';
import { marketSectionPlan } from './marketSections';

/// One market (view 17): every account sees every open request and offer.
/// A business workspace is a lens: business cards come first, nothing hides.
///
///   npx tsx --test features/market/marketSections.test.ts

test('a business workspace sees personal cards too, with business first', () => {
  assert.deepEqual(marketSectionPlan('business').map((s) => s.key), ['b2b', 'p2p', 'hiring']);
});

test('people and visitors see every section, business last', () => {
  assert.deepEqual(marketSectionPlan('person').map((s) => s.key), ['p2p', 'hiring', 'b2b']);
  assert.deepEqual(marketSectionPlan('public').map((s) => s.key), ['p2p', 'hiring', 'b2b']);
});
