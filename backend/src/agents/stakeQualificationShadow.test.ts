import assert from 'node:assert/strict';
import test from 'node:test';
import { DurableTaskRunner, InMemoryDurableTaskStore } from './durableTaskRunner.js';
import {
  createStakeQualificationShadowHandlers,
  createStakeQualificationShadowObserver,
  STAKE_QUALIFICATION_SHADOW_TASK,
} from './stakeQualificationShadow.js';
import { InMemoryEvidenceRuntimeRepository } from '../evidence/runtime.js';
import { InMemoryAgentRuntimeRepository } from '../db/agentRuntime.js';
import { InMemoryNegotiationAttemptStore } from '../negotiation/attempts.js';
import { InMemoryFinancialRuntimeRepository } from '../financial/runtime.js';
import {
  createFinancialCommandShadowHandlers,
  createFinancialCommandShadowObserver,
} from './financialCommandShadow.js';
import { buildStakeFinancialObservation } from './stakeFinancialProjection.js';
import { decideStakeQualification } from '../staking/policy.js';

function data(overrides: Record<string, unknown> = {}) {
  return {
    dealRoomId: 'room-stake-1', idempotencyKey: 'stake:room-stake-1:seller-1:v1', observedAtUnix: 100,
    source: 'manual-fixture' as const,
    requirement: {
      requirementVersion: 1, requiredStakeUsdc: '100', stakeOwner: '0x1111111111111111111111111111111111111111',
      fundingWallet: '0x3333333333333333333333333333333333333333', vaultAddress: '0x2222222222222222222222222222222222222222', asset: 'USDC' as const, network: 'arc-testnet',
    },
    snapshot: { freeStakeUsdc: '25', liquidFundingUsdc: '0', dealRoomOpen: true, mandateVersion: 1, expectedRequirementVersion: 1 },
    policy: { autonomousMaxUsdc: '50', allowedVaults: ['0x2222222222222222222222222222222222222222'], allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'] },
    blocker: { id: 'blocker-stake-1', blockerKey: 'stake:room-stake-1:seller-1:v1', kind: 'STAKE_SHORTFALL', subject: 'seller-1', data: {} },
    ...overrides,
  };
}

test('stake qualification shadow persists a funding blocker and resolves it once after confirmed funding', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryEvidenceRuntimeRepository();
  const attempts = new InMemoryNegotiationAttemptStore();
  const observe = createStakeQualificationShadowObserver(tasks);
  await observe({ data: data() });
  const firstRunner = new DurableTaskRunner(tasks, createStakeQualificationShadowHandlers(repository, { clock: () => 200 }), { workerId: 'stake-worker-1', clock: () => 200 });
  assert.equal((await firstRunner.runOnce(200)).succeeded, 1);
  assert.equal((await repository.getBlocker('blocker-stake-1'))?.state, 'open');

  await observe({ data: data({
    idempotencyKey: 'stake:room-stake-1:seller-1:v1:funded', source: 'funding-confirmed', confirmedFunding: true,
    snapshot: { ...data().snapshot, liquidFundingUsdc: '100' },
    resume: { attemptId: 'attempt-stake-resume-1', attemptNumber: 2, triggerReference: 'funding:receipt-1', strategy: { mode: 'recheck-prior-offer' } },
  }) });
  const secondRunner = new DurableTaskRunner(tasks, createStakeQualificationShadowHandlers(repository, { attemptStore: attempts, clock: () => 300 }), { workerId: 'stake-worker-2', clock: () => 300 });
  assert.equal((await secondRunner.runOnce(300)).succeeded, 1);
  assert.equal((await repository.getBlocker('blocker-stake-1'))?.state, 'resolved');
  const resumed = await attempts.list('room-stake-1');
  assert.equal(resumed.length, 1);
  assert.equal(resumed[0]?.trigger, 'FUNDS_CONFIRMED');
});

test('stake qualification shadow never executes a stake and rejects malformed tasks audibly', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryEvidenceRuntimeRepository();
  await tasks.enqueue({ id: 'task:stake:invalid', kind: STAKE_QUALIFICATION_SHADOW_TASK, idempotencyKey: 'stake:invalid', availableAt: 100, data: { invalid: true }, now: 100 });
  const runner = new DurableTaskRunner(tasks, createStakeQualificationShadowHandlers(repository, { clock: () => 200 }), { workerId: 'stake-worker', clock: () => 200 });
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  const checkpoints = await tasks.listCheckpoints('task:stake:invalid');
  assert.equal((checkpoints[0]?.data as { decision?: string }).decision, 'rejected');
});

test('approval-required stake qualification creates one exact scoped approval', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryEvidenceRuntimeRepository();
  const approvals = new InMemoryAgentRuntimeRepository();
  const base = {
    dealRoomId: 'room-stake-approval', source: 'manual-fixture' as const, observedAtUnix: 100,
    requirement: {
      requirementVersion: 2, requiredStakeUsdc: '500', stakeOwner: '0x1111111111111111111111111111111111111111',
      fundingWallet: '0x3333333333333333333333333333333333333333', vaultAddress: '0x2222222222222222222222222222222222222222',
      asset: 'USDC' as const, network: 'arc-testnet',
    },
    snapshot: { freeStakeUsdc: '0', liquidFundingUsdc: '500', dealRoomOpen: true, mandateVersion: 3, expectedRequirementVersion: 2 },
    policy: { autonomousMaxUsdc: '250', allowedVaults: ['0x2222222222222222222222222222222222222222'], allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'] },
    blocker: { id: 'blocker-stake-approval', blockerKey: 'stake:approval:1', kind: 'STAKE_APPROVAL', subject: 'seller-1', data: {} },
  };
  const observe = createStakeQualificationShadowObserver(tasks);
  await observe({ data: { ...base, idempotencyKey: 'stake:approval:1' } });
  await observe({ data: { ...base, idempotencyKey: 'stake:approval:1' } });
  const runner = new DurableTaskRunner(
    tasks,
    createStakeQualificationShadowHandlers(repository, { approvalRepository: approvals, clock: () => 200 }),
    { workerId: 'stake-approval-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  const approvalId = 'approval:stake:room-stake-approval:requirement:2:shortfall:500:mandate:3';
  const approval = await approvals.getApproval(approvalId);
  assert.equal(approval?.state, 'requested');
  assert.equal(approval?.expiresAt, 3_700);
  assert.equal((approval?.data as { amountUsdc?: string }).amountUsdc, '500');
  assert.equal((approval?.data as { shortfallUsdc?: string }).shortfallUsdc, '500');
});

test('stake qualification shadow projects one conservative financial command without provider activity', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const evidence = new InMemoryEvidenceRuntimeRepository();
  const financial = new InMemoryFinancialRuntimeRepository();
  const input = data({ idempotencyKey: 'stake:financial-shadow:1' });
  const decision = decideStakeQualification(input.requirement, input.snapshot, input.policy);
  const projected = buildStakeFinancialObservation({
    dealRoomId: input.dealRoomId,
    requirement: input.requirement,
    snapshot: input.snapshot,
    policy: input.policy,
    decision,
    observedAtUnix: input.observedAtUnix,
  });
  assert.ok(projected);
  const financialObserver = createFinancialCommandShadowObserver(tasks);
  const handlers = {
    ...createStakeQualificationShadowHandlers(evidence, { financialObserver, clock: () => 200 }),
    ...createFinancialCommandShadowHandlers(financial, { clock: () => 200 }),
  };
  await createStakeQualificationShadowObserver(tasks)({ data: input });
  const runner = new DurableTaskRunner(tasks, handlers, { workerId: 'stake-financial-shadow', clock: () => 200 });
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  const record = await financial.get(projected.command.idempotencyKey);
  assert.equal(record?.decision, 'APPROVAL_REQUIRED');
  assert.equal(record?.providerLifecycle, 'CREATED');
  const checkpoints = await tasks.listCheckpoints(`task:financial:command:${projected.command.idempotencyKey}`);
  assert.equal((checkpoints[0]?.data as { providerCallMade?: boolean }).providerCallMade, false);
  assert.equal((checkpoints[0]?.data as { financialMutation?: boolean }).financialMutation, false);
});
