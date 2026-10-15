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

test('every supported language includes all entry labels, none empty', () => {
  const leaves = (value: unknown, path = ''): Array<[string, unknown]> =>
    value && typeof value === 'object'
      ? Object.entries(value).flatMap(([key, inner]) => leaves(inner, path ? `${path}.${key}` : key))
      : [[path, value]];
  const keys = leaves(TRADE_ENTRY_COPY.en).map(([path]) => path).sort();
  for (const copy of Object.values(TRADE_ENTRY_COPY)) {
    const entries = leaves(copy);
    assert.deepEqual(entries.map(([path]) => path).sort(), keys);
    for (const [path, label] of entries) assert.ok(typeof label === 'string' && label.trim(), path);
  }
});
