import assert from 'node:assert/strict';
import test from 'node:test';
import { DurableTaskRunner, InMemoryDurableTaskStore } from '../agents/durableTaskRunner.js';
import {
  buildUserRequestedReengagementInput,
  createReengagementShadowHandlers,
  scheduleBoundedReengagement,
} from './reengagement.js';

const base = {
  dealRoomId: 'room-reengagement',
  trigger: 'TERMS_CHANGED' as const,
  triggerReference: 'event-1',
  nowUnix: 100,
  attemptCount: 0,
  maxAttempts: 3,
  currentFingerprint: 'changed',
  previousFingerprint: 'old',
  nextAttemptCostUsdc: '0.02',
};

test('bounded re-engagement applies policy before durable enqueue and deduplicates delivery', async () => {
  const store = new InMemoryDurableTaskStore();
  const first = await scheduleBoundedReengagement(store, { ...base, data: { source: 'test' } });
  assert.equal(first.decision.outcome, 'schedule');
  assert.equal(first.created, true);
  if (first.decision.outcome === 'schedule') {
    assert.equal(first.decision.key, 'TERMS_CHANGED:event-1');
  }
  assert.equal(first.task.kind, 'deal_room.reengage');
  assert.equal(first.task.availableAt, 100_000);

  const duplicate = await scheduleBoundedReengagement(store, { ...base, nowUnix: 101 });
  assert.equal(duplicate.decision.outcome, 'schedule');
  assert.equal(duplicate.created, false);
  assert.equal((await store.listRecent()).length, 1);
});

test('bounded re-engagement suppresses spend and withdrawal without creating tasks', async () => {
  const store = new InMemoryDurableTaskStore();
  const spend = await scheduleBoundedReengagement(store, {
    ...base,
    negotiationSpendUsdc: '0.04',
    negotiationSpendCapUsdc: '0.05',
  });
  assert.deepEqual(spend, { decision: { outcome: 'suppress', reason: 'SPEND_CAP' }, created: false });

  const withdrawn = await scheduleBoundedReengagement(store, {
    ...base,
    triggerReference: 'event-withdrawn',
    explicitDoNotReengage: true,
  });
  assert.deepEqual(withdrawn, { decision: { outcome: 'suppress', reason: 'DO_NOT_REENGAGE' }, created: false });
  assert.equal((await store.listRecent()).length, 0);
});

test('non-material trigger names cannot be mapped into automatic durable re-engagement', async () => {
  const store = new InMemoryDurableTaskStore();
  await assert.rejects(
    () => scheduleBoundedReengagement(store, {
      ...base,
      trigger: 'COOLDOWN_ELAPSED',
      triggerReference: 'clock-1',
      previousFingerprint: 'old',
    }),
    /not a material durable trigger/,
  );
  assert.equal((await store.listRecent()).length, 0);
});

test('shadow re-engagement handler checkpoints policy context without authority', async () => {
  const store = new InMemoryDurableTaskStore();
  const scheduled = await scheduleBoundedReengagement(store, base);
  assert.equal(scheduled.created, true);
  const runner = new DurableTaskRunner(
    store,
    createReengagementShadowHandlers(),
    { workerId: 'reengagement-shadow-test', clock: () => 100_000 },
  );
  assert.equal((await runner.runOnce(100_000)).succeeded, 1);
  const checkpoints = await store.listCheckpoints(scheduled.task.id);
  assert.equal(checkpoints.length, 1);
  assert.equal((checkpoints[0]?.data as { mode?: string }).mode, 'shadow-reengagement');
  assert.equal((checkpoints[0]?.data as { reentryCondition?: string }).reentryCondition, 'material_trigger');
  assert.equal((checkpoints[0]?.data as { providerCallMade?: boolean }).providerCallMade, false);
});

test('legacy reconsideration projects one bounded user-triggered shadow attempt', () => {
  const input = buildUserRequestedReengagementInput({
    jobId: 'Job-Reconsider-1',
    passedAt: 123,
    passed: {
      buyerAgent: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      sellerAgent: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      proceedPriceUsdc: '12.500000',
      limitUsdc: '10.000000',
      buyerCeilingUsdc: '10.000000',
      sellerFloorUsdc: '12.500000',
    },
  }, 456);

  assert.ok(input);
  assert.equal(input.dealRoomId, 'Job-Reconsider-1');
  assert.equal(input.trigger, 'USER_REQUESTED');
  assert.equal(input.triggerReference, 'reconsider:job-reconsider-1:123');
  assert.equal(input.attemptCount, 0);
  assert.equal(input.maxAttempts, 1);
  assert.equal(input.currentFingerprint, input.previousFingerprint);
  assert.equal(input.data?.mode, 'legacy-reconsider');
  assert.equal(input.data?.buyerAgent, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(input.sourceEventId, 'legacy-reconsider:job-reconsider-1:123');
});

test('malformed legacy reconsideration snapshots are not projected', () => {
  assert.equal(
    buildUserRequestedReengagementInput({
      jobId: 'room',
      passedAt: 1,
      passed: {
        buyerAgent: 'not-an-address',
        sellerAgent: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        proceedPriceUsdc: '12',
        limitUsdc: '10',
        buyerCeilingUsdc: '10',
        sellerFloorUsdc: '12',
      },
    }, 2),
    null,
  );
  assert.equal(
    buildUserRequestedReengagementInput({
      jobId: 'room',
      passedAt: 1,
      passed: {
        buyerAgent: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        sellerAgent: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        proceedPriceUsdc: 'not-money',
        limitUsdc: '10',
        buyerCeilingUsdc: '10',
        sellerFloorUsdc: '12',
      },
    }, 2),
    null,
  );
});
