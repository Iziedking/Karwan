import assert from 'node:assert/strict';
import test from 'node:test';
import { DurableTaskRunner, InMemoryDurableTaskStore } from './durableTaskRunner.js';
import {
  createEvidenceAcquisitionShadowHandlers,
  createEvidenceAcquisitionShadowObserver,
  EVIDENCE_ACQUISITION_SHADOW_TASK,
} from './evidenceAcquisitionShadow.js';
import { InMemoryEvidenceRuntimeRepository } from '../evidence/runtime.js';
import { InMemoryAgentRuntimeRepository } from '../db/agentRuntime.js';
import { evidenceNeedKey } from '../evidence/planner.js';

function data(overrides: Record<string, unknown> = {}) {
  return {
    dealRoomId: 'room-acquisition-1',
    source: 'manual-fixture' as const,
    idempotencyKey: 'evidence:acquisition:room-1:1',
    planner: {
      need: {
        needId: 'need-planner-1', claim: 'completed-transactions' as const, subject: 'seller-1',
        decision: 'ranking' as const, requiredFreshnessSeconds: 3600, minimumReliability: 80,
        maximumPriceUsdc: '0.02', mandateVersion: 1, policyVersion: 'policy-1', expiresAtUnix: 10_000,
      },
      nowUnix: 100,
      cachedSnapshots: [],
      providers: [{
        providerId: 'provider-1', source: 'x402' as const, endpoint: 'https://provider.example/evidence',
        network: 'base-sepolia', asset: 'USDC', payTo: '0x2222222222222222222222222222222222222222',
        priceUsdc: '0.01', expectedReliability: 90, responseLimitBytes: 10_000,
        providerVersion: '2026-08-24', claims: ['completed-transactions' as const],
        provenanceRequirements: ['provider-receipt'], enabled: true,
        circuit: { state: 'closed' as const, consecutiveFailures: 0, cooldownSeconds: 60, failureThreshold: 3 },
      }],
      expectedDecisionValueUsdc: '1', perDealSpentUsdc: '0', perDealBudgetUsdc: '1',
      allowedNetworks: ['base-sepolia'], allowedAssets: ['USDC'],
      allowedPayTo: ['0x2222222222222222222222222222222222222222'],
      requiredProvenance: ['provider-receipt'],
    },
    ...overrides,
  };
}

test('planner-driven acquisition is durable, idempotent, and never calls a provider', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryEvidenceRuntimeRepository();
  const observe = createEvidenceAcquisitionShadowObserver(tasks);
  await observe({ data: data() });
  await observe({ data: data() });
  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceAcquisitionShadowHandlers(repository, { clock: () => 200 }),
    { workerId: 'evidence-acquisition-worker', clock: () => 200 },
  );
  const result = await runner.runOnce(200);
  assert.equal(result.succeeded, 1);
  const need = await repository.getNeed(`need:${evidenceNeedKey(data().planner.need)}`);
  assert.equal(need?.state, 'open');
  const purchases = await repository.getPurchaseByIdempotencyKey(`evidence:${evidenceNeedKey(data().planner.need)}:provider-1`);
  assert.equal(purchases?.state, 'created');
  const checkpoints = await tasks.listCheckpoints(`task:evidence:acquisition:room-acquisition-1:${evidenceNeedKey(data().planner.need)}`);
  assert.equal(checkpoints.length, 1);
  assert.equal((checkpoints[0]?.data as { decision?: string }).decision, 'purchase');
  assert.equal((checkpoints[0]?.data as { providerCallMade?: boolean }).providerCallMade, false);
  assert.equal((checkpoints[0]?.data as { financialMutation?: boolean }).financialMutation, false);
});

test('acquisition observer can seed the shadow room for a Postgres foreign key', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const rooms = new InMemoryAgentRuntimeRepository();
  await createEvidenceAcquisitionShadowObserver(tasks, rooms)({ data: data() });
  assert.equal((await rooms.getDealRoom('room-acquisition-1'))?.state, 'open');
});

test('research scout source is accepted by the same shadow task boundary', async () => {
  const tasks = new InMemoryDurableTaskStore();
  await createEvidenceAcquisitionShadowObserver(tasks)({
    data: data({
      dealRoomId: 'research-scout:opaque-room',
      source: 'research-scout-shadow',
      idempotencyKey: 'evidence:research-scout:opaque-room',
    }),
  });
  const queued = tasks.inspect(
    `task:evidence:acquisition:research-scout:opaque-room:${evidenceNeedKey(data().planner.need)}`,
  );
  assert.equal(queued?.kind, EVIDENCE_ACQUISITION_SHADOW_TASK);
  assert.equal((queued?.data as { source?: string }).source, 'research-scout-shadow');
});

test('settled provider observations require proof and fulfill the exact need snapshot', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryEvidenceRuntimeRepository();
  const input = data({
    idempotencyKey: 'evidence:acquisition:room-1:settled',
    providerObservation: {
      state: 'settled' as const,
      providerTransactionId: 'provider-tx-1',
      txHash: '0xsettled',
      snapshot: {
        snapshotId: 'snapshot-1', needId: 'need-planner-1', source: 'x402' as const, capturedAtUnix: 100,
        reliability: 90, status: 'fresh' as const, provenance: ['provider-receipt'], responseHash: 'sha256:1',
      },
    },
  });
  const observe = createEvidenceAcquisitionShadowObserver(tasks);
  await observe({ data: input });
  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceAcquisitionShadowHandlers(repository, { clock: () => 200 }),
    { workerId: 'evidence-acquisition-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  const need = await repository.getNeed(`need:${evidenceNeedKey(input.planner.need)}`);
  assert.equal(need?.state, 'fulfilled');
  const purchase = await repository.getPurchaseByIdempotencyKey(`evidence:${evidenceNeedKey(input.planner.need)}:provider-1`);
  assert.equal(purchase?.state, 'settled');
  assert.equal(purchase?.txHash, '0xsettled');
  assert.equal((await repository.listSnapshots(need!.id))[0]?.purchaseId, purchase?.id);
});

test('an unknown direct snapshot is retained while the planner waits', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryEvidenceRuntimeRepository();
  const input = data({
    idempotencyKey: 'evidence:acquisition:room-1:unknown-direct',
    planner: {
      ...data().planner,
      providers: [],
      perDealSpentUsdc: '0.02',
      directSnapshot: {
        snapshotId: 'legacy-market-snapshot',
        needId: 'need-planner-1',
        source: 'x402' as const,
        capturedAtUnix: 100,
        reliability: 0,
        status: 'unknown' as const,
        provenance: ['provider:exa-market-research'],
        responseHash: 'sha256:legacy-unknown',
      },
    },
  });
  await createEvidenceAcquisitionShadowObserver(tasks)({ data: input });
  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceAcquisitionShadowHandlers(repository, { clock: () => 200 }),
    { workerId: 'evidence-acquisition-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  const need = await repository.getNeed(`need:${evidenceNeedKey(input.planner.need)}`);
  assert.equal(need?.state, 'open');
  const snapshots = await repository.listSnapshots(need!.id);
  assert.equal(snapshots[0]?.state, 'unknown');
  const purchase = await repository.getPurchaseByIdempotencyKey(
    `legacy-observed-payment:${evidenceNeedKey(input.planner.need)}`,
  );
  assert.equal(purchase?.state, 'unknown');
  assert.equal(snapshots[0]?.purchaseId, purchase?.id);
  const checkpoints = await tasks.listCheckpoints('task:evidence:acquisition:room-acquisition-1:' + evidenceNeedKey(input.planner.need));
  assert.equal((checkpoints[0]?.data as { decision?: string }).decision, 'wait');
});

test('malformed acquisition tasks are rejected without retry or provider activity', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const repository = new InMemoryEvidenceRuntimeRepository();
  await tasks.enqueue({
    id: 'task:evidence:acquisition:invalid', kind: EVIDENCE_ACQUISITION_SHADOW_TASK,
    idempotencyKey: 'evidence:acquisition:invalid', availableAt: 100, data: { invalid: true }, now: 100,
  });
  const runner = new DurableTaskRunner(
    tasks,
    createEvidenceAcquisitionShadowHandlers(repository, { clock: () => 200 }),
    { workerId: 'evidence-acquisition-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  const checkpoints = await tasks.listCheckpoints('task:evidence:acquisition:invalid');
  assert.equal((checkpoints[0]?.data as { decision?: string }).decision, 'rejected');
});
