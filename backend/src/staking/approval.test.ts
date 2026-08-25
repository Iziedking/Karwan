import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAgentRuntimeRepository } from '../db/agentRuntime.js';
import { validateStakeApproval } from './approval.js';

const requirement = {
  requirementVersion: 2, requiredStakeUsdc: '500', stakeOwner: '0x1111111111111111111111111111111111111111',
  fundingWallet: '0x3333333333333333333333333333333333333333', vaultAddress: '0x2222222222222222222222222222222222222222',
  asset: 'USDC' as const, network: 'arc-testnet',
};
const snapshot = { freeStakeUsdc: '100', liquidFundingUsdc: '400', dealRoomOpen: true, mandateVersion: 3, expectedRequirementVersion: 2 };

async function approval(overrides: Record<string, unknown> = {}) {
  const repository = new InMemoryAgentRuntimeRepository();
  const record = await repository.createApproval({
    id: 'approval-stake-1', dealRoomId: 'room-1', requestKey: 'stake:room-1:2:3', kind: 'stake', expiresAt: 2_000,
    data: { amountUsdc: '400', requiredStakeUsdc: '500', requirementVersion: 2, mandateVersion: 3, ...overrides }, now: 100,
  });
  return { repository, record };
}

test('stake approval validates exact shortfall and current versions', async () => {
  const { repository, record } = await approval();
  const approved = await repository.updateApproval(record.id, record.version, 'approved', undefined, 110);
  assert.deepEqual(validateStakeApproval(approved, requirement, snapshot, 1_000), {
    allowed: true, amountUsdc: '400', requirementVersion: 2, mandateVersion: 3,
  });
});

test('stake approval rejects a different approver when actor identity is supplied', async () => {
  const { repository, record } = await approval({ approverAddress: '0x1111111111111111111111111111111111111111' });
  const approved = await repository.updateApproval(record.id, record.version, 'approved', undefined, 110);

  assert.equal(
    validateStakeApproval(approved, requirement, snapshot, 1_000, '0x2222222222222222222222222222222222222222').reason,
    'WRONG_APPROVER',
  );
  assert.deepEqual(validateStakeApproval(approved, requirement, snapshot, 1_000, '0x1111111111111111111111111111111111111111'), {
    allowed: true, amountUsdc: '400', requirementVersion: 2, mandateVersion: 3,
  });
  assert.deepEqual(validateStakeApproval(approved, requirement, snapshot, 1_000), {
    allowed: true, amountUsdc: '400', requirementVersion: 2, mandateVersion: 3,
  });
});

test('stake approval rejects replay, expiry, changed versions, and changed amount', async () => {
  const requested = (await approval()).record;
  assert.equal(validateStakeApproval(requested, requirement, snapshot, 1_000).reason, 'STATE_NOT_APPROVED');
  const approved = await requestedRepositoryApproval();
  assert.equal(validateStakeApproval(approved, requirement, snapshot, 2_000).reason, 'EXPIRED');
  assert.equal(validateStakeApproval(approved, { ...requirement, requirementVersion: 3 }, { ...snapshot, expectedRequirementVersion: 3 }, 1_000).reason, 'REQUIREMENT_VERSION_MISMATCH');
  assert.equal(validateStakeApproval(approved, requirement, { ...snapshot, mandateVersion: 4 }, 1_000).reason, 'MANDATE_VERSION_MISMATCH');
  const wrongAmount = await approval({ amountUsdc: '401' });
  const wrongApproved = await wrongAmount.repository.updateApproval(wrongAmount.record.id, wrongAmount.record.version, 'approved', undefined, 110);
  assert.equal(validateStakeApproval(wrongApproved, requirement, snapshot, 1_000).reason, 'AMOUNT_MISMATCH');
});

async function requestedRepositoryApproval() {
  const repository = new InMemoryAgentRuntimeRepository();
  const created = await repository.createApproval({ id: 'approval-stake-2', dealRoomId: 'room-1', requestKey: 'stake:room-1:2:4', kind: 'stake', expiresAt: 2_000, data: { amountUsdc: '400', requirementVersion: 2, mandateVersion: 3 }, now: 100 });
  return repository.updateApproval(created.id, created.version, 'approved', undefined, 110);
}
