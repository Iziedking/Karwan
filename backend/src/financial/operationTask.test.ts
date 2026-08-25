import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAgentRuntimeRepository } from '../db/agentRuntime.js';
import { DurableTaskRunner, InMemoryDurableTaskStore } from '../agents/durableTaskRunner.js';
import type { CircleWalletAdapter, Submission } from '../circle/CircleWalletAdapter.js';
import {
  createFinancialCommandOperationHandlers,
  createFinancialCommandOperationObserver,
  FINANCIAL_COMMAND_OPERATION_TASK,
  type FinancialCommandOperationTaskData,
} from './operationTask.js';
import { InMemoryFinancialRuntimeRepository } from './runtime.js';

const SOURCE = '0x1111111111111111111111111111111111111111';
const DESTINATION = '0x2222222222222222222222222222222222222222';

function operationData(overrides: Partial<FinancialCommandOperationTaskData> = {}): FinancialCommandOperationTaskData {
  return {
    dealRoomId: 'room-operation-1',
    source: 'manual-review',
    command: {
      commandId: 'operation-command-1', idempotencyKey: 'operation:room-1:fund:1', operation: 'ESCROW_FUNDING',
      amountUsdc: '5', sourceAddress: SOURCE, destinationAddress: DESTINATION,
      expectedDealRoomVersion: 1, mandateVersion: 1, nowUnix: 100,
    },
    policy: { autonomousMaxUsdc: '10', allowedDestinations: [DESTINATION], requireApprovalFor: [] },
    current: { dealRoomVersion: 1, mandateVersion: 1 },
    descriptor: { kind: 'transfer', walletId: 'wallet-1', tokenId: 'usdc-token', feeLevel: 'LOW' },
    ...overrides,
  };
}

function adapter(submission: Submission = { providerId: 'circle-operation-1', status: 'INITIATED' }) {
  let calls = 0;
  const value: Pick<CircleWalletAdapter, 'createTransfer' | 'executeContract'> = {
    async createTransfer(input) {
      calls += 1;
      assert.equal(input.idempotencyKey, 'operation:room-1:fund:1');
      return submission;
    },
    async executeContract() { throw new Error('unexpected contract call'); },
  };
  return { value, calls: () => calls };
}

test('operation observer and durable handler execute one injected command and checkpoint it', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryFinancialRuntimeRepository();
  const fake = adapter();
  const rooms = new InMemoryAgentRuntimeRepository();
  const observe = createFinancialCommandOperationObserver(tasks, rooms);
  const observed = await observe(operationData());
  const duplicate = await observe(operationData());
  assert.deepEqual({ observed, duplicate }, { observed: { created: true }, duplicate: { created: false } });
  assert.equal((await rooms.getDealRoom('room-operation-1'))?.state, 'open');
  const runner = new DurableTaskRunner(
    tasks,
    createFinancialCommandOperationHandlers({ repository, adapter: fake.value, clock: () => 200 }),
    { workerId: 'operation-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  assert.equal(fake.calls(), 1);
  assert.equal((await repository.get('operation:room-1:fund:1'))?.providerLifecycle, 'SUBMITTED');
  const checkpoints = await tasks.listCheckpoints('task:financial:operation:operation:room-1:fund:1');
  assert.equal(checkpoints.length, 1);
  assert.equal((checkpoints[0]?.data as { financialMutation?: boolean }).financialMutation, true);
  assert.equal((checkpoints[0]?.data as { mode?: string }).mode, 'reviewed-operation-seam');
});

test('operation handler preserves approval gating and does not call provider when claim is unavailable', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryFinancialRuntimeRepository();
  const approvals = new InMemoryAgentRuntimeRepository();
  const requested = await approvals.createApproval({
    id: 'operation-approval-1', dealRoomId: 'room-operation-1', requestKey: 'operation:approval:1', kind: 'escrow-funding',
    expiresAt: 999, data: { amountUsdc: '5', operation: 'ESCROW_FUNDING', destinationAddress: DESTINATION }, now: 90,
  });
  await approvals.updateApproval(requested.id, requested.version, 'approved', undefined, 95);
  const fake = adapter();
  const data = operationData({
    command: { ...operationData().command, approvalId: requested.id, approvalVersion: 2, nowUnix: 1_000 },
    current: { dealRoomVersion: 1, mandateVersion: 1, approval: { id: requested.id, version: 2, expiresAtUnix: 2_000, amountUsdc: '5' } },
  });
  await tasks.enqueue({ id: 'task:operation:approval', kind: FINANCIAL_COMMAND_OPERATION_TASK, idempotencyKey: 'operation:approval:task', availableAt: 100, data, now: 100 });
  const runner = new DurableTaskRunner(
    tasks,
    createFinancialCommandOperationHandlers({ repository, adapter: fake.value, approvalRepository: approvals, clock: () => 200 }),
    { workerId: 'operation-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  assert.equal(fake.calls(), 0);
  assert.equal((await repository.get(data.command.idempotencyKey))?.providerLifecycle, 'CREATED');
  assert.equal((await approvals.getApproval(requested.id))?.state, 'approved');
  const checkpoint = (await tasks.listCheckpoints('task:operation:approval'))[0];
  assert.equal((checkpoint?.data as { status?: string }).status, 'approval_unavailable');
  assert.equal((checkpoint?.data as { failureReason?: string }).failureReason, 'APPROVAL_EXPIRED');
});

test('operation handler carries an explicit actor into the approval claim', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryFinancialRuntimeRepository();
  const approvals = new InMemoryAgentRuntimeRepository();
  const requested = await approvals.createApproval({
    id: 'operation-actor-approval', dealRoomId: 'room-operation-actor', requestKey: 'operation:actor:1', kind: 'escrow-funding',
    expiresAt: 2_000,
    data: {
      amountUsdc: '5', operation: 'ESCROW_FUNDING', destinationAddress: DESTINATION,
      approverAddress: SOURCE,
    },
    now: 90,
  });
  await approvals.updateApproval(requested.id, requested.version, 'approved', undefined, 95);
  const fake = adapter();
  const data = operationData({
    dealRoomId: 'room-operation-actor',
    command: {
      ...operationData().command,
      commandId: 'operation-actor-command',
      idempotencyKey: 'operation:actor:1',
      approvalId: requested.id,
      approvalVersion: 2,
      actorAddress: '0x3333333333333333333333333333333333333333',
      nowUnix: 1_000,
    },
    current: {
      dealRoomVersion: 1, mandateVersion: 1,
      approval: { id: requested.id, version: 2, expiresAtUnix: 2_000, amountUsdc: '5' },
    },
  });
  await tasks.enqueue({
    id: 'task:operation:actor', kind: FINANCIAL_COMMAND_OPERATION_TASK,
    idempotencyKey: 'operation:actor:task', availableAt: 100, data, now: 100,
  });
  const runner = new DurableTaskRunner(
    tasks,
    createFinancialCommandOperationHandlers({ repository, adapter: fake.value, approvalRepository: approvals, clock: () => 200 }),
    { workerId: 'operation-actor-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  assert.equal(fake.calls(), 0);
  assert.equal((await approvals.getApproval(requested.id))?.state, 'approved');
  assert.equal((await repository.get(data.command.idempotencyKey))?.data.actorAddress, '0x3333333333333333333333333333333333333333');
  const checkpoint = (await tasks.listCheckpoints('task:operation:actor'))[0];
  assert.equal((checkpoint?.data as { status?: string }).status, 'approval_unavailable');
  assert.equal((checkpoint?.data as { failureReason?: string }).failureReason, 'APPROVAL_ACTOR_MISMATCH');
});

test('operation handler records provider timeout as UNKNOWN and duplicate delivery cannot resubmit', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryFinancialRuntimeRepository();
  const fake = adapter();
  const timeoutAdapter: Pick<CircleWalletAdapter, 'createTransfer' | 'executeContract'> = {
    async createTransfer() { fake.calls(); throw new Error('provider timeout'); },
    async executeContract() { throw new Error('unexpected contract call'); },
  };
  await tasks.enqueue({ id: 'task:operation:timeout', kind: FINANCIAL_COMMAND_OPERATION_TASK, idempotencyKey: 'operation:timeout:task', availableAt: 100, data: operationData({ command: { ...operationData().command, idempotencyKey: 'operation:timeout' } }), now: 100 });
  const runner = new DurableTaskRunner(
    tasks,
    createFinancialCommandOperationHandlers({ repository, adapter: timeoutAdapter, clock: () => 200 }),
    { workerId: 'operation-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  const record = await repository.get('operation:timeout');
  assert.equal(record?.providerLifecycle, 'UNKNOWN');
  assert.equal((await runner.runOnce(200)).succeeded, 0);
  assert.equal(record?.providerLifecycle, 'UNKNOWN');
});
