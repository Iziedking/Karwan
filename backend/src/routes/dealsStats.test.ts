import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// /api/deals/stats must not let created value pass for volume. Unfunded and
/// cancelled deals add to what was agreed, never to what settled.
///
///   npx tsx --test src/routes/dealsStats.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-deals-stats-')));
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
process.env.PUBLIC_TRACTION_ENABLED = 'true';

const { dealsRoutes } = await import('./deals.js');
const { createDeal, patchDeal } = await import('../db/deals.js');

const BUYER = `0x${'11'.repeat(20)}`;
const SELLER = `0x${'22'.repeat(20)}`;
let n = 0;

async function deal(amount: string, patch: Record<string, unknown> = {}) {
  n += 1;
  const jobId = `0x${n.toString(16).padStart(64, '0')}`;
  await createDeal({ jobId, buyer: BUYER, seller: SELLER, dealAmountUsdc: amount, origin: 'direct' } as never);
  if (Object.keys(patch).length) await patchDeal(jobId, patch);
}

test('settled volume counts only settled deals, created value counts every deal', async () => {
  await deal('100', { settledAt: 1_000 });
  await deal('40.5', { settledAt: 2_000 });
  await deal('250');
  await deal('75', { cancelledAt: 3_000, cancelKind: 'pre-accept' });

  const res = await dealsRoutes.request('/stats');
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.total, 4);
  assert.equal(body.settled, 2);
  assert.equal(body.settledVolumeUsdc, 140.5);
  assert.equal(body.createdValueUsdc, 465.5);
  assert.equal('volumeUsdc' in body, false, 'a bare volume figure invites quoting created value as volume');
});
