import assert from 'node:assert/strict';
import test from 'node:test';
import { DurableTaskRunner, InMemoryDurableTaskStore } from './durableTaskRunner.js';
import {
  createFinancialCommandShadowHandlers,
  createFinancialCommandShadowObserver,
  FINANCIAL_COMMAND_SHADOW_TASK,
} from './financialCommandShadow.js';
import { InMemoryFinancialRuntimeRepository } from '../financial/runtime.js';
import { InMemoryAgentRuntimeRepository } from '../db/agentRuntime.js';

function data(overrides: Record<string, unknown> = {}) {
  return {
    dealRoomId: 'room-financial-1',
    source: 'manual-fixture' as const,
    command: {
      commandId: 'financial-command-1', idempotencyKey: 'financial:room-1:stake:1', operation: 'STAKE' as const,
      amountUsdc: '5', sourceAddress: '0x1111111111111111111111111111111111111111',
      destinationAddress: '0x2222222222222222222222222222222222222222',
      expectedDealRoomVersion: 1, mandateVersion: 1, nowUnix: 100,
    },
    policy: {
      autonomousMaxUsdc: '10',
      allowedDestinations: ['0x2222222222222222222222222222222222222222'],
      requireApprovalFor: [],
    },
    current: { dealRoomVersion: 1, mandateVersion: 1 },
    ...overrides,
  };
}

test('financial shadow task is durable, idempotent, and preserves uncertain provider state', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryFinancialRuntimeRepository();
  const observe = createFinancialCommandShadowObserver(tasks);
  await observe({ data: { ...data(), providerObservation: { lifecycle: 'UNKNOWN', providerId: 'circle-fixture-1' } } });
  await observe({ data: { ...data(), providerObservation: { lifecycle: 'UNKNOWN', providerId: 'circle-fixture-1' } } });
  const runner = new DurableTaskRunner(
    tasks,
    createFinancialCommandShadowHandlers(repository, { clock: () => 200 }),
    { workerId: 'financial-worker', clock: () => 200 },
  );
  const result = await runner.runOnce(200);
  assert.equal(result.succeeded, 1);
  const record = await repository.get('financial:room-1:stake:1');
  assert.equal(record?.decision, 'AUTHORIZED');
  assert.equal(record?.providerLifecycle, 'UNKNOWN');
  assert.equal(record?.providerId, 'circle-fixture-1');
  const checkpoints = await tasks.listCheckpoints('task:financial:command:financial:room-1:stake:1');
  assert.equal(checkpoints.length, 1);
  assert.equal((checkpoints[0]?.data as { providerCallMade?: boolean }).providerCallMade, false);
  assert.equal((checkpoints[0]?.data as { financialMutation?: boolean }).financialMutation, false);
});

test('financial shadow task records policy rejection without retry or provider activity', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryFinancialRuntimeRepository();
  await tasks.enqueue({
    id: 'task:financial:invalid', kind: FINANCIAL_COMMAND_SHADOW_TASK,
    idempotencyKey: 'financial:invalid', availableAt: 100,
    data: data({ command: { ...data().command, destinationAddress: '0x3333333333333333333333333333333333333333' } }), now: 100,
  });
  const runner = new DurableTaskRunner(
    tasks,
    createFinancialCommandShadowHandlers(repository, { clock: () => 200 }),
    { workerId: 'financial-worker', clock: () => 200 },
  );
  const result = await runner.runOnce(200);
  assert.equal(result.succeeded, 1);
  const record = await repository.get('financial:room-1:stake:1');
  assert.equal(record?.decision, 'REJECTED');
  assert.equal(record?.reason, 'DESTINATION_NOT_ALLOWLISTED');
  const checkpoints = await tasks.listCheckpoints('task:financial:invalid');
  assert.equal((checkpoints[0]?.data as { decision?: string }).decision, 'REJECTED');
});

test('contract acceptance shadow preserves the legacy receipt without authorizing a V2 action', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryFinancialRuntimeRepository();
  const acceptance = data({
    command: {
      ...data().command,
      commandId: 'financial-contract-acceptance-1',
      idempotencyKey: 'financial:room-1:acceptance:1',
      operation: 'CONTRACT_ACCEPTANCE' as const,
    },
    policy: {
      ...data().policy,
      autonomousMaxUsdc: '0',
      requireApprovalFor: ['CONTRACT_ACCEPTANCE' as const],
    },
    providerObservation: { lifecycle: 'SETTLED' as const, txHash: '0xaccept-receipt' },
  });
  await createFinancialCommandShadowObserver(tasks)({ data: acceptance });
  const runner = new DurableTaskRunner(
    tasks,
    createFinancialCommandShadowHandlers(repository, { clock: () => 200 }),
    { workerId: 'financial-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  const record = await repository.get('financial:room-1:acceptance:1');
  assert.equal(record?.operation, 'CONTRACT_ACCEPTANCE');
  assert.equal(record?.decision, 'APPROVAL_REQUIRED');
  assert.equal(record?.providerLifecycle, 'CREATED');
  const checkpoint = (await tasks.listCheckpoints('task:financial:command:financial:room-1:acceptance:1'))[0];
  const checkpointData = checkpoint?.data as {
    observedLegacyProviderLifecycle?: string;
    observedLegacyTxHash?: string;
    financialMutation?: boolean;
  };
  assert.equal(checkpointData.observedLegacyProviderLifecycle, 'SETTLED');
  assert.equal(checkpointData.observedLegacyTxHash, '0xaccept-receipt');
  assert.equal(checkpointData.financialMutation, false);
});

test('escrow shadow preserves the pre-funding authorization observation before any V2 action', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryFinancialRuntimeRepository();
  const preFunding = {
    balanceUsdc: '20.000000',
    requiredUsdc: '12.500000',
    outcome: 'sufficient' as const,
    observedAtUnix: 101,
  };
  const escrow = data({
    source: 'legacy-accept' as const,
    command: {
      ...data().command,
      commandId: 'financial-escrow-prefund-1',
      idempotencyKey: 'financial:room-1:escrow:prefund:1',
      operation: 'ESCROW_FUNDING' as const,
    },
    preFundingObservation: preFunding,
  });
  await createFinancialCommandShadowObserver(tasks)({ data: escrow });
  const runner = new DurableTaskRunner(
    tasks,
    createFinancialCommandShadowHandlers(repository, { clock: () => 200 }),
    { workerId: 'financial-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  const record = await repository.get('financial:room-1:escrow:prefund:1');
  assert.equal(record?.decision, 'AUTHORIZED');
  const checkpoint = (await tasks.listCheckpoints('task:financial:command:financial:room-1:escrow:prefund:1'))[0];
  const checkpointData = checkpoint?.data as {
    legacyPreFundingOutcome?: string;
    legacyPreFundingBalanceUsdc?: string;
    legacyPreFundingRequiredUsdc?: string;
    financialMutation?: boolean;
  };
  assert.equal(checkpointData.legacyPreFundingOutcome, 'sufficient');
  assert.equal(checkpointData.legacyPreFundingBalanceUsdc, '20.000000');
  assert.equal(checkpointData.legacyPreFundingRequiredUsdc, '12.500000');
  assert.equal(checkpointData.financialMutation, false);
});

test('financial observer can seed the shadow room before durable enqueue', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const rooms = new InMemoryAgentRuntimeRepository();
  await createFinancialCommandShadowObserver(tasks, rooms)({ data: data() });
  assert.equal((await rooms.getDealRoom('room-financial-1'))?.state, 'open');
});

test('x402 funding shadow records intent and submitted proof without provider or financial mutation', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryFinancialRuntimeRepository();
  const input = {
    dealRoomId: 'room-x402-shadow-1',
    source: 'legacy-x402-funding' as const,
    command: {
      commandId: 'legacy-x402-command-1',
      idempotencyKey: 'legacy-x402:submitted:1',
      operation: 'X402_FUNDING' as const,
      amountUsdc: '0.010000',
      sourceAddress: '0x1111111111111111111111111111111111111111',
      destinationAddress: '0x2222222222222222222222222222222222222222',
      expectedDealRoomVersion: 1,
      mandateVersion: 1,
      nowUnix: 100,
    },
    policy: {
      autonomousMaxUsdc: '0',
      allowedDestinations: ['0x2222222222222222222222222222222222222222'],
      requireApprovalFor: ['X402_FUNDING' as const],
    },
    current: { dealRoomVersion: 1, mandateVersion: 1 },
    x402FundingObservation: {
      payerAgentAddress: '0x1111111111111111111111111111111111111111',
      gatewayWalletAddress: '0x2222222222222222222222222222222222222222',
      beneficiaryAddress: '0x3333333333333333333333333333333333333333',
      availableBeforeUsdc: '0.000000',
      requiredUsdc: '0.010000',
      phase: 'submitted' as const,
      depositTxHash: '0xdeposit-proof-1',
    },
    providerObservation: { lifecycle: 'SUBMITTED' as const, txHash: '0xdeposit-proof-1' },
  };

  await createFinancialCommandShadowObserver(tasks)({ data: input });
  const runner = new DurableTaskRunner(
    tasks,
    createFinancialCommandShadowHandlers(repository, { clock: () => 200 }),
    { workerId: 'financial-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  const record = await repository.get(input.command.idempotencyKey);
  assert.equal(record?.operation, 'X402_FUNDING');
  assert.equal(record?.decision, 'APPROVAL_REQUIRED');
  assert.equal(record?.providerLifecycle, 'CREATED');
  assert.equal(record?.data.legacyX402Funding && (record.data.legacyX402Funding as { phase: string }).phase, 'submitted');

  const checkpoint = (await tasks.listCheckpoints(`task:financial:command:${input.command.idempotencyKey}`))[0];
  const checkpointData = checkpoint?.data as {
    x402FundingPhase?: string;
    x402FundingPayerAgentAddress?: string;
    x402FundingGatewayWalletAddress?: string;
    x402FundingBeneficiaryAddress?: string;
    x402FundingDepositTxHash?: string;
    observedLegacyProviderLifecycle?: string;
    observedLegacyTxHash?: string;
    providerCallMade?: boolean;
    financialMutation?: boolean;
  };
  assert.equal(checkpointData.x402FundingPhase, 'submitted');
  assert.equal(checkpointData.x402FundingPayerAgentAddress, input.command.sourceAddress);
  assert.equal(checkpointData.x402FundingGatewayWalletAddress, input.command.destinationAddress);
  assert.equal(checkpointData.x402FundingBeneficiaryAddress, input.x402FundingObservation.beneficiaryAddress);
  assert.equal(checkpointData.x402FundingDepositTxHash, '0xdeposit-proof-1');
  assert.equal(checkpointData.observedLegacyProviderLifecycle, 'SUBMITTED');
  assert.equal(checkpointData.observedLegacyTxHash, '0xdeposit-proof-1');
  assert.equal(checkpointData.providerCallMade, false);
  assert.equal(checkpointData.financialMutation, false);
});
