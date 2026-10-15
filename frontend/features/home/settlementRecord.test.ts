import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { latestSettled, settlementFigures } from './settlementRecord';

const stats = {
  network: { chainId: 5042002, name: 'Arc Testnet', testnet: true },
  totals: { deals: 209 },
  volumes: { fundedUsdc: '18433.361904', releasedUsdc: '14822.203237', refundedUsdc: '2981.590463' },
  scannedAt: 1_790_000_000_000,
};

test('the figures are the contracts’ own all-time totals, with honest shares of what was funded', () => {
  const f = settlementFigures(stats);
  assert.ok(f);
  assert.equal(f.deals, 209);
  assert.equal(Math.round(f.fundedUsdc), 18433);
  assert.equal(f.releasedShare, 80);
  assert.equal(f.returnedShare, 16);
  assert.equal(f.testnet, true);
  assert.equal(f.scannedAt, stats.scannedAt);
});

test('no deals or bad numbers mean no figures, so the example sequence shows instead', () => {
  assert.equal(settlementFigures({ ...stats, totals: { deals: 0 } }), null);
  assert.equal(settlementFigures({ ...stats, volumes: { fundedUsdc: 'x', releasedUsdc: '1', refundedUsdc: '1' } }), null);
  assert.equal(settlementFigures(null), null);
});

test('shares never add up past everything that was funded', () => {
  const f = settlementFigures({ ...stats, volumes: { fundedUsdc: '100', releasedUsdc: '99.6', refundedUsdc: '0.6' } });
  assert.ok(f && f.releasedShare + f.returnedShare <= 100);
});

test('the newest settled deals come first, five at most', () => {
  const feed = [1, 7, 3, 9, 5, 2, 8].map((t) => ({ amountBand: 'under_100' as const, settledAt: t }));
  assert.deepEqual(latestSettled(feed).map((d) => d.settledAt), [9, 8, 7, 5, 3]);
  assert.deepEqual(latestSettled(undefined), []);
});

test('the landing shows the real record and asks for the waitlist where it says waitlist', () => {
  const landing = readFileSync(new URL('../../app/page.tsx', import.meta.url), 'utf8');
  assert.match(landing, /<SettlementRecord \/>/);
  assert.match(landing, /href="\/waitlist"/);
  const section = readFileSync(new URL('./components/SettlementRecord.tsx', import.meta.url), 'utf8');
  assert.match(section, /api\.networkLifetime\(/);
  assert.match(section, /api\.dealsFeed\(\)/);
  assert.match(section, /sealedRecord\.bands/, 'settled deals show a value range, never an exact amount');
  assert.doesNotMatch(section, /Loading|title=/);
});
