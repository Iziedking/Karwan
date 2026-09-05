import { Hono } from 'hono';
import { formatUnits } from 'viem';
import { z } from 'zod';
import { config } from '../config.js';
import { appendActivity } from '../db/activityLog.js';
import { logger } from '../logger.js';
import { viewerAddress } from '../auth/session.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { readUsdcBalance } from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import { bus } from '../events.js';
import {
  RESEARCH_ACTIVATION_USDC,
  activateResearch,
  getResearchState,
  chargeResearch,
} from '../x402/researchAccount.js';
import { researchMarket } from '../x402/externalClient.js';
import { recordExternalResearchFailure, recordExternalResearchPayment } from '../x402/researchAccounting.js';
import { extractKeywords } from '../llm/keywords.js';
import { saveScoutRead, recentScoutReads } from '../db/scoutReads.js';
import { randomUUID } from 'node:crypto';
import type { EvidenceAcquisitionShadowObserver } from '../agents/evidenceAcquisitionShadow.js';
import { buildResearchScoutEvidenceAcquisitionObservation } from '../agents/evidenceAcquisitionProjection.js';
import {
  unavailableAgentKitVerifier,
  type AgentKitVerificationRequest,
  type AgentKitVerifier,
} from '../agentkit/agentKitVerification.js';
import {
  ResearchAllowanceExhaustedError,
  ResearchAllowanceExpiredError,
  ResearchAllowanceReplayError,
  type ResearchAllowanceStore,
} from '../evidence/researchAllowance.js';

/// "Agent research" activation. The user pays a one-time fee in USDC on Arc
/// from their agent wallet; it becomes a prepaid credit the agent draws down as
/// it pays for live market research (x402, off-platform). UI copy never says
/// "x402"; it frames this as the agent paying for its own research.
export const researchRoutes = new Hono();

let researchScoutEvidenceShadowObserver: EvidenceAcquisitionShadowObserver | null = null;
let agentKitResearchEnabled = false;
let agentKitVerifier: AgentKitVerifier = unavailableAgentKitVerifier();
let agentKitAllowanceStore: ResearchAllowanceStore | null = null;

export function configureAgentKitResearch(input: {
  enabled: boolean;
  verifier?: AgentKitVerifier;
  allowanceStore?: ResearchAllowanceStore;
}): () => void {
  agentKitResearchEnabled = input.enabled;
  agentKitVerifier = input.verifier ?? unavailableAgentKitVerifier();
  agentKitAllowanceStore = input.allowanceStore ?? null;
  return () => {
    agentKitResearchEnabled = false;
    agentKitVerifier = unavailableAgentKitVerifier();
    agentKitAllowanceStore = null;
  };
}

/**
 * Installs the optional read-only scout evidence observer. The legacy scout
 * provider call and research-credit charge remain authoritative; this hook
 * only enqueues a durable shadow observation after the result is available.
 */
export function configureResearchScoutEvidenceShadow(
  observer: EvidenceAcquisitionShadowObserver | null,
): () => void {
  researchScoutEvidenceShadowObserver = observer;
  return () => {
    if (researchScoutEvidenceShadowObserver === observer) researchScoutEvidenceShadowObserver = null;
  };
}

const USDC_DECIMALS = 6;

researchRoutes.get('/status', async (c) => {
  const owner = viewerAddress(c);
  if (!owner) return c.json({ active: false, creditUsdc: 0, priceUsdc: RESEARCH_ACTIVATION_USDC });
  const state = await getResearchState(owner);
  return c.json({ ...state, priceUsdc: RESEARCH_ACTIVATION_USDC });
});

researchRoutes.post('/activate', async (c) => {
  const owner = viewerAddress(c);
  if (!owner) return c.json({ error: 'sign in first' }, 401);
  if (!config.KARWAN_TREASURY_ADDR) return c.json({ error: 'research not configured' }, 503);

  const wallets = await getAgentWallets(owner).catch(() => null);
  if (!wallets?.buyerWalletId || !wallets.buyerAddress) {
    return c.json({ error: 'activate your agent first' }, 400);
  }

  const feeAtomic = BigInt(Math.round(RESEARCH_ACTIVATION_USDC * 10 ** USDC_DECIMALS));
  // Pay from whichever agent wallet can cover it: the buyer agent first, then
  // the seller agent. Either funds the same prepaid research credit. If neither
  // holds enough, return a graceful insufficient-funds with the best balance
  // seen so the user knows to top up an agent wallet.
  const candidates: Array<{ walletId: string; address: string }> = [
    { walletId: wallets.buyerWalletId, address: wallets.buyerAddress },
  ];
  if (wallets.sellerWalletId && wallets.sellerAddress) {
    candidates.push({ walletId: wallets.sellerWalletId, address: wallets.sellerAddress });
  }
  let payer: { walletId: string; address: string } | null = null;
  let payerBalBefore = 0n;
  let bestBalance = 0n;
  for (const cand of candidates) {
    const bal = await readUsdcBalance(cand.address).catch(() => 0n);
    if (bal > bestBalance) bestBalance = bal;
    if (bal >= feeAtomic) {
      payer = cand;
      payerBalBefore = bal;
      break;
    }
  }
  if (!payer) {
    return c.json(
      {
        error: 'insufficient-balance',
        needUsdc: RESEARCH_ACTIVATION_USDC,
        haveUsdc: Number(formatUnits(bestBalance, USDC_DECIMALS)),
        message: 'Fund a buyer or seller agent wallet, then add research credit.',
      },
      402,
    );
  }

  try {
    const tx = await executeContractCall(
      {
        walletId: payer.walletId,
        contractAddress: config.USDC_ADDR,
        abiFunctionSignature: 'transfer(address,uint256)',
        abiParameters: [config.KARWAN_TREASURY_ADDR, feeAtomic.toString()],
      },
      'research.activate',
    );
    // On Arc an agent SCA userOp can report COMPLETE at the handleOps layer while
    // the inner USDC transfer reverts (the ERC-4337 inner-revert gotcha), so the
    // txHash alone is not proof the fee moved. This bites a wallet holding exactly
    // the fee with no headroom for the USDC-denominated gas. Verify the payer's
    // balance actually dropped by at least the fee before crediting; otherwise the
    // charge silently no-oped and we must not record a credit the user did not pay.
    const balAfter = await readUsdcBalance(payer.address).catch(() => null);
    if (balAfter !== null && payerBalBefore - balAfter < feeAtomic) {
      logger.warn(
        { owner, txHash: tx.txHash, before: payerBalBefore.toString(), after: balAfter.toString() },
        'research charge did not move the fee; treating as insufficient',
      );
      return c.json(
        {
          error: 'insufficient-balance',
          needUsdc: RESEARCH_ACTIVATION_USDC,
          haveUsdc: Number(formatUnits(balAfter, USDC_DECIMALS)),
          message: 'The charge did not go through. Top up your agent wallet and try again.',
        },
        402,
      );
    }
    const state = await activateResearch(owner, RESEARCH_ACTIVATION_USDC);
    bus.emitEvent({
      type: 'agent.funded',
      actor: 'platform',
      payload: {
        user: owner,
        agent: 'research',
        amountUsdc: String(RESEARCH_ACTIVATION_USDC),
        scope: 'agent-research-activation',
        // The hash was already in hand and left out of the event, so the only
        // copy of it lived in a response body the user sees once.
        txHash: tx.txHash,
      },
    });
    void appendActivity({
      address: owner,
      kind: 'agent_spend',
      summary: `Paid ${RESEARCH_ACTIVATION_USDC} USDC to activate agent market research`,
      params: {t: 'researchActivate', amount: String(RESEARCH_ACTIVATION_USDC)},
      amountUsdc: String(RESEARCH_ACTIVATION_USDC),
      txHash: tx.txHash,
    });
    logger.info({ owner, txHash: tx.txHash }, 'agent research activated');
    return c.json({ ...state, txHash: tx.txHash });
  } catch (err) {
    logger.error({ owner, err: (err as Error).message }, 'research activation failed');
    return c.json({ error: 'activation failed', detail: (err as Error).message }, 502);
  }
});

const agentKitRequestSchema = z.object({
  agentAddress: z.string(),
  domain: z.string(),
  nonce: z.string(),
  issuedAt: z.number().int(),
  expiresAt: z.number().int(),
  signature: z.string(),
  proof: z.unknown(),
});

researchRoutes.get('/agentkit/status', (c) => {
  if (!viewerAddress(c)) return c.json({ error: 'sign in first' }, 401);
  return c.json({
    verification: 'not-checked' as const,
    provider: 'world-agentbook' as const,
    mode: agentKitResearchEnabled && agentKitAllowanceStore ? 'sandbox-ready' as const : 'unavailable' as const,
    allowancePolicy: { scope: 'counterparty-report' as const, reportsPer24Hours: 3 },
    allowance: null,
  });
});

researchRoutes.post('/agentkit/verify', async (c) => {
  if (!agentKitResearchEnabled || !agentKitAllowanceStore) {
    return c.json({ error: 'agentkit verification unavailable', code: 'PROVIDER_UNAVAILABLE' }, 503);
  }
  const parsed = agentKitRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid agentkit proof', code: 'PROOF_REJECTED' }, 400);
  const result = await agentKitVerifier.verify(parsed.data as AgentKitVerificationRequest);
  if (result.status !== 'verified') {
    return c.json({ error: result.message, code: result.code }, result.status === 'unavailable' ? 503 : 403);
  }
  try {
    await agentKitAllowanceStore.recordBinding({
      agentAddress: result.agentAddress,
      humanKeyDigest: result.humanKeyDigest,
      verifier: result.verifier,
      checkedAt: result.checkedAt,
      expiresAt: result.expiresAt,
    });
    const consumed = await agentKitAllowanceStore.consume({
      humanKeyDigest: result.humanKeyDigest,
      agentAddress: result.agentAddress,
      domain: parsed.data.domain,
      nonce: parsed.data.nonce,
      nonceExpiresAt: parsed.data.expiresAt,
    });
    return c.json({
      verification: 'verified' as const,
      provider: result.verifier,
      allowance: consumed.snapshot,
      boundAgentCount: (await agentKitAllowanceStore.listBindings(result.humanKeyDigest)).length,
    });
  } catch (error) {
    if (error instanceof ResearchAllowanceReplayError) return c.json({ error: error.message, code: 'NONCE_REPLAY' }, 409);
    if (error instanceof ResearchAllowanceExpiredError) return c.json({ error: error.message, code: 'NONCE_EXPIRED' }, 400);
    if (error instanceof ResearchAllowanceExhaustedError) return c.json({ error: error.message, code: 'ALLOWANCE_EXHAUSTED' }, 429);
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'agentkit allowance failed');
    return c.json({ error: 'agentkit allowance unavailable', code: 'ALLOWANCE_UNAVAILABLE' }, 503);
  }
});

/// User-triggered market scout (audit/AGENTIC_WORKFLOW_REVIEW.md item 10). The
/// user submits a topic or keywords, their prepaid research credit funds a fresh
/// off-platform read (cache bypassed), and the result renders as a MarketRead
/// card they can carry into a request. Same paid rail the agents use, exposed
/// directly to the user. Soft-capped to keep one account from draining the rail.
const SCOUT_RATE_LIMIT = 5;
const SCOUT_WINDOW_MS = 60 * 60 * 1000;
const scoutHits = new Map<string, number[]>();

function scoutHitCount(owner: string, now: number): number {
  const hits = (scoutHits.get(owner) ?? []).filter((t) => now - t < SCOUT_WINDOW_MS);
  scoutHits.set(owner, hits);
  return hits.length;
}

function recordScoutHit(owner: string, now: number): void {
  const hits = scoutHits.get(owner) ?? [];
  hits.push(now);
  scoutHits.set(owner, hits);
}

researchRoutes.post('/scout', async (c) => {
  if (!config.SCOUT_ENABLED) return c.json({ error: 'scout not enabled' }, 404);
  const owner = viewerAddress(c);
  if (!owner) return c.json({ error: 'sign in first' }, 401);
  if (!config.X402_PAID_SIGNALS_ENABLED || !config.X402_BASE_PRIVATE_KEY) {
    return c.json({ error: 'market research is not configured' }, 503);
  }

  const now = Date.now();
  const key = owner.toLowerCase();
  if (scoutHitCount(key, now) >= SCOUT_RATE_LIMIT) {
    return c.json(
      { error: 'rate-limited', message: 'Up to 5 market scouts an hour. Try again shortly.' },
      429,
    );
  }

  const body = (await c.req.json().catch(() => ({}))) as { keywords?: unknown; query?: unknown };
  const rawKeywords = Array.isArray(body.keywords) ? body.keywords : [];
  let keywords = rawKeywords
    .map((k) => (typeof k === 'string' ? k.trim() : ''))
    .filter(Boolean)
    .slice(0, 8);
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 400) : '';
  if (keywords.length === 0 && query) keywords = await extractKeywords(query, 'scout');
  if (keywords.length === 0) {
    return c.json({ error: 'give a topic or keywords to scout' }, 400);
  }

  // The scout draws the user's prepaid research credit, so it requires an active
  // account. Same 402 shape the activation route uses so the UI can prompt.
  const state = await getResearchState(owner);
  if (!state.active) {
    return c.json(
      {
        error: 'no-research-credit',
        priceUsdc: RESEARCH_ACTIVATION_USDC,
        message: 'Activate agent research first to scout the market.',
      },
      402,
    );
  }

  recordScoutHit(key, now);
  let read;
  try {
    read = await researchMarket(keywords, query || undefined, {
      bypassCache: true,
      onPayment: async (notice) => {
        await recordExternalResearchPayment({
          notice,
          actor: 'platform',
          agent: 'scout',
          owner,
          scope: 'market-scout',
        });
        // Scout credit is prepaid by the requesting user. Decrement it per
        // confirmed provider payment, before synthesis, so a later model
        // failure cannot make paid research disappear from the account ledger.
        await chargeResearch(owner, notice.amountUsd);
        const keywordLabel =
          keywords.slice(0, 3).join(', ') +
          (keywords.length > 3 ? ` +${keywords.length - 3}` : '');
        await appendActivity({
          address: owner,
          kind: 'agent_spend',
          summary: `Your scout agent paid ${notice.amountUsd} USDC for a market read on ${keywordLabel}`,
          params: { t: 'marketRead', amount: String(notice.amountUsd), keywords: keywordLabel },
          amountUsdc: String(notice.amountUsd),
          ...(notice.txHash ? { txHash: notice.txHash } : {}),
        });
      },
      onFailure: (notice) => {
        recordExternalResearchFailure({
          notice,
          actor: 'platform',
          agent: 'scout',
          scope: 'market-scout',
        });
      },
    });
  } catch (err) {
    logger.warn({ owner, err: (err as Error).message }, 'market scout failed');
    return c.json({ error: 'scout failed', detail: (err as Error).message }, 502);
  }

  // Observe the already-completed legacy read before billing/accounting below.
  // Any enqueue failure is isolated so the existing scout response and credit
  // semantics remain unchanged.
  const evidenceObserver = researchScoutEvidenceShadowObserver;
  if (evidenceObserver) {
    try {
      const data = buildResearchScoutEvidenceAcquisitionObservation(read, owner);
      void evidenceObserver({ data }).catch((err) => {
        logger.warn(
          { owner, err: (err as Error).message },
          'research scout evidence shadow observation failed',
        );
      });
    } catch (err) {
      logger.warn(
        { owner, err: (err as Error).message },
        'research scout evidence shadow projection failed',
      );
    }
  }

  await saveScoutRead({ id: randomUUID(), owner, ts: now, read });
  const after = await getResearchState(owner);
  return c.json({ read, creditUsdc: after.creditUsdc });
});

/// Recent scouts for the signed-in user, newest first. Powers the scout history
/// and the "use in a request" prefill.
researchRoutes.get('/scout/recent', async (c) => {
  const owner = viewerAddress(c);
  if (!owner) return c.json({ scouts: [] });
  const limit = Math.min(20, Math.max(1, Number(c.req.query('limit') ?? 8) || 8));
  const scouts = await recentScoutReads(owner, limit);
  return c.json({ scouts });
});
