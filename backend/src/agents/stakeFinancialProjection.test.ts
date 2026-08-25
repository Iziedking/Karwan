import assert from 'node:assert/strict';
import test from 'node:test';
import { decideStakeQualification } from '../staking/policy.js';
import { buildStakeApprovalResumeOperation, buildStakeFinancialObservation, buildStakeFinancialOperation, createStakeApprovalResumeObserver, createStakeFinancialOperationObserver, parseStakeApprovalResumeInput, parseStakeFinancialOperationInput } from './stakeFinancialProjection.js';
import { InMemoryDurableTaskStore } from './durableTaskRunner.js';
import { InMemoryAgentRuntimeRepository } from '../db/agentRuntime.js';

const requirement = {
  requirementVersion: 2,
  requiredStakeUsdc: '500',
  stakeOwner: '0x1111111111111111111111111111111111111111',
  fundingWallet: '0x2222222222222222222222222222222222222222',
  vaultAddress: '0x3333333333333333333333333333333333333333',
  asset: 'USDC' as const,
  network: 'arc-testnet',
};
const snapshot = {
  freeStakeUsdc: '100',
  liquidFundingUsdc: '400',
  dealRoomOpen: true,
  mandateVersion: 7,
  expectedRequirementVersion: 2,
};
const policy = {
  autonomousMaxUsdc: '250',
  allowedVaults: [requirement.vaultAddress],
  allowedNetworks: ['arc-testnet'],
  allowedAssets: ['USDC'],
};

test('stake shortfall projects exact source, vault, amount, and approval boundary', () => {
  const decision = decideStakeQualification(requirement, snapshot, policy);
  assert.equal(decision.outcome, 'approval_required');
  if (decision.outcome !== 'approval_required') return;
  const observation = buildStakeFinancialObservation({
    dealRoomId: 'room-stake-financial', requirement, snapshot, policy, decision, observedAtUnix: 100,
    approval: { id: 'approval-stake-1', version: 3, expiresAtUnix: 3_700, amountUsdc: '400' },
  });
  assert.equal(observation?.source, 'legacy-stake');
  assert.equal(observation?.command.operation, 'STAKE');
  assert.equal(observation?.command.amountUsdc, '400');
  assert.equal(observation?.command.sourceAddress, requirement.fundingWallet);
  assert.equal(observation?.command.destinationAddress, requirement.vaultAddress);
  assert.equal(observation?.command.approvalId, 'approval-stake-1');
  assert.deepEqual(observation?.policy.requireApprovalFor, ['STAKE']);
  assert.equal(observation?.policy.autonomousMaxUsdc, '250');
});

test('funding-required shortfall is never projected as autonomous', () => {
  const fundingDecision = decideStakeQualification(requirement, {
    ...snapshot,
    liquidFundingUsdc: '0',
  }, policy);
  assert.equal(fundingDecision.outcome, 'funding_required');
  if (fundingDecision.outcome !== 'funding_required') return;
  const observation = buildStakeFinancialObservation({
    dealRoomId: 'room-stake-financial-funding', requirement, snapshot: { ...snapshot, liquidFundingUsdc: '0' },
    policy, decision: fundingDecision, observedAtUnix: 100,
  });
  assert.equal(observation?.policy.autonomousMaxUsdc, '0');
  assert.deepEqual(observation?.policy.requireApprovalFor, ['STAKE']);
  assert.equal(observation?.command.approvalId, undefined);
});

test('qualified and blocked outcomes create no financial command', () => {
  const qualified = decideStakeQualification(requirement, { ...snapshot, freeStakeUsdc: '500' }, policy);
  assert.equal(buildStakeFinancialObservation({ dealRoomId: 'room-qualified', requirement, snapshot: { ...snapshot, freeStakeUsdc: '500' }, policy, decision: qualified, observedAtUnix: 100 }), null);
  const blocked = decideStakeQualification(requirement, { ...snapshot, dealRoomOpen: false }, policy);
  assert.equal(buildStakeFinancialObservation({ dealRoomId: 'room-closed', requirement, snapshot: { ...snapshot, dealRoomOpen: false }, policy, decision: blocked, observedAtUnix: 100 }), null);
});

test('approved stake projects one exact reviewed operation without granting execution authority', () => {
  const decision = decideStakeQualification(requirement, snapshot, policy);
  assert.equal(decision.outcome, 'approval_required');
  if (decision.outcome !== 'approval_required') return;
  const operation = buildStakeFinancialOperation({
    dealRoomId: 'room-stake-operation', requirement, snapshot, policy, decision, observedAtUnix: 100,
    approval: { id: 'approval-stake-1', version: 3, expiresAtUnix: 3_700, amountUsdc: '400', state: 'approved' },
    execution: {
      walletId: 'circle-seller-wallet-1', contractAddress: requirement.vaultAddress,
      feeLevel: 'LOW', abiFunctionSignature: 'stake(uint256)', abiParameters: ['400000000'],
    },
  });
  assert.equal(operation?.source, 'stake-resume');
  assert.equal(operation?.command.operation, 'STAKE');
  assert.equal(operation?.command.amountUsdc, '400');
  assert.equal(operation?.command.approvalId, 'approval-stake-1');
  assert.equal(operation?.descriptor.kind, 'contract');
  assert.equal(operation?.descriptor.walletId, 'circle-seller-wallet-1');
  assert.equal(operation?.descriptor.contractAddress, requirement.vaultAddress);
  assert.deepEqual(operation?.policy.requireApprovalFor, ['STAKE']);
});

test('auto-authorized stake projects without an approval and funding shortfall never projects', () => {
  const autoPolicy = { ...policy, autonomousMaxUsdc: '400' };
  const autoDecision = decideStakeQualification(requirement, snapshot, autoPolicy);
  assert.equal(autoDecision.outcome, 'auto_authorized');
  const autoOperation = buildStakeFinancialOperation({
    dealRoomId: 'room-stake-auto', requirement, snapshot, policy: autoPolicy,
    decision: autoDecision, observedAtUnix: 100,
    execution: {
      walletId: 'circle-seller-wallet-1', contractAddress: requirement.vaultAddress,
      feeLevel: 'MEDIUM', callData: '0x1234',
    },
  });
  assert.deepEqual(autoOperation?.policy.requireApprovalFor, []);
  assert.throws(() => buildStakeFinancialOperation({
    dealRoomId: 'room-stake-auto-approval', requirement, snapshot, policy: autoPolicy,
    decision: autoDecision, observedAtUnix: 100,
    approval: { id: 'unexpected-approval', version: 1, expiresAtUnix: 3_700, amountUsdc: '400' },
    execution: {
      walletId: 'circle-seller-wallet-1', contractAddress: requirement.vaultAddress,
      feeLevel: 'LOW', callData: '0x1234',
    },
  }), /must not carry an approval/);

  const fundingSnapshot = { ...snapshot, liquidFundingUsdc: '0' };
  const fundingDecision = decideStakeQualification(requirement, fundingSnapshot, autoPolicy);
  assert.equal(fundingDecision.outcome, 'funding_required');
  assert.equal(buildStakeFinancialOperation({
    dealRoomId: 'room-stake-funding', requirement, snapshot: fundingSnapshot, policy: autoPolicy,
    decision: fundingDecision, observedAtUnix: 100,
    execution: {
      walletId: 'circle-seller-wallet-1', contractAddress: requirement.vaultAddress,
      feeLevel: 'LOW', callData: '0x1234',
    },
  }), null);
});

test('stake operation refuses a different destination or mismatched approval', () => {
  const decision = decideStakeQualification(requirement, snapshot, policy);
  assert.equal(decision.outcome, 'approval_required');
  if (decision.outcome !== 'approval_required') return;
  const base = {
    dealRoomId: 'room-stake-invalid-operation', requirement, snapshot, policy, decision, observedAtUnix: 100,
    approval: { id: 'approval-stake-1', version: 3, expiresAtUnix: 3_700, amountUsdc: '400', state: 'approved' as const },
    execution: { walletId: 'circle-seller-wallet-1', contractAddress: requirement.vaultAddress, feeLevel: 'LOW' as const, callData: '0x1234' },
  };
  assert.throws(() => buildStakeFinancialOperation({ ...base, execution: { ...base.execution, contractAddress: '0x4444444444444444444444444444444444444444' } }), /approved vault/);
  assert.throws(() => buildStakeFinancialOperation({ ...base, approval: { ...base.approval, amountUsdc: '399' } }), /approval amount mismatch/);
  assert.equal(buildStakeFinancialOperation({ ...base, approval: undefined }), null);
});

test('stake operation observer enqueues one reviewed task without provider authority', async () => {
  const autoPolicy = { ...policy, autonomousMaxUsdc: '400' };
  const autoDecision = decideStakeQualification(requirement, snapshot, autoPolicy);
  assert.equal(autoDecision.outcome, 'auto_authorized');
  if (autoDecision.outcome !== 'auto_authorized') return;
  const input = parseStakeFinancialOperationInput({
    dealRoomId: 'room-stake-observer', requirement, snapshot, policy: autoPolicy,
    decision: autoDecision, observedAtUnix: 100,
    execution: {
      walletId: 'circle-seller-wallet-1', contractAddress: requirement.vaultAddress,
      feeLevel: 'LOW', callData: '0x1234',
    },
  });
  const tasks = new InMemoryDurableTaskStore();
  const observe = createStakeFinancialOperationObserver(tasks);
  assert.deepEqual(await observe(input), { created: true });
  assert.deepEqual(await observe(input), { created: false });
  const recent = await tasks.listRecent({ limit: 5 });
  assert.equal(recent.length, 1);
  assert.equal(recent[0]?.kind, 'financial.command.operation');
  assert.equal((recent[0]?.data as { command?: { operation?: string } }).command?.operation, 'STAKE');
});

test('approval resume rereads the exact persisted approval before enqueue', async () => {
  const approvals = new InMemoryAgentRuntimeRepository();
  const approval = await approvals.createApproval({
    id: 'approval:stake-resume', dealRoomId: 'room-stake-resume', requestKey: 'stake:resume:1', kind: 'STAKE',
    expiresAt: 3_700,
    data: { amountUsdc: '400', requirementVersion: 2, mandateVersion: 7, approverAddress: '0x9999999999999999999999999999999999999999' }, now: 100,
  });
  const approved = await approvals.updateApproval(approval.id, approval.version, 'approved', undefined, 110);
  const input = parseStakeApprovalResumeInput({
    dealRoomId: 'room-stake-resume', approvalId: approved.id, observedAtUnix: 120,
    requirement, snapshot, policy, actorAddress: '0x9999999999999999999999999999999999999999',
    execution: {
      walletId: 'circle-seller-wallet-1', contractAddress: requirement.vaultAddress,
      feeLevel: 'LOW', abiFunctionSignature: 'stake(uint256)', abiParameters: ['400000000'],
    },
  });
  const validation = buildStakeApprovalResumeOperation(input, approved);
  assert.equal(validation.allowed, true);
  if (!validation.allowed) return;
  assert.equal(validation.operation.command.approvalId, approved.id);
  assert.equal(validation.operation.command.approvalVersion, approved.version);

  const tasks = new InMemoryDurableTaskStore();
  const observe = createStakeApprovalResumeObserver(tasks, approvals);
  assert.deepEqual(await observe(input), { created: true, reason: undefined });
  assert.deepEqual(await observe(input), { created: false, reason: undefined });
  assert.equal((await approvals.getApproval(approved.id))?.state, 'approved');
  const wrongActor = buildStakeApprovalResumeOperation({ ...input, actorAddress: '0x8888888888888888888888888888888888888888' }, approved);
  assert.deepEqual(wrongActor, { allowed: false, reason: 'WRONG_APPROVER' });
  const closed = buildStakeApprovalResumeOperation({ ...input, snapshot: { ...input.snapshot, dealRoomOpen: false } }, approved);
  assert.deepEqual(closed, { allowed: false, reason: 'DEAL_CLOSED' });
});
