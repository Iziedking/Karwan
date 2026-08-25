import assert from 'node:assert/strict';
import test from 'node:test';
import { DurableTaskRunner, InMemoryDurableTaskStore } from '../agents/durableTaskRunner.js';
import { createReviewedOperationTaskHandlers } from '../agents/reviewedOperationHandlers.js';
import { createStakeQualificationShadowHandlers, createStakeQualificationShadowObserver } from '../agents/stakeQualificationShadow.js';
import { createStakeFundingResumeObserver } from '../agents/stakeFundingResume.js';
import { InMemoryAgentRuntimeRepository } from '../db/agentRuntime.js';
import { InMemoryEvidenceRuntimeRepository } from '../evidence/runtime.js';
import { InMemoryNegotiationAttemptStore } from '../negotiation/attempts.js';
import { createNegotiationOperationObserver } from '../negotiation/operationTask.js';
import { InMemoryNegotiationRuntime } from '../negotiation/runtime.js';
import { createReengagementShadowHandlers, scheduleBoundedReengagement } from '../negotiation/reengagement.js';

process.env.ADMIN_API_TOKEN = 'reviewed-operation-integration-token';

const {
  configureReviewedNegotiationIngress,
  configureReengagementIngress,
  configureStakeQualificationShadowIngress,
  configureStakeFundingResumeIngress,
  reviewedOperationIngressRoutes,
} = await import('./reviewedOperationIngress.js');

const headers = {
  'x-admin-token': 'reviewed-operation-integration-token',
  'content-type': 'application/json',
};

const body = {
  dealRoomId: 'room-reviewed-operation-integration',
  source: 'manual-review' as const,
  commandId: 'reviewed-operation-command-1',
  idempotencyKey: 'reviewed-operation-idempotency-1',
  expectedDealRoomVersion: 1,
  rawOffer: {
    dealRoomId: 'room-reviewed-operation-integration',
    offerId: 'reviewed-operation-offer-1',
    offerVersion: 1,
    senderRole: 'buyer' as const,
    recipientRole: 'seller' as const,
    kind: 'OPENING' as const,
    action: 'REVISE_PRICE' as const,
    priceUsdc: '12',
    deadlineUnix: 2_000,
    buyerMandateVersion: 1,
    sellerMandateVersion: 1,
    terms: { scope: 'integration', delivery: '24 hours', paymentTerms: 'after acceptance' },
  },
  mandates: {
    buyerMaxPriceUsdc: '20',
    sellerMinPriceUsdc: '5',
    buyerMandateVersion: 1,
    sellerMandateVersion: 1,
  },
  attempt: {
    id: 'reviewed-operation-attempt-1',
    attemptNumber: 1,
    trigger: 'USER_REQUESTED' as const,
    triggerReference: 'reviewed-operation-integration-1',
    strategy: { style: 'balanced' },
  },
  observedAtUnix: 100,
};

test('reviewed ingress composes with durable runner and deterministic negotiation handler', async () => {
  const taskStore = new InMemoryDurableTaskStore();
  const attempts = new InMemoryNegotiationAttemptStore();
  const runtime = new InMemoryNegotiationRuntime();
  runtime.seedRoom({
    dealRoomId: body.dealRoomId,
    mandates: body.mandates,
    nowUnix: body.observedAtUnix,
  });
  const dispose = configureReviewedNegotiationIngress(async (data) => {
    return createNegotiationOperationObserver(taskStore)(data);
  });

  try {
    const first = await reviewedOperationIngressRoutes.request('/negotiation', {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    assert.equal(first.status, 202);
    const duplicate = await reviewedOperationIngressRoutes.request('/negotiation', {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    assert.equal(duplicate.status, 200);

    const handlers = createReviewedOperationTaskHandlers({
      negotiationAttempts: attempts,
      negotiationExecutor: {
        async publishOffer(input) {
          const result = runtime.publishOffer(input);
          if (result.outcome === 'stale') {
            return {
              outcome: 'stale' as const,
              reason: result.reason,
              dealRoomVersion: result.room.dealRoomVersion,
              ...(result.room.activeOfferId ? { activeOfferId: result.room.activeOfferId } : {}),
              ...(result.room.activeOfferVersion ? { activeOfferVersion: result.room.activeOfferVersion } : {}),
            };
          }
          return {
            outcome: result.outcome,
            offer: result.offer.offer,
            dealRoomVersion: result.room.dealRoomVersion,
            ...(result.outcome === 'published' && result.supersededOfferId ? { supersededOfferId: result.supersededOfferId } : {}),
          };
        },
      },
    });
    const runner = new DurableTaskRunner(taskStore, handlers, {
      workerId: 'reviewed-operation-integration-worker',
      clock: () => 200,
    });
    assert.deepEqual(await runner.runOnce(200), {
      succeeded: 1, waiting: 0, retried: 0, deadLettered: 0, leaseLost: 0,
    });

    const task = taskStore.inspect('task:negotiation:operation:reviewed-operation-idempotency-1');
    assert.equal(task?.state, 'succeeded');
    assert.equal((await attempts.get(body.attempt.id))?.state, 'waiting');
    assert.equal(runtime.getRoom(body.dealRoomId).dealRoomVersion, 2);
    const checkpoints = await taskStore.listCheckpoints(task!.id);
    assert.equal(checkpoints.length, 1);
    assert.equal(checkpoints[0]?.data.providerCallMade, false);
    assert.equal(checkpoints[0]?.data.financialMutation, false);
    assert.deepEqual(await runner.runOnce(200), {
      succeeded: 0, waiting: 0, retried: 0, deadLettered: 0, leaseLost: 0,
    });
  } finally {
    dispose();
  }
});

test('re-engagement ingress applies policy before one durable shadow task', async () => {
  const taskStore = new InMemoryDurableTaskStore();
  const dispose = configureReengagementIngress((data) => scheduleBoundedReengagement(taskStore, data));
  const body = {
    dealRoomId: 'room-reengagement-reviewed-integration',
    trigger: 'USER_REQUESTED' as const,
    triggerReference: 'user-request-integration-1',
    nowUnix: 100,
    attemptCount: 0,
    maxAttempts: 3,
    currentFingerprint: 'fingerprint-integration-1',
    data: { source: 'integration-test' },
  };
  try {
    const first = await reviewedOperationIngressRoutes.request('/reengagement', {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    assert.equal(first.status, 202);
    const duplicate = await reviewedOperationIngressRoutes.request('/reengagement', {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    assert.equal(duplicate.status, 200);

    const runner = new DurableTaskRunner(
      taskStore,
      createReengagementShadowHandlers(),
      { workerId: 'reviewed-reengagement-integration-worker', clock: () => 100_000 },
    );
    assert.deepEqual(await runner.runOnce(100_000), {
      succeeded: 1, waiting: 0, retried: 0, deadLettered: 0, leaseLost: 0,
    });
    const tasks = await taskStore.listRecent();
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]?.kind, 'deal_room.reengage');
    const checkpoints = await taskStore.listCheckpoints(tasks[0]!.id);
    assert.equal(checkpoints.length, 1);
    assert.equal(checkpoints[0]?.data.providerCallMade, false);
    assert.equal(checkpoints[0]?.data.financialMutation, false);
    assert.equal(checkpoints[0]?.data.reentryCondition, 'material_trigger');
  } finally {
    dispose();
  }
});

test('staking shadow ingress composes with the durable runner without execution authority', async () => {
  const taskStore = new InMemoryDurableTaskStore();
  const evidenceRuntime = new InMemoryEvidenceRuntimeRepository();
  const runtimeRepository = new InMemoryAgentRuntimeRepository();
  const stakeBody = {
    dealRoomId: 'room-stake-reviewed-integration',
    idempotencyKey: 'stake-reviewed-integration-1',
    observedAtUnix: 100,
    source: 'manual-fixture' as const,
    requirement: {
      requirementVersion: 1,
      requiredStakeUsdc: '500',
      stakeOwner: '0x1111111111111111111111111111111111111111',
      fundingWallet: '0x3333333333333333333333333333333333333333',
      vaultAddress: '0x2222222222222222222222222222222222222222',
      asset: 'USDC' as const,
      network: 'arc-testnet',
    },
    snapshot: {
      freeStakeUsdc: '100', liquidFundingUsdc: '400', dealRoomOpen: true,
      mandateVersion: 1, expectedRequirementVersion: 1,
    },
    policy: {
      autonomousMaxUsdc: '0',
      allowedVaults: ['0x2222222222222222222222222222222222222222'],
      allowedNetworks: ['arc-testnet'],
      allowedAssets: ['USDC'],
    },
    blocker: {
      id: 'blocker-stake-reviewed-integration',
      blockerKey: 'stake:room-stake-reviewed-integration:v1',
      kind: 'STAKE_SHORTFALL',
      subject: 'seller-1',
      data: {},
    },
    confirmedFunding: false,
  };
  const observer = createStakeQualificationShadowObserver(taskStore);
  const dispose = configureStakeQualificationShadowIngress((data) => observer({ data }));
  try {
    const first = await reviewedOperationIngressRoutes.request('/staking-shadow', {
      method: 'POST', headers, body: JSON.stringify(stakeBody),
    });
    assert.equal(first.status, 202);
    const duplicate = await reviewedOperationIngressRoutes.request('/staking-shadow', {
      method: 'POST', headers, body: JSON.stringify(stakeBody),
    });
    assert.equal(duplicate.status, 200);

    const runner = new DurableTaskRunner(
      taskStore,
      createStakeQualificationShadowHandlers(evidenceRuntime, { approvalRepository: runtimeRepository }),
      { workerId: 'reviewed-stake-integration-worker', clock: () => 200 },
    );
    assert.deepEqual(await runner.runOnce(200), {
      succeeded: 1, waiting: 0, retried: 0, deadLettered: 0, leaseLost: 0,
    });
    const task = taskStore.inspect('task:stake:qualification:room-stake-reviewed-integration:stake-reviewed-integration-1');
    assert.equal(task?.state, 'succeeded');
    const checkpoints = await taskStore.listCheckpoints(task!.id);
    assert.equal(checkpoints.length, 1);
    assert.equal(checkpoints[0]?.data.providerCallMade, false);
    assert.equal(checkpoints[0]?.data.financialMutation, false);
    assert.equal((await evidenceRuntime.getBlockerByKey('stake:room-stake-reviewed-integration:v1'))?.state, 'open');
  } finally {
    dispose();
  }
});

test('confirmed funding ingress resumes one persisted blocker without staking authority', async () => {
  const taskStore = new InMemoryDurableTaskStore();
  const evidenceRuntime = new InMemoryEvidenceRuntimeRepository();
  const runtimeRepository = new InMemoryAgentRuntimeRepository();
  const roomId = 'room-stake-funding-reviewed-integration';
  await runtimeRepository.createDealRoom({ id: roomId, jobId: roomId, data: {}, now: 100 });
  const stakeBody = {
    dealRoomId: roomId,
    idempotencyKey: 'stake-funding-reviewed-integration-1',
    observedAtUnix: 100,
    source: 'manual-fixture' as const,
    requirement: {
      requirementVersion: 1, requiredStakeUsdc: '100',
      stakeOwner: '0x1111111111111111111111111111111111111111',
      fundingWallet: '0x3333333333333333333333333333333333333333',
      vaultAddress: '0x2222222222222222222222222222222222222222',
      asset: 'USDC' as const, network: 'arc-testnet',
    },
    snapshot: {
      freeStakeUsdc: '25', liquidFundingUsdc: '10', dealRoomOpen: true,
      mandateVersion: 1, expectedRequirementVersion: 1,
    },
    policy: {
      autonomousMaxUsdc: '0',
      allowedVaults: ['0x2222222222222222222222222222222222222222'],
      allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'],
    },
    blocker: {
      id: 'blocker-stake-funding-reviewed-integration',
      blockerKey: 'stake:room-stake-funding-reviewed-integration:v1',
      kind: 'STAKE_SHORTFALL',
      subject: '0x3333333333333333333333333333333333333333', data: {},
    },
    confirmedFunding: false,
  };
  const stakeObserver = createStakeQualificationShadowObserver(taskStore, runtimeRepository);
  const fundingObserver = createStakeFundingResumeObserver(taskStore, evidenceRuntime, runtimeRepository);
  const disposeStake = configureStakeQualificationShadowIngress((data) => stakeObserver({ data }));
  const disposeFunding = configureStakeFundingResumeIngress(fundingObserver);
  try {
    const initial = await reviewedOperationIngressRoutes.request('/staking-shadow', {
      method: 'POST', headers, body: JSON.stringify(stakeBody),
    });
    assert.equal(initial.status, 202);
    const initialRunner = new DurableTaskRunner(
      taskStore,
      createStakeQualificationShadowHandlers(evidenceRuntime, { approvalRepository: runtimeRepository }),
      { workerId: 'reviewed-stake-funding-initial', clock: () => 110 },
    );
    assert.equal((await initialRunner.runOnce(110)).succeeded, 1);
    assert.equal((await evidenceRuntime.getBlockerByKey(stakeBody.blocker.blockerKey))?.state, 'open');

    const fundingBody = {
      agentAddress: stakeBody.requirement.fundingWallet,
      amountUsdc: '15', movementState: 'completed', observedAtUnix: 200,
      reference: 'reviewed-funding-1', txHash: `0x${'bb'.repeat(32)}`,
    };
    const resumed = await reviewedOperationIngressRoutes.request('/staking-funding-shadow', {
      method: 'POST', headers, body: JSON.stringify(fundingBody),
    });
    assert.equal(resumed.status, 202);
    assert.equal((await resumed.json()).resumedTasks, 1);
    const duplicate = await reviewedOperationIngressRoutes.request('/staking-funding-shadow', {
      method: 'POST', headers, body: JSON.stringify(fundingBody),
    });
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).resumedTasks, 0);

    const resumeRunner = new DurableTaskRunner(
      taskStore,
      createStakeQualificationShadowHandlers(evidenceRuntime, { approvalRepository: runtimeRepository }),
      { workerId: 'reviewed-stake-funding-resume', clock: () => 220 },
    );
    assert.equal((await resumeRunner.runOnce(220)).succeeded, 1);
    assert.equal((await evidenceRuntime.getBlockerByKey(stakeBody.blocker.blockerKey))?.state, 'resolved');
    const resumedTask = (await taskStore.listRecent({ limit: 10 }))
      .find((task) => task.idempotencyKey.includes('funding:'));
    assert.ok(resumedTask);
    const checkpoints = await taskStore.listCheckpoints(resumedTask.id);
    assert.equal(checkpoints.at(-1)?.data.providerCallMade, false);
    assert.equal(checkpoints.at(-1)?.data.financialMutation, false);
  } finally {
    disposeFunding();
    disposeStake();
  }
});
