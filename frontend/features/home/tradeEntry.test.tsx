import assert from 'node:assert/strict';
import test from 'node:test';
import { TRADE_ENTRY_COPY, tradeEntryRoutes } from './tradeEntry';

test('one way to start a trade for every account (view 17)', () => {
  assert.deepEqual(tradeEntryRoutes(), {
    buy: '/buyer?mode=managed#new-deal',
    sell: '/seller#post-listing',
    agreement: '/buyer?mode=direct#new-deal',
  });
  for (const href of Object.values(tradeEntryRoutes())) {
    assert.doesNotMatch(href, /\/(supply|partners|p2p|b2b)/, href);
  }
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
