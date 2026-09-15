import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MARKETPLACE_SEED_CATALOG,
  selectMarketplaceSeedItems,
} from './marketplaceSeedCatalog.js';

test('market seed catalog contains unique bounded real-record inputs', () => {
  const keys = MARKETPLACE_SEED_CATALOG.map((item) => item.seedKey);
  assert.equal(new Set(keys).size, keys.length);

  for (const item of MARKETPLACE_SEED_CATALOG) {
    if (item.kind === 'request') {
      assert.ok(item.brief.length >= 5 && item.brief.length <= 500);
      assert.ok(item.budgetUsdc > 0);
      assert.ok(item.deadlineDays >= 1 && item.deadlineDays <= 90);
    } else {
      assert.ok(item.title.length >= 3 && item.title.length <= 120);
      assert.ok(item.description.length >= 5 && item.description.length <= 500);
      assert.ok(item.askingPriceUsdc > 0);
    }
  }
});

test('catalog selection keeps request and offer batches separate', () => {
  const requests = selectMarketplaceSeedItems('request');
  const offers = selectMarketplaceSeedItems('offer');
  assert.ok(requests.length > 0);
  assert.ok(offers.length > 0);
  assert.ok(requests.every((item) => item.kind === 'request'));
  assert.ok(offers.every((item) => item.kind === 'offer'));
  assert.equal(selectMarketplaceSeedItems('all', 3).length, 3);
});
