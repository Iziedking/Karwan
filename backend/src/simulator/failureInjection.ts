import {
  DurableTaskRunner,
  InMemoryDurableTaskStore,
  isManualShadowReplayableTaskKind,
} from '../agents/durableTaskRunner.js';
import type { DurableTaskContext, TaskCheckpointPhase } from '../agents/durableTaskRunner.js';
import { buildStakeFundingResumeObservation } from '../agents/stakeFundingResume.js';
import {
  InMemoryIdempotentConsumer,
  InMemoryOutboxStore,
  OutboxDispatcher,
} from '../events/outboxWorker.js';
import { sequenceCursor } from '../events/replayCursor.js';
import {
  decideReengagement,
  parseStructuredOffer,
  validateExactAcceptance,
} from '../negotiation/structuredOffer.js';
import { InMemoryNegotiationRuntime } from '../negotiation/runtime.js';
import { scheduleBoundedReengagement } from '../negotiation/reengagement.js';
import { isReliableTransactionEvidence } from '../matching/evidence.js';
import { decideStakeQualification } from '../staking/policy.js';
import { validateStakeApproval } from '../staking/approval.js';
import {
  InMemoryEvidencePurchaseLedger,
  evidenceNeedKey,
  planEvidenceAcquisition,
} from '../evidence/planner.js';
import {
  createEvidenceAcquisitionOperationHandlers,
  EVIDENCE_ACQUISITION_OPERATION_TASK,
} from '../evidence/acquisitionTask.js';
import { InMemoryEvidenceRuntimeRepository } from '../evidence/runtime.js';
import { createX402EvidenceAcquisitionAdapter } from '../evidence/x402Adapter.js';
import { runReliabilitySimulation } from './reliability.js';

export interface FailureInjectionSimulationReport {
  scenarios: readonly string[];
  invariants: Readonly<Record<string, boolean>>;
  passed: boolean;
}

/**
 * Exercises the durable boundaries with deterministic failures only. The
 * fake provider is an in-memory counter; this simulator never reaches a
 * wallet, chain, network, or payment adapter.
 */
export async function runFailureInjectionSimulation(): Promise<FailureInjectionSimulationReport> {
  const durableScenarios = [
    'Circle timeout before provider ID remains unknown without resubmission',
    'Circle timeout after provider ID persistence reconciles without resubmission',
    'duplicate task delivery and two-worker claim',
    'duplicate event delivery',
    'two identical re-engagement triggers',
    'cooldown expires without material change',
    'explicit do-not-reengage',
    'bounded retry reaches dead letter',
    'manual dead-letter replay resets a shadow task once',
    'notification provider failure retries without duplicate delivery',
    'dispatcher commit failure retries without duplicate consumption',
    'mandate change rejects stale acceptance',
    'malformed model output is rejected',
    'approval expiry and replay are rejected',
    'confirmed funding resumes the blocked deal once',
    'SSE cursor replay is ordered and gap-free',
    'provider-only paid totals cannot qualify',
    'stale and contradictory evidence cannot qualify',
    'fresh evidence is reused across re-engagement',
    'worker dies during evaluation and resumes',
    'worker dies after bid submission and resumes',
    'worker dies after accept submission and resumes',
    'worker dies after stake submission and resumes',
    'deal closes while stake approval or funding is pending',
    'deal closes while an approved stake is pending',
    'deal closes after stake submission before confirmation',
    'simultaneous buyer and seller commands serialize',
    'stake shortfall blocks qualification before negotiation',
    'x402 signed request timeout remains uncertain without resubmission',
    'model timeout uses bounded retry',
  ];

  const circleBeforeIdStore = new InMemoryDurableTaskStore();
  await circleBeforeIdStore.enqueue({
    id: 'task:sim:circle-before-id', kind: 'circle.before-id', idempotencyKey: 'sim:circle-before-id',
    availableAt: 100, maxAttempts: 1, data: {}, now: 100,
  });
  let circleBeforeIdCalls = 0;
  const circleBeforeIdRunner = new DurableTaskRunner(
    circleBeforeIdStore,
    {
      'circle.before-id': async (context) => {
        circleBeforeIdCalls += 1;
        await context.checkpoint({
          checkpointKey: 'circle-timeout-before-id',
          phase: 'authorization.recorded',
          data: {
            provider: 'circle',
            lifecycle: 'UNKNOWN',
            providerIdPersisted: false,
            resubmissionAllowed: false,
          },
        });
        return { state: 'succeeded' as const };
      },
    },
    { workerId: 'sim-circle-before-id-worker', clock: () => 100 },
  );
  const circleBeforeIdResult = await circleBeforeIdRunner.runOnce(100);
  const circleBeforeIdCheckpoints = await circleBeforeIdStore.listCheckpoints('task:sim:circle-before-id');

  const submissionStore = new InMemoryDurableTaskStore();
  await submissionStore.enqueue({
    id: 'task:sim:submission', kind: 'simulated.external', idempotencyKey: 'sim:submission',
    availableAt: 100, maxAttempts: 3, data: {}, now: 100,
  });
  let providerCalls = 0;
  let crashAfterSubmit = true;
  const submissionHandler = async (context: DurableTaskContext) => {
    const submitted = context.checkpoints.find((checkpoint) => checkpoint.phase === 'external.submitted');
    if (!submitted) {
      providerCalls += 1;
      await context.checkpoint({
        checkpointKey: 'provider-submission',
        phase: 'external.submitted',
        externalId: 'fake-provider-1',
        data: { providerCall: providerCalls },
      });
      if (crashAfterSubmit) {
        crashAfterSubmit = false;
        throw new Error('simulated worker crash after provider id persistence');
      }
    }
    await context.checkpoint({
      checkpointKey: 'provider-reconciliation',
      phase: 'external.reconciled',
      externalId: 'fake-provider-1',
      data: { lifecycle: 'SETTLED', txHash: '0xfake' },
    });
    return { state: 'succeeded' as const };
  };
  const submissionRunner = new DurableTaskRunner(
    submissionStore,
    { 'simulated.external': submissionHandler },
    { workerId: 'sim-submission-worker', clock: () => 100 },
  );
  const firstSubmission = await submissionRunner.runOnce(100);
  const secondSubmission = await submissionRunner.runOnce(1_100);
  const submissionCheckpoints = await submissionStore.listCheckpoints('task:sim:submission');

  const claimStore = new InMemoryDurableTaskStore();
  await claimStore.enqueue({
    id: 'task:sim:claim', kind: 'simulated.claim', idempotencyKey: 'sim:claim',
    availableAt: 100, data: {}, now: 100,
  });
  let claimedCalls = 0;
  const claimHandler = async () => {
    claimedCalls += 1;
    return { state: 'succeeded' as const };
  };
  const claimRunners = [
    new DurableTaskRunner(claimStore, { 'simulated.claim': claimHandler }, { workerId: 'sim-worker-a', clock: () => 100 }),
    new DurableTaskRunner(claimStore, { 'simulated.claim': claimHandler }, { workerId: 'sim-worker-b', clock: () => 100 }),
  ];
  const claimResults = await Promise.all(claimRunners.map((runner) => runner.runOnce(100)));

  const eventStore = new InMemoryDurableTaskStore();
  const eventFirst = await eventStore.recordIngestedEvent({
    source: 'simulator', eventKey: 'event-1', partitionKey: 'room-1', cursor: '1',
    expectedCursorVersion: 0, data: { event: 'offer' }, now: 100,
  });
  const eventReplay = await eventStore.recordIngestedEvent({
    source: 'simulator', eventKey: 'event-1', partitionKey: 'room-1', cursor: '1',
    expectedCursorVersion: 0, data: { event: 'offer' }, now: 101,
  });

  const reengagementStore = new InMemoryDurableTaskStore();
  const reengagementResults = await Promise.all([
    scheduleBoundedReengagement(reengagementStore, {
      dealRoomId: 'room-reengage', trigger: 'TERMS_CHANGED', triggerReference: 'event-1',
      nowUnix: 100, attemptCount: 0, maxAttempts: 3, currentFingerprint: 'changed',
      data: { fingerprint: 'changed' },
    }),
    scheduleBoundedReengagement(reengagementStore, {
      dealRoomId: 'room-reengage', trigger: 'TERMS_CHANGED', triggerReference: 'event-1',
      nowUnix: 100, attemptCount: 0, maxAttempts: 3, currentFingerprint: 'changed',
      data: { fingerprint: 'changed' },
    }),
  ]);
  const doNotReengage = decideReengagement({
    trigger: 'TERMS_CHANGED', triggerReference: 'event-2', nowUnix: 100,
    attemptCount: 0, maxAttempts: 3, currentFingerprint: 'changed', explicitDoNotReengage: true,
  });
  const cooldownWithoutChange = decideReengagement({
    trigger: 'COOLDOWN_ELAPSED', triggerReference: 'cooldown-1', nowUnix: 200,
    cooldownUntilUnix: 200, attemptCount: 0, maxAttempts: 3,
    currentFingerprint: 'same', previousFingerprint: 'same',
  });

  const deadLetterStore = new InMemoryDurableTaskStore();
  await deadLetterStore.enqueue({
    id: 'task:sim:dead-letter', kind: 'deal_room.reengage', idempotencyKey: 'sim:dead-letter',
    availableAt: 100, maxAttempts: 2, data: {}, now: 100,
  });
  const deadLetterRunner = new DurableTaskRunner(
    deadLetterStore,
    { 'deal_room.reengage': async () => { throw new Error('simulated malformed model output'); } },
    { workerId: 'sim-dead-letter-worker', clock: () => 100, baseBackoffMs: 1_000 },
  );
  const firstFailure = await deadLetterRunner.runOnce(100);
  const secondFailure = await deadLetterRunner.runOnce(1_100);
  const deadLetters = await deadLetterStore.listDeadLetters();
  const deadLetterReplay = await deadLetterStore.replayDeadLetter({
    taskId: 'task:sim:dead-letter', replayKey: 'sim:dead-letter-replay', actor: 'sim-admin', now: 1_200,
  });
  const duplicateDeadLetterReplay = await deadLetterStore.replayDeadLetter({
    taskId: 'task:sim:dead-letter', replayKey: 'sim:dead-letter-replay', actor: 'sim-admin', now: 1_300,
  });

  const notificationStore = new InMemoryOutboxStore();
  notificationStore.enqueue({
    id: 'event:sim:notification', aggregateType: 'deal_room', aggregateId: 'room-notification',
    aggregateVersion: 1, sequence: 1, category: 'deal_room', type: 'deal.room.state.changed',
    actor: 'platform', jobId: 'job-notification', payload: { state: 'qualifying' }, occurredAt: 100,
  });
  let notificationAttempts = 0;
  const notificationConsumer = new InMemoryIdempotentConsumer('notification', async () => {
    notificationAttempts += 1;
    if (notificationAttempts === 1) throw new Error('simulated notification provider outage');
  });
  const notificationDispatcher = new OutboxDispatcher(notificationStore, [notificationConsumer], {
    workerId: 'sim-notification-worker', maxAttempts: 3, baseBackoffMs: 10,
  });
  const notificationFailure = await notificationDispatcher.dispatchOnce(100);
  const notificationRecovery = await notificationDispatcher.dispatchOnce(110);

  const commitStore = new InMemoryOutboxStore();
  commitStore.enqueue({
    id: 'event:sim:commit', aggregateType: 'deal_room', aggregateId: 'room-commit',
    aggregateVersion: 1, sequence: 1, category: 'deal_room', type: 'deal.room.state.changed',
    actor: 'platform', jobId: 'job-commit', payload: { state: 'qualified' }, occurredAt: 100,
  });
  let dispatcherCommits = 0;
  const commitConsumer = new InMemoryIdempotentConsumer('commit', async () => {});
  const commitDispatcher = new OutboxDispatcher(commitStore, [commitConsumer], {
    workerId: 'sim-commit-worker', baseBackoffMs: 10,
    afterConsumers: async () => {
      dispatcherCommits += 1;
      if (dispatcherCommits === 1) throw new Error('simulated dispatcher commit failure');
    },
  });
  const commitFailure = await commitDispatcher.dispatchOnce(100);
  const commitRecovery = await commitDispatcher.dispatchOnce(110);

  const staleMandate = validateExactAcceptance(
    {
      commandId: 'accept-after-mandate-change', dealRoomId: 'room-1', expectedDealRoomVersion: 2,
      offerId: 'offer-2', offerVersion: 2, buyerMandateVersion: 3, sellerMandateVersion: 4,
    },
    {
      dealRoomId: 'room-1', dealRoomVersion: 2, activeOfferId: 'offer-2', activeOfferVersion: 2,
      buyerMandateVersion: 5, sellerMandateVersion: 4,
    },
  );

  const malformedModel = (() => {
    try {
      parseStructuredOffer({
        dealRoomId: 'room-1', offerId: 'malformed', offerVersion: 1,
        senderRole: 'buyer', recipientRole: 'seller', kind: 'OPENING', action: 'REVISE_PRICE',
        priceUsdc: 'not-usdc', deadlineUnix: 2_000, buyerMandateVersion: 3,
        sellerMandateVersion: 4, terms: { scope: 'research', delivery: '48 hours', paymentTerms: 'after acceptance' },
        hiddenChainOfThought: 'must never be persisted',
      });
      return false;
    } catch {
      return true;
    }
  })();

  const fundingTask = {
    dealRoomId: 'room-funding-resume', idempotencyKey: 'stake:room-funding-resume:v1',
    observedAtUnix: 100, source: 'matching-shadow' as const,
    requirement: {
      requirementVersion: 1, requiredStakeUsdc: '100',
      stakeOwner: '0x1111111111111111111111111111111111111111',
      fundingWallet: '0x3333333333333333333333333333333333333333',
      vaultAddress: '0x2222222222222222222222222222222222222222', asset: 'USDC' as const, network: 'arc-testnet',
    },
    snapshot: { freeStakeUsdc: '25', liquidFundingUsdc: '10', dealRoomOpen: true, mandateVersion: 1, expectedRequirementVersion: 1 },
    policy: {
      autonomousMaxUsdc: '0', allowedVaults: ['0x2222222222222222222222222222222222222222'],
      allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'],
    },
    blocker: {
      id: 'blocker-funding-resume', blockerKey: 'stake:room-funding-resume:v1',
      kind: 'STAKE_SHORTFALL', subject: '0x3333333333333333333333333333333333333333', data: {},
    },
    confirmedFunding: false,
  };
  const fundingObservation = {
    agentAddress: fundingTask.requirement.fundingWallet, amountUsdc: '15', movementState: 'completed',
    observedAtUnix: 200, reference: 'funding-receipt-1', txHash: `0x${'aa'.repeat(32)}`,
  };
  const fundingResume = buildStakeFundingResumeObservation(fundingTask, fundingObservation);
  const fundingResumeReplay = buildStakeFundingResumeObservation(fundingTask, { ...fundingObservation, observedAtUnix: 999 });
  const cursorReplay = [sequenceCursor('room-1:1'), sequenceCursor('room-1:2'), sequenceCursor('room-1:3')];
  const providerOnlyPaidEvidence = isReliableTransactionEvidence({
    source: 'paid_x402', completed: 100, disputed: 0, failed: 0,
    verified: true, paymentStatus: 'SETTLED',
  }, 100);

  const runCheckpointRecovery = async (input: {
    taskId: string;
    phase: TaskCheckpointPhase;
    crashAfterCheckpoint: boolean;
    error: string;
  }) => {
    const store = new InMemoryDurableTaskStore();
    await store.enqueue({
      id: input.taskId, kind: `simulated.${input.phase}`, idempotencyKey: input.taskId,
      availableAt: 100, maxAttempts: 2, data: {}, now: 100,
    });
    let calls = 0;
    const handler = async (context: DurableTaskContext) => {
      calls += 1;
      const checkpointed = context.checkpoints.some((checkpoint) => checkpoint.phase === input.phase);
      if (!checkpointed && !input.crashAfterCheckpoint && calls === 1) {
        throw new Error(input.error);
      }
      if (!checkpointed) {
        await context.checkpoint({
          checkpointKey: `${input.phase}-checkpoint`,
          phase: input.phase,
          data: { call: calls },
        });
      }
      if (!checkpointed && input.crashAfterCheckpoint && calls === 1) {
        throw new Error(input.error);
      }
      return { state: 'succeeded' as const };
    };
    const runner = new DurableTaskRunner(
      store,
      { [`simulated.${input.phase}`]: handler },
      { workerId: `${input.taskId}:worker`, clock: () => 100, baseBackoffMs: 1_000 },
    );
    const first = await runner.runOnce(100);
    const second = await runner.runOnce(1_100);
    return { calls, first, second, checkpoints: await store.listCheckpoints(input.taskId) };
  };

  const [evaluationRecovery, bidRecovery, acceptRecovery, stakeRecovery, modelTimeoutRecovery] = await Promise.all([
    runCheckpointRecovery({ taskId: 'task:sim:evaluation', phase: 'candidate.evaluated', crashAfterCheckpoint: false, error: 'simulated evaluation worker crash' }),
    runCheckpointRecovery({ taskId: 'task:sim:bid', phase: 'bid.submitted', crashAfterCheckpoint: true, error: 'simulated bid worker crash' }),
    runCheckpointRecovery({ taskId: 'task:sim:accept', phase: 'external.submitted', crashAfterCheckpoint: true, error: 'simulated accept worker crash' }),
    runCheckpointRecovery({ taskId: 'task:sim:stake', phase: 'external.submitted', crashAfterCheckpoint: true, error: 'simulated stake worker crash' }),
    runCheckpointRecovery({ taskId: 'task:sim:model-timeout', phase: 'candidate.evaluated', crashAfterCheckpoint: false, error: 'simulated model timeout' }),
  ]);

  const closedStakeRequirement = {
      requirementVersion: 1, requiredStakeUsdc: '500',
      stakeOwner: '0x1111111111111111111111111111111111111111',
      fundingWallet: '0x3333333333333333333333333333333333333333',
      vaultAddress: '0x2222222222222222222222222222222222222222', asset: 'USDC', network: 'arc-testnet',
    } as const;
  const closedStakeSnapshot = { freeStakeUsdc: '0', liquidFundingUsdc: '0', dealRoomOpen: false, mandateVersion: 1, expectedRequirementVersion: 1 } as const;
  const closedStakeDecision = decideStakeQualification(
    closedStakeRequirement,
    closedStakeSnapshot,
    { autonomousMaxUsdc: '250', allowedVaults: ['0x2222222222222222222222222222222222222222'], allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'] },
  );
  const closedApprovalDecision = validateStakeApproval(
    {
      id: 'approval:closed-stake', dealRoomId: 'room-closed-stake', requestKey: 'stake:closed-stake',
      kind: 'STAKE', state: 'approved', version: 1, createdAt: 90, updatedAt: 90, expiresAt: 1_000,
      data: { requirementVersion: 1, mandateVersion: 1, amountUsdc: '500' },
    },
    closedStakeRequirement,
    closedStakeSnapshot,
    100,
  );
  const approvalForReplay = {
    id: 'approval:replay', dealRoomId: 'room-replay', requestKey: 'stake:replay',
    kind: 'STAKE' as const, state: 'approved' as const, version: 1,
    createdAt: 90, updatedAt: 90, expiresAt: 1_000,
    data: { requirementVersion: 1, mandateVersion: 1, amountUsdc: '500' },
  };
  const openStakeSnapshot = {
    freeStakeUsdc: '0', liquidFundingUsdc: '500', dealRoomOpen: true,
    mandateVersion: 1, expectedRequirementVersion: 1,
  } as const;
  const expiredApprovalDecision = validateStakeApproval(
    { ...approvalForReplay, expiresAt: 99 }, closedStakeRequirement, openStakeSnapshot, 100,
  );
  const replayedApprovalDecision = validateStakeApproval(
    { ...approvalForReplay, state: 'executed' }, closedStakeRequirement, openStakeSnapshot, 100,
  );

  const closedAfterStakeStore = new InMemoryDurableTaskStore();
  await closedAfterStakeStore.enqueue({
    id: 'task:sim:closed-stake', kind: 'simulated.closed-stake', idempotencyKey: 'sim:closed-stake',
    availableAt: 100, maxAttempts: 2, data: {}, now: 100,
  });
  let closedAfterStake = false;
  let stakeSubmissionCalls = 0;
  const closedAfterStakeHandler = async (context: DurableTaskContext) => {
    const submitted = context.checkpoints.find((checkpoint) => checkpoint.phase === 'external.submitted');
    if (!submitted) {
      stakeSubmissionCalls += 1;
      await context.checkpoint({
        checkpointKey: 'stake-submission', phase: 'external.submitted', externalId: 'stake-provider-1',
        data: { lifecycle: 'SUBMITTED' },
      });
      closedAfterStake = true;
      throw new Error('simulated deal close before stake confirmation');
    }
    if (!closedAfterStake) throw new Error('stake closure fixture lost its close state');
    await context.checkpoint({
      checkpointKey: 'stake-reconciliation', phase: 'external.reconciled', externalId: 'stake-provider-1',
      data: { lifecycle: 'UNKNOWN', dealRoomOpen: false, reconciliationRequired: true },
    });
    return { state: 'succeeded' as const };
  };
  const closedAfterStakeRunner = new DurableTaskRunner(
    closedAfterStakeStore,
    { 'simulated.closed-stake': closedAfterStakeHandler },
    { workerId: 'sim-closed-stake-worker', clock: () => 100, baseBackoffMs: 1_000 },
  );
  const closedStakeFirst = await closedAfterStakeRunner.runOnce(100);
  const closedStakeSecond = await closedAfterStakeRunner.runOnce(1_100);
  const closedStakeCheckpoints = await closedAfterStakeStore.listCheckpoints('task:sim:closed-stake');

  const simultaneousRuntime = new InMemoryNegotiationRuntime();
  const simultaneousMandates = {
    buyerMaxPriceUsdc: '150', sellerMinPriceUsdc: '100', buyerMandateVersion: 3, sellerMandateVersion: 4,
  };
  simultaneousRuntime.seedRoom({ dealRoomId: 'room-simultaneous', mandates: simultaneousMandates });
  const simultaneousOffer = (offerId: string) => ({
    dealRoomId: 'room-simultaneous', offerId, offerVersion: 1,
    senderRole: 'buyer' as const, recipientRole: 'seller' as const, kind: 'OPENING' as const,
    action: 'REVISE_PRICE' as const, priceUsdc: '125', deadlineUnix: 2_000,
    buyerMandateVersion: 3, sellerMandateVersion: 4,
    terms: { scope: 'simultaneous', delivery: '48 hours', paymentTerms: 'after acceptance' },
  });
  const simultaneousResults = await Promise.all([
    Promise.resolve(simultaneousRuntime.publishOffer({
      commandId: 'simultaneous-buyer', expectedDealRoomVersion: 1,
      rawOffer: simultaneousOffer('simultaneous-buyer-offer'), mandates: simultaneousMandates, nowUnix: 100,
    })),
    Promise.resolve(simultaneousRuntime.publishOffer({
      commandId: 'simultaneous-seller', expectedDealRoomVersion: 1,
      rawOffer: simultaneousOffer('simultaneous-seller-offer'), mandates: simultaneousMandates, nowUnix: 100,
    })),
  ]);
  const stakeShortfall = decideStakeQualification(
    {
      requirementVersion: 1, requiredStakeUsdc: '500',
      stakeOwner: '0x1111111111111111111111111111111111111111',
      fundingWallet: '0x3333333333333333333333333333333333333333',
      vaultAddress: '0x2222222222222222222222222222222222222222', asset: 'USDC', network: 'arc-testnet',
    },
    { freeStakeUsdc: '0', liquidFundingUsdc: '100', dealRoomOpen: true, mandateVersion: 1, expectedRequirementVersion: 1 },
    { autonomousMaxUsdc: '250', allowedVaults: ['0x2222222222222222222222222222222222222222'], allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'] },
  );
  const paidTimeoutLedger = new InMemoryEvidencePurchaseLedger();
  const timeoutNeed = {
    needId: 'sim-timeout-need', claim: 'completed-transactions' as const, subject: 'seller-1',
    decision: 'qualification' as const, requiredFreshnessSeconds: 3_600, minimumReliability: 70,
    maximumPriceUsdc: '1', mandateVersion: 1, policyVersion: 'policy-1', expiresAtUnix: 1_000,
  };
  const timeoutCreated = paidTimeoutLedger.recordStatus(timeoutNeed, 'CREATED');
  const timeoutUnknown = paidTimeoutLedger.recordStatus(timeoutNeed, 'UNKNOWN');
  const timeoutReplay = paidTimeoutLedger.recordStatus(timeoutNeed, 'UNKNOWN');
  const evidenceSnapshotBase = {
    snapshotId: 'snapshot:sim-evidence', needId: timeoutNeed.needId,
    source: 'x402' as const, reliability: 95, provenance: ['receipt'], responseHash: 'hash:sim-evidence',
  };
  const staleEvidencePlan = planEvidenceAcquisition({
    need: timeoutNeed, nowUnix: 200,
    directSnapshot: { ...evidenceSnapshotBase, capturedAtUnix: 100, status: 'stale' as const },
    cachedSnapshots: [], providers: [], expectedDecisionValueUsdc: '5', perDealSpentUsdc: '0',
    perDealBudgetUsdc: '1', allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'], allowedPayTo: [],
  });
  const contradictoryEvidencePlan = planEvidenceAcquisition({
    need: timeoutNeed, nowUnix: 200,
    directSnapshot: { ...evidenceSnapshotBase, snapshotId: 'snapshot:sim-contradictory', status: 'contradictory' as const, capturedAtUnix: 190 },
    cachedSnapshots: [], providers: [], expectedDecisionValueUsdc: '5', perDealSpentUsdc: '0',
    perDealBudgetUsdc: '1', allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'], allowedPayTo: [],
  });
  const freshEvidencePlan = planEvidenceAcquisition({
    need: timeoutNeed, nowUnix: 200, directSnapshot: undefined,
    cachedSnapshots: [{ ...evidenceSnapshotBase, snapshotId: 'snapshot:sim-fresh', capturedAtUnix: 190, status: 'fresh' as const }],
    providers: [], expectedDecisionValueUsdc: '5', perDealSpentUsdc: '0', perDealBudgetUsdc: '1',
    allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'], allowedPayTo: [],
  });
  const evidenceDedupLedger = new InMemoryEvidencePurchaseLedger();
  const firstEvidenceSnapshot = evidenceDedupLedger.recordSnapshot(timeoutNeed, {
    ...evidenceSnapshotBase, snapshotId: 'snapshot:sim-dedup', capturedAtUnix: 190, status: 'fresh',
  });
  const replayEvidenceSnapshot = evidenceDedupLedger.recordSnapshot(timeoutNeed, {
    ...evidenceSnapshotBase, snapshotId: 'snapshot:sim-dedup-replay', capturedAtUnix: 191, status: 'fresh',
  });
  let conflictingEvidenceRejected = false;
  try {
    evidenceDedupLedger.recordSnapshot(timeoutNeed, {
      ...evidenceSnapshotBase, snapshotId: 'snapshot:sim-conflict', capturedAtUnix: 191,
      status: 'fresh', responseHash: 'hash:different',
    });
  } catch {
    conflictingEvidenceRejected = true;
  }

  const signedTimeoutTasks = new InMemoryDurableTaskStore();
  const signedTimeoutRepository = new InMemoryEvidenceRuntimeRepository();
  const signedTimeoutData = {
    dealRoomId: 'room-sim-x402-signed-timeout', source: 'manual-review' as const,
    idempotencyKey: 'sim:x402:signed-timeout',
    planner: {
      need: timeoutNeed,
      nowUnix: 100,
      cachedSnapshots: [],
      providers: [{
        providerId: 'sim-x402-timeout-provider', source: 'x402' as const,
        endpoint: 'https://provider.example/evidence', network: 'arc-testnet', asset: 'USDC',
        payTo: '0x2222222222222222222222222222222222222222', priceUsdc: '0.10', expectedReliability: 90,
        responseLimitBytes: 10_000, providerVersion: 'sim-1', claims: ['completed-transactions' as const],
        provenanceRequirements: ['receipt'], enabled: true,
        circuit: { state: 'closed' as const, consecutiveFailures: 0, cooldownSeconds: 60, failureThreshold: 3 },
      }],
      expectedDecisionValueUsdc: '5', perDealSpentUsdc: '0', perDealBudgetUsdc: '1',
      allowedNetworks: ['arc-testnet'], allowedAssets: ['USDC'],
      allowedPayTo: ['0x2222222222222222222222222222222222222222'], requiredProvenance: ['receipt'],
    },
  };
  await signedTimeoutTasks.enqueue({
    id: 'task:sim:x402-signed-timeout', kind: EVIDENCE_ACQUISITION_OPERATION_TASK,
    idempotencyKey: signedTimeoutData.idempotencyKey, availableAt: 100, data: signedTimeoutData, now: 100,
  });
  let signedTimeoutCalls = 0;
  const signedTimeoutAdapter = createX402EvidenceAcquisitionAdapter({
    transport: async () => {
      signedTimeoutCalls += 1;
      throw new Error('x402 signed request timeout');
    },
  });
  const signedTimeoutRunner = new DurableTaskRunner(
    signedTimeoutTasks,
    createEvidenceAcquisitionOperationHandlers({
      repository: signedTimeoutRepository, adapter: signedTimeoutAdapter, clock: () => 100,
    }),
    { workerId: 'sim-x402-signed-timeout-worker', clock: () => 100 },
  );
  const signedTimeoutFirst = await signedTimeoutRunner.runOnce(100);
  const signedTimeoutDuplicate = await signedTimeoutRunner.runOnce(100);
  const signedTimeoutPurchase = await signedTimeoutRepository.getPurchaseByIdempotencyKey(
    `evidence:${evidenceNeedKey(timeoutNeed)}:sim-x402-timeout-provider`,
  );

  const policySimulation = runReliabilitySimulation();
  const scenarios = [...durableScenarios, ...policySimulation.scenarios];

  const invariants = {
    ...policySimulation.invariants,
    circleTimeoutBeforeProviderIdStaysUnknown: circleBeforeIdCalls === 1
      && circleBeforeIdResult.succeeded === 1
      && circleBeforeIdCheckpoints.some((checkpoint) => checkpoint.phase === 'authorization.recorded'
        && checkpoint.data.lifecycle === 'UNKNOWN'
        && checkpoint.data.providerIdPersisted === false
        && checkpoint.data.resubmissionAllowed === false),
    submissionCheckpointPreventsResubmit: providerCalls === 1
      && firstSubmission.retried === 1
      && secondSubmission.succeeded === 1
      && submissionCheckpoints.some((checkpoint) => checkpoint.phase === 'external.reconciled'),
    circleTimeoutAfterProviderIdDoesNotResubmit: providerCalls === 1
      && firstSubmission.retried === 1
      && secondSubmission.succeeded === 1
      && submissionCheckpoints.filter((checkpoint) => checkpoint.phase === 'external.submitted').length === 1,
    oneWorkerClaimsDuplicateDelivery: claimedCalls === 1
      && claimResults.reduce((total, result) => total + result.succeeded, 0) === 1,
    duplicateEventIsIgnored: eventFirst.duplicate === false
      && eventReplay.duplicate === true
      && eventReplay.cursor?.version === 1,
    duplicateReengagementIsSuppressed: reengagementResults[0]?.created === true
      && reengagementResults[1]?.created === false
      && reengagementResults[0]?.decision.outcome === 'schedule',
    explicitWithdrawalBlocksReengagement: doNotReengage.outcome === 'suppress'
      && doNotReengage.reason === 'DO_NOT_REENGAGE',
    cooldownWithoutMaterialChangeStaysSuppressed: cooldownWithoutChange.outcome === 'suppress'
      && cooldownWithoutChange.reason === 'NO_MATERIAL_CHANGE',
    boundedFailureReachesDeadLetter: firstFailure.retried === 1
      && secondFailure.deadLettered === 1
      && deadLetters.length === 1,
    manualDeadLetterReplayIsPermissionedAndIdempotent: deadLetterReplay.replayed === true
      && duplicateDeadLetterReplay.replayed === false
      && deadLetterReplay.task.state === 'pending'
      && deadLetterReplay.task.attempt === 0
      && isManualShadowReplayableTaskKind(deadLetterReplay.task.kind)
      && isManualShadowReplayableTaskKind('financial.command.operation') === false,
    notificationFailureRetriesWithoutDuplicateDelivery: notificationFailure.retried === 1
      && notificationRecovery.delivered === 1
      && notificationAttempts === 2
      && notificationConsumer.calls === 1
      && notificationStore.inspect('event:sim:notification')?.state === 'delivered',
    dispatcherCommitFailureRetriesWithoutDuplicateConsumption: commitFailure.retried === 1
      && commitRecovery.delivered === 1
      && dispatcherCommits === 2
      && commitConsumer.calls === 1
      && commitStore.inspect('event:sim:commit')?.state === 'delivered',
    mandateChangeInvalidatesAcceptance: staleMandate.outcome === 'stale'
      && staleMandate.reason === 'STALE_BUYER_MANDATE',
    expiredOrReplayedApprovalIsRejected: expiredApprovalDecision.allowed === false
      && expiredApprovalDecision.reason === 'EXPIRED'
      && replayedApprovalDecision.allowed === false
      && replayedApprovalDecision.reason === 'STATE_NOT_APPROVED',
    malformedModelOutputIsRejectedWithoutPersistence: malformedModel,
    confirmedFundingResumesOnceWithStableIdentity: fundingResume?.data.confirmedFunding === true
      && fundingResume?.data.snapshot.liquidFundingUsdc === '25'
      && fundingResume?.data.resume?.triggerReference === 'funding-receipt-1'
      && fundingResume?.data.idempotencyKey === fundingResumeReplay?.data.idempotencyKey,
    sseCursorReplayIsOrderedAndGapFree: JSON.stringify(cursorReplay) === JSON.stringify([1, 2, 3]),
    providerOnlyPaidTotalsStayUncertain: providerOnlyPaidEvidence === false,
    staleOrContradictoryEvidenceCannotQualify: staleEvidencePlan.action === 'wait'
      && contradictoryEvidencePlan.action === 'wait',
    freshEvidenceIsReusedWithoutRepurchase: freshEvidencePlan.action === 'use'
      && freshEvidencePlan.reason === 'FRESH_EVIDENCE_REUSED'
      && firstEvidenceSnapshot === replayEvidenceSnapshot
      && conflictingEvidenceRejected,
    evaluationWorkerRestartRecovers: evaluationRecovery.calls === 2
      && evaluationRecovery.first.retried === 1
      && evaluationRecovery.second.succeeded === 1
      && evaluationRecovery.checkpoints.length === 1,
    bidSubmissionCheckpointPreventsDuplicate: bidRecovery.calls === 2
      && bidRecovery.first.retried === 1
      && bidRecovery.second.succeeded === 1
      && bidRecovery.checkpoints.length === 1
      && bidRecovery.checkpoints[0]?.phase === 'bid.submitted',
    acceptSubmissionCheckpointPreventsDuplicate: acceptRecovery.calls === 2
      && acceptRecovery.first.retried === 1
      && acceptRecovery.second.succeeded === 1
      && acceptRecovery.checkpoints.length === 1,
    stakeSubmissionCheckpointPreventsDuplicate: stakeRecovery.calls === 2
      && stakeRecovery.first.retried === 1
      && stakeRecovery.second.succeeded === 1
      && stakeRecovery.checkpoints.length === 1,
    closedDealDoesNotResumePendingStake: closedStakeDecision.outcome === 'blocked'
      && closedStakeDecision.reason === 'DEAL_CLOSED',
    closedDealDoesNotConsumeApprovedStake: closedApprovalDecision.allowed === false
      && closedApprovalDecision.reason === 'DEAL_CLOSED',
    closedAfterStakeSubmissionReconcilesWithoutResubmit: stakeSubmissionCalls === 1
      && closedStakeFirst.retried === 1
      && closedStakeSecond.succeeded === 1
      && closedStakeCheckpoints.some((checkpoint) => checkpoint.phase === 'external.reconciled')
      && closedStakeCheckpoints.filter((checkpoint) => checkpoint.phase === 'external.submitted').length === 1,
    simultaneousBuyerSellerCommandsSerialize: simultaneousResults.filter((result) => result.outcome === 'published').length === 1
      && simultaneousResults.filter((result) => result.outcome === 'stale').length === 1,
    stakeShortfallBlocksBeforeNegotiation: stakeShortfall.outcome === 'funding_required'
      && stakeShortfall.shortfallUsdc === '500',
    x402TimeoutStaysUncertain: timeoutCreated === 'CREATED'
      && timeoutUnknown === 'UNKNOWN'
      && timeoutReplay === 'UNKNOWN',
    x402SignedRequestTimeoutIsDurableUnknown: signedTimeoutCalls === 1
      && signedTimeoutFirst.succeeded === 1
      && signedTimeoutDuplicate.succeeded === 0
      && signedTimeoutPurchase?.state === 'unknown',
    modelTimeoutUsesBoundedFallback: modelTimeoutRecovery.calls === 2
      && modelTimeoutRecovery.first.retried === 1
      && modelTimeoutRecovery.second.succeeded === 1
      && modelTimeoutRecovery.checkpoints[0]?.phase === 'candidate.evaluated',
  };
  return { scenarios, invariants, passed: Object.values(invariants).every(Boolean) };
}
