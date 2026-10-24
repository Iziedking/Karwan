import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import type { DirectDeal } from '../db/deals.js';

const testUrl = process.env.TEST_DATABASE_URL;
test('two_moves_of_one_deal_saved_at_once_both_stay', { skip: !testUrl }, async () => {
  const url = new URL(testUrl!);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'this test requires a disposable local database');
  process.env.DATABASE_URL = testUrl;
  process.env.X402_PAID_SIGNALS_ENABLED = 'false';
  const { ensureSchema, postgresExecutor, closePostgresPool } = await import('../db/client.js');
  const { getDeal, invalidateDealsCache, recordEarningsMove } = await import('../db/deals.js');
  const id = `0x${randomBytes(32).toString('hex')}`;
  const initial = { jobId: id, buyer: `0x${'a'.repeat(40)}`, seller: `0x${'b'.repeat(40)}`, escrowVersion: 'suite', createdAt: Date.now() } as DirectDeal;
  try {
    await ensureSchema();
    await postgresExecutor().query('INSERT INTO direct_deals (job_id,buyer,seller,created_at,data) VALUES ($1,$2,$3,$4,$5)', [
      id, initial.buyer, initial.seller, initial.createdAt, JSON.stringify(initial),
    ]);
    // A tranche payout and a ruling share of the same deal, written together.
    const move = (amountMicros: string) => ({ amountMicros, state: 'pending' as const, attempt: 1, at: Date.now() });
    await Promise.all([recordEarningsMove(id, '0', move('495000000')), recordEarningsMove(id, 'ruling:0xabc', move('250000000'))]);
    invalidateDealsCache();
    const saved = (await getDeal(id))!;
    assert.deepEqual(Object.keys(saved.suiteEarnings ?? {}).sort(), ['0', 'ruling:0xabc']);
  } finally {
    await closePostgresPool();
  }
});
