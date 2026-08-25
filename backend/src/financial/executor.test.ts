import assert from 'node:assert/strict';
import test from 'node:test';
import { executeFinancialCommand } from './executor.js';
import { InMemoryFinancialRuntimeRepository } from './runtime.js';
import { claimFinancialApproval } from './approvalClaim.js';
import { InMemoryAgentRuntimeRepository } from '../db/agentRuntime.js';
import type { CircleWalletAdapter, Submission } from '../circle/CircleWalletAdapter.js';
import type { CurrentFinancialState, FinancialCommand, FinancialPolicy } from './commandBoundary.js';

const SOURCE = '0x1111111111111111111111111111111111111111';
const DESTINATION = '0x2222222222222222222222222222222222222222';
const CONTRACT = '0x3333333333333333333333333333333333333333';

const policy: FinancialPolicy = {
  autonomousMaxUsdc: '0',
  allowedDestinations: [DESTINATION, CONTRACT],
  requireApprovalFor: [],
};

const current: CurrentFinancialState = {
  dealRoomVersion: 4,
  offerVersion: 2,
  mandateVersion: 7,
};

function command(overrides: Partial<FinancialCommand> = {}): FinancialCommand {
  return {
    commandId: 'command-1',
    idempotencyKey: 'financial:room-1:funding:2',
    operation: 'ESCROW_FUNDING',
    amountUsdc: '12.500000',
    sourceAddress: SOURCE,
    destinationAddress: DESTINATION,
    expectedDealRoomVersion: 4,
    expectedOfferVersion: 2,
    mandateVersion: 7,
    nowUnix: 1_000,
    ...overrides,
  };
}

function transferDescriptor() {
  return { kind: 'transfer' as const, walletId: 'wallet-1', tokenId: 'usdc-token', feeLevel: 'LOW' as const };
}

function contractDescriptor() {
  return {
    kind: 'contract' as const,
    walletId: 'wallet-1',
    contractAddress: CONTRACT,
    feeLevel: 'MEDIUM' as const,
    abiFunctionSignature: 'fundEscrow(bytes32)',
    abiParameters: ['0x' + 'aa'.repeat(32)],
  };
}

function fakeAdapter(
  submission: Submission = { providerId: 'circle-1', status: 'INITIATED' },
) {
  let transferCalls = 0;
  let contractCalls = 0;
  const adapter: Pick<CircleWalletAdapter, 'createTransfer' | 'executeContract'> = {
    async createTransfer(input) {
      transferCalls += 1;
      assert.equal(input.idempotencyKey, 'financial:room-1:funding:2');
      assert.equal(input.amountUsdc, '12.500000');
      return submission;
    },
    async executeContract(input) {
      contractCalls += 1;
      assert.equal(input.contractAddress, CONTRACT.toLowerCase());
      assert.equal(input.abiFunctionSignature, 'fundEscrow(bytes32)');
      return submission;
    },
  };
  return { adapter, calls: () => ({ transferCalls, contractCalls }) };
}

test('approval-required commands are persisted but never call the provider', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  const fake = fakeAdapter();
  const result = await executeFinancialCommand({
    command: command(),
    policy: { ...policy, requireApprovalFor: ['ESCROW_FUNDING'] },
    current,
    descriptor: transferDescriptor(),
    repository,
    adapter: fake.adapter,
    now: 1_000,
  });

  assert.equal(result.status, 'approval_required');
  assert.equal(result.providerCalled, false);
  assert.equal(result.record.providerLifecycle, 'CREATED');
  assert.deepEqual(fake.calls(), { transferCalls: 0, contractCalls: 0 });
});

test('stale commands are rejected before any provider call', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  const fake = fakeAdapter();
  const result = await executeFinancialCommand({
    command: command({ expectedOfferVersion: 1 }),
    policy,
    current,
    descriptor: transferDescriptor(),
    repository,
    adapter: fake.adapter,
    now: 1_000,
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.decision.reason, 'STALE_OFFER');
  assert.equal(result.providerCalled, false);
  assert.deepEqual(fake.calls(), { transferCalls: 0, contractCalls: 0 });
});

test('an authorized transfer is submitted once and duplicate replay is read-only', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  const fake = fakeAdapter();
  const input = { command: command(), policy: { ...policy, autonomousMaxUsdc: '20' }, current, descriptor: transferDescriptor(), repository, adapter: fake.adapter, now: 1_000 };
  const first = await executeFinancialCommand(input);
  const second = await executeFinancialCommand(input);

  assert.equal(first.status, 'submitted');
  assert.equal(first.record.providerId, 'circle-1');
  assert.equal(second.status, 'already_recorded');
  assert.equal(second.providerCalled, false);
  assert.deepEqual(fake.calls(), { transferCalls: 1, contractCalls: 0 });
});

test('a provider timeout becomes UNKNOWN and is never retried automatically', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  let calls = 0;
  const adapter: Pick<CircleWalletAdapter, 'createTransfer' | 'executeContract'> = {
    async createTransfer() {
      calls += 1;
      throw new Error('provider timeout');
    },
    async executeContract() {
      throw new Error('unexpected contract call');
    },
  };
  const input = { command: command(), policy: { ...policy, autonomousMaxUsdc: '20' }, current, descriptor: transferDescriptor(), repository, adapter, now: 1_000 };
  const first = await executeFinancialCommand(input);
  const second = await executeFinancialCommand(input);

  assert.equal(first.status, 'unknown');
  assert.equal(first.record.providerLifecycle, 'UNKNOWN');
  assert.equal(second.status, 'needs_reconciliation');
  assert.equal(second.providerCalled, false);
  assert.equal(calls, 1);
});

test('authorized contract commands use the contract adapter with exact call data', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  const fake = fakeAdapter();
  const result = await executeFinancialCommand({
    command: command({ operation: 'STAKE', destinationAddress: CONTRACT, idempotencyKey: 'financial:room-1:stake:1', commandId: 'command-stake' }),
    policy: { ...policy, autonomousMaxUsdc: '20' },
    current,
    descriptor: contractDescriptor(),
    repository,
    adapter: fake.adapter,
    now: 1_000,
  });

  assert.equal(result.status, 'submitted');
  assert.deepEqual(fake.calls(), { transferCalls: 0, contractCalls: 1 });
});

test('an approved command consumes one exact approval before provider submission', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  const approvals = new InMemoryAgentRuntimeRepository();
  const approval = await approvals.createApproval({
    id: 'approval-financial-1',
    dealRoomId: 'room-1',
    requestKey: 'financial:approval:1',
    kind: 'escrow-funding',
    expiresAt: 2_000,
    data: { amountUsdc: '12.500000', operation: 'ESCROW_FUNDING', destinationAddress: DESTINATION },
    now: 900,
  });
  await approvals.updateApproval(approval.id, approval.version, 'approved', undefined, 950);
  const fake = fakeAdapter();
  const approvedCommand = command({ approvalId: approval.id, approvalVersion: 2 });
  const input = {
    command: approvedCommand,
    policy,
    current: {
      ...current,
      approval: { id: approval.id, version: 2, expiresAtUnix: 2_000, amountUsdc: '12.500000' },
    },
    descriptor: transferDescriptor(),
    repository,
    adapter: fake.adapter,
    claimApproval: (claim: Parameters<typeof claimFinancialApproval>[1]) => claimFinancialApproval(approvals, claim),
    now: 1_000,
  };

  const first = await executeFinancialCommand(input);
  const second = await executeFinancialCommand(input);
  assert.equal(first.status, 'submitted');
  assert.equal(second.status, 'already_recorded');
  assert.equal(first.record.approvalId, approval.id);
  assert.equal(first.record.approvalVersion, 2);
  assert.equal((await approvals.getApproval(approval.id))?.state, 'executed');
  assert.deepEqual(fake.calls(), { transferCalls: 1, contractCalls: 0 });
});

test('a stale or expired approval blocks the provider and leaves the command unsubmitted', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  const approvals = new InMemoryAgentRuntimeRepository();
  const approval = await approvals.createApproval({
    id: 'approval-financial-expired',
    dealRoomId: 'room-1',
    requestKey: 'financial:approval:expired',
    kind: 'escrow-funding',
    expiresAt: 999,
    data: { amountUsdc: '12.500000' },
    now: 900,
  });
  await approvals.updateApproval(approval.id, approval.version, 'approved', undefined, 950);
  const fake = fakeAdapter();
  const result = await executeFinancialCommand({
    command: command({ approvalId: approval.id, approvalVersion: 2, nowUnix: 1_000 }),
    policy,
    current: { ...current, approval: { id: approval.id, version: 2, expiresAtUnix: 2_000, amountUsdc: '12.500000' } },
    descriptor: transferDescriptor(),
    repository,
    adapter: fake.adapter,
    claimApproval: (claim) => claimFinancialApproval(approvals, claim),
    now: 1_000,
  });

  assert.equal(result.status, 'approval_unavailable');
  assert.equal(result.failureReason, 'APPROVAL_EXPIRED');
  assert.equal(result.providerCalled, false);
  assert.equal(result.record.providerLifecycle, 'CREATED');
  assert.equal((await approvals.getApproval(approval.id))?.state, 'approved');
  assert.deepEqual(fake.calls(), { transferCalls: 0, contractCalls: 0 });
});

test('provider uncertainty after approval claim becomes UNKNOWN and replay cannot resubmit', async () => {
  const repository = new InMemoryFinancialRuntimeRepository();
  const approvals = new InMemoryAgentRuntimeRepository();
  const approval = await approvals.createApproval({
    id: 'approval-financial-timeout',
    dealRoomId: 'room-1',
    requestKey: 'financial:approval:timeout',
    kind: 'escrow-funding',
    expiresAt: 2_000,
    data: { amountUsdc: '12.500000' },
    now: 900,
  });
  await approvals.updateApproval(approval.id, approval.version, 'approved', undefined, 950);
  let calls = 0;
  const adapter: Pick<CircleWalletAdapter, 'createTransfer' | 'executeContract'> = {
    async createTransfer() { calls += 1; throw new Error('provider timeout'); },
    async executeContract() { throw new Error('unexpected contract call'); },
  };
  const input = {
    command: command({ approvalId: approval.id, approvalVersion: 2 }),
    policy,
    current: { ...current, approval: { id: approval.id, version: 2, expiresAtUnix: 2_000, amountUsdc: '12.500000' } },
    descriptor: transferDescriptor(),
    repository,
    adapter,
    claimApproval: (claim: Parameters<typeof claimFinancialApproval>[1]) => claimFinancialApproval(approvals, claim),
    now: 1_000,
  };

  const first = await executeFinancialCommand(input);
  const second = await executeFinancialCommand(input);
  assert.equal(first.status, 'unknown');
  assert.equal(second.status, 'needs_reconciliation');
  assert.equal((await approvals.getApproval(approval.id))?.state, 'executed');
  assert.equal(calls, 1);
});
