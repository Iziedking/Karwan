import assert from 'node:assert/strict';
import test from 'node:test';

// The managed shell exports NODE_ENV=production. Load the repository only
// after pinning this isolated test to its explicit non-production fallback.
process.env.NODE_ENV = 'test';
const { listResearchPayments, recordResearchPayment } = await import('./researchPayments.js');

test('research payment ledger is idempotent by provider payment run and angle', async () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  const input = {
    idempotencyKey: key,
    runId: `run-${key}`,
    actor: 'platform' as const,
    angle: 'pricing',
    provider: 'exa',
    amountUsd: 0.007,
    payer: '0x1111111111111111111111111111111111111111',
    paidAt: Date.now(),
  };
  const first = await recordResearchPayment(input);
  const second = await recordResearchPayment({ ...input, amountUsd: 0.009 });
  assert.equal(second.idempotencyKey, first.idempotencyKey);
  assert.equal(second.amountUsd, first.amountUsd);
  const rows = await listResearchPayments({ runId: input.runId });
  assert.equal(rows.filter((row) => row.idempotencyKey === key).length, 1);
});
