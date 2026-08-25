import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryFinancialRuntimeRepository } from './runtime.js';

function command() {
  return {
    commandId: 'command-financial-1',
    idempotencyKey: 'financial:escrow:room-1:offer-1',
    operation: 'ESCROW_FUNDING' as const,
    amountUsdc: '12.50',
    amountMicros: '12500000',
    sourceAddress: '0x1111111111111111111111111111111111111111',
    destinationAddress: '0x2222222222222222222222222222222222222222',
    expectedDealRoomVersion: 3,
    expectedOfferVersion: 2,
    mandateVersion: 4,
    decision: 'AUTHORIZED' as const,
    reason: 'POLICY_ACCEPTED',
    data: { source: 'shadow-test' },
    now: 100,
  };
}

test('financial command runtime is idempotent and preserves unknown provider outcomes', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  const first = await repository.recordDecision(command());
  const duplicate = await repository.recordDecision(command());
  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.record.commandId, first.record.commandId);

  const unknown = await repository.recordProviderUpdate(first.record.idempotencyKey, first.record.version, {
    lifecycle: 'UNKNOWN', providerId: 'circle-tx-1',
  }, 200);
  assert.equal(unknown.providerLifecycle, 'UNKNOWN');
  const duplicateUnknown = await repository.recordProviderUpdate(unknown.idempotencyKey, unknown.version, {
    lifecycle: 'UNKNOWN', providerId: 'circle-tx-1',
  }, 250);
  assert.equal(duplicateUnknown.version, unknown.version);
  const reconciling = await repository.recordProviderUpdate(unknown.idempotencyKey, unknown.version, {
    lifecycle: 'RECONCILING', providerId: 'circle-tx-1',
  }, 300);
  assert.equal(reconciling.providerLifecycle, 'RECONCILING');
  const settled = await repository.recordProviderUpdate(reconciling.idempotencyKey, reconciling.version, {
    lifecycle: 'SETTLED', providerId: 'circle-tx-1', txHash: '0xabc',
  }, 400);
  assert.equal(settled.providerLifecycle, 'SETTLED');
  assert.equal(settled.txHash, '0xabc');
});

test('financial command runtime refuses stale, changed-provider, and tx-less settlement', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  const first = await repository.recordDecision(command());
  await assert.rejects(
    repository.recordProviderUpdate(first.record.idempotencyKey, 99, { lifecycle: 'UNKNOWN', providerId: 'circle-tx-1' }),
    /stale/,
  );
  const unknown = await repository.recordProviderUpdate(first.record.idempotencyKey, first.record.version, { lifecycle: 'UNKNOWN', providerId: 'circle-tx-1' });
  await assert.rejects(
    repository.recordProviderUpdate(unknown.idempotencyKey, unknown.version, { lifecycle: 'RECONCILING', providerId: 'circle-tx-2' }),
    /PROVIDER_ID_CHANGED/,
  );
  await assert.rejects(
    repository.recordProviderUpdate(unknown.idempotencyKey, unknown.version, { lifecycle: 'SETTLED', providerId: 'circle-tx-1' }),
    /SETTLED_REQUIRES_TX_HASH/,
  );
  await assert.rejects(
    repository.recordDecision({ ...command(), commandId: 'different-command' }),
    /duplicate financial runtime boundary/,
  );
});
