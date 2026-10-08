import assert from 'node:assert/strict';
import test from 'node:test';
import { getAddress } from 'viem';
import { bidsFromHistory } from './bidHistory.js';

const MADNADE = getAddress('0x20d2cfd0b8f00f72cbf221d29cc91a51afd8deff');
const FORGE = getAddress('0x83f2c96ceb69042fba2e0226c84868e1780f391f');
const ev = (type: string, ts: number, payload: Record<string, unknown>) => ({ type, ts, payload });

test('every offer on the record comes back, under the checksummed address, with its score', () => {
  const bids = bidsFromHistory([
    ev('bid.submitted', 1, { seller: MADNADE.toLowerCase(), priceUsdc: '58.84', deadlineUnix: 1791550885 }),
    ev('bid.scored', 2, { seller: MADNADE, priceUsdc: '58.84', pattern: 'normal', tier: 'new', topicalMatch: 67, score: 72, suggestedCounterPrice: '50', suggestedCounterDeadlineDays: 2 }),
    ev('bid.submitted', 3, { seller: FORGE.toLowerCase(), priceUsdc: '60.2', deadlineUnix: 1791550885 }),
  ]);
  assert.equal(bids.length, 2);
  const m = bids.find((b) => b.seller === MADNADE)!;
  assert.equal(m.priceUsdc, '58.84');
  assert.equal(m.priceWei, 58_840_000n);
  assert.equal(m.deadlineUnix, 1791550885);
  assert.equal(m.score, 72);
  assert.equal(m.sellerTier, 'new');
  assert.equal(m.topicalMatch, 67);
  assert.equal(m.pattern, 'normal');
  assert.equal(bids.find((b) => b.seller === FORGE)!.score, undefined);
});

test('a later offer from the same seller replaces the earlier one', () => {
  const bids = bidsFromHistory([
    ev('bid.submitted', 1, { seller: FORGE, priceUsdc: '70', deadlineUnix: 10 }),
    ev('bid.submitted', 5, { seller: FORGE, priceUsdc: '62', deadlineUnix: 10 }),
  ]);
  assert.equal(bids.length, 1);
  assert.equal(bids[0]!.priceUsdc, '62');
});

test('broken entries are skipped, never invented', () => {
  const bids = bidsFromHistory([
    ev('bid.submitted', 1, { seller: 'nope', priceUsdc: '5', deadlineUnix: 1 }),
    ev('bid.submitted', 2, { seller: FORGE, priceUsdc: 'abc', deadlineUnix: 1 }),
    ev('bid.scored', 3, { seller: MADNADE, score: 50 }),
  ]);
  assert.deepEqual(bids, []);
});
