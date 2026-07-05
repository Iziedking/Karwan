import { Hono } from 'hono';
import { formatUnits } from 'viem';
import { config } from '../config.js';
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
import { extractKeywords } from '../llm/keywords.js';
import { saveScoutRead, recentScoutReads } from '../db/scoutReads.js';
import { randomUUID } from 'node:crypto';

/// "Agent research" activation. The user pays a one-time fee in USDC on Arc
/// from their agent wallet; it becomes a prepaid credit the agent draws down as
/// it pays for live market research (x402, off-platform). UI copy never says
/// "x402"; it frames this as the agent paying for its own research.
export const researchRoutes = new Hono();

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
      },
    });
    logger.info({ owner, txHash: tx.txHash }, 'agent research activated');
    return c.json({ ...state, txHash: tx.txHash });
  } catch (err) {
    logger.error({ owner, err: (err as Error).message }, 'research activation failed');
    return c.json({ error: 'activation failed', detail: (err as Error).message }, 502);
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
    read = await researchMarket(keywords, query || undefined, { bypassCache: true });
  } catch (err) {
    logger.warn({ owner, err: (err as Error).message }, 'market scout failed');
    return c.json({ error: 'scout failed', detail: (err as Error).message }, 502);
  }

  // Bill the user's credit only on a fresh paid call. A shared in-flight read
  // returns cached: it was already billed to whoever triggered it, so re-billing
  // here would double-charge for one payment.
  if (!read.cached && read.paidUsd > 0) {
    await chargeResearch(owner, read.paidUsd);
    bus.emitEvent({
      type: 'agent.paid',
      actor: 'platform',
      payload: {
        rail: 'base',
        kind: 'research',
        agent: 'scout',
        scope: 'market-scout',
        user: key,
        amountUsd: read.paidUsd,
        txHash: read.txHash,
        payer: read.payer,
        demand: read.demand,
        keywords,
      },
    });
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
