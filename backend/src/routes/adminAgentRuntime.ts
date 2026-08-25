import { Hono } from 'hono';
import { z } from 'zod';
import { config } from '../config.js';
import { pgEnabled, postgresExecutor, withPostgresTransaction } from '../db/client.js';
import { listProfiles } from '../db/profiles.js';
import {
  PostgresBuyerTimerParityAuditStore,
  type BuyerTimerParityAuditStore,
} from '../agents/buyerTaskParity.js';
import {
  PostgresMatchingAuditStore,
  buildMatchingAuditReviewQueue,
  type MatchingAuditStore,
} from '../matching/audit.js';
import {
  PostgresMatchingAuditReviewStore,
  type MatchingAuditReviewStore,
} from '../matching/review.js';
import { buildMatchingReviewCoverage } from '../matching/reviewCoverage.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import {
  PostgresNegotiationShadowAuditStore,
  type NegotiationShadowAuditStore,
} from '../agents/negotiationTaskShadow.js';
import {
  PostgresEvidenceRuntimeAuditStore,
  type EvidenceRuntimeAuditStore,
} from '../evidence/runtime.js';
import {
  PostgresFinancialRuntimeRepository,
  type FinancialRuntimeAuditStore,
} from '../financial/runtime.js';
import {
  PostgresDurableTaskStore,
  type DurableTaskAuditStore,
  type DurableTaskStore,
  DeadLetterReplayConflictError,
  DeadLetterReplayStateError,
  isManualShadowReplayableTaskKind,
} from '../agents/durableTaskRunner.js';
import {
  PostgresResearchCreditStore,
  type ResearchCreditAuditStore,
} from '../evidence/researchCredit.js';
import {
  planResearchCreditBootstrap,
  type LegacyResearchCreditRecord,
} from '../evidence/researchCreditBootstrap.js';
import type { AgentTaskState } from '../domain/agentRuntimeState.js';
import { buildShadowRolloutReport } from '../rollout/report.js';
import {
  PostgresNegotiationCommandLedger,
  type NegotiationCommandAuditStore,
} from '../negotiation/commandLedger.js';

const listQuerySchema = z.object({
  jobId: z.string().trim().min(1).optional(),
  kind: z.enum(['collection', 'counter-timeout']).optional(),
  comparison: z.enum(['pending', 'matched', 'diverged']).optional(),
  task: z.enum([
    'pending',
    'awaiting-planner',
    'matched',
    'stale-suppressed',
    'diverged',
  ]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

type StoreFactory = () => BuyerTimerParityAuditStore | null;
type MatchingStoreFactory = () => MatchingAuditStore | null;
type MatchingReviewStoreFactory = () => MatchingAuditReviewStore | null;
type NegotiationStoreFactory = () => NegotiationShadowAuditStore | null;
type EvidenceStoreFactory = () => EvidenceRuntimeAuditStore | null;
type FinancialStoreFactory = () => FinancialRuntimeAuditStore | null;
type TaskStoreFactory = () => DurableTaskAuditStore | null;
type TaskReplayStoreFactory = () => Pick<DurableTaskStore, 'get' | 'replayDeadLetter'> | null;
type OperationAuditStore = Pick<DurableTaskAuditStore, 'listRecent'>
  & Pick<DurableTaskStore, 'listCheckpoints'>;
type OperationAuditStoreFactory = () => OperationAuditStore | null;
type ResearchCreditStoreFactory = () => ResearchCreditAuditStore | null;
interface LegacyResearchCreditReader {
  list(): Promise<readonly LegacyResearchCreditRecord[]>;
}
type LegacyResearchCreditReaderFactory = () => LegacyResearchCreditReader;
type NegotiationCommandAuditStoreFactory = () => NegotiationCommandAuditStore | null;

function defaultStoreFactory(): BuyerTimerParityAuditStore | null {
  return pgEnabled
    ? new PostgresBuyerTimerParityAuditStore(postgresExecutor())
    : null;
}

function defaultMatchingStoreFactory(): MatchingAuditStore | null {
  return pgEnabled ? new PostgresMatchingAuditStore(postgresExecutor()) : null;
}

function defaultMatchingReviewStoreFactory(): MatchingAuditReviewStore | null {
  return pgEnabled ? new PostgresMatchingAuditReviewStore(postgresExecutor()) : null;
}

function defaultNegotiationStoreFactory(): NegotiationShadowAuditStore | null {
  return pgEnabled ? new PostgresNegotiationShadowAuditStore(postgresExecutor()) : null;
}

function defaultEvidenceStoreFactory(): EvidenceRuntimeAuditStore | null {
  return pgEnabled ? new PostgresEvidenceRuntimeAuditStore(postgresExecutor()) : null;
}

function defaultFinancialStoreFactory(): FinancialRuntimeAuditStore | null {
  return pgEnabled ? new PostgresFinancialRuntimeRepository(postgresExecutor(), withPostgresTransaction) : null;
}

function defaultTaskStoreFactory(): DurableTaskAuditStore | null {
  return pgEnabled
    ? new PostgresDurableTaskStore(postgresExecutor(), withPostgresTransaction)
    : null;
}

function defaultTaskReplayStoreFactory(): ReturnType<TaskReplayStoreFactory> {
  return pgEnabled
    ? new PostgresDurableTaskStore(postgresExecutor(), withPostgresTransaction)
    : null;
}

function defaultOperationAuditStoreFactory(): OperationAuditStore | null {
  return pgEnabled
    ? new PostgresDurableTaskStore(postgresExecutor(), withPostgresTransaction)
    : null;
}

function defaultLegacyResearchCreditReaderFactory(): LegacyResearchCreditReader {
  return {
    async list() {
      const profiles = await listProfiles();
      return profiles.map((profile) => ({
        owner: profile.address,
        active: profile.research?.active === true,
        creditUsdc: profile.research?.creditUsdc ?? 0,
        updatedAt: profile.updatedAt,
      }));
    },
  };
}

function defaultResearchCreditStoreFactory(): ResearchCreditAuditStore | null {
  return pgEnabled
    ? new PostgresResearchCreditStore(postgresExecutor(), withPostgresTransaction)
    : null;
}

function defaultNegotiationCommandAuditStoreFactory(): NegotiationCommandAuditStore | null {
  return pgEnabled ? new PostgresNegotiationCommandLedger(postgresExecutor()) : null;
}

const taskStateSchema = z.enum([
  'pending', 'leased', 'running', 'waiting', 'failed', 'succeeded', 'dead_letter', 'cancelled',
] satisfies [AgentTaskState, ...AgentTaskState[]]);

export function createAdminAgentRuntimeRoutes(
  storeFactory: StoreFactory = defaultStoreFactory,
  matchingStoreFactory: MatchingStoreFactory = defaultMatchingStoreFactory,
  negotiationStoreFactory: NegotiationStoreFactory = defaultNegotiationStoreFactory,
  evidenceStoreFactory: EvidenceStoreFactory = defaultEvidenceStoreFactory,
  financialStoreFactory: FinancialStoreFactory = defaultFinancialStoreFactory,
  taskStoreFactory: TaskStoreFactory = defaultTaskStoreFactory,
  researchCreditStoreFactory: ResearchCreditStoreFactory = defaultResearchCreditStoreFactory,
  operationAuditStoreFactory: OperationAuditStoreFactory = defaultOperationAuditStoreFactory,
  legacyResearchCreditReaderFactory: LegacyResearchCreditReaderFactory = defaultLegacyResearchCreditReaderFactory,
  negotiationCommandAuditStoreFactory: NegotiationCommandAuditStoreFactory = defaultNegotiationCommandAuditStoreFactory,
  matchingReviewStoreFactory: MatchingReviewStoreFactory = defaultMatchingReviewStoreFactory,
  taskReplayStoreFactory: TaskReplayStoreFactory = defaultTaskReplayStoreFactory,
): Hono {
  const routes = new Hono();
  routes.use('*', requireAdmin);

  routes.get('/reviewed-operations', (c) => c.json({
    mode: 'reviewed-operation-seam',
    enabled: config.AGENT_RUNTIME_V2_ENABLED && config.REVIEWED_OPERATION_TASKS_V2_ENABLED,
    taskHandlersRegistered: config.AGENT_RUNTIME_V2_ENABLED && config.REVIEWED_OPERATION_TASKS_V2_ENABLED,
    evidenceProviderEnabled: config.AGENT_RUNTIME_V2_ENABLED
      && config.REVIEWED_OPERATION_TASKS_V2_ENABLED
      && config.EVIDENCE_RESEARCH_CREDIT_V2_ENABLED,
    evidenceProviderCallsAuthorized: config.AGENT_RUNTIME_V2_ENABLED
      && config.REVIEWED_OPERATION_TASKS_V2_ENABLED
      && config.EVIDENCE_RESEARCH_CREDIT_V2_ENABLED,
    researchCreditLedgerEnabled: config.AGENT_RUNTIME_V2_ENABLED
      && config.REVIEWED_OPERATION_TASKS_V2_ENABLED
      && config.EVIDENCE_RESEARCH_CREDIT_V2_ENABLED,
    stakingQualificationShadowEnabled: config.AGENT_RUNTIME_V2_ENABLED
      && (config.STAKING_V2_ENABLED || config.EVIDENCE_V2_SHADOW),
    stakeExecutionAuthorized: false,
    legacyRoutesEnqueue: false,
    authoritativeNegotiation: 'legacy',
    authoritativeFinancial: 'legacy',
    providerWritesAuthorized: false,
  }));

  routes.get('/rollout-gate', async (c) => {
    const parsed = z.object({
      minimumObservations: z.coerce.number().int().min(1).max(1_000_000),
      maximumStaleOfferAcceptances: z.coerce.number().int().min(0).max(1_000_000),
      maximumUnknownEvidenceUsed: z.coerce.number().int().min(0).max(1_000_000).default(0),
      maximumEvidenceSettlementConflicts: z.coerce.number().int().min(0).max(1_000_000).default(0),
      maximumUncertainFinancialStates: z.coerce.number().int().min(0).max(1_000_000).default(0),
    }).safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({
        error: 'rollout gate thresholds are required',
        detail: parsed.error.flatten(),
      }, 400);
    }

    // Resolve each factory once so an operator request observes one coherent
    // set of read-only audit sources rather than constructing mixed stores.
    const stores = {
      matching: matchingStoreFactory(),
      parity: storeFactory(),
      negotiation: negotiationStoreFactory(),
      negotiationCommands: negotiationCommandAuditStoreFactory(),
      evidence: evidenceStoreFactory(),
      financial: financialStoreFactory(),
      tasks: taskStoreFactory(),
      matchingReviews: matchingReviewStoreFactory(),
    };
    if (!Object.values(stores).some(Boolean)) {
      return c.json({ error: 'rollout gate audit requires Postgres' }, 503);
    }
    const [matching, parity, negotiation, negotiationCommands, evidence, financial, tasks, matchingRecords] = await Promise.all([
      stores.matching?.summary() ?? null,
      stores.parity?.summary() ?? null,
      stores.negotiation?.summary() ?? null,
      stores.negotiationCommands?.summary() ?? null,
      stores.evidence?.summary() ?? null,
      stores.financial?.summary() ?? null,
      stores.tasks?.summary() ?? null,
      stores.matching?.list({ limit: 500 }) ?? null,
    ]);
    const matchingReviewQueue = matchingRecords
      ? buildMatchingAuditReviewQueue(matchingRecords, 500)
      : [];
    const matchingReviewCoverage = stores.matching && stores.matchingReviews
      ? buildMatchingReviewCoverage({
          queue: matchingReviewQueue,
          reviews: (await Promise.all(matchingReviewQueue.map((item) =>
            stores.matchingReviews!.list({ observationKey: item.observationKey, limit: 1 }),
          ))).flat(),
          scanComplete: matchingRecords !== null && matchingRecords.length < 500,
        })
      : null;
    const report = buildShadowRolloutReport(
      { matching, matchingReviewCoverage, parity, negotiation, negotiationCommands, evidence, financial, tasks },
      parsed.data,
    );
    return c.json({
      mode: 'read-only-rollout-gate',
      authoritativeRoutes: 'legacy',
      providerWritesAuthorized: false,
      financialMutationsAuthorized: false,
      ...report,
    });
  });

  routes.get('/tasks', async (c) => {
    const parsed = z.object({
      state: taskStateSchema.optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: 'invalid task query', detail: parsed.error.flatten() }, 400);
    }
    const store = taskStoreFactory();
    if (!store) return c.json({ error: 'durable task audit requires Postgres' }, 503);
    const [summary, tasks] = await Promise.all([
      store.summary(),
      store.listRecent({
        limit: parsed.data.limit,
        ...(parsed.data.state ? { state: parsed.data.state } : {}),
      }),
    ]);
    return c.json({
      mode: 'read-only-operational',
      authoritativeRoutes: 'legacy',
      providerWritesAuthorized: false,
      summary,
      tasks: tasks.map((task) => ({
        id: task.id,
        ...(task.dealRoomId ? { dealRoomId: task.dealRoomId } : {}),
        kind: task.kind,
        state: task.state,
        attempt: task.attempt,
        maxAttempts: task.maxAttempts,
        availableAt: task.availableAt,
        updatedAt: task.updatedAt,
        ...(task.lastError ? { lastError: task.lastError.slice(0, 300) } : {}),
        ...(task.completedAt === undefined ? {} : { completedAt: task.completedAt }),
        ...(task.deadLetteredAt === undefined ? {} : { deadLetteredAt: task.deadLetteredAt }),
      })),
    });
  });

  routes.post('/tasks/:taskId/replay', async (c) => {
    if (!config.AGENT_RUNTIME_V2_ENABLED) {
      return c.json({ error: 'manual replay is disabled until the agent runtime shadow gate is enabled' }, 409);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'replay body must be valid JSON' }, 400);
    }
    const parsed = z.object({ replayKey: z.string().trim().min(8).max(200) }).strict().safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'replayKey is required', detail: parsed.error.flatten() }, 400);
    }
    const store = taskReplayStoreFactory();
    if (!store) return c.json({ error: 'durable task replay requires Postgres' }, 503);
    const taskId = c.req.param('taskId');
    const task = await store.get(taskId);
    if (!task) return c.json({ error: 'dead-letter task not found' }, 404);
    if (!isManualShadowReplayableTaskKind(task.kind)) {
      return c.json({ error: 'only allowlisted shadow tasks can be manually replayed' }, 409);
    }
    try {
      const result = await store.replayDeadLetter({
        taskId,
        replayKey: parsed.data.replayKey,
        actor: 'admin',
        now: Math.floor(Date.now() / 1000),
      });
      return c.json({
        mode: 'manual-shadow-replay',
        authoritativeRoutes: 'legacy',
        providerWritesAuthorized: false,
        financialMutationsAuthorized: false,
        replayed: result.replayed,
        task: {
          id: result.task.id,
          kind: result.task.kind,
          state: result.task.state,
          attempt: result.task.attempt,
          maxAttempts: result.task.maxAttempts,
          availableAt: result.task.availableAt,
          version: result.task.version,
        },
      });
    } catch (error) {
      if (error instanceof DeadLetterReplayConflictError || error instanceof DeadLetterReplayStateError) {
        return c.json({ error: error.message }, 409);
      }
      throw error;
    }
  });

  routes.get('/operation-audit', async (c) => {
    const parsed = z.object({
      kind: z.enum([
        'negotiation.turn.operation',
        'evidence.acquisition.operation',
        'evidence.reconcile.operation',
        'financial.command.operation',
      ]).optional(),
      state: taskStateSchema.optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: 'invalid operation audit query', detail: parsed.error.flatten() }, 400);
    }
    const store = operationAuditStoreFactory();
    if (!store) return c.json({ error: 'operation audit requires Postgres' }, 503);
    const tasks = await store.listRecent({
      ...(parsed.data.state ? { state: parsed.data.state } : {}),
      // Filter after a bounded 500-row read so unrelated recent tasks cannot
      // hide reviewed operations when a kind filter is requested.
      limit: 500,
    });
      const reviewedKinds = new Set([
        'negotiation.turn.operation',
        'evidence.acquisition.operation',
        'evidence.reconcile.operation',
        'financial.command.operation',
      ]);
    const selected = tasks
      .filter((task) => reviewedKinds.has(task.kind) && (!parsed.data.kind || task.kind === parsed.data.kind))
      .slice(0, parsed.data.limit);
    const audited = await Promise.all(selected.map(async (task) => {
      const checkpoints = await store.listCheckpoints(task.id);
      const checkpoint = checkpoints.at(-1);
      const data = checkpoint?.data ?? {};
      const safeData = Object.fromEntries([
        'mode', 'outcome', 'status', 'decision', 'reason', 'failureReason',
        'attemptState', 'purchaseState', 'snapshotState', 'providerLifecycle',
        'reentryCondition', 'resumable',
        'failureCode', 'approvalClaimed', 'providerCallMade', 'financialMutation',
        'verificationReference', 'observationKey', 'researchCreditReservationState',
      ].flatMap((key) => Object.prototype.hasOwnProperty.call(data, key) ? [[key, data[key]]] : []));
      return {
        id: task.id,
        ...(task.dealRoomId ? { dealRoomId: task.dealRoomId } : {}),
        kind: task.kind,
        state: task.state,
        attempt: task.attempt,
        updatedAt: task.updatedAt,
        ...(checkpoint ? {
          checkpoint: {
            phase: checkpoint.phase,
            sequence: checkpoint.sequence,
            data: safeData,
          },
        } : {}),
      };
    }));
    return c.json({
      mode: 'read-only-operational',
      authoritativeRoutes: 'legacy',
      providerWritesAuthorized: false,
      financialMutationsAuthorized: false,
      reviewedOperationKinds: [...reviewedKinds],
      tasks: audited,
    });
  });

  routes.get('/research-credit', async (c) => {
    const parsed = z.object({
      owner: z.string().regex(/^0x[0-9a-f]{40}$/i).optional(),
      state: z.enum(['reserved', 'settled', 'released']).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: 'invalid research-credit query', detail: parsed.error.flatten() }, 400);
    }
    const store = researchCreditStoreFactory();
    if (!store) return c.json({ error: 'research-credit audit requires Postgres' }, 503);
    const [accounts, reservations] = await Promise.all([
      store.listAccounts({ owner: parsed.data.owner, limit: parsed.data.limit }),
      store.listReservations({ owner: parsed.data.owner, state: parsed.data.state, limit: parsed.data.limit }),
    ]);
    return c.json({
      mode: 'read-only-operational',
      authoritativeResearchCredit: 'legacy-until-explicit-cutover',
      providerWritesAuthorized: false,
      accounts: accounts.map((account) => ({
        owner: account.owner,
        balanceMicros: account.balanceMicros,
        reservedMicros: account.reservedMicros,
        version: account.version,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      })),
      reservations: reservations.map((reservation) => ({
        id: reservation.id,
        reservationKey: reservation.reservationKey,
        owner: reservation.owner,
        amountMicros: reservation.amountMicros,
        state: reservation.state,
        version: reservation.version,
        createdAt: reservation.createdAt,
        updatedAt: reservation.updatedAt,
      })),
    });
  });

  routes.get('/research-credit/bootstrap-audit', async (c) => {
    const parsed = z.object({
      owner: z.string().regex(/^0x[0-9a-f]{40}$/i).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: 'invalid research-credit bootstrap query', detail: parsed.error.flatten() }, 400);
    }
    const store = researchCreditStoreFactory();
    if (!store) return c.json({ error: 'research-credit bootstrap audit requires Postgres' }, 503);
    const [legacy, ledger] = await Promise.all([
      legacyResearchCreditReaderFactory().list(),
      store.listAccounts({ limit: 500 }),
    ]);
    const legacyByOwner = new Map(legacy.map((record) => [record.owner.toLowerCase(), record]));
    const ledgerByOwner = new Map(ledger.map((record) => [record.owner.toLowerCase(), record]));
    const owners = [...new Set([
      ...legacyByOwner.keys(),
      ...ledgerByOwner.keys(),
    ])]
      .filter((owner) => !parsed.data.owner || owner === parsed.data.owner.toLowerCase())
      .sort()
      .slice(0, parsed.data.limit);
    const plans = owners.map((owner) => planResearchCreditBootstrap({
      owner,
      ...(legacyByOwner.get(owner) ? { legacy: legacyByOwner.get(owner) } : {}),
      ...(ledgerByOwner.get(owner) ? { ledger: ledgerByOwner.get(owner) } : {}),
    }));
    return c.json({
      mode: 'read-only-operational',
      authoritativeResearchCredit: 'legacy-until-explicit-cutover',
      migrationWritesAuthorized: false,
      plans,
    });
  });


  routes.get('/buyer-timer-parity', async (c) => {
    const parsed = listQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: 'invalid parity query', detail: parsed.error.flatten() }, 400);
    }
    const store = storeFactory();
    if (!store) {
      return c.json({ error: 'buyer timer parity audit requires Postgres' }, 503);
    }
    const [summary, candidates] = await Promise.all([
      store.summary(),
      store.list({
        ...(parsed.data.jobId ? { jobId: parsed.data.jobId } : {}),
        ...(parsed.data.kind ? { kind: parsed.data.kind } : {}),
        limit: 500,
      }),
    ]);
    const records = candidates
      .filter((record) =>
        !parsed.data.comparison || record.comparisonStatus === parsed.data.comparison)
      .filter((record) => !parsed.data.task || record.taskStatus === parsed.data.task)
      .slice(0, parsed.data.limit);
    return c.json({
      mode: 'read-only-shadow',
      enabled: config.AGENT_RUNTIME_V2_ENABLED && config.MATCH_ENGINE_V2_SHADOW,
      authoritativeTimers: 'legacy',
      summary,
      recordWindow: { scanned: candidates.length, maximum: 500 },
      records,
    });
  });

  routes.get('/matching-shadow', async (c) => {
    const parsed = z.object({
      source: z.enum(['buyer-bids', 'listing-brief']).optional(),
      comparison: z.enum(['matched', 'diverged']).optional(),
      review: z.enum(['required']).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: 'invalid matching shadow query', detail: parsed.error.flatten() }, 400);
    }
    const store = matchingStoreFactory();
    if (!store) return c.json({ error: 'matching shadow audit requires Postgres' }, 503);
    const [summary, records] = await Promise.all([
      store.summary(),
      store.list({
        ...(parsed.data.source ? { source: parsed.data.source } : {}),
        ...(parsed.data.comparison ? { comparison: parsed.data.comparison } : {}),
        limit: parsed.data.limit,
      }),
    ]);
    const reviewQueue = buildMatchingAuditReviewQueue(records, parsed.data.limit);
    const filteredRecords = parsed.data.review === 'required'
      ? records.filter((record) => reviewQueue.some((item) => item.observationKey === record.observationKey))
      : records;
    return c.json({
      mode: 'read-only-shadow',
      enabled: config.AGENT_RUNTIME_V2_ENABLED && config.MATCH_ENGINE_V2_SHADOW,
      authoritativeMatching: 'legacy',
      summary,
      reviewQueue,
      records: filteredRecords,
    });
  });

  routes.get('/matching-shadow/reviews', async (c) => {
    const parsed = z.object({
      observationKey: z.string().trim().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: 'invalid matching review query', detail: parsed.error.flatten() }, 400);
    }
    const store = matchingReviewStoreFactory();
    if (!store) return c.json({ error: 'matching review audit requires Postgres' }, 503);
    const reviews = await store.list({
      ...(parsed.data.observationKey ? { observationKey: parsed.data.observationKey } : {}),
      limit: parsed.data.limit,
    });
    return c.json({
      mode: 'read-only-matching-review',
      winnerSelectionChanged: false,
      rolloutGateChanged: false,
      reviews,
    });
  });

  routes.post('/matching-shadow/reviews', async (c) => {
    const matchingStore = matchingStoreFactory();
    const reviewStore = matchingReviewStoreFactory();
    if (!matchingStore || !reviewStore) {
      return c.json({ error: 'matching review audit requires Postgres' }, 503);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    const parsed = z.object({
      reviewId: z.string().trim().min(1).max(200),
      observationKey: z.string().trim().min(1).max(200),
      decision: z.enum(['retain_legacy', 'accept_shadow', 'needs_more_evidence']),
      reviewer: z.string().trim().min(1).max(200),
      note: z.string().max(500).optional(),
    }).strict().safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid matching review', detail: parsed.error.flatten() }, 400);
    }
    const observation = await matchingStore.get(parsed.data.observationKey);
    if (!observation) return c.json({ error: 'matching observation not found' }, 404);
    const reviewQueue = buildMatchingAuditReviewQueue([observation], 1);
    if (reviewQueue.length === 0) {
      return c.json({ error: 'matching observation does not require review' }, 409);
    }
    try {
      const review = await reviewStore.record({
        ...parsed.data,
        createdAt: Date.now(),
      });
      return c.json({
        mode: 'read-only-matching-review',
        winnerSelectionChanged: false,
        rolloutGateChanged: false,
        review,
      }, 201);
    } catch (error) {
      return c.json({
        error: 'matching review conflict',
        detail: error instanceof Error ? error.message.slice(0, 300) : String(error),
      }, 409);
    }
  });

  routes.get('/negotiation-shadow', async (c) => {
    const parsed = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: 'invalid negotiation shadow query', detail: parsed.error.flatten() }, 400);
    }
    const store = negotiationStoreFactory();
    if (!store) return c.json({ error: 'negotiation shadow audit requires Postgres' }, 503);
    const summary = await store.summary();
    const records = await store.list(parsed.data.limit);
    return c.json({
      mode: 'read-only-shadow',
      enabled: config.AGENT_RUNTIME_V2_ENABLED && config.NEGOTIATION_V2_SHADOW,
      authoritativeNegotiation: 'legacy',
      summary,
      records,
    });
  });

  routes.get('/evidence-shadow', async (c) => {
    const parsed = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: 'invalid evidence shadow query', detail: parsed.error.flatten() }, 400);
    }
    const store = evidenceStoreFactory();
    if (!store) return c.json({ error: 'evidence shadow audit requires Postgres' }, 503);
    const summary = await store.summary();
    const records = await store.list(parsed.data.limit);
    return c.json({
      mode: 'read-only-shadow',
      enabled: config.AGENT_RUNTIME_V2_ENABLED && config.EVIDENCE_V2_SHADOW,
      authoritativeEvidence: 'legacy',
      summary,
      records,
    });
  });

  routes.get('/financial-shadow', async (c) => {
    const parsed = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: 'invalid financial shadow query', detail: parsed.error.flatten() }, 400);
    }
    const store = financialStoreFactory();
    if (!store) return c.json({ error: 'financial command audit requires Postgres' }, 503);
    const summary = await store.summary();
    const records = await store.list(parsed.data.limit);
    return c.json({
      mode: 'read-only-shadow',
      enabled: config.AGENT_RUNTIME_V2_ENABLED && config.FINANCIAL_COMMANDS_V2_ENABLED,
      reconciliationWorkerEnabled: config.AGENT_RUNTIME_V2_ENABLED && config.FINANCIAL_RECONCILIATION_V2_ENABLED,
      authoritativeFinancial: 'legacy',
      providerWritesAuthorized: false,
      summary,
      records,
    });
  });

  return routes;
}

export const adminAgentRuntimeRoutes = createAdminAgentRuntimeRoutes();
