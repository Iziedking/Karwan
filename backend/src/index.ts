import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie } from 'hono/cookie';
import { logger as appLogger } from './logger.js';
import { installProcessErrorHandlers } from './errorTracker.js';
import { startProactiveSupervisor } from './llm/supervisor.js';
import { config } from './config.js';
import { publicClient } from './chain/client.js';
import { invalidateEscrowCache } from './chain/contracts.js';
import { bus } from './events.js';
import { jobsRoutes } from './routes/jobs.js';
import { configureJobsReengagementShadow } from './routes/jobsReengagement.js';
import { agentsRoutes } from './routes/agents.js';
import { eventsRoutes } from './routes/events.js';
import { milestonesRoutes } from './routes/milestones.js';
import { balancesRoutes } from './routes/balances.js';
import { activityRoutes } from './routes/activity.js';
import { profileRoutes } from './routes/profile.js';
import { newsletterRoutes } from './routes/newsletter.js';
import { settingsRoutes } from './routes/settings.js';
import { termsRoutes } from './routes/terms.js';
import { reputationRoutes } from './routes/reputation.js';
import { dealsRoutes } from './routes/deals.js';
import { paytagRoutes } from './routes/paytag.js';
import { cashoutRoutes } from './routes/cashout.js';
import { networkRoutes } from './routes/network.js';
import { activationRoutes } from './routes/activation.js';
import { depositRoutes } from './routes/deposit.js';
import { attestationRoutes } from './routes/attestation.js';
import { vaultRoutes } from './routes/vault.js';
import { legacyRoutes } from './routes/legacy.js';
import { bridgeRoutes, resumePendingBridges } from './routes/bridge.js';
import { gatewayRoutes } from './routes/gateway.js';
import { chatRoutes } from './routes/chat.js';
import { financingChatRoutes } from './routes/financingChat.js';
import { telegramRoutes } from './routes/telegram.js';
import { adminRoutes } from './routes/admin.js';
import { adminAgentRuntimeRoutes } from './routes/adminAgentRuntime.js';
import {
  configureReviewedNegotiationIngress,
  configureReviewedEvidenceIngress,
  configureReviewedEvidenceReconciliationIngress,
  configureReviewedFinancialOperationIngress,
  configureStakeQualificationShadowIngress,
  configureStakeFundingResumeIngress,
  configureStakeFinancialOperationIngress,
  configureStakeApprovalResumeIngress,
  configureReengagementIngress,
  reviewedOperationIngressRoutes,
} from './routes/reviewedOperationIngress.js';
import { adminDisputeRoutes } from './routes/adminDisputes.js';
import { adminTeamKeyRoutes } from './routes/adminTeamKeys.js';
import { adminSignalRoutes } from './routes/adminSignals.js';
import { signalIngestRoutes } from './routes/signalIngest.js';
import { oauthRoutes, oauthMetadataRoutes } from './routes/oauth.js';
import { teamPortalRoutes } from './routes/teamPortal.js';
import { adminTeamMemberRoutes } from './routes/adminTeamMembers.js';
import { adminNewsletterRoutes } from './routes/adminNewsletter.js';
import { newsletterArchiveRoutes } from './routes/newsletterArchive.js';
import { teamMcpRoutes } from './routes/teamMcp.js';
import { supportTeamRoutes } from './routes/supportTeam.js';
import { adminTreasuryRoutes } from './routes/adminTreasury.js';
import { adminUsycRoutes } from './routes/adminUsyc.js';
import { treasuryRoutes } from './routes/treasury.js';
import { yieldRoutes, startYieldIndexer } from './routes/yield.js';
import { configureListingMatchingEngineShadow, listingsRoutes } from './routes/listings.js';
import { xRoutes } from './routes/x.js';
import { authRoutes } from './routes/auth.js';
import { siweRoutes } from './routes/siwe.js';
import { tradeRoutes } from './routes/trade.js';
import { factoringRoutes } from './routes/factoring.js';
import { poFinancingRoutes } from './routes/poFinancing.js';
import { financierRoutes } from './routes/financier.js';
import { smeRoutes } from './routes/sme.js';
import { assistantRoutes } from './routes/assistant.js';
import { supportRoutes, startSupportSweeper } from './routes/support.js';
import { configureAgentKitResearch, configureResearchScoutEvidenceShadow, researchRoutes } from './routes/research.js';
import { diagnoseRoutes } from './routes/diagnose.js';
import { businessRoutes, businessAdminRoutes } from './routes/business.js';
import { verificationRoutes } from './routes/verification.js';
import { partnersRoutes } from './routes/partners.js';
import { x402Routes } from './routes/x402.js';
import { feedbackRoutes } from './routes/feedback.js';
import { circleWebhookRoutes } from './routes/circle-webhook.js';
import {
  startBuyerAgents,
  backfillRecentJobs as backfillBuyer,
  configureBuyerTimerShadow,
  configureBuyerTimerParity,
  configureMatchingEngineShadow,
  configureNegotiationShadow,
  configureEvidenceQualificationShadow,
  configureEvidenceAcquisitionShadow,
  configureFinancialCommandShadow,
} from './agents/buyer.js';
import {
  startSellerAgents,
  hydrateActiveBids,
  flushActiveBidsSync,
  configureSellerStakeQualificationShadow,
  configureSellerEvidenceAcquisitionShadow,
} from './agents/seller.js';
import { configureDealFinancialCommandShadow, startDealWatcher } from './agents/dealWatcher.js';
import { configureX402GatewayFundingShadow } from './x402/buyerClient.js';
import { startFactoringWatcher } from './agents/factoringWatcher.js';
import { startPOWatcher } from './agents/poWatcher.js';
import { startJobExpiryWatcher } from './agents/jobExpiryWatcher.js';
import { startReleaseWatcher } from './agents/releaseWatcher.js';
import { startTrendScout } from './agents/trendScout.js';
import { startBalanceWatcher } from './chain/balanceWatcher.js';
import { startDepositWatcher } from './circle/depositWatcher.js';
import { startCooldownWatcher } from './chain/cooldownWatcher.js';
import { startVaultScanWatcher } from './chain/vaultScanCache.js';
import { startCurrentContractsWatcher } from './chain/currentContracts.js';
import { backfillBusFromChain } from './chain/eventBackfill.js';
import { syncBridgeEventsToBus } from './chain/bridgeEventSync.js';
import { startReputationReconciler } from './reputation/reconciler.js';
import { startAttestationSweep } from './attestation/sweep.js';
import { startTelegramBot } from './telegram/bot.js';
import { startTeamDaily } from './telegram/team.js';
import { startTelegramNotifier } from './telegram/notifier.js';
import { startChatRetentionSweep } from './chat/retention.js';
import { startEmailNotifier } from './emails/dealNotifier.js';
import { startXBroadcaster } from './notifiers/xBroadcaster.js';
import {
  ensureSchema,
  pgEnabled,
  postgresExecutor,
  withPostgresTransaction,
} from './db/client.js';
import { configureMatchProposalRevisionObserver } from './db/matchProposals.js';
import {
  OutboxDispatcher,
  PostgresOutboxStore,
  createBrowserProjectionConsumer,
  createNotificationJobConsumer,
  startOutboxDispatcherLoop,
} from './events/outboxWorker.js';
import {
  DurableTaskRunner,
  PostgresDurableTaskStore,
  startDurableTaskRunnerLoop,
} from './agents/durableTaskRunner.js';
import {
  PostgresBuyerRuntimeSnapshotStore,
  createBuyerTimerShadowHandlers,
  createBuyerTimerShadowObserver,
} from './agents/buyerTaskShadow.js';
import {
  PostgresBuyerTimerParityAuditStore,
  createBuyerTimerParityObserver,
} from './agents/buyerTaskParity.js';
import {
  PostgresMatchingAuditStore,
} from './matching/audit.js';
import { createMatchingShadowObserver } from './matching/shadow.js';
import {
  createNegotiationShadowHandlers,
  createNegotiationShadowObserver,
} from './agents/negotiationTaskShadow.js';
import {
  createReengagementShadowHandlers,
  scheduleBoundedReengagement,
} from './negotiation/reengagement.js';
import { PostgresNegotiationRuntime } from './negotiation/postgresRuntime.js';
import { PostgresNegotiationCommandLedger } from './negotiation/commandLedger.js';
import { PostgresMandateSnapshotStore } from './negotiation/mandates.js';
import { createNegotiationOperationObserver } from './negotiation/operationTask.js';
import {
  createEvidenceQualificationShadowHandlers,
  createEvidenceQualificationShadowObserver,
} from './agents/evidenceQualificationShadow.js';
import {
  createEvidenceAcquisitionShadowHandlers,
  createEvidenceAcquisitionShadowObserver,
} from './agents/evidenceAcquisitionShadow.js';
import { createEvidenceAcquisitionOperationObserver } from './evidence/acquisitionTask.js';
import { createEvidenceReconciliationOperationObserver } from './evidence/reconciliationTask.js';
import { createFinancialCommandOperationObserver } from './financial/operationTask.js';
import {
  createStakeApprovalResumeObserver,
  createStakeFinancialOperationObserver,
} from './agents/stakeFinancialProjection.js';
import { PostgresEvidenceRuntimeRepository } from './evidence/runtime.js';
import { PostgresResearchCreditStore } from './evidence/researchCredit.js';
import { PostgresResearchAllowanceStore } from './evidence/researchAllowance.js';
import { unavailableAgentKitVerifier } from './agentkit/agentKitVerification.js';
import { createX402EvidenceAcquisitionAdapter } from './evidence/x402Adapter.js';
import { PostgresAgentRuntimeRepository } from './db/agentRuntime.js';
import { createFinancialCommandShadowHandlers } from './agents/financialCommandShadow.js';
import { createFinancialCommandShadowObserver } from './agents/financialCommandShadow.js';
import {
  createFinancialReconciliationShadowHandlers,
  createFinancialReconciliationShadowObserver,
  parseCircleReconciliationObservation,
} from './agents/financialReconciliationShadow.js';
import { PostgresFinancialRuntimeRepository } from './financial/runtime.js';
import { createFinancialReconciliationWorker } from './financial/reconciliationWorker.js';
import { createCircleWalletAdapter } from './circle/CircleWalletAdapter.js';
import { createReviewedOperationTaskHandlers } from './agents/reviewedOperationHandlers.js';
import {
  createStakeQualificationShadowHandlers,
  createStakeQualificationShadowObserver,
} from './agents/stakeQualificationShadow.js';
import { createStakeFundingResumeObserver } from './agents/stakeFundingResume.js';
import { PostgresNegotiationAttemptStore } from './negotiation/attempts.js';
import { PostgresMatchProposalRevisionStore } from './negotiation/proposalRevision.js';
import { initUsersStore } from './db/users.js';
import { initPriceObservationsStore } from './db/priceObservations.js';
import { initEphemeralStores } from './db/ephemeral.js';
import { createCorrelationMiddleware } from './observability/correlationMiddleware.js';
import { requireAdmin } from './middleware/adminAuth.js';
import { buildOperatorRouteCatalog } from './ops/routeCatalog.js';

const app = new Hono();

/// Give every request a bounded correlation identifier for support and
/// operator logs. It is metadata only and never becomes an idempotency key or
/// authority input. The path excludes query strings so secrets in query
/// parameters cannot be copied into logs.
app.use('*', createCorrelationMiddleware(appLogger));

// Session cookies need credentials:true, which forbids origin:*. We echo the
// request's Origin back when it's in the trusted set. Defaults cover local
// dev; production deploys can extend by setting FRONTEND_BASE_URL.
const ALLOWED_ORIGINS = new Set<string>(
  [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    config.FRONTEND_BASE_URL?.replace(/\/$/, ''),
    config.WEBAUTHN_ORIGIN?.replace(/\/$/, ''),
  ].filter((x): x is string => !!x),
);

// Preview origins are opt-in and exact. This used to be a
// `^https://[a-z0-9-]+\.vercel\.app$` wildcard so the operator could test from
// the Vercel-issued domain. Combined with credentials:true it meant any page
// anyone deployed to vercel.app could call this API with the visitor's session
// cookie attached and read the response, which is every authenticated endpoint.
for (const extra of (config.EXTRA_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean)) {
  ALLOWED_ORIGINS.add(extra);
}

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin.replace(/\/$/, ''));
}

/// CSRF. Session cookies are SameSite=None in production (the frontend and the
/// API sit on different hosts), so the browser attaches them to cross-site
/// requests and nothing here checked where a state-changing call came from.
/// Hono's c.req.json() ignores Content-Type, so a form or a text/plain fetch
/// from any origin reached a mutation with no preflight to block it.
///
/// The check targets exactly the ambient-cookie vector: a mutation that is
/// authenticated by the session cookie must carry an Origin we allow, or a
/// Sec-Fetch-Site that is not cross-site. Requests with no session cookie are
/// untouched, so server-to-server callers, the Telegram bot, cron and
/// admin-token routes keep working without an Origin header.
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

app.use('*', async (c, next) => {
  if (!MUTATING.has(c.req.method)) return next();
  if (!getCookie(c, 'karwan_session')) return next();

  const site = c.req.header('sec-fetch-site');
  if (site && site !== 'cross-site') return next();

  const origin = c.req.header('origin');
  if (origin && isAllowedOrigin(origin)) return next();

  // No Origin at all on a cookie-authenticated mutation is the classic
  // form-post shape, so it is refused rather than waved through.
  appLogger.warn(
    { path: c.req.path, method: c.req.method, origin: origin ?? null, site: site ?? null },
    'blocked cross-site state-changing request',
  );
  return c.json({ error: 'cross-site request blocked', code: 'csrf_blocked' }, 403);
});

app.use(
  '*',
  cors({
    origin: (origin) => (origin && isAllowedOrigin(origin) ? origin : null),
    credentials: true,
    // PATCH belongs here even though nothing used it when this list was written.
    // Two routes do now (team member access, newsletter edit), and a method
    // missing from this list fails the browser's PREFLIGHT, so the real request
    // is never sent. The client sees a rejected fetch rather than an HTTP error,
    // which surfaces as a generic "could not do that" with no status to chase,
    // while the same call over curl succeeds and makes it look like a UI fault.
    allowMethods: ['GET', 'POST', 'OPTIONS', 'DELETE', 'PUT', 'PATCH'],
    allowHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Admin-Token', 'X-Correlation-ID'],
    exposeHeaders: ['X-Correlation-ID'],
    // Cache the CORS preflight for a day so the browser stops firing an OPTIONS
    // round-trip before every cross-origin API call. The allowed methods and
    // headers are static, so a long cache is safe and cuts perceived latency on
    // every authed page (each of which makes several api.karwan.site calls).
    maxAge: 86_400,
  }),
);

app.get('/', (c) => c.json({ name: 'karwan', status: 'ok' }));

/// Health check serves the orchestrator: the only question it answers is
/// "is the API process up and able to serve HTTP requests?" Returning 503
/// when the chain is degraded turned a routine RPC quota exhaustion into a
/// deploy outage. The orchestrator marked the container unhealthy, CI
/// rolled back, and the previous image inherited the same downstream RPC
/// issues. The API itself is fine even when chain reads fail; routes that
/// need chain data already degrade gracefully with their own cached
/// snapshots and warning logs.
///
/// New behaviour: always return 200 with the API status. Chain reachability
/// is reported as a sibling field so dashboards can still surface degraded
/// chain state, but the container stays healthy and deploys land.
app.get('/health', async (c) => {
  /// Short timeout on the chain probe so a wedged RPC doesn't tie the
  /// orchestrator's health check up for its full window.
  const HEALTH_RPC_TIMEOUT_MS = 2500;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('chain-probe-timeout')), HEALTH_RPC_TIMEOUT_MS),
  );
  try {
    const [chainId, blockNumber] = await Promise.race([
      Promise.all([publicClient.getChainId(), publicClient.getBlockNumber()]),
      timeoutPromise,
    ]);
    return c.json({
      status: 'ok',
      chain: { id: chainId, latestBlock: blockNumber.toString(), reachable: true },
    });
  } catch (err) {
    /// Chain unreachable, usually RPC rate-limit, occasionally a transient
    /// network blip. Log it for dashboards but keep the API healthy.
    /// Surfaces / surfaces with their own cached snapshots keep working;
    /// surfaces that need live chain data show the warning state they
    /// already render for these errors.
    appLogger.warn({ err: String(err) }, 'health check: chain probe failed, API still healthy');
    return c.json({
      status: 'ok',
      chain: { reachable: false, error: String(err) },
    });
  }
});

app.route('/api/jobs', jobsRoutes);
app.route('/api/agents', agentsRoutes);
app.route('/api/events', eventsRoutes);
app.route('/api/milestones', milestonesRoutes);
app.route('/api/balances', balancesRoutes);
app.route('/api/activity', activityRoutes);
app.route('/api/profile', profileRoutes);
app.route('/api/paytag', paytagRoutes);
app.route('/api/newsletter', newsletterRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/bridge', bridgeRoutes);
app.route('/api/gateway', gatewayRoutes);
app.route('/api/reputation', reputationRoutes);
app.route('/api/deals', dealsRoutes);
app.route('/api/cashout', cashoutRoutes);
app.route('/api/network', networkRoutes);
app.route('/api/activation', activationRoutes);
app.route('/api/deposit', depositRoutes);
// Root-mounted on purpose: a verifier derives /.well-known and /schemas from the
// issuer domain, so they cannot live under /api.
app.route('/', attestationRoutes);
app.route('/api/vault', vaultRoutes);
app.route('/api/legacy', legacyRoutes);
app.route('/api/chat', chatRoutes);
app.route('/api/financing-chat', financingChatRoutes);
app.route('/api/telegram', telegramRoutes);
// Support-team router first: /api/admin/support is reachable by the scoped
// support token, while the rest of /api/admin stays admin-only.
app.route('/api/admin/support', supportTeamRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/admin/agent-runtime', adminAgentRuntimeRoutes);
app.route('/api/admin/reviewed-operation-ingress', reviewedOperationIngressRoutes);
app.route('/api/admin/disputes', adminDisputeRoutes);
app.route('/api/admin/treasuries', adminTreasuryRoutes);
app.route('/api/admin/usyc', adminUsycRoutes);
app.route('/api/admin/team-keys', adminTeamKeyRoutes);
app.route('/api/admin/signals', adminSignalRoutes);
app.route('/api/signals', signalIngestRoutes);
app.route('/oauth', oauthRoutes);
app.route('/team', teamPortalRoutes);
app.route('/api/admin/team-members', adminTeamMemberRoutes);
// At the issuer root, not under /oauth. Clients build this path from the issuer
// identifier and will not look anywhere else for it.
app.route('/.well-known', oauthMetadataRoutes);
app.route('/api/admin/newsletter', adminNewsletterRoutes);
app.route('/api/newsletter', newsletterArchiveRoutes);
app.route('/api/team-mcp', teamMcpRoutes);
app.route('/api/yield', yieldRoutes);
app.route('/api/treasury', treasuryRoutes);
app.route('/api/listings', listingsRoutes);
app.route('/api/terms', termsRoutes);
app.route('/api/x', xRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/siwe', siweRoutes);
// SME trade-finance rail (Phase 2 Track 2).
app.route('/api/trade', tradeRoutes);
app.route('/api/factoring', factoringRoutes);
app.route('/api/po-financing', poFinancingRoutes);
app.route('/api/financier', financierRoutes);
app.route('/api/sme', smeRoutes);
app.route('/api/assistant', assistantRoutes);
app.route('/api/support', supportRoutes);
app.route('/api/research', researchRoutes);
app.route('/api/diagnose', diagnoseRoutes);
app.route('/api/business', businessRoutes);
app.route('/api/verification', verificationRoutes);
app.route('/api/partners', partnersRoutes);
app.route('/api/admin/business', businessAdminRoutes);
app.route('/api/x402', x402Routes);
app.route('/api/feedback', feedbackRoutes);
app.route('/api/circle', circleWebhookRoutes);

// Source-of-truth operator inventory. Hono expands mounted routers into the
// app routing table, so this always reports the endpoints this exact backend
// process can serve instead of relying on a manually maintained checklist.
app.get('/api/admin/route-catalog', requireAdmin, (c) => {
  const routes = buildOperatorRouteCatalog(app.routes);
  return c.json({
    generatedAt: Date.now(),
    source: 'runtime' as const,
    count: routes.length,
    routes,
  });
});

// Process-wide error capture. Routes unhandled rejections + uncaught
// exceptions through `errorTracker` so they land in the ring buffer and
// emit a `system.error` event the activity feed picks up. We do NOT
// exit; watchers and SSE keep running so one bad task can't take the
// whole server down.
installProcessErrorHandlers();

const stopFns: Array<() => void> = [];

// Private trade and financing conversations have a fixed 14-day retention
// window. This worker is independent of agent flags so cleanup continues when
// agents are intentionally disabled during maintenance or rollout.
stopFns.push(startChatRetentionSweep());

// Any event that mutates on-chain escrow state has to bust the readEscrow
// cache so the next read pulls fresh data instead of serving the stale tuple.
const ESCROW_MUTATING_EVENTS = new Set<string>([
  'escrow.funded',
  'escrow.milestone.released',
  'escrow.settled',
  'deal.disputed',
  'deal.cancelled',
]);
stopFns.push(
  bus.subscribe((e) => {
    if (ESCROW_MUTATING_EVENTS.has(e.type) && e.jobId) {
      invalidateEscrowCache(e.jobId);
    }
  }),
);

// Phase-C proactive supervisor: auto-diagnose captured errors as they land.
// No-op unless SUPERVISOR_PROACTIVE_ENABLED is set and an Anthropic key exists;
// self-guards on cost via dedup + an hourly rate cap.
stopFns.push(startProactiveSupervisor());

function bootAgents() {
  if (process.env.SKIP_AGENTS === '1') {
    appLogger.warn('SKIP_AGENTS=1, not starting buyer/seller agents');
    return;
  }
  if (!config.OPENROUTER_API_KEY) {
    appLogger.warn('OPENROUTER_API_KEY not set, agents will start but cannot score bids');
  }
  try {
    stopFns.push(startBuyerAgents());
    // Replay recent JobPosted events so the in-memory jobs map survives restarts.
    // Fire-and-forget; agents handle live events while the backfill catches up.
    backfillBuyer().catch((err) =>
      appLogger.warn({ err: (err as Error).message }, 'buyer backfill failed'),
    );
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'buyer agent not started');
  }
  try {
    stopFns.push(startSellerAgents());
    // Seller-side backfill is intentionally NOT called: replaying JobPosted
    // events causes seller agents to re-bid on jobs they already bid on, since
    // their activeBids map is wiped on restart but the chain still has the
    // original bid. Live events handle new jobs; old jobs the seller missed
    // during downtime stay missed.
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'seller agent not started');
  }
  try {
    stopFns.push(startDealWatcher());
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'deal watcher not started');
  }
  try {
    stopFns.push(startFactoringWatcher());
    stopFns.push(startPOWatcher());
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'factoring watcher not started');
  }
  try {
    stopFns.push(startJobExpiryWatcher());
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'job expiry watcher not started');
  }
  try {
    stopFns.push(startReleaseWatcher());
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'release watcher not started');
  }
  try {
    if (config.REPUTATION_RECONCILER_ENABLED) {
      stopFns.push(startReputationReconciler());
    } else {
      appLogger.info(
        'reputation reconciler disabled via REPUTATION_RECONCILER_ENABLED',
      );
    }
  } catch (err) {
    appLogger.warn(
      { err: (err as Error).message },
      'reputation reconciler not started',
    );
  }
  try {
    if (config.ATTESTATION_ISSUANCE_ENABLED) {
      stopFns.push(startAttestationSweep());
    } else {
      appLogger.info(
        'attestation sweep disabled via ATTESTATION_ISSUANCE_ENABLED',
      );
    }
  } catch (err) {
    appLogger.warn(
      { err: (err as Error).message },
      'attestation sweep not started',
    );
  }
  try {
    if (config.TREND_NUDGES_ENABLED) {
      stopFns.push(startTrendScout());
    } else {
      appLogger.info('trend scout disabled via TREND_NUDGES_ENABLED');
    }
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'trend scout not started');
  }
  try {
    stopFns.push(startBalanceWatcher());
  } catch (err) {
    appLogger.warn(
      { err: (err as Error).message },
      'balance watcher not started',
    );
  }
  // The balance watcher above covers Arc only. This is the same job for the
  // deposit chains, driven by Circle's webhook instead of by log polling.
  try {
    stopFns.push(startDepositWatcher());
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'deposit watcher not started');
  }
  try {
    stopFns.push(startCooldownWatcher());
  } catch (err) {
    appLogger.warn(
      { err: (err as Error).message },
      'cooldown watcher not started',
    );
  }
  /// Boot prefetch + periodic refresh of the shared vault scan cache.
  /// Without this, each `/api/vault/positions` request did its own full
  /// positionId walk on chain. The watcher hydrates the cache from disk
  /// (the prior process's snapshot) and kicks off a fresh scan in the
  /// background, so the first reader after a restart serves warm.
  try {
    stopFns.push(startVaultScanWatcher());
  } catch (err) {
    appLogger.warn(
      { err: (err as Error).message },
      'vault scan watcher not started',
    );
  }

  /// Daily re-read of what the live contracts hold, for /activity/all-time.
  /// In-process rather than a system cron: the VM image ships without cron, so
  /// a schedule that lives outside the process is a schedule that quietly does
  /// not run.
  try {
    stopFns.push(startCurrentContractsWatcher());
  } catch (err) {
    appLogger.warn(
      { err: (err as Error).message },
      'current contracts watcher not started',
    );
  }

  /// Incremental yield indexer: scans the distributor's events once, checkpoints
  /// the running totals, then only reads new blocks. Keeps /stake's chart and the
  /// per-user numbers instant instead of re-walking millions of blocks per read.
  try {
    stopFns.push(startYieldIndexer());
  } catch (err) {
    appLogger.warn(
      { err: (err as Error).message },
      'yield indexer not started',
    );
  }
}

async function boot() {
  let schemaReady = false;
  if (pgEnabled) {
    try {
      await ensureSchema();
      schemaReady = true;
    } catch (err) {
      appLogger.error(
        { err: (err as Error).message },
        'postgres schema init failed, check DATABASE_URL',
      );
    }
  } else {
    appLogger.warn('DATABASE_URL not set, using flat-file persistence (dev only)');
  }
  const disableAgentKitResearch = configureAgentKitResearch({
    enabled: config.AGENTKIT_VERIFICATION_V2_ENABLED && schemaReady,
    ...(config.AGENTKIT_VERIFICATION_V2_ENABLED && schemaReady
      ? {
          verifier: unavailableAgentKitVerifier('World AgentBook provider adapter is not configured'),
          allowanceStore: new PostgresResearchAllowanceStore(postgresExecutor(), withPostgresTransaction),
        }
      : {}),
  });
  stopFns.push(disableAgentKitResearch);
  if (config.EVENT_OUTBOX_V2_ENABLED && schemaReady) {
    const outboxStore = new PostgresOutboxStore(withPostgresTransaction);
    const dispatcher = new OutboxDispatcher(
      outboxStore,
      [
        createNotificationJobConsumer(withPostgresTransaction),
        createBrowserProjectionConsumer(withPostgresTransaction),
      ],
      { workerId: `karwan-outbox-${process.pid}` },
    );
    stopFns.push(
      startOutboxDispatcherLoop(dispatcher, {
        onError: (err) =>
          appLogger.error({ err: (err as Error).message }, 'V2 event outbox dispatch failed'),
        onResult: ({ retried, deadLettered }) => {
          if (deadLettered > 0) {
            appLogger.error({ deadLettered }, 'V2 event outbox rows moved to dead letter');
          } else if (retried > 0) {
            appLogger.warn({ retried }, 'V2 event outbox rows scheduled for retry');
          }
        },
      }),
    );
    appLogger.info('V2 event outbox dispatcher started');
  } else if (config.EVENT_OUTBOX_V2_ENABLED) {
    appLogger.error('V2 event outbox dispatcher not started because Postgres schema is unavailable');
  }
  // Accounts hydrate from Postgres (and one-time-import users.json) BEFORE
  // anything can serve auth requests: a login check against a half-loaded
  // store would read as "no such user".
  await initUsersStore();
  // In-flight auth state (OTP codes, WebAuthn challenges, SIWE nonces,
  // Telegram link tokens) survives the restart the same way.
  await initEphemeralStores();
  // Category price history hydrates so per-skill medians survive a restart
  // instead of rebuilding from zero. Non-fatal; agents fall back to the global
  // ring when a category is thin.
  await initPriceObservationsStore();
  // In-flight seller bids restore BEFORE agents start, so a deploy mid-auction
  // resumes negotiations instead of stalling on a lost activeBids map.
  await hydrateActiveBids();
  if (config.AGENT_RUNTIME_V2_ENABLED && schemaReady) {
    // Preserve the historical evidence-shadow coupling while exposing an
    // explicit staking flag for staged rollout and operator reporting.
    const stakingShadowEnabled = config.STAKING_V2_ENABLED || config.EVIDENCE_V2_SHADOW;
    const taskStore = new PostgresDurableTaskStore(
      postgresExecutor(),
      withPostgresTransaction,
    );
    const buyerSnapshotStore = new PostgresBuyerRuntimeSnapshotStore(postgresExecutor());
    const buyerParityStore = new PostgresBuyerTimerParityAuditStore(postgresExecutor());
    const matchingAuditStore = new PostgresMatchingAuditStore(postgresExecutor());
    const proposalRevisionStore = config.MATCH_ENGINE_V2_SHADOW
      ? new PostgresMatchProposalRevisionStore(postgresExecutor())
      : null;
    const runtimeRepository = new PostgresAgentRuntimeRepository(postgresExecutor());
    const reviewedEvidenceEnabled = config.REVIEWED_OPERATION_TASKS_V2_ENABLED
      && config.EVIDENCE_RESEARCH_CREDIT_V2_ENABLED;
    const evidenceRuntime = (config.EVIDENCE_V2_SHADOW || stakingShadowEnabled || reviewedEvidenceEnabled)
      ? new PostgresEvidenceRuntimeRepository(postgresExecutor(), withPostgresTransaction)
      : null;
    const approvalRuntime = stakingShadowEnabled ? runtimeRepository : null;
    const negotiationAttemptStore = (stakingShadowEnabled || config.REVIEWED_OPERATION_TASKS_V2_ENABLED)
      ? new PostgresNegotiationAttemptStore(postgresExecutor())
      : null;
    const financialRuntime = (config.FINANCIAL_COMMANDS_V2_ENABLED
      || config.FINANCIAL_RECONCILIATION_V2_ENABLED
      || config.REVIEWED_OPERATION_TASKS_V2_ENABLED)
      ? new PostgresFinancialRuntimeRepository(postgresExecutor(), withPostgresTransaction)
      : null;
    const financialShadowObserver = config.FINANCIAL_COMMANDS_V2_ENABLED && financialRuntime
      ? createFinancialCommandShadowObserver(taskStore, runtimeRepository)
      : null;
    // Reviewed operation handlers are deliberately separate from the shadow
    // flags. They are registered only after an explicit cutover decision, and
    // no legacy route enqueues their task kinds yet.
    const reviewedNegotiationConflictRecorder = config.REVIEWED_OPERATION_TASKS_V2_ENABLED
      ? new PostgresNegotiationCommandLedger(postgresExecutor())
      : null;
    const mandateSnapshotStore = (config.REVIEWED_OPERATION_TASKS_V2_ENABLED || config.NEGOTIATION_V2_SHADOW)
      ? new PostgresMandateSnapshotStore(postgresExecutor())
      : null;
    const reviewedMandateSnapshotStore = config.REVIEWED_OPERATION_TASKS_V2_ENABLED
      ? mandateSnapshotStore
      : null;
    // The same deterministic offer runtime serves reviewed operations and the
    // shadow projection. In shadow mode it only writes V2 offer/room rows; no
    // legacy proposal, JobBoard call, provider, wallet, or money path is used.
    const negotiationRuntime = (config.REVIEWED_OPERATION_TASKS_V2_ENABLED || config.NEGOTIATION_V2_SHADOW)
      ? new PostgresNegotiationRuntime(withPostgresTransaction, reviewedNegotiationConflictRecorder ?? undefined)
      : null;
    const reviewedNegotiationRuntime = config.REVIEWED_OPERATION_TASKS_V2_ENABLED
      ? negotiationRuntime
      : null;
    const shadowNegotiationRuntime = config.NEGOTIATION_V2_SHADOW
      ? negotiationRuntime
      : null;
    const reviewedCircleAdapter = config.REVIEWED_OPERATION_TASKS_V2_ENABLED
      ? createCircleWalletAdapter()
      : null;
    const reviewedEvidenceAdapter = reviewedEvidenceEnabled
      ? createX402EvidenceAcquisitionAdapter()
      : null;
    const researchCreditStore = reviewedEvidenceEnabled
      ? new PostgresResearchCreditStore(postgresExecutor(), withPostgresTransaction)
      : null;
    const reconciliationCircleAdapter = config.FINANCIAL_RECONCILIATION_V2_ENABLED
      ? createCircleWalletAdapter()
      : null;
    // Phase 3B handlers only read persisted buyer snapshots and write task
    // checkpoints. They cannot call agents, providers, wallets, contracts, or
    // proposal stores. Legacy timers remain the sole authority.
    const taskHandlers = {
      ...createBuyerTimerShadowHandlers(buyerSnapshotStore, {
        parityStore: buyerParityStore,
      }),
      ...(config.NEGOTIATION_V2_SHADOW
        ? createNegotiationShadowHandlers(
            shadowNegotiationRuntime
              ? { offerRuntime: shadowNegotiationRuntime }
              : {},
          )
        : {}),
      ...(config.NEGOTIATION_V2_SHADOW ? createReengagementShadowHandlers() : {}),
      ...(config.EVIDENCE_V2_SHADOW && evidenceRuntime ? createEvidenceQualificationShadowHandlers(evidenceRuntime) : {}),
      ...(config.EVIDENCE_V2_SHADOW && evidenceRuntime ? createEvidenceAcquisitionShadowHandlers(evidenceRuntime) : {}),
      ...(stakingShadowEnabled && evidenceRuntime
        ? createStakeQualificationShadowHandlers(evidenceRuntime, {
            attemptStore: negotiationAttemptStore ?? undefined,
            approvalRepository: approvalRuntime ?? undefined,
            ...(financialShadowObserver ? { financialObserver: financialShadowObserver } : {}),
          })
        : {}),
      ...(config.FINANCIAL_COMMANDS_V2_ENABLED && financialRuntime
        ? createFinancialCommandShadowHandlers(financialRuntime)
        : {}),
      ...(config.FINANCIAL_COMMANDS_V2_ENABLED && financialRuntime
        ? createFinancialReconciliationShadowHandlers(financialRuntime)
        : {}),
      ...createReviewedOperationTaskHandlers({
        ...(reviewedNegotiationRuntime && negotiationAttemptStore
          ? { negotiationExecutor: reviewedNegotiationRuntime, negotiationAttempts: negotiationAttemptStore }
          : {}),
        ...(reviewedCircleAdapter && financialRuntime
          ? { financialRepository: financialRuntime, approvalRepository: runtimeRepository, financialAdapter: reviewedCircleAdapter }
          : {}),
        ...(reviewedEvidenceAdapter && researchCreditStore && evidenceRuntime
          ? {
              evidenceRepository: evidenceRuntime,
              evidenceAdapter: reviewedEvidenceAdapter,
              evidenceResearchCredits: researchCreditStore,
            }
          : {}),
        ...(reviewedEvidenceEnabled && evidenceRuntime
          ? {
              evidenceReconciliationRepository: evidenceRuntime,
              ...(researchCreditStore
                ? { evidenceReconciliationResearchCredits: researchCreditStore }
                : {}),
            }
          : {}),
      }),
    };
    if (config.NEGOTIATION_V2_SHADOW) {
      stopFns.push(
        configureNegotiationShadow(
          createNegotiationShadowObserver(taskStore, runtimeRepository, mandateSnapshotStore ?? undefined),
        ),
      );
      stopFns.push(
        configureReengagementIngress((data) => scheduleBoundedReengagement(taskStore, data)),
      );
      stopFns.push(
        configureJobsReengagementShadow((data) => scheduleBoundedReengagement(taskStore, data)),
      );
      appLogger.info('V2 structured negotiation shadow scheduling and offer projection enabled');
    }
    if (config.REVIEWED_OPERATION_TASKS_V2_ENABLED) {
      stopFns.push(
        configureReviewedNegotiationIngress(
          createNegotiationOperationObserver(
            taskStore,
            runtimeRepository,
            reviewedMandateSnapshotStore ?? undefined,
          ),
        ),
      );
      if (reviewedEvidenceAdapter && researchCreditStore && evidenceRuntime) {
        stopFns.push(
          configureReviewedEvidenceIngress(
            createEvidenceAcquisitionOperationObserver(taskStore, runtimeRepository),
          ),
        );
        appLogger.warn(
          'reviewed x402 evidence adapter and research-credit ledger enabled behind explicit flag',
        );
      }
      if (reviewedEvidenceEnabled && evidenceRuntime) {
        stopFns.push(
          configureReviewedEvidenceReconciliationIngress(
            createEvidenceReconciliationOperationObserver(taskStore, runtimeRepository),
          ),
        );
        appLogger.info(
          'reviewed evidence reconciliation ingress enabled; provider calls remain separate from observation resume',
        );
      }
      if (reviewedCircleAdapter && financialRuntime) {
        stopFns.push(
          configureReviewedFinancialOperationIngress(
            createFinancialCommandOperationObserver(taskStore, runtimeRepository),
          ),
        );
        stopFns.push(
          configureStakeFinancialOperationIngress(
            createStakeFinancialOperationObserver(taskStore, runtimeRepository),
          ),
        );
        stopFns.push(
          configureStakeApprovalResumeIngress(
            createStakeApprovalResumeObserver(taskStore, runtimeRepository, runtimeRepository),
          ),
        );
      }
    }
    if (config.EVIDENCE_V2_SHADOW) {
      stopFns.push(
        configureEvidenceQualificationShadow(
          createEvidenceQualificationShadowObserver(taskStore, runtimeRepository),
        ),
      );
      stopFns.push(
        configureEvidenceAcquisitionShadow(
          createEvidenceAcquisitionShadowObserver(taskStore, runtimeRepository),
        ),
      );
      stopFns.push(
        configureResearchScoutEvidenceShadow(
          createEvidenceAcquisitionShadowObserver(taskStore, runtimeRepository),
        ),
      );
      stopFns.push(
        configureSellerEvidenceAcquisitionShadow(
          createEvidenceAcquisitionShadowObserver(taskStore, runtimeRepository),
        ),
      );
      // Evidence tasks only persist planner decisions and shadow observations.
      // They never call a provider, purchase evidence, or mutate live authority.
      appLogger.info('V2 evidence acquisition shadow handlers enabled');
    }
    if (stakingShadowEnabled && evidenceRuntime) {
      const stakeQualificationObserver = createStakeQualificationShadowObserver(taskStore, runtimeRepository);
      stopFns.push(configureSellerStakeQualificationShadow(stakeQualificationObserver));
      stopFns.push(
        configureStakeQualificationShadowIngress((data) => stakeQualificationObserver({ data })),
      );
      const fundingResumeObserver = createStakeFundingResumeObserver(
        taskStore,
        evidenceRuntime,
        runtimeRepository,
      );
      stopFns.push(
        configureStakeFundingResumeIngress((data) => fundingResumeObserver(data)),
      );
      stopFns.push(
        bus.subscribe((event) => {
          if (event.type !== 'agent.funded') return;
          const payload = event.payload ?? {};
          const agentAddress = typeof payload.agentAddress === 'string' ? payload.agentAddress : null;
          const amountUsdc = typeof payload.amountUsdc === 'string' || typeof payload.amountUsdc === 'number'
            ? String(payload.amountUsdc)
            : null;
          const movementState = typeof payload.movementState === 'string' ? payload.movementState : null;
          if (!agentAddress || !amountUsdc || !movementState) return;
          const reference = typeof payload.reference === 'string' ? payload.reference : undefined;
          const txHash = typeof payload.txHash === 'string' ? payload.txHash : undefined;
          void fundingResumeObserver({
            agentAddress,
            amountUsdc,
            movementState,
            observedAtUnix: Math.floor(event.ts / 1_000),
            ...(reference ? { reference } : {}),
            ...(txHash ? { txHash } : {}),
          }).catch((err) =>
            appLogger.warn(
              { err: (err as Error).message, agentAddress },
              'V2 stake funding resume shadow enqueue failed',
            ),
          );
        }),
      );
      appLogger.info('V2 staking qualification and funding-resume shadow handlers enabled');
    }
    if (config.FINANCIAL_COMMANDS_V2_ENABLED) {
      // The command task records policy decisions and provider observations
      // only. No handler path invokes Circle, a chain executor, or a wallet.
      // Verified Circle webhook observations feed the reconciliation task only
      // when they carry both explicit command correlation and provider ID;
      // unrelated notifications are ignored instead of guessed into a command.
      const reconcileObserver = createFinancialReconciliationShadowObserver(taskStore);
      const commandShadowObserver =
        financialShadowObserver ?? createFinancialCommandShadowObserver(taskStore, runtimeRepository);
      stopFns.push(
        configureFinancialCommandShadow(commandShadowObserver),
      );
      stopFns.push(
        configureX402GatewayFundingShadow(commandShadowObserver),
      );
      stopFns.push(
        configureDealFinancialCommandShadow(commandShadowObserver),
      );
      stopFns.push(
        bus.subscribe((event) => {
          if (event.type !== 'circle.webhook') return;
          const observation = parseCircleReconciliationObservation(
            event.payload.notification,
            Math.floor(event.ts / 1000),
          );
          if (!observation) return;
          void reconcileObserver({ data: observation }).catch((err) =>
            appLogger.warn(
              { err: (err as Error).message, providerId: observation.providerId },
              'V2 financial reconciliation shadow enqueue failed',
            ),
          );
        }),
      );
      appLogger.info('V2 financial command shadow handler enabled');
    }
    if (config.FINANCIAL_RECONCILIATION_V2_ENABLED) {
      if (!financialRuntime || !reconciliationCircleAdapter) {
        appLogger.error('V2 financial reconciliation worker not started because its repository or adapter is unavailable');
      } else {
        const reconciliationWorker = createFinancialReconciliationWorker(
          financialRuntime,
          reconciliationCircleAdapter,
          {
            onError: (err) =>
              appLogger.error(
                { err: err instanceof Error ? err.message : String(err) },
                'V2 financial reconciliation worker failed',
              ),
            onResult: (result) => {
              if (result.errors.length > 0) {
                appLogger.warn(
                  { scanned: result.scanned, polled: result.polled, updated: result.updated, errors: result.errors.length },
                  'V2 financial reconciliation completed with provider errors',
                );
              } else if (result.updated > 0) {
                appLogger.info(
                  { scanned: result.scanned, polled: result.polled, updated: result.updated },
                  'V2 financial reconciliation updated persisted provider state',
                );
              }
            },
          },
        );
        reconciliationWorker.start();
        stopFns.push(() => reconciliationWorker.stop());
        appLogger.info('V2 financial reconciliation worker started in read-only mode');
      }
    }
    if (config.REVIEWED_OPERATION_TASKS_V2_ENABLED) {
      appLogger.warn(
        'reviewed operation task handlers registered behind explicit flag; no legacy route enqueues them',
      );
    }
    if (config.MATCH_ENGINE_V2_SHADOW) {
      if (proposalRevisionStore) {
        stopFns.push(configureMatchProposalRevisionObserver(proposalRevisionStore));
      }
      stopFns.push(
        configureBuyerTimerShadow(
          createBuyerTimerShadowObserver(
            taskStore,
            buyerSnapshotStore,
            buyerParityStore,
          ),
        ),
      );
      stopFns.push(
        configureBuyerTimerParity(createBuyerTimerParityObserver(buyerParityStore)),
      );
      stopFns.push(
        configureMatchingEngineShadow(createMatchingShadowObserver(matchingAuditStore)),
      );
      stopFns.push(
        configureListingMatchingEngineShadow(createMatchingShadowObserver(matchingAuditStore)),
      );
      appLogger.info('V2 buyer timer shadow scheduling enabled');
      appLogger.info('V2 immutable MatchProposal revision audit enabled');
    }
    const taskRunner = new DurableTaskRunner(taskStore, taskHandlers, {
      workerId: `karwan-task-${process.pid}`,
      onError: (err, task) =>
        appLogger.error(
          { err: (err as Error).message, taskId: task?.id, taskKind: task?.kind },
          'V2 durable task execution failed',
        ),
    });
    stopFns.push(
      startDurableTaskRunnerLoop(taskRunner, {
        onError: (err) =>
          appLogger.error({ err: (err as Error).message }, 'V2 durable task runner failed'),
        onResult: ({ retried, deadLettered, leaseLost }) => {
          if (deadLettered > 0 || leaseLost > 0) {
            appLogger.error(
              { deadLettered, leaseLost },
              'V2 durable tasks need operator attention',
            );
          } else if (retried > 0) {
            appLogger.warn({ retried }, 'V2 durable tasks scheduled for retry');
          }
        },
      }),
    );
    appLogger.info({ handlerCount: Object.keys(taskHandlers).length }, 'V2 durable task runner started');
  } else if (config.AGENT_RUNTIME_V2_ENABLED) {
    appLogger.error('V2 durable task runner not started because Postgres schema is unavailable');
  } else if (config.MATCH_ENGINE_V2_SHADOW) {
    appLogger.error('V2 buyer timer shadow requires AGENT_RUNTIME_V2_ENABLED');
  } else if (config.NEGOTIATION_V2_SHADOW) {
    appLogger.error('V2 structured negotiation shadow requires AGENT_RUNTIME_V2_ENABLED');
  } else if (config.EVIDENCE_V2_SHADOW) {
    appLogger.error('V2 evidence qualification shadow requires AGENT_RUNTIME_V2_ENABLED');
  } else if (config.STAKING_V2_ENABLED) {
    appLogger.error('V2 staking qualification shadow requires AGENT_RUNTIME_V2_ENABLED and Postgres');
  } else if (config.FINANCIAL_COMMANDS_V2_ENABLED) {
    appLogger.error('V2 financial command shadow requires AGENT_RUNTIME_V2_ENABLED');
  } else if (config.FINANCIAL_RECONCILIATION_V2_ENABLED) {
    appLogger.error('V2 financial reconciliation requires AGENT_RUNTIME_V2_ENABLED');
  } else if (config.REVIEWED_OPERATION_TASKS_V2_ENABLED) {
    appLogger.error('reviewed operation task handlers require AGENT_RUNTIME_V2_ENABLED and Postgres');
  } else if (config.EVIDENCE_RESEARCH_CREDIT_V2_ENABLED) {
    appLogger.error('reviewed x402 evidence requires REVIEWED_OPERATION_TASKS_V2_ENABLED, AGENT_RUNTIME_V2_ENABLED, and Postgres');
  }
  bootAgents();
  // Telegram bot + notifier: both no-op cleanly when TELEGRAM_BOT_TOKEN is unset.
  try {
    stopFns.push(startTelegramBot());
    stopFns.push(startTeamDaily());
    stopFns.push(startTelegramNotifier());
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'telegram not started');
  }
  // Live-support housekeeping: prune closed conversations, archive abandoned
  // ones. No-op-safe regardless of whether the handoff is configured.
  stopFns.push(startSupportSweeper());
  // Email notifier: deal lifecycle alerts to verified contact emails. No-op
  // cleanly when RESEND_API_KEY is unset.
  try {
    stopFns.push(startEmailNotifier());
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'email notifier not started');
  }
  // X broadcaster queues posts for users with a bound handle. The actual API
  // post is a follow-up; this just wires the subscription so the queue is
  // observable in the activity feed.
  try {
    stopFns.push(startXBroadcaster());
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'x broadcaster not started');
  }
  // Resume any bridge that burned but never minted, e.g. across a restart.
  resumePendingBridges().catch((err) =>
    appLogger.error({ err: (err as Error).message }, 'bridge resume failed'),
  );
  /// One-shot replay of historical chain events into the bus when the disk
  /// snapshot (data/events.json) is missing or empty. Without this, a fresh
  /// deploy or VPS restore comes up with /activity showing zero events even
  /// though the chain has full history. Fire-and-forget: the boot path
  /// completes immediately, the replay populates the bus in the background,
  /// and the next /api/activity read after it finishes returns the seeded
  /// history. Skips itself if the bus already loaded from disk.
  ///
  /// FORCE_EVENT_BACKFILL=1 on the env bypasses the skip-guard and replays
  /// unconditionally. Use after a contract redeploy, after a VPS rebuild
  /// that left a stale data/events.json behind, or any time /activity shows
  /// zero on a chain that obviously has history. Safe to leave on; the
  /// replay dedupes by (type|jobId|ts) when injecting.
  const forceBackfill =
    (process.env.FORCE_EVENT_BACKFILL ?? '').toLowerCase() === '1' ||
    (process.env.FORCE_EVENT_BACKFILL ?? '').toLowerCase() === 'true';
  /// Hydrate the in-memory bus from Postgres before the chain replay
  /// decides whether to run. PG is the durable store; once we load the
  /// last HISTORY_CAPACITY events the boot-guard correctly skips the
  /// expensive chain scan unless the operator forces it. Without this
  /// step, a fresh container with an empty events.json would always
  /// trigger a full replay even though the DB has the data.
  await bus.hydrateFromPg().then(
    (added) =>
      appLogger.info({ added, total: bus.historyLength() }, 'bus hydrated from postgres'),
    (err) =>
      appLogger.warn({ err: (err as Error).message }, 'bus PG hydrate failed; using disk JSON'),
  );
  backfillBusFromChain({ force: forceBackfill }).catch((err) =>
    appLogger.error({ err: (err as Error).message }, 'event backfill failed'),
  );
  /// Bring the bus in line with per-user bridge persistence. The bridge
  /// store survives events.json wipes, so without this the activity-page
  /// BRIDGE counter reads 0 while the per-user bridge history modal still
  /// shows every bridge the user made. Idempotent, the bus dedupes by
  /// (type|jobId|ts). Fire-and-forget; an empty bridge store is a no-op.
  syncBridgeEventsToBus().catch((err) =>
    appLogger.error({ err: (err as Error).message }, 'bridge event sync failed'),
  );
}

void boot();

const port = config.PORT;
const server = serve({ fetch: app.fetch, port }, (info) => {
  appLogger.info({ port: info.port, env: config.NODE_ENV }, 'karwan backend listening');
});

// Bump Node's HTTP timeouts well above the worst-case Circle DCW path.
// The Circle bridge endpoint signs two on-chain calls back-to-back
// (approve + depositForBurn). Each takes 10-30s through Circle's API
// + RPC, so the combined response can comfortably exceed Node 20's
// default `headersTimeout` of 60s. Without these overrides, the socket
// closes before we send a response and the browser reports
// "Failed to fetch", even though the on-chain work actually completed.
//
// @hono/node-server's ServerType union includes HTTP/2 servers, which
// lack these properties. We're always on HTTP/1 (no http2 config), so
// narrow via a structural cast and set the overrides defensively.
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const httpServer = server as unknown as {
  headersTimeout?: number;
  requestTimeout?: number;
  timeout?: number;
};
if ('headersTimeout' in httpServer) httpServer.headersTimeout = FIFTEEN_MINUTES_MS;
if ('requestTimeout' in httpServer) httpServer.requestTimeout = FIFTEEN_MINUTES_MS;
if ('timeout' in httpServer) httpServer.timeout = FIFTEEN_MINUTES_MS;

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    appLogger.info({ sig }, 'shutting down');
    // Last durable copy of in-flight bids before the process exits (the debounced
    // async flush may not have fired for the most recent round).
    try {
      flushActiveBidsSync();
    } catch {
      /* best-effort */
    }
    stopFns.forEach((fn) => fn());
    process.exit(0);
  });
}

export { app };
