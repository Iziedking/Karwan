import assert from 'node:assert/strict';
import test from 'node:test';
import { TRADE_ENTRY_COPY, tradeEntryRoutes } from './tradeEntry';

test('entry routes reach real personal and business surfaces without changing workspace', () => {
  assert.equal(tradeEntryRoutes(false).buy, '/buyer?mode=managed#new-deal');
  assert.equal(tradeEntryRoutes(false).sell, '/seller#post-listing');
  assert.equal(tradeEntryRoutes(true).sell, '/supply');
  assert.equal(tradeEntryRoutes(true).buy, '/partners');
  assert.equal(tradeEntryRoutes(true).agreement, '/buyer?mode=direct#bring-a-deal');
  assert.equal(tradeEntryRoutes(false).agreement, '/buyer?mode=direct#new-deal');
});

test('every supported language includes all entry labels', () => {
  const keys = Object.keys(TRADE_ENTRY_COPY.en).sort();
  for (const copy of Object.values(TRADE_ENTRY_COPY)) {
    assert.deepEqual(Object.keys(copy).sort(), keys);
    for (const [key, value] of Object.entries(copy)) {
      if (typeof value === 'string') {
        assert.ok(value.trim(), key);
        continue;
      }
      assert.ok(Object.values(value).every((label) => label.trim()), key);
    }
  }
});
