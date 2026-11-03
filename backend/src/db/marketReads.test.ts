import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
const { marketReadsSince, saveMarketRead } = await import('./marketReads.js');

/// Paid research is kept so a restart does not lose it (view 48, step 4).

const read = (researchedAt: number) => ({ keywords: ['logo'], researchedAt, demand: 'steady' }) as never;

test('a saved read comes back while it is fresh, and the newest wins', async () => {
  await saveMarketRead('logo', read(1_000));
  await saveMarketRead('logo', read(2_000));
  await saveMarketRead('rice', read(500));
  const rows = await marketReadsSince(900);
  assert.deepEqual(rows.map(([k, r]) => [k, (r as { researchedAt: number }).researchedAt]), [['logo', 2_000]]);
});
