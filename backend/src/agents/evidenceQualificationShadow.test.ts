import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryDurableTaskStore, DurableTaskRunner } from './durableTaskRunner.js';
import {
  createEvidenceQualificationShadowHandlers,
  createEvidenceQualificationShadowObserver,
  EVIDENCE_QUALIFICATION_SHADOW_TASK,
} from './evidenceQualificationShadow.js';
import { InMemoryEvidenceRuntimeRepository } from '../evidence/runtime.js';
import { InMemoryAgentRuntimeRepository } from '../db/agentRuntime.js';

function data() {
  return {
    dealRoomId: 'room-evidence-1',
    idempotencyKey: 'evidence:room-evidence-1:qualification:1',
    observedAtUnix: 100,
    source: 'manual-fixture' as const,
    need: {
      id: 'need-evidence-1', needKey: 'room-evidence-1:completed-transactions',
      kind: 'completed-transactions', riskClass: 'high', data: { required: true },
    },
    purchase: {
      id: 'purchase-evidence-1', idempotencyKey: 'purchase:evidence-1', providerId: 'fixture-provider',
      priceUsdc: '0.25', observedState: 'unknown' as const, providerTransactionId: 'provider-tx-1', data: { fixture: true },
    },
    snapshot: {
      id: 'snapshot-evidence-1', purchaseId: 'purchase-evidence-1', source: 'fixture-provider', capturedAt: 100,
      reliability: 0, state: 'unknown' as const, responseHash: 'sha256:fixture-1', provenance: ['fixture'],
    },
    blocker: {
      id: 'blocker-evidence-1', blockerKey: 'room-evidence-1:stake-shortfall:seller-1', kind: 'STAKE_SHORTFALL',
      subject: 'seller-1', data: { shortfallUsdc: '10' },
    },
  };
}

test('evidence qualification shadow persists idempotent unknown evidence and blocker state', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryEvidenceRuntimeRepository();
  const observe = createEvidenceQualificationShadowObserver(tasks);
  await observe({ data: data() });
  await observe({ data: data() });
  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceQualificationShadowHandlers(repository, { clock: () => 200 }),
    { workerId: 'evidence-worker', clock: () => 200 },
  );
  const result = await runner.runOnce(200);
  assert.equal(result.succeeded, 1);
  assert.equal((await repository.getNeed('need-evidence-1'))?.state, 'open');
  assert.equal((await repository.getPurchase('purchase-evidence-1'))?.state, 'unknown');
  assert.equal((await repository.listSnapshots('need-evidence-1'))[0]?.state, 'unknown');
  assert.equal((await repository.getBlocker('blocker-evidence-1'))?.state, 'open');
  const checkpoints = await tasks.listCheckpoints('task:evidence:qualification:room-evidence-1:room-evidence-1:completed-transactions');
  assert.equal(checkpoints.length, 1);
  assert.equal((checkpoints[0]?.data as { providerCallMade?: boolean }).providerCallMade, false);
  assert.equal((checkpoints[0]?.data as { financialMutation?: boolean }).financialMutation, false);
});

test('evidence qualification observer seeds its shadow room before durable enqueue', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const rooms = new InMemoryAgentRuntimeRepository();
  await createEvidenceQualificationShadowObserver(tasks, rooms)({ data: data() });
  assert.equal((await rooms.getDealRoom('room-evidence-1'))?.state, 'open');
});

test('malformed evidence task is checkpointed as a rejection without retry', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryEvidenceRuntimeRepository();
  await tasks.enqueue({
    id: 'task:evidence:invalid', kind: EVIDENCE_QUALIFICATION_SHADOW_TASK,
    idempotencyKey: 'evidence:invalid', availableAt: 100, data: { unexpected: true }, now: 100,
  });
  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceQualificationShadowHandlers(repository, { clock: () => 200 }),
    { workerId: 'evidence-worker', clock: () => 200 },
  );
  const result = await runner.runOnce(200);
  assert.equal(result.succeeded, 1);
  const checkpoints = await tasks.listCheckpoints('task:evidence:invalid');
  assert.equal(checkpoints.length, 1);
  assert.equal((checkpoints[0]?.data as { decision?: string }).decision, 'rejected');
});
