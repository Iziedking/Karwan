import assert from 'node:assert/strict';
import test from 'node:test';
import { DurableTaskRunner, InMemoryDurableTaskStore } from '../agents/durableTaskRunner.js';
import { InMemoryBuyerTimerParityAuditStore } from '../agents/buyerTaskParity.js';
import { InMemoryMatchingAuditStore } from '../matching/audit.js';
import { InMemoryMatchingAuditReviewStore } from '../matching/review.js';
import { InMemoryNegotiationShadowAuditStore } from '../agents/negotiationTaskShadow.js';
import { InMemoryEvidenceRuntimeAuditStore } from '../evidence/runtime.js';
import { InMemoryFinancialRuntimeRepository } from '../financial/runtime.js';
import { InMemoryResearchCreditStore } from '../evidence/researchCredit.js';
import { InMemoryNegotiationCommandLedger } from '../negotiation/commandLedger.js';

process.env.ADMIN_API_TOKEN = 'phase3c-admin-test-token';

const { createAdminAgentRuntimeRoutes } = await import('./adminAgentRuntime.js');

test('reviewed operation status is admin-only and cannot claim live authority', async () => {
  const routes = createAdminAgentRuntimeRoutes();
  const response = await routes.request('/reviewed-operations', {
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    mode: string;
    legacyRoutesEnqueue: boolean;
    authoritativeNegotiation: string;
    authoritativeFinancial: string;
    providerWritesAuthorized: boolean;
    stakingQualificationShadowEnabled: boolean;
    stakeExecutionAuthorized: boolean;
  };
  assert.equal(body.mode, 'reviewed-operation-seam');
  assert.equal(body.legacyRoutesEnqueue, false);
  assert.equal(body.authoritativeNegotiation, 'legacy');
  assert.equal(body.authoritativeFinancial, 'legacy');
  assert.equal(body.providerWritesAuthorized, false);
  assert.equal(body.stakingQualificationShadowEnabled, false);
  assert.equal(body.stakeExecutionAuthorized, false);
  const unauthenticated = await routes.request('/reviewed-operations');
  assert.equal(unauthenticated.status, 401);
});

test('rollout gate is admin-only, read-only, and fails closed on incomplete telemetry', async () => {
  const routes = createAdminAgentRuntimeRoutes(
    () => new InMemoryBuyerTimerParityAuditStore(),
    () => new InMemoryMatchingAuditStore(),
    () => new InMemoryNegotiationShadowAuditStore([]),
    () => new InMemoryEvidenceRuntimeAuditStore({ needs: [], purchases: [], blockers: [] }),
    () => null,
    () => new InMemoryDurableTaskStore(),
  );
  const response = await routes.request(
    '/rollout-gate?minimumObservations=1&maximumStaleOfferAcceptances=0',
    { headers: { 'x-admin-token': 'phase3c-admin-test-token' } },
  );
  assert.equal(response.status, 200);
  const body = await response.json() as {
    mode: string;
    authoritativeRoutes: string;
    providerWritesAuthorized: boolean;
    financialMutationsAuthorized: boolean;
    metricsComplete: boolean;
    gate: { eligible: boolean; killSwitch: boolean; reasons: string[] };
    missingMetrics: string[];
  };
  assert.equal(body.mode, 'read-only-rollout-gate');
  assert.equal(body.authoritativeRoutes, 'legacy');
  assert.equal(body.providerWritesAuthorized, false);
  assert.equal(body.financialMutationsAuthorized, false);
  assert.equal(body.metricsComplete, false);
  assert.equal(body.gate.eligible, false);
  assert.equal(body.gate.killSwitch, true);
  assert.deepEqual(body.gate.reasons, ['INSUFFICIENT_OBSERVATIONS', 'METRICS_INCOMPLETE']);
  assert.ok(body.missingMetrics.includes('negotiation.duplicateCommandConflicts'));
  assert.equal(body.missingMetrics.includes('tasks.leaseLosses'), false);
  assert.equal((await routes.request('/rollout-gate?maximumStaleOfferAcceptances=0', {
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  })).status, 400);
  assert.equal((await routes.request('/rollout-gate')).status, 401);
  assert.equal((await routes.request('/rollout-gate', {
    method: 'POST', headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  })).status, 404);
});

test('rollout gate reports durable stale acceptance telemetry without authorizing cutover', async () => {
  const commands = new InMemoryNegotiationCommandLedger();
  await commands.put({
    commandId: 'rollout-stale-acceptance', idempotencyKey: 'rollout:accept:1', kind: 'accept_offer',
    result: { outcome: 'stale', reason: 'STALE_OFFER' }, createdAt: 100,
  });
  const routes = createAdminAgentRuntimeRoutes(
    () => null, () => null, () => null, () => null, () => null, () => null,
    undefined, undefined, undefined, () => commands,
  );
  const response = await routes.request('/rollout-gate?minimumObservations=1&maximumStaleOfferAcceptances=0', {
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    metrics: { staleOfferAcceptances: number };
    missingMetrics: string[];
    gate: { eligible: boolean; reasons: string[] };
  };
  assert.equal(body.metrics.staleOfferAcceptances, 1);
  assert.ok(body.gate.reasons.includes('STALE_ACCEPTANCE_RATE_TOO_HIGH'));
  assert.equal(body.gate.eligible, false);
  assert.equal(body.missingMetrics.includes('negotiation.staleOfferAcceptances'), false);
  assert.equal(body.missingMetrics.includes('negotiation.duplicateCommandConflicts'), false);
});

test('rollout gate reports immutable matching review coverage without changing winner authority', async () => {
  const matching = new InMemoryMatchingAuditStore();
  await matching.record({
    observationKey: 'rollout-review-observation', source: 'buyer-bids', mandateId: 'rollout-review-mandate',
    mandateVersion: 1, legacyCandidateIds: ['legacy-winner'], shadowCandidateIds: ['shadow-winner'],
    evaluations: [], observedAt: 100,
  });
  const reviews = new InMemoryMatchingAuditReviewStore();
  const routes = createAdminAgentRuntimeRoutes(
    () => null, () => matching, () => null, () => null, () => null, () => null,
    undefined, undefined, undefined, undefined, () => reviews,
  );
  const headers = { 'x-admin-token': 'phase3c-admin-test-token' };
  const pendingResponse = await routes.request(
    '/rollout-gate?minimumObservations=1&maximumStaleOfferAcceptances=0', { headers },
  );
  assert.equal(pendingResponse.status, 200);
  const pendingBody = await pendingResponse.json() as {
    metrics: { matchingReviewsPending: number };
    matchingReviewCoverage: { reviewedCount: number; pendingCount: number };
    missingMetrics: string[];
    gate: { reasons: string[] };
  };
  assert.equal(pendingBody.metrics.matchingReviewsPending, 1);
  assert.equal(pendingBody.matchingReviewCoverage.pendingCount, 1);
  assert.equal(pendingBody.matchingReviewCoverage.reviewedCount, 0);
  assert.equal(pendingBody.missingMetrics.includes('matching.reviews'), false);
  assert.ok(pendingBody.gate.reasons.includes('MATCHING_REVIEW_PENDING'));

  await reviews.record({
    reviewId: 'rollout-review-1', observationKey: 'rollout-review-observation',
    decision: 'retain_legacy', reviewer: 'admin', createdAt: 200,
  });
  const reviewedResponse = await routes.request(
    '/rollout-gate?minimumObservations=1&maximumStaleOfferAcceptances=0', { headers },
  );
  const reviewedBody = await reviewedResponse.json() as {
    metrics: { matchingReviewsPending: number };
    matchingReviewCoverage: { reviewedCount: number; pendingCount: number; byDecision: { retain_legacy: number } };
  };
  assert.equal(reviewedBody.metrics.matchingReviewsPending, 0);
  assert.equal(reviewedBody.matchingReviewCoverage.pendingCount, 0);
  assert.equal(reviewedBody.matchingReviewCoverage.reviewedCount, 1);
  assert.equal(reviewedBody.matchingReviewCoverage.byDecision.retain_legacy, 1);
});

test('rollout gate includes unresolved financial provider state as a blocker', async () => {
  const store = new InMemoryFinancialRuntimeRepository();
  const created = await store.recordDecision({
    commandId: 'rollout-financial-command', idempotencyKey: 'rollout:financial:1', operation: 'STAKE',
    amountUsdc: '5', amountMicros: '5000000',
    sourceAddress: '0x1111111111111111111111111111111111111111',
    destinationAddress: '0x2222222222222222222222222222222222222222',
    expectedDealRoomVersion: 1, mandateVersion: 1, decision: 'AUTHORIZED', reason: 'POLICY_ACCEPTED',
    data: {}, now: 100,
  });
  const submitted = await store.recordProviderUpdate(created.record.idempotencyKey, created.record.version, {
    lifecycle: 'SUBMITTED', providerId: 'provider-rollout-1',
  }, 150);
  await store.recordProviderUpdate(created.record.idempotencyKey, submitted.version, {
    lifecycle: 'RECONCILING', providerId: 'provider-rollout-1',
  }, 200);
  const routes = createAdminAgentRuntimeRoutes(
    () => null, () => null, () => null, () => null, () => store, () => null,
  );
  const response = await routes.request('/rollout-gate?minimumObservations=1&maximumStaleOfferAcceptances=0', {
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    metrics: { uncertainFinancialStates: number };
    missingMetrics: string[];
    gate: { eligible: boolean; reasons: string[] };
  };
  assert.equal(body.metrics.uncertainFinancialStates, 1);
  assert.equal(body.missingMetrics.includes('financial.uncertainProviderStates'), false);
  assert.ok(body.gate.reasons.includes('UNCERTAIN_FINANCIAL_STATE'));
  assert.equal(body.gate.eligible, false);
});

test('durable task operational report is read-only, filterable, and exposes retry/dead-letter counts', async () => {
  const store = new InMemoryDurableTaskStore();
  await store.enqueue({
    id: 'task-admin-pending', kind: 'admin.pending', idempotencyKey: 'admin:pending',
    availableAt: 100, data: { internal: 'not exposed' }, now: 100,
  });
  await store.enqueue({
    id: 'task-admin-failure', kind: 'admin.failure', idempotencyKey: 'admin:failure',
    availableAt: 100, maxAttempts: 1, data: {}, now: 100,
  });
  const runner = new DurableTaskRunner(
    store,
    {
      'admin.pending': async () => ({ state: 'succeeded' as const }),
      'admin.failure': async () => { throw new Error('simulated task failure'); },
    },
    { workerId: 'admin-task-test-worker', clock: () => 100 },
  );
  assert.equal((await runner.runOnce(100)).deadLettered, 1);

  const routes = createAdminAgentRuntimeRoutes(() => null, () => null, () => null, () => null, () => null, () => store);
  const response = await routes.request('/tasks?state=dead_letter&limit=10', {
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    mode: string;
    authoritativeRoutes: string;
    providerWritesAuthorized: boolean;
    summary: { total: number; retrying: number; deadLettered: number };
    tasks: Array<Record<string, unknown>>;
  };
  assert.equal(body.mode, 'read-only-operational');
  assert.equal(body.authoritativeRoutes, 'legacy');
  assert.equal(body.providerWritesAuthorized, false);
  assert.equal(body.summary.total, 2);
  assert.equal(body.summary.retrying, 0);
  assert.equal(body.summary.deadLettered, 1);
  assert.equal(body.tasks.length, 1);
  assert.equal(body.tasks[0]?.state, 'dead_letter');
  assert.equal('data' in (body.tasks[0] ?? {}), false);
  const writeResponse = await routes.request('/tasks', {
    method: 'POST', headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(writeResponse.status, 404);
  const unauthorizedReplay = await routes.request('/tasks/task-admin-failure/replay', {
    method: 'POST',
    body: JSON.stringify({ replayKey: 'admin-replay-1' }),
  });
  assert.equal(unauthorizedReplay.status, 401);
  const disabledReplay = await routes.request('/tasks/task-admin-failure/replay', {
    method: 'POST',
    headers: { 'x-admin-token': 'phase3c-admin-test-token', 'content-type': 'application/json' },
    body: JSON.stringify({ replayKey: 'admin-replay-1' }),
  });
  assert.equal(disabledReplay.status, 409);
});

test('enabled admin replay is shadow-only and remains idempotent after the task leaves dead-letter state', async () => {
  const store = new InMemoryDurableTaskStore();
  await store.enqueue({
    id: 'task-admin-replay', kind: 'financial.command.shadow', idempotencyKey: 'admin:replay',
    availableAt: 100, maxAttempts: 1, data: {}, now: 100,
  });
  const runner = new DurableTaskRunner(
    store,
    { 'financial.command.shadow': async () => { throw new Error('shadow failure'); } },
    { workerId: 'admin-replay-worker', clock: () => 100 },
  );
  assert.equal((await runner.runOnce(100)).deadLettered, 1);
  const { config } = await import('../config.js');
  const previous = config.AGENT_RUNTIME_V2_ENABLED;
  config.AGENT_RUNTIME_V2_ENABLED = true;
  try {
    const routes = createAdminAgentRuntimeRoutes(
      undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, () => store,
    );
    const first = await routes.request('/tasks/task-admin-replay/replay', {
      method: 'POST',
      headers: { 'x-admin-token': 'phase3c-admin-test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ replayKey: 'admin-replay-route-1' }),
    });
    assert.equal(first.status, 200);
    const firstBody = await first.json() as { replayed: boolean; task: { state: string } };
    assert.equal(firstBody.replayed, true);
    assert.equal(firstBody.task.state, 'pending');
    const duplicate = await routes.request('/tasks/task-admin-replay/replay', {
      method: 'POST',
      headers: { 'x-admin-token': 'phase3c-admin-test-token', 'content-type': 'application/json' },
      body: JSON.stringify({ replayKey: 'admin-replay-route-1' }),
    });
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json() as { replayed: boolean }).replayed, false);
  } finally {
    config.AGENT_RUNTIME_V2_ENABLED = previous;
  }
});

test('reviewed operation audit is read-only and exposes only allowlisted outcomes', async () => {
  const store = new InMemoryDurableTaskStore();
  await store.enqueue({
    id: 'task-admin-reviewed-negotiation', kind: 'negotiation.turn.operation',
    idempotencyKey: 'admin:reviewed:negotiation', availableAt: 100, data: {}, now: 100,
  });
  await store.enqueue({
    id: 'task-admin-unrelated', kind: 'simulated.unrelated',
    idempotencyKey: 'admin:unrelated', availableAt: 100, data: {}, now: 100,
  });
  const runner = new DurableTaskRunner(
    store,
    {
      'negotiation.turn.operation': async (context) => {
        await context.checkpoint({
          checkpointKey: 'operation-result',
          phase: 'negotiation.turn',
          data: {
            mode: 'reviewed-negotiation-operation-seam', outcome: 'published', attemptState: 'waiting',
            reentryCondition: 'material_trigger', resumable: true,
            providerCallMade: false, financialMutation: false, providerId: 'must-not-leak', endpoint: 'https://secret.invalid',
          },
        });
        return { state: 'succeeded' as const };
      },
    },
    { workerId: 'admin-reviewed-operation-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  const routes = createAdminAgentRuntimeRoutes(
    () => null, () => null, () => null, () => null, () => null, () => null, undefined, () => store,
  );
  const response = await routes.request('/operation-audit?kind=negotiation.turn.operation&limit=10', {
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    mode: string;
    authoritativeRoutes: string;
    providerWritesAuthorized: boolean;
    financialMutationsAuthorized: boolean;
    tasks: Array<{ kind: string; checkpoint?: { data: Record<string, unknown> } }>;
  };
  assert.equal(body.mode, 'read-only-operational');
  assert.equal(body.authoritativeRoutes, 'legacy');
  assert.equal(body.providerWritesAuthorized, false);
  assert.equal(body.financialMutationsAuthorized, false);
  assert.equal(body.tasks.length, 1);
  assert.equal(body.tasks[0]?.kind, 'negotiation.turn.operation');
  assert.equal(body.tasks[0]?.checkpoint?.data.outcome, 'published');
  assert.equal(body.tasks[0]?.checkpoint?.data.providerCallMade, false);
  assert.equal(body.tasks[0]?.checkpoint?.data.reentryCondition, 'material_trigger');
  assert.equal(body.tasks[0]?.checkpoint?.data.resumable, true);
  assert.equal('providerId' in (body.tasks[0]?.checkpoint?.data ?? {}), false);
  assert.equal('endpoint' in (body.tasks[0]?.checkpoint?.data ?? {}), false);
  assert.equal((await routes.request('/operation-audit')).status, 401);
  assert.equal((await routes.request('/operation-audit', {
    method: 'POST', headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  })).status, 404);
});

test('research-credit audit is admin-only, read-only, and never exposes ledger metadata', async () => {
  const store = new InMemoryResearchCreditStore();
  const owner = '0x1111111111111111111111111111111111111111';
  await store.ensureAccount({ owner, initialCreditUsdc: '1', now: 100 });
  await store.reserve({
    id: 'admin-credit-reservation', reservationKey: 'admin-credit-key', owner,
    amountUsdc: '0.25', data: { secret: 'not for reporting' }, now: 110,
  });
  const routes = createAdminAgentRuntimeRoutes(undefined, undefined, undefined, undefined, undefined, undefined, () => store);
  const response = await routes.request('/research-credit?owner=0x1111111111111111111111111111111111111111', {
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    mode: string;
    authoritativeResearchCredit: string;
    providerWritesAuthorized: boolean;
    accounts: Array<Record<string, unknown>>;
    reservations: Array<Record<string, unknown>>;
  };
  assert.equal(body.mode, 'read-only-operational');
  assert.equal(body.authoritativeResearchCredit, 'legacy-until-explicit-cutover');
  assert.equal(body.providerWritesAuthorized, false);
  assert.equal(body.accounts[0]?.balanceMicros, '1000000');
  assert.equal(body.reservations[0]?.state, 'reserved');
  assert.equal('data' in (body.accounts[0] ?? {}), false);
  assert.equal('data' in (body.reservations[0] ?? {}), false);
  const unauthenticated = await routes.request('/research-credit');
  assert.equal(unauthenticated.status, 401);
});

test('research-credit bootstrap audit compares legacy and ledger state without writing', async () => {
  const store = new InMemoryResearchCreditStore();
  const owner = '0x2222222222222222222222222222222222222222';
  await store.ensureAccount({ owner, initialCreditUsdc: '0.5', now: 120 });
  const routes = createAdminAgentRuntimeRoutes(
    undefined, undefined, undefined, undefined, undefined, undefined, () => store, undefined,
    () => ({
      list: async () => [{ owner, active: true, creditUsdc: 1.5, updatedAt: 100 }],
    }),
  );
  const response = await routes.request('/research-credit/bootstrap-audit?owner=0x2222222222222222222222222222222222222222', {
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    mode: string;
    authoritativeResearchCredit: string;
    migrationWritesAuthorized: boolean;
    plans: Array<{ action: string; reason: string; legacyCreditMicros: string; ledgerBalanceMicros?: string }>;
  };
  assert.equal(body.mode, 'read-only-operational');
  assert.equal(body.authoritativeResearchCredit, 'legacy-until-explicit-cutover');
  assert.equal(body.migrationWritesAuthorized, false);
  assert.deepEqual(body.plans, [{
    owner, action: 'review-required', reason: 'LEGACY_LEDGER_MISMATCH',
    legacyActive: true, legacyCreditMicros: '1500000', ledgerBalanceMicros: '500000',
    ledgerReservedMicros: '0', ledgerVersion: 1, legacyUpdatedAt: 100, ledgerUpdatedAt: 120,
  }]);
  assert.equal((await routes.request('/research-credit/bootstrap-audit')).status, 401);
  assert.equal((await store.getAccount(owner))?.balanceMicros, '500000');
});

async function seededStore(): Promise<InMemoryBuyerTimerParityAuditStore> {
  const store = new InMemoryBuyerTimerParityAuditStore();
  await store.ensureSchedule({
    jobId: 'job-1',
    kind: 'collection',
    scheduleVersion: 1,
    scheduledFor: 1_000,
    snapshotRevision: 1,
    createdAt: 900,
  });
  const decision = {
    action: 'propose_match' as const,
    seller: 'seller-a',
    priceUsdc: '90',
    reason: 'at-or-under-budget' as const,
    candidateQueue: ['seller-a'],
  };
  await store.recordComparison({
    jobId: 'job-1',
    kind: 'collection',
    scheduleVersion: 1,
    snapshotRevision: 2,
    observedAt: 1_000,
    legacyDecision: decision,
    plannerDecision: decision,
  });
  return store;
}

test('buyer timer parity report fails closed without the admin token', async () => {
  const store = await seededStore();
  const routes = createAdminAgentRuntimeRoutes(() => store);
  const response = await routes.request('/buyer-timer-parity');
  assert.equal(response.status, 401);
});

test('buyer timer parity report is read-only, filterable, and explicit about authority', async () => {
  const store = await seededStore();
  const routes = createAdminAgentRuntimeRoutes(() => store);
  const response = await routes.request(
    '/buyer-timer-parity?comparison=matched&kind=collection&limit=10',
    { headers: { 'x-admin-token': 'phase3c-admin-test-token' } },
  );
  assert.equal(response.status, 200);
  const body = await response.json() as {
    mode: string;
    authoritativeTimers: string;
    summary: { total: number };
    records: Array<{ comparisonStatus: string; kind: string }>;
  };
  assert.equal(body.mode, 'read-only-shadow');
  assert.equal(body.authoritativeTimers, 'legacy');
  assert.equal(body.summary.total, 1);
  assert.deepEqual(body.records.map((record) => [record.kind, record.comparisonStatus]), [
    ['collection', 'matched'],
  ]);

  const writeResponse = await routes.request('/buyer-timer-parity', {
    method: 'POST',
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(writeResponse.status, 404);
});

test('matching shadow report is admin-only, read-only, and explicit about legacy authority', async () => {
  const store = new InMemoryMatchingAuditStore();
  await store.record({
    observationKey: 'matching-admin-1',
    source: 'buyer-bids',
    mandateId: 'mandate-1',
    mandateVersion: 1,
    legacyCandidateIds: ['seller-a'],
    shadowCandidateIds: ['seller-a'],
    evaluations: [],
    observedAt: 1_000,
  });
  const routes = createAdminAgentRuntimeRoutes(() => null, () => store);
  const response = await routes.request('/matching-shadow?source=buyer-bids&comparison=matched', {
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    mode: string;
    authoritativeMatching: string;
    summary: { total: number };
    records: Array<{ comparisonStatus: string }>;
  };
  assert.equal(body.mode, 'read-only-shadow');
  assert.equal(body.authoritativeMatching, 'legacy');
  assert.equal(body.summary.total, 1);
  assert.deepEqual(body.records.map((record) => record.comparisonStatus), ['matched']);
  const writeResponse = await routes.request('/matching-shadow', {
    method: 'POST',
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(writeResponse.status, 404);
});

test('matching shadow review filter is read-only and exposes explicit review reasons', async () => {
  const store = new InMemoryMatchingAuditStore();
  await store.record({
    observationKey: 'matching-review-queue',
    source: 'buyer-bids',
    mandateId: 'mandate-review',
    mandateVersion: 1,
    legacyCandidateIds: ['seller-a'],
    shadowCandidateIds: ['seller-b'],
    evaluations: [],
    observedAt: 1_000,
  });
  await store.record({
    observationKey: 'matching-review-clean',
    source: 'buyer-bids',
    mandateId: 'mandate-review',
    mandateVersion: 1,
    legacyCandidateIds: ['seller-b'],
    shadowCandidateIds: ['seller-b'],
    evaluations: [],
    observedAt: 900,
  });
  const routes = createAdminAgentRuntimeRoutes(() => null, () => store);
  const response = await routes.request('/matching-shadow?review=required', {
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    records: Array<{ observationKey: string }>;
    reviewQueue: Array<{ observationKey: string; reasons: string[] }>;
  };
  assert.deepEqual(body.records.map((record) => record.observationKey), ['matching-review-queue']);
  assert.deepEqual(body.reviewQueue, [{
    observationKey: 'matching-review-queue',
    source: 'buyer-bids',
    mandateId: 'mandate-review',
    mandateVersion: 1,
    observedAt: 1_000,
    reasons: ['winner-divergence', 'false-negative'],
    legacyWinnerId: 'seller-a',
    shadowWinnerId: 'seller-b',
  }]);
  const writeResponse = await routes.request('/matching-shadow?review=required', {
    method: 'POST',
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(writeResponse.status, 404);
});

test('matching shadow review ledger is admin-only, immutable, and never changes winner authority', async () => {
  const matching = new InMemoryMatchingAuditStore();
  await matching.record({
    observationKey: 'matching-review-ledger',
    source: 'buyer-bids',
    mandateId: 'mandate-review-ledger',
    mandateVersion: 2,
    legacyCandidateIds: ['seller-legacy'],
    shadowCandidateIds: ['seller-shadow'],
    evaluations: [],
    observedAt: 2_000,
  });
  const reviews = new InMemoryMatchingAuditReviewStore();
  const routes = createAdminAgentRuntimeRoutes(
    () => null,
    () => matching,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => reviews,
  );

  assert.equal((await routes.request('/matching-shadow/reviews')).status, 401);
  const response = await routes.request('/matching-shadow/reviews', {
    method: 'POST',
    headers: {
      'x-admin-token': 'phase3c-admin-test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      reviewId: 'review-ledger-1',
      observationKey: 'matching-review-ledger',
      decision: 'retain_legacy',
      reviewer: 'operator-1',
      note: 'Shadow ranking lacks the legacy relationship context.',
    }),
  });
  assert.equal(response.status, 201);
  const body = await response.json() as {
    mode: string;
    winnerSelectionChanged: boolean;
    rolloutGateChanged: boolean;
    review: { observationKey: string; decision: string };
  };
  assert.equal(body.mode, 'read-only-matching-review');
  assert.equal(body.winnerSelectionChanged, false);
  assert.equal(body.rolloutGateChanged, false);
  assert.deepEqual(body.review, {
    observationKey: 'matching-review-ledger',
    decision: 'retain_legacy',
    reviewId: 'review-ledger-1',
    reviewer: 'operator-1',
    note: 'Shadow ranking lacks the legacy relationship context.',
    createdAt: body.review && (body.review as unknown as { createdAt: number }).createdAt,
  });
  const duplicate = await routes.request('/matching-shadow/reviews', {
    method: 'POST',
    headers: {
      'x-admin-token': 'phase3c-admin-test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      reviewId: 'review-ledger-1',
      observationKey: 'matching-review-ledger',
      decision: 'retain_legacy',
      reviewer: 'operator-1',
      note: 'Shadow ranking lacks the legacy relationship context.',
    }),
  });
  assert.equal(duplicate.status, 201);
  const listed = await routes.request('/matching-shadow/reviews?limit=10', {
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(listed.status, 200);
  const listedBody = await listed.json() as { reviews: Array<{ reviewId: string }> };
  assert.deepEqual(listedBody.reviews.map((review) => review.reviewId), ['review-ledger-1']);

  const clean = new InMemoryMatchingAuditStore();
  await clean.record({
    observationKey: 'matching-review-clean-ledger',
    source: 'buyer-bids',
    mandateId: 'mandate-review-ledger',
    mandateVersion: 2,
    legacyCandidateIds: ['seller-same'],
    shadowCandidateIds: ['seller-same'],
    evaluations: [],
    observedAt: 2_000,
  });
  const cleanRoutes = createAdminAgentRuntimeRoutes(
    () => null,
    () => clean,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => new InMemoryMatchingAuditReviewStore(),
  );
  const cleanResponse = await cleanRoutes.request('/matching-shadow/reviews', {
    method: 'POST',
    headers: {
      'x-admin-token': 'phase3c-admin-test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      reviewId: 'review-clean', observationKey: 'matching-review-clean-ledger',
      decision: 'accept_shadow', reviewer: 'operator-1',
    }),
  });
  assert.equal(cleanResponse.status, 409);
});

test('negotiation shadow report is admin-only, read-only, and explicit about legacy authority', async () => {
  const store = new InMemoryNegotiationShadowAuditStore([{
    taskId: 'task-negotiation-1',
    dealRoomId: 'room-1',
    state: 'succeeded',
    idempotencyKey: 'negotiation:room-1:1',
    attempt: 0,
    createdAt: 100,
    updatedAt: 200,
    checkpoint: {
      phase: 'negotiation.turn',
      sequence: 1,
      data: { mode: 'read-only-shadow', offerVersion: 1 },
    },
  }]);
  const routes = createAdminAgentRuntimeRoutes(() => null, () => null, () => store);
  const response = await routes.request('/negotiation-shadow?limit=10', {
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    mode: string;
    authoritativeNegotiation: string;
    summary: { total: number; checkpointed: number };
    records: Array<{ taskId: string }>;
  };
  assert.equal(body.mode, 'read-only-shadow');
  assert.equal(body.authoritativeNegotiation, 'legacy');
  assert.equal(body.summary.total, 1);
  assert.equal(body.summary.checkpointed, 1);
  assert.equal(body.records[0]?.taskId, 'task-negotiation-1');
  const writeResponse = await routes.request('/negotiation-shadow', {
    method: 'POST',
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(writeResponse.status, 404);
});

test('evidence shadow report is admin-only, read-only, and keeps uncertain state visible', async () => {
  const store = new InMemoryEvidenceRuntimeAuditStore({
    needs: [{
      id: 'need-1', dealRoomId: 'room-1', needKey: 'need-key-1', kind: 'completed-transactions',
      state: 'open', riskClass: 'standard', version: 1, createdAt: 100, updatedAt: 100, data: {},
    }],
    purchases: [{
      id: 'purchase-1', evidenceNeedId: 'need-1', idempotencyKey: 'evidence:1', providerId: 'provider-1',
      state: 'unknown', priceUsdc: '0.02', version: 1, createdAt: 100, updatedAt: 100, data: {},
    }],
    blockers: [{
      id: 'blocker-1', dealRoomId: 'room-1', blockerKey: 'stake:1', kind: 'STAKE_SHORTFALL', subject: 'seller-1',
      state: 'open', version: 1, createdAt: 100, updatedAt: 100, data: {},
    }],
  });
  const routes = createAdminAgentRuntimeRoutes(() => null, () => null, () => null, () => store);
  const response = await routes.request('/evidence-shadow?limit=10', {
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    mode: string;
    authoritativeEvidence: string;
    summary: { unknownPurchases: number; openBlockers: number };
    records: { purchases: Array<{ state: string }>; blockers: Array<{ state: string }> };
  };
  assert.equal(body.mode, 'read-only-shadow');
  assert.equal(body.authoritativeEvidence, 'legacy');
  assert.equal(body.summary.unknownPurchases, 1);
  assert.equal(body.summary.openBlockers, 1);
  assert.equal(body.records.purchases[0]?.state, 'unknown');
  assert.equal(body.records.blockers[0]?.state, 'open');
  const writeResponse = await routes.request('/evidence-shadow', {
    method: 'POST',
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(writeResponse.status, 404);
});

test('rollout gate keeps needs-more-evidence review blocked', async () => {
  const matching = new InMemoryMatchingAuditStore();
  await matching.record({
    observationKey: 'rollout-needs-evidence', source: 'buyer-bids', mandateId: 'mandate-needs-evidence',
    mandateVersion: 1, legacyCandidateIds: ['legacy-winner'], shadowCandidateIds: ['shadow-winner'],
    evaluations: [], observedAt: 100,
  });
  const reviews = new InMemoryMatchingAuditReviewStore();
  await reviews.record({
    reviewId: 'review-needs-evidence', observationKey: 'rollout-needs-evidence',
    decision: 'needs_more_evidence', reviewer: 'operator', createdAt: 200,
  });
  const routes = createAdminAgentRuntimeRoutes(
    () => null, () => matching, () => null, () => null, () => null, () => null,
    undefined, undefined, undefined, undefined, () => reviews,
  );
  const response = await routes.request(
    '/rollout-gate?minimumObservations=1&maximumStaleOfferAcceptances=0',
    { headers: { 'x-admin-token': 'phase3c-admin-test-token' } },
  );
  assert.equal(response.status, 200);
  const body = await response.json() as {
    metrics: { matchingReviewsPending: number; matchingReviewsNeedingEvidence: number };
    matchingReviewCoverage: { pendingCount: number; needsMoreEvidenceCount: number };
    gate: { eligible: boolean; reasons: string[] };
  };
  assert.equal(body.metrics.matchingReviewsPending, 0);
  assert.equal(body.metrics.matchingReviewsNeedingEvidence, 1);
  assert.equal(body.matchingReviewCoverage.pendingCount, 0);
  assert.equal(body.matchingReviewCoverage.needsMoreEvidenceCount, 1);
  assert.ok(body.gate.reasons.includes('MATCHING_REVIEW_NEEDS_EVIDENCE'));
  assert.equal(body.gate.eligible, false);
});

test('financial shadow report is admin-only, read-only, and keeps unknown provider state visible', async () => {
  const store = new InMemoryFinancialRuntimeRepository();
  const created = await store.recordDecision({
    commandId: 'command-1', idempotencyKey: 'financial:1', operation: 'STAKE', amountUsdc: '5', amountMicros: '5000000',
    sourceAddress: '0x1111111111111111111111111111111111111111',
    destinationAddress: '0x2222222222222222222222222222222222222222',
    expectedDealRoomVersion: 1, mandateVersion: 1, decision: 'AUTHORIZED', reason: 'POLICY_ACCEPTED', data: {}, now: 100,
  });
  await store.recordProviderUpdate(created.record.idempotencyKey, created.record.version, {
    lifecycle: 'UNKNOWN', providerId: 'circle-1',
  }, 200);
  const routes = createAdminAgentRuntimeRoutes(() => null, () => null, () => null, () => null, () => store);
  const response = await routes.request('/financial-shadow?limit=10', {
    headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    mode: string;
    reconciliationWorkerEnabled: boolean;
    authoritativeFinancial: string;
    providerWritesAuthorized: boolean;
    summary: { total: number; unknown: number };
    records: Array<{ providerLifecycle: string }>;
  };
  assert.equal(body.mode, 'read-only-shadow');
  assert.equal(body.reconciliationWorkerEnabled, false);
  assert.equal(body.authoritativeFinancial, 'legacy');
  assert.equal(body.providerWritesAuthorized, false);
  assert.equal(body.summary.total, 1);
  assert.equal(body.summary.unknown, 1);
  assert.equal(body.records[0]?.providerLifecycle, 'UNKNOWN');
  const writeResponse = await routes.request('/financial-shadow', {
    method: 'POST', headers: { 'x-admin-token': 'phase3c-admin-test-token' },
  });
  assert.equal(writeResponse.status, 404);
});
