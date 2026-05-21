import { Hono } from 'hono';
import { formatUnits, keccak256, parseUnits, toBytes, type Address } from 'viem';
import { z } from 'zod';
import { jobBoard } from '../chain/contracts.js';
import { publicClient, arcTestnet } from '../chain/client.js';
import { executeContractCall } from '../chain/txs.js';
import {
  getBuyerSnapshot,
  getBuyerJob,
  reseedJobFromChain,
  getMatchProposal,
  listMatchProposalsForUser,
  approveAgentMatch,
  declineAgentMatch,
  getMarketplaceBriefs,
  cancelBriefByBuyer,
  type MarketplaceBrief,
} from '../agents/buyer.js';
import { resolveBuyerProfileForUser } from '../agents/agent-registry.js';
import { createBrief, patchBrief, getBrief } from '../db/briefs.js';
import { getDeal } from '../db/deals.js';
import { extractKeywords } from '../llm/keywords.js';
import { sessionAddress } from '../auth/session.js';
import { logger } from '../logger.js';

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');
const callerSchema = z.object({ caller: addrSchema });
const declineSchema = z.object({ caller: addrSchema, reason: z.string().min(1).max(400).optional() });
const inFlight = new Set<string>();

const USDC_DECIMALS = 6;
const NATIVE_DECIMALS = arcTestnet.nativeCurrency.decimals;

/// Deadline accepts either legacy `deadlineDays` (int 1-90) or the newer
/// `deadlineSeconds` (60s to 90d). Frontend's deadline-unit picker sends
/// `deadlineSeconds`; older clients still send `deadlineDays`. One required.
const MIN_DEADLINE_SECONDS = 60;
const MAX_DEADLINE_SECONDS = 90 * 86_400;

const postJobSchema = z
  .object({
    posterAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address'),
    brief: z.string().min(5).max(500),
    budgetUsdc: z.number().positive().max(5_000_000),
    deadlineDays: z.number().int().min(1).max(90).optional(),
    deadlineSeconds: z
      .number()
      .int()
      .min(MIN_DEADLINE_SECONDS)
      .max(MAX_DEADLINE_SECONDS)
      .optional(),
    /** Per-brief tolerance: agent may accept seller counters up to budget * (1 + pct/100).
     * 0 = strict (no negotiation above budget). Capped at 50 to keep agents sane. */
    negotiationMaxIncreasePct: z.number().min(0).max(50).optional(),
  })
  .refine((b) => b.deadlineDays != null || b.deadlineSeconds != null, {
    message: 'deadlineDays or deadlineSeconds required',
    path: ['deadlineSeconds'],
  });

export const jobsRoutes = new Hono();

jobsRoutes.get('/', (c) => c.json(getBuyerSnapshot()));

/// Open buyer briefs packaged for the marketplace surface. Public; we mask
/// the buyer address so a crawler can't enumerate wallets. A brief leaves the
/// market the moment it is spoken for: getMarketplaceBriefs already drops
/// finalized/funded/cancelled/expired in-memory state, and here we also drop any
/// brief that carries an active (non-declined) match proposal or a created deal,
/// so a matched brief can never linger as "awaiting bids".
jobsRoutes.get('/marketplace', async (c) => {
  function mask(addr: string): string {
    return /^0x[a-fA-F0-9]{40}$/.test(addr)
      ? `${addr.slice(0, 6)}…${addr.slice(-4)}`
      : addr;
  }
  const candidates = getMarketplaceBriefs();
  const out: Array<MarketplaceBrief & { buyer: string }> = [];
  for (const b of candidates) {
    const proposal = await getMatchProposal(b.jobId);
    if (proposal && !proposal.declinedAt) continue;
    const deal = await getDeal(b.jobId);
    if (deal) continue;
    out.push({ ...b, buyer: mask(b.buyer) });
  }
  return c.json({ briefs: out });
});

jobsRoutes.get('/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  let job = getBuyerJob(jobId);
  // Backend restarts wipe the in-memory jobs Map. If the boot backfill window
  // didn't reach this job's JobPosted block, the route would 404 even when a
  // match proposal exists. Try an on-demand reseed before giving up.
  if (!job) {
    const ok = await reseedJobFromChain(jobId);
    if (ok) job = getBuyerJob(jobId);
  }
  if (!job) return c.json({ error: 'not found' }, 404);
  const brief = getBrief(jobId);

  // Privacy: the full job page (bids, negotiation, amounts) belongs to the two
  // parties only. The buyer who posted it always sees it; once a match exists,
  // the matched seller does too. Everyone else gets a status-only summary so the
  // page can say "collecting bids" / "in negotiation" without leaking the
  // auction. Identity is the signed session, never a client-supplied param.
  const caller = sessionAddress(c);
  const proposal = await getMatchProposal(jobId);
  const deal = await getDeal(jobId);
  const parties = new Set<string>();
  if (brief?.postedBy) parties.add(brief.postedBy.toLowerCase());
  if (proposal) {
    parties.add(proposal.buyerUser.toLowerCase());
    parties.add(proposal.sellerUser.toLowerCase());
  }
  if (deal) {
    parties.add(deal.buyer.toLowerCase());
    parties.add(deal.seller.toLowerCase());
  }
  const isParty = !!caller && parties.has(caller);

  if (!isParty) {
    const matched = !!(proposal || deal) || job.finalized || job.escrowFunded;
    const status = job.cancelledAt
      ? 'cancelled'
      : job.expiredAt
        ? 'expired'
        : matched
          ? 'negotiating'
          : 'open';
    return c.json({ jobId, isParty: false, status });
  }

  // Merge the off-chain brief metadata (human-readable text, negotiation
  // ceiling) into the response so the job page can render it inline. The
  // on-chain snapshot only carries the termsHash for integrity.
  return c.json({
    ...job,
    isParty: true,
    briefText: brief?.briefText ?? null,
    keywords: brief?.keywords ?? null,
    negotiationMaxIncreasePct: brief?.negotiationMaxIncreasePct ?? null,
  });
});

jobsRoutes.post('/', async (c) => {
  let body;
  try {
    body = postJobSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }

  // Managed jobs run on the poster's own buyer agent, so they must have
  // activated and filled a buyer profile.
  const buyerProfile = await resolveBuyerProfileForUser(body.posterAddress);
  if (!buyerProfile) {
    return c.json(
      {
        error: 'buyer profile required',
        detail:
          'Activate your agent wallets and set up a buyer profile before posting a managed job.',
      },
      409,
    );
  }

  try {
    const balanceWei = await publicClient.getBalance({
      address: buyerProfile.address as Address,
    });
    const balanceUsdc = Number(formatUnits(balanceWei, NATIVE_DECIMALS));
    const headroom = body.budgetUsdc + 0.5;
    if (balanceUsdc < headroom) {
      return c.json(
        {
          error: 'insufficient buyer balance',
          detail: `Your buyer agent has ${balanceUsdc.toFixed(2)} USDC, this deal needs >= ${headroom.toFixed(2)} USDC (budget plus gas). Fund it from your profile page.`,
          balanceUsdc,
          budgetUsdc: body.budgetUsdc,
        },
        409,
      );
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'balance precheck skipped');
  }

  const jobId = keccak256(toBytes(`${body.brief}|${Date.now()}|${Math.random()}`));
  const budgetWei = parseUnits(body.budgetUsdc.toString(), USDC_DECIMALS);
  // Prefer the explicit seconds shape when both arrive; otherwise convert days.
  const deadlineSeconds = body.deadlineSeconds ?? (body.deadlineDays ?? 1) * 86_400;
  const deadlineUnix = Math.floor(Date.now() / 1000) + deadlineSeconds;
  const termsHash = keccak256(toBytes(body.brief));

  // Persist brief metadata BEFORE the on-chain call so agents have it when the
  // JobPosted event fires. On-chain only carries termsHash for integrity.
  createBrief({
    jobId,
    briefText: body.brief,
    postedBy: body.posterAddress,
    negotiationMaxIncreasePct: body.negotiationMaxIncreasePct,
  });

  // Extract canonical match keywords from the brief. Fire-and-forget; if the
  // LLM is slow, the seller agent's first-bid decision may not see them yet
  // (it falls back to budget-range matching). Updated in place via patchBrief.
  extractKeywords(body.brief, `brief:${jobId}`)
    .then((keywords) => {
      patchBrief(jobId, { keywords });
      logger.info({ jobId, keywords }, 'brief keywords extracted');
    })
    .catch(() => {});

  try {
    const result = await executeContractCall(
      {
        walletId: buyerProfile.walletId,
        contractAddress: jobBoard.address,
        abiFunctionSignature: 'postJob(bytes32,uint256,uint64,string)',
        abiParameters: [jobId, budgetWei.toString(), deadlineUnix.toString(), termsHash],
      },
      `postJob(${jobId})`,
    );
    return c.json({ jobId, deadlineUnix, ...result });
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'postJob failed');
    return c.json({ error: 'postJob failed', detail: (err as Error).message }, 502);
  }
});

/// The agent has reached agreement with a seller and is awaiting human approval
/// before touching the chain. Returns the pending match, or null if there is none.
jobsRoutes.get('/:jobId/match', async (c) => {
  const jobId = c.req.param('jobId');
  const proposal = await getMatchProposal(jobId);
  if (!proposal) return c.json({ proposal: null });
  // The proposal names both parties and the agreed price. Only they may read it.
  const caller = sessionAddress(c);
  const isParty =
    !!caller &&
    (caller === proposal.buyerUser.toLowerCase() ||
      caller === proposal.sellerUser.toLowerCase());
  if (!isParty) return c.json({ proposal: null });
  return c.json({ proposal });
});

/// All open match proposals where caller is either the buyer (awaiting their
/// approval) or the seller (waiting for buyer to approve). Seller-side use
/// case: the `/seller` dashboard polls this to surface "your bid became a
/// match" so sellers don't have to know jobIds to find their pending matches.
jobsRoutes.get('/matches/for', async (c) => {
  const caller = c.req.query('caller');
  if (!caller || !/^0x[a-fA-F0-9]{40}$/.test(caller)) {
    return c.json({ error: 'caller query param required (0x... address)' }, 400);
  }
  const all = await listMatchProposalsForUser(caller);
  const proposals = all.filter((p) => !p.approvedAt && !p.declinedAt);
  return c.json({ proposals });
});

/// Seller accepts the agent's matched proposal. The seller is the gate because
/// the agent negotiated on their behalf at a price that may differ from what
/// they'd want; the buyer already pre-committed via the brief's budget +
/// tolerance. Acceptance triggers acceptBid + fundEscrow via the BUYER's agent
/// wallet automatically (no separate buyer approval — the buyer's spending is
/// pre-authorized within budget+tolerance). From this point the deal follows
/// the standard direct-deal flow (delivered → release → settled).
jobsRoutes.post('/:jobId/approve-match', async (c) => {
  const jobId = c.req.param('jobId');
  let body;
  try {
    body = callerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const proposal = await getMatchProposal(jobId);
  if (!proposal) return c.json({ error: 'no match proposal for this job' }, 404);
  if (body.caller.toLowerCase() !== proposal.sellerUser) {
    return c.json({ error: 'only the seller can approve this match' }, 403);
  }
  if (inFlight.has(jobId)) {
    return c.json({ error: 'an action is already in progress for this job' }, 409);
  }

  inFlight.add(jobId);
  try {
    const result = await approveAgentMatch(jobId);
    if (!result.ok) {
      const status = result.code === 'INSUFFICIENT_AGENT_BALANCE' ? 409 : 502;
      return c.json({ error: 'approval failed', code: result.code, detail: result.message }, status);
    }
    return c.json({ accepted: true, jobId, txHash: result.txHash }, 200);
  } finally {
    inFlight.delete(jobId);
  }
});

/// Buyer cancels their own managed brief BEFORE a match has been approved.
/// After a match + escrow is funded the cancel lives on /deals/[id] (mutual
/// cancel + refund flow); this route only covers the pre-match window.
jobsRoutes.post('/:jobId/cancel', async (c) => {
  const jobId = c.req.param('jobId');
  let body;
  try {
    body = callerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const result = cancelBriefByBuyer(jobId as `0x${string}`, body.caller);
  if (!result.ok) {
    const status = result.code === 'NOT_BUYER' ? 403 : 409;
    return c.json({ error: result.message, code: result.code }, status);
  }
  return c.json({ accepted: true, jobId }, 200);
});

/// Seller declines the matched proposal. The job stays finalized in memory;
/// this just marks the proposal as not-pursued. Re-running the auction is a v2
/// follow-up. Buyer's pre-committed funds are never touched.
jobsRoutes.post('/:jobId/decline-match', async (c) => {
  const jobId = c.req.param('jobId');
  let body;
  try {
    body = declineSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const proposal = await getMatchProposal(jobId);
  if (!proposal) return c.json({ error: 'no match proposal for this job' }, 404);
  if (body.caller.toLowerCase() !== proposal.sellerUser) {
    return c.json({ error: 'only the seller can decline this match' }, 403);
  }
  const result = await declineAgentMatch(jobId, body.reason);
  if (!result.ok) return c.json({ error: result.message, code: result.code }, 409);
  return c.json({ accepted: true, jobId }, 200);
});
