import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { SqlExecutor } from '../db/migrations.js';
import type { EvidenceQualificationShadowObservation } from '../agents/evidenceQualificationShadow.js';

const databaseUrl = process.env.SHADOW_SOAK_DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('SHADOW_SOAK_DATABASE_URL is required; refusing to use DATABASE_URL');
}
if (process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be unset for the disposable shadow soak');
}

const adminToken = process.env.SHADOW_SOAK_ADMIN_TOKEN?.trim() || randomUUID();
process.env.DATABASE_URL = databaseUrl;
process.env.ADMIN_API_TOKEN = adminToken;
process.env.AGENT_RUNTIME_V2_ENABLED = '1';
process.env.MATCH_ENGINE_V2_SHADOW = '1';
process.env.NEGOTIATION_V2_SHADOW = '1';
process.env.EVIDENCE_V2_SHADOW = '1';
process.env.NEGOTIATION_V2_ENABLED = '0';
process.env.FINANCIAL_COMMANDS_V2_ENABLED = '0';
process.env.EVENT_OUTBOX_V2_ENABLED = '0';
process.env.X402_PAID_SIGNALS_ENABLED = '0';
process.env.RESEARCH_AWAIT_ENABLED = '0';
process.env.SECURITY_MATCH_GATE_ENABLED = '0';
process.env.TREND_NUDGES_ENABLED = '0';
process.env.SCOUT_ENABLED = '0';
process.env.REPUTATION_RECONCILER_ENABLED = '0';
process.env.ATTESTATION_ISSUANCE_ENABLED = '0';
process.env.SUPERVISOR_PROACTIVE_ENABLED = '0';
process.env.CIRCLE_GAS_STATION_ENABLED = '0';
process.env.ARC_TESTNET_RPC_URL = 'http://127.0.0.1:9';
process.env.ARC_TESTNET_WSS_URL = 'ws://127.0.0.1:9';

const { runNumberedMigrations } = await import('../db/migrations.js');
const { PostgresAgentRuntimeRepository } = await import('../db/agentRuntime.js');
const { DurableTaskRunner, PostgresDurableTaskStore } = await import('../agents/durableTaskRunner.js');
const {
  PostgresBuyerRuntimeSnapshotStore,
  createBuyerTimerShadowHandlers,
  createBuyerTimerShadowObserver,
} = await import('../agents/buyerTaskShadow.js');
const {
  PostgresBuyerTimerParityAuditStore,
  createBuyerTimerParityObserver,
} = await import('../agents/buyerTaskParity.js');
const { PostgresMatchingAuditStore } = await import('../matching/audit.js');
const { createMatchingShadowObserver } = await import('../matching/shadow.js');
const {
  PostgresNegotiationShadowAuditStore,
  createNegotiationShadowHandlers,
  createNegotiationShadowObserver,
} = await import('../agents/negotiationTaskShadow.js');
const { PostgresEvidenceRuntimeAuditStore, PostgresEvidenceRuntimeRepository } = await import('../evidence/runtime.js');
const { PostgresFinancialRuntimeRepository } = await import('../financial/runtime.js');
const {
  createFinancialCommandShadowHandlers,
  createFinancialCommandShadowObserver,
} = await import('../agents/financialCommandShadow.js');
const {
  createStakeQualificationShadowHandlers,
  createStakeQualificationShadowObserver,
} = await import('../agents/stakeQualificationShadow.js');
const {
  createEvidenceQualificationShadowHandlers,
  createEvidenceQualificationShadowObserver,
} = await import('../agents/evidenceQualificationShadow.js');
const { BUYER_TIMER_SOAK_FIXTURES, BUYER_TIMER_SOAK_NOW, BUYER_TIMER_SOAK_STALE_FIXTURES } =
  await import('../agents/buyerTaskSoakFixtures.js');
const { createAdminAgentRuntimeRoutes } = await import('../routes/adminAgentRuntime.js');

const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
const schema = `karwan_shadow_soak_${randomUUID().replaceAll('-', '')}`;
assert.match(schema, /^karwan_shadow_soak_[a-f0-9]{32}$/);
const client = await pool.connect();

const transaction = async <T>(operation: (executor: typeof client) => Promise<T>): Promise<T> => {
  const tx = await pool.connect();
  await tx.query('BEGIN');
  try {
    await tx.query(`SET LOCAL search_path TO "${schema}"`);
    const result = await operation(tx);
    await tx.query('COMMIT');
    return result;
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally {
    tx.release();
  }
};

// The admin rollout report intentionally reads several audit stores in
// parallel. Give those reads independent pooled clients while pinning every
// query to this disposable schema; sharing one pg.Client would serialize the
// reads and hide a production-only concurrency bug in the soak harness.
const scopedExecutor: SqlExecutor = {
  async query<TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) {
    const scoped = await pool.connect();
    try {
      await scoped.query(`SET search_path TO "${schema}"`);
      const result = await scoped.query<TRow>(sql, params as unknown[] | undefined);
      return { rows: result.rows };
    } finally {
      scoped.release();
    }
  },
};

try {
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET search_path TO "${schema}"`);
  await runNumberedMigrations(client);

  const snapshotStore = new PostgresBuyerRuntimeSnapshotStore(client);
  const taskStore = new PostgresDurableTaskStore(client, transaction);
  const parityStore = new PostgresBuyerTimerParityAuditStore(client);
  const matchingAuditStore = new PostgresMatchingAuditStore(client);
  const negotiationAuditStore = new PostgresNegotiationShadowAuditStore(client);
  const financialRuntime = new PostgresFinancialRuntimeRepository(client, transaction);
  const routeParityStore = new PostgresBuyerTimerParityAuditStore(scopedExecutor);
  const routeMatchingStore = new PostgresMatchingAuditStore(scopedExecutor);
  const routeNegotiationStore = new PostgresNegotiationShadowAuditStore(scopedExecutor);
  const routeEvidenceStore = new PostgresEvidenceRuntimeAuditStore(scopedExecutor);
  const routeFinancialStore = new PostgresFinancialRuntimeRepository(scopedExecutor, transaction);
  const routeTaskStore = new PostgresDurableTaskStore(scopedExecutor, transaction);
  const roomRepository = new PostgresAgentRuntimeRepository(client);
  await client.query(
    `INSERT INTO deal_rooms (id, job_id, state, version, created_at, updated_at, data)
     VALUES ($1, $2, $3, $4, $5, $5, $6::jsonb)`,
    [
      'live-soak-room',
      'live-soak-job',
      'open',
      1,
      BUYER_TIMER_SOAK_NOW,
      JSON.stringify({ source: 'controlled-read-only-soak' }),
    ],
  );
  const observeShadow = createBuyerTimerShadowObserver(taskStore, snapshotStore, parityStore);
  const observeParity = createBuyerTimerParityObserver(parityStore);
  const observeNegotiation = createNegotiationShadowObserver(taskStore);
  const observeEvidence = createEvidenceQualificationShadowObserver(taskStore);
  const evidenceRuntime = new PostgresEvidenceRuntimeRepository(client, transaction);

  for (const fixture of BUYER_TIMER_SOAK_FIXTURES) {
    await observeShadow({ snapshot: fixture.snapshot, schedule: fixture.schedule });
    await observeShadow({ snapshot: fixture.snapshot, schedule: fixture.schedule });
    await observeParity({
      snapshot: fixture.snapshot,
      schedule: fixture.schedule,
      legacyDecision: fixture.legacyDecision,
      observedAt: BUYER_TIMER_SOAK_NOW,
    });
  }

  const stale = BUYER_TIMER_SOAK_STALE_FIXTURES;
  await observeShadow({ snapshot: stale.old.snapshot, schedule: stale.old.schedule });
  await observeShadow({ snapshot: stale.current.snapshot, schedule: stale.current.schedule });
  await observeShadow({ snapshot: stale.current.snapshot, schedule: stale.current.schedule });
  await observeParity({
    snapshot: stale.current.snapshot,
    schedule: stale.current.schedule,
    legacyDecision: {
      ...stale.current.legacyDecision,
      candidateQueue: [...stale.current.legacyDecision.candidateQueue],
    },
    observedAt: BUYER_TIMER_SOAK_NOW,
  });

  const crashed = await taskStore.claimDue({
    workerId: 'live-soak-crashed-worker',
    now: BUYER_TIMER_SOAK_NOW,
    leaseMs: 1_000,
    limit: 1,
  });
  assert.equal(crashed.length, 1, 'expected one simulated crashed lease');

  const runner = new DurableTaskRunner(
    taskStore,
    {
      ...createBuyerTimerShadowHandlers(snapshotStore, {
        clock: () => BUYER_TIMER_SOAK_NOW + 1_500,
        parityStore,
      }),
      ...createNegotiationShadowHandlers({ clock: () => BUYER_TIMER_SOAK_NOW + 1_500 }),
    },
    {
      workerId: 'live-soak-restarted-worker',
      clock: () => BUYER_TIMER_SOAK_NOW + 1_500,
      leaseMs: 1_000,
      batchSize: BUYER_TIMER_SOAK_FIXTURES.length + 4,
    },
  );
  const runnerResult = await runner.runOnce();
  const parity = await parityStore.summary();
  assert.equal(parity.comparison.diverged, 0);
  assert.equal(parity.task.diverged, 0);
  assert.equal(runnerResult.deadLettered, 0);
  assert.equal(runnerResult.leaseLost, 0);
  assert.equal(parity.task['stale-suppressed'], 2);

  const negotiationObservation = {
    data: {
      dealRoomId: 'live-soak-room',
      commandId: 'live-soak-negotiation-command-1',
      idempotencyKey: 'live-soak-negotiation:room-1',
      expectedDealRoomVersion: 1,
      rawOffer: {
        dealRoomId: 'live-soak-room',
        offerId: 'live-soak-offer-1',
        offerVersion: 1,
        senderRole: 'buyer',
        recipientRole: 'seller',
        kind: 'OPENING',
        action: 'REVISE_PRICE',
        priceUsdc: '80',
        deadlineUnix: 1_900,
        buyerMandateVersion: 1,
        sellerMandateVersion: 1,
        terms: {
          scope: 'deliver the requested service',
          delivery: 'within the agreed deadline',
          paymentTerms: 'release after verified delivery',
        },
      },
      mandates: {
        buyerMaxPriceUsdc: '100',
        sellerMinPriceUsdc: '70',
        earliestDeadlineUnix: 1_200,
        latestDeadlineUnix: 2_000,
        buyerMandateVersion: 1,
        sellerMandateVersion: 1,
      },
      observedAtUnix: BUYER_TIMER_SOAK_NOW,
      source: 'buyer-bids',
    },
  } as const;
  await observeNegotiation(negotiationObservation);
  await observeNegotiation(negotiationObservation);

  const negotiationRunner = new DurableTaskRunner(
    taskStore,
    createNegotiationShadowHandlers({ clock: () => BUYER_TIMER_SOAK_NOW + 1_500 }),
    {
      workerId: 'live-soak-negotiation-restarted-worker',
      clock: () => BUYER_TIMER_SOAK_NOW + 1_500,
      leaseMs: 1_000,
      batchSize: 2,
    },
  );
  const negotiationRunnerResult = await negotiationRunner.runOnce();
  assert.equal(negotiationRunnerResult.succeeded, 1);
  const negotiationSummary = await negotiationAuditStore.summary();
  assert.equal(negotiationSummary.total, 1);
  assert.equal(negotiationSummary.checkpointed, 1);
  assert.equal(negotiationSummary.rejected, 0);

  const evidenceObservation: EvidenceQualificationShadowObservation = {
    data: {
      dealRoomId: 'live-soak-room',
      idempotencyKey: 'live-soak:evidence:room-1:seller-1:v1',
      observedAtUnix: BUYER_TIMER_SOAK_NOW,
      source: 'manual-fixture',
      need: {
        id: 'live-soak-evidence-need',
        needKey: 'live-soak:evidence:room-1:seller-1:v1',
        kind: 'completed-transactions',
        riskClass: 'standard',
        data: { subject: 'seller-1', decision: 'ranking' },
      },
      purchase: {
        id: 'live-soak-evidence-purchase',
        idempotencyKey: 'live-soak:evidence:room-1:seller-1:v1',
        providerId: 'controlled-provider-fixture',
        priceUsdc: '0.02',
        observedState: 'unknown',
        providerTransactionId: 'controlled-provider-tx',
        data: { mode: 'controlled-no-provider-call' },
      },
      snapshot: {
        id: 'live-soak-evidence-snapshot',
        purchaseId: 'live-soak-evidence-purchase',
        source: 'x402',
        capturedAt: BUYER_TIMER_SOAK_NOW + 1,
        reliability: 0,
        state: 'unknown',
        responseHash: 'controlled:unknown-response',
        provenance: ['controlled-provider-tx'],
      },
      blocker: {
        id: 'live-soak-qualification-blocker',
        blockerKey: 'live-soak:stake:room-1:seller-1:v1',
        kind: 'STAKE_SHORTFALL',
        subject: 'seller-1',
        data: { shortfallUsdc: '25', resolution: 'confirmed-funding' },
      },
    },
  };
  await observeEvidence(evidenceObservation);
  await observeEvidence(evidenceObservation);
  const evidenceRunner = new DurableTaskRunner(
    taskStore,
    createEvidenceQualificationShadowHandlers(evidenceRuntime, { clock: () => BUYER_TIMER_SOAK_NOW + 1_500 }),
    {
      workerId: 'live-soak-evidence-restarted-worker',
      clock: () => BUYER_TIMER_SOAK_NOW + 1_500,
      leaseMs: 1_000,
      batchSize: 2,
    },
  );
  const evidenceRunnerResult = await evidenceRunner.runOnce();
  assert.equal(evidenceRunnerResult.succeeded, 1);
  const evidenceNeed = await evidenceRuntime.getNeed('live-soak-evidence-need');
  const evidenceUnknown = await evidenceRuntime.getPurchase('live-soak-evidence-purchase');
  const evidenceSnapshot = (await evidenceRuntime.listSnapshots('live-soak-evidence-need'))[0];
  const qualificationBlocker = await evidenceRuntime.getBlocker('live-soak-qualification-blocker');
  assert.ok(evidenceNeed);
  assert.equal(evidenceUnknown?.state, 'unknown');
  assert.equal(evidenceSnapshot?.state, 'unknown');
  assert.equal(qualificationBlocker?.state, 'open');

  const observeMatching = createMatchingShadowObserver(matchingAuditStore);
  await observeMatching({
    source: 'buyer-bids',
    observationKey: 'live-soak:matching:1',
    mandate: {
      mandateId: 'live-soak-mandate',
      version: 1,
      ownerAddress: '0xbuyer',
      lane: 'service',
      budgetUsdc: '100',
      maxBudgetUsdc: '100',
      maxDeadlineUnix: 2_000,
      requiredKeywords: ['api', 'backend'],
    },
    candidates: [
      {
        candidateId: 'seller-a',
        version: 1,
        kind: 'profile',
        sellerAgentAddress: '0xseller-a',
        sellerOwnerAddress: '0xowner-a',
        lane: 'service',
        keywords: ['api', 'backend'],
        priceUsdc: '90',
        deadlineUnix: 1_500,
        capacityAvailable: true,
        tier: 'established',
      },
      {
        candidateId: 'seller-b',
        version: 1,
        kind: 'listing',
        sellerAgentAddress: '0xseller-b',
        sellerOwnerAddress: '0xowner-b',
        lane: 'service',
        keywords: ['api'],
        priceUsdc: '100',
        deadlineUnix: 1_500,
        capacityAvailable: true,
        tier: 'cold',
      },
    ],
    legacyCandidateIds: ['seller-a', 'seller-b'],
    nowUnix: 1_000,
  });
  const matchingSummary = await matchingAuditStore.summary();
  assert.deepEqual(matchingSummary.comparison, { matched: 1, diverged: 0 });

  const routes = createAdminAgentRuntimeRoutes(
    () => routeParityStore,
    () => routeMatchingStore,
    () => routeNegotiationStore,
    () => routeEvidenceStore,
    () => routeFinancialStore,
    () => routeTaskStore,
    () => null,
    () => routeTaskStore,
    () => ({ list: async () => [] }),
    () => null,
    () => null,
  );
  const response = await routes.request('http://local.test/buyer-timer-parity', {
    headers: { 'X-Admin-Token': adminToken },
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    mode: string;
    enabled: boolean;
    authoritativeTimers: string;
    summary: typeof parity;
    recordWindow: { scanned: number; maximum: number };
    records: unknown[];
  };
  assert.equal(body.mode, 'read-only-shadow');
  assert.equal(body.enabled, true);
  assert.equal(body.authoritativeTimers, 'legacy');
  assert.deepEqual(body.summary, parity);
  assert.equal(body.recordWindow.maximum, 500);
  assert.equal(body.records.length, parity.total);
  const pendingAfterSoak = body.records.filter((record) => {
    const candidate = record as { comparisonStatus?: string; taskStatus?: string };
    return candidate.comparisonStatus === 'pending' || candidate.taskStatus === 'pending';
  }).length;
  const matchingResponse = await routes.request('http://local.test/matching-shadow?comparison=matched', {
    headers: { 'X-Admin-Token': adminToken },
  });
  assert.equal(matchingResponse.status, 200);
  const matchingBody = (await matchingResponse.json()) as {
    mode: string;
    enabled: boolean;
    authoritativeMatching: string;
    summary: typeof matchingSummary;
    records: unknown[];
  };
  assert.equal(matchingBody.mode, 'read-only-shadow');
  assert.equal(matchingBody.enabled, true);
  assert.equal(matchingBody.authoritativeMatching, 'legacy');
  assert.deepEqual(matchingBody.summary, matchingSummary);
  assert.equal(matchingBody.records.length, matchingSummary.total);

  const negotiationResponse = await routes.request('http://local.test/negotiation-shadow', {
    headers: { 'X-Admin-Token': adminToken },
  });
  assert.equal(negotiationResponse.status, 200);
  const negotiationBody = (await negotiationResponse.json()) as {
    mode: string;
    enabled: boolean;
    authoritativeNegotiation: string;
    summary: typeof negotiationSummary;
    records: unknown[];
  };
  assert.equal(negotiationBody.mode, 'read-only-shadow');
  assert.equal(negotiationBody.enabled, true);
  assert.equal(negotiationBody.authoritativeNegotiation, 'legacy');
  assert.deepEqual(negotiationBody.summary, negotiationSummary);
  assert.equal(negotiationBody.records.length, negotiationSummary.total);

  const evidenceResponse = await routes.request('http://local.test/evidence-shadow?limit=10', {
    headers: { 'X-Admin-Token': adminToken },
  });
  assert.equal(evidenceResponse.status, 200);
  const evidenceBody = (await evidenceResponse.json()) as {
    mode: string;
    enabled: boolean;
    authoritativeEvidence: string;
    summary: { unknownPurchases: number; openBlockers: number };
    records: { purchases: Array<{ state: string }>; blockers: Array<{ state: string }> };
  };
  assert.equal(evidenceBody.mode, 'read-only-shadow');
  assert.equal(evidenceBody.enabled, true);
  assert.equal(evidenceBody.authoritativeEvidence, 'legacy');
  assert.equal(evidenceBody.summary.unknownPurchases, 1);
  assert.equal(evidenceBody.summary.openBlockers, 1);
  assert.equal(evidenceBody.records.purchases[0]?.state, 'unknown');
  assert.equal(evidenceBody.records.blockers[0]?.state, 'open');

  // Cross-domain shadow coverage: a stake shortfall creates a durable blocker
  // and projects one approval-required financial command. The financial
  // shadow handler records policy/lifecycle state only; it never calls Circle,
  // signs a wallet, or mutates funds.
  const stakeObservation = {
    dealRoomId: 'live-soak-stake-room',
    idempotencyKey: 'live-soak:stake:shortfall:v1',
    observedAtUnix: BUYER_TIMER_SOAK_NOW,
    source: 'manual-fixture' as const,
    confirmedFunding: false,
    requirement: {
      requirementVersion: 1,
      requiredStakeUsdc: '100',
      stakeOwner: '0x1111111111111111111111111111111111111111',
      fundingWallet: '0x3333333333333333333333333333333333333333',
      vaultAddress: '0x2222222222222222222222222222222222222222',
      asset: 'USDC' as const,
      network: 'arc-testnet',
    },
    snapshot: {
      freeStakeUsdc: '25',
      liquidFundingUsdc: '0',
      dealRoomOpen: true,
      mandateVersion: 1,
      expectedRequirementVersion: 1,
    },
    policy: {
      autonomousMaxUsdc: '50',
      allowedVaults: ['0x2222222222222222222222222222222222222222'],
      allowedNetworks: ['arc-testnet'],
      allowedAssets: ['USDC'],
    },
    blocker: {
      id: 'live-soak-stake-blocker',
      blockerKey: 'live-soak:stake:shortfall:v1',
      kind: 'STAKE_SHORTFALL',
      subject: 'seller-live-soak',
      data: { mode: 'controlled-read-only-shadow' },
    },
  };
  const observeFinancial = createFinancialCommandShadowObserver(taskStore, roomRepository);
  const observeStake = createStakeQualificationShadowObserver(taskStore, roomRepository);
  await observeStake({ data: stakeObservation });
  const duplicateStake = await observeStake({ data: stakeObservation });
  assert.equal(duplicateStake.created, false, 'duplicate stake observation must remain idempotent');
  const stakeRunner = new DurableTaskRunner(
    taskStore,
    {
      ...createStakeQualificationShadowHandlers(evidenceRuntime, {
        financialObserver: observeFinancial,
        clock: () => BUYER_TIMER_SOAK_NOW + 1_500,
      }),
      ...createFinancialCommandShadowHandlers(financialRuntime, {
        clock: () => BUYER_TIMER_SOAK_NOW + 1_500,
      }),
    },
    {
      workerId: 'live-soak-stake-shadow-worker',
      clock: () => BUYER_TIMER_SOAK_NOW + 1_500,
      leaseMs: 1_000,
      batchSize: 4,
    },
  );
  const stakeQualificationResult = await stakeRunner.runOnce();
  assert.equal(stakeQualificationResult.succeeded, 1);
  const stakeBlocker = await evidenceRuntime.getBlocker('live-soak-stake-blocker');
  assert.equal(stakeBlocker?.state, 'open');
  const financialProjectionResult = await stakeRunner.runOnce();
  assert.equal(financialProjectionResult.succeeded, 1);
  const financialSummary = await financialRuntime.summary();
  assert.equal(financialSummary.total, 1);
  assert.equal(financialSummary.approvalRequired, 1);
  assert.equal(financialSummary.unknown, 0);
  const financialRecord = (await financialRuntime.list(10))[0];
  assert.ok(financialRecord);
  assert.equal(financialRecord.providerLifecycle, 'CREATED');
  const financialCheckpoints = await taskStore.listCheckpoints(
    `task:financial:command:${financialRecord.idempotencyKey}`,
  );
  assert.equal(financialCheckpoints.length, 1);
  assert.equal((financialCheckpoints[0]?.data as { providerCallMade?: boolean }).providerCallMade, false);
  assert.equal((financialCheckpoints[0]?.data as { financialMutation?: boolean }).financialMutation, false);
  const financialResponse = await routes.request('http://local.test/financial-shadow?limit=10', {
    headers: { 'X-Admin-Token': adminToken },
  });
  assert.equal(financialResponse.status, 200);
  const financialBody = (await financialResponse.json()) as {
    mode: string;
    authoritativeFinancial: string;
    providerWritesAuthorized: boolean;
    summary: typeof financialSummary;
    records: Array<{ decision: string; providerLifecycle: string }>;
  };
  assert.equal(financialBody.mode, 'read-only-shadow');
  assert.equal(financialBody.authoritativeFinancial, 'legacy');
  assert.equal(financialBody.providerWritesAuthorized, false);
  assert.deepEqual(financialBody.summary, financialSummary);
  assert.equal(financialBody.records[0]?.decision, 'APPROVAL_REQUIRED');
  assert.equal(financialBody.records[0]?.providerLifecycle, 'CREATED');
  const rolloutResponse = await routes.request(
    '/rollout-gate?minimumObservations=1&maximumStaleOfferAcceptances=0&maximumUnknownEvidenceUsed=0&maximumEvidenceSettlementConflicts=0&maximumUncertainFinancialStates=0',
    { headers: { 'X-Admin-Token': adminToken } },
  );
  assert.equal(rolloutResponse.status, 200);
  const rolloutBody = (await rolloutResponse.json()) as {
    mode: string;
    authoritativeRoutes: string;
    financialMutationsAuthorized: boolean;
    metrics: { observations: number; unknownEvidenceUsed: number; uncertainFinancialStates: number };
    metricsComplete: boolean;
    missingMetrics: string[];
    gate: { eligible: boolean; killSwitch: boolean; reasons: string[] };
  };
  assert.equal(rolloutBody.mode, 'read-only-rollout-gate');
  assert.equal(rolloutBody.authoritativeRoutes, 'legacy');
  assert.equal(rolloutBody.financialMutationsAuthorized, false);
  assert.ok(rolloutBody.metrics.observations >= 15);
  assert.equal(rolloutBody.metrics.unknownEvidenceUsed, 1);
  assert.equal(rolloutBody.metrics.uncertainFinancialStates, 0);
  assert.equal(rolloutBody.metricsComplete, false);
  assert.equal(rolloutBody.gate.eligible, false);
  assert.equal(rolloutBody.gate.killSwitch, true);
  assert.ok(rolloutBody.gate.reasons.includes('UNCERTAIN_EVIDENCE_USED'));
  assert.ok(rolloutBody.gate.reasons.includes('METRICS_INCOMPLETE'));
  assert.ok(rolloutBody.missingMetrics.includes('matching.reviews'));
  assert.ok(rolloutBody.missingMetrics.includes('negotiation.staleOfferAcceptances'));

  console.log(JSON.stringify({
    mode: 'controlled-postgres-read-only-shadow-soak',
    database: 'disposable-schema',
    schema,
    flags: {
      AGENT_RUNTIME_V2_ENABLED: true,
      MATCH_ENGINE_V2_SHADOW: true,
      NEGOTIATION_V2_SHADOW: true,
      EVIDENCE_V2_SHADOW: true,
      NEGOTIATION_V2_ENABLED: false,
      FINANCIAL_COMMANDS_V2_ENABLED: false,
      EVENT_OUTBOX_V2_ENABLED: false,
    },
    authoritativeTimers: 'legacy',
    financialFlagsChanged: false,
    fixtureCount: BUYER_TIMER_SOAK_FIXTURES.length,
    schedulesObserved: BUYER_TIMER_SOAK_FIXTURES.length + 2,
    duplicateObservations: BUYER_TIMER_SOAK_FIXTURES.length + 1,
    crashedLeaseClaims: crashed.length,
    runner: runnerResult,
    parity,
    pendingAfterSoak,
    matchingShadow: {
      summary: matchingSummary,
      adminRoute: {
        status: matchingResponse.status,
        recordsReturned: matchingBody.records.length,
      },
    },
    negotiationShadow: {
      summary: negotiationSummary,
      runner: negotiationRunnerResult,
      adminRoute: {
        status: negotiationResponse.status,
        recordsReturned: negotiationBody.records.length,
      },
    },
    evidenceAndQualification: {
      needCreated: evidenceNeed !== null,
      purchaseState: evidenceUnknown?.state,
      snapshotState: evidenceSnapshot?.state,
      blockerState: qualificationBlocker?.state,
      runner: evidenceRunnerResult,
      adminRoute: {
        status: evidenceResponse.status,
        mode: evidenceBody.mode,
      },
    },
    financialAndStaking: {
      stakeBlockerState: stakeBlocker?.state,
      stakeQualificationRunner: stakeQualificationResult,
      financialProjectionRunner: financialProjectionResult,
      financial: financialSummary,
      adminRoute: {
        status: financialResponse.status,
        mode: financialBody.mode,
        recordsReturned: financialBody.records.length,
      },
      providerWritesAuthorized: financialBody.providerWritesAuthorized,
    },
    rolloutGate: {
      status: rolloutResponse.status,
      eligible: rolloutBody.gate.eligible,
      killSwitch: rolloutBody.gate.killSwitch,
      reasons: rolloutBody.gate.reasons,
      metricsComplete: rolloutBody.metricsComplete,
    },
    adminRoute: {
      status: response.status,
      mode: body.mode,
      enabled: body.enabled,
      recordWindow: body.recordWindow,
      recordsReturned: body.records.length,
    },
  }));
} finally {
  if (!/^karwan_shadow_soak_[a-f0-9]{32}$/.test(schema)) {
    throw new Error(`refusing to drop unexpected schema ${schema}`);
  }
  await client.query('RESET search_path');
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  client.release();
  await pool.end();
}
