import { Hono } from 'hono';
import {
  encodeAbiParameters,
  formatUnits,
  keccak256,
  parseUnits,
  toBytes,
  type Address,
} from 'viem';
import { z } from 'zod';
import { jobBoard, readPostedJobId } from '../chain/contracts.js';
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
  proceedAgentNearMiss,
  raiseMatchOffer,
  patchTrackedJobContext,
  reopenForNewBids,
  type MarketplaceBrief,
} from '../agents/buyer.js';
import { getPendingNearMiss, upsertNearMiss } from '../db/nearMiss.js';
import { getMarketAdvisory } from '../db/marketAdvisory.js';
import { getOutOfReach } from '../db/outOfReach.js';
import { endNearMissOnDecline, reRaiseNearMissFromPassed } from '../agents/nearMiss.js';
import { bus } from '../events.js';
import { resolveBuyerProfileForUser } from '../agents/agent-registry.js';
import { createBrief, patchBrief, getBrief, deleteBrief, rekeyBrief } from '../db/briefs.js';
import { accountTypeOf, deriveLane } from '../profile/accountType.js';
import { getDeal } from '../db/deals.js';
import { extractKeywords } from '../llm/keywords.js';
import { isSessionSelf, sessionAddress, viewerAddress } from '../auth/session.js';
import { logger } from '../logger.js';

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');
const callerSchema = z.object({ caller: addrSchema });
const declineSchema = z.object({ caller: addrSchema, reason: z.string().min(1).max(400).optional() });
const raiseSchema = z.object({ caller: addrSchema, priceUsdc: z.coerce.number().positive().max(1_000_000) });
/// Pre-match edit. Any of briefText, negotiationMaxIncreasePct, or trustedMatch
/// can change. Each field is optional but at least one must be provided. The
/// in-flight match guard at the route layer prevents a desync against a running
/// auction; once a proposal is on the table, the buyer declines it first.
/// On-chain budget and deadline remain locked at their post-time values. Those
/// live on JobBoard and changing them needs a new post.
const editBriefSchema = z
  .object({
    caller: addrSchema,
    briefText: z.string().min(5).max(2000).optional(),
    negotiationMaxIncreasePct: z.number().min(0).max(50).optional(),
    trustedMatch: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.briefText !== undefined ||
      b.negotiationMaxIncreasePct !== undefined ||
      b.trustedMatch !== undefined,
    { message: 'provide at least one field to change' },
  );
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
    /** Trusted Match mode. When true, the agent loop weights seller reputation
     *  and stake above price, and gates bids on the seller's free stake covering
     *  the deal's insurance reservation. For higher-value or one-shot deals. */
    trustedMatch: z.boolean().optional(),
    /** Per-brief milestone split the buyer stated in the request ("30% then
     *  70%"). Percentages must sum to 100. Overrides the buyer profile default
     *  at escrow funding; the managed flow funds a two-part split, so a 1 or
     *  3-4 part value is stored but only takes effect when it's two parts. */
    milestonePcts: z
      .array(z.number().int().min(1).max(99))
      .min(1)
      .max(4)
      .refine((a) => a.reduce((s, n) => s + n, 0) === 100, {
        message: 'milestonePcts must sum to 100',
      })
      .optional(),
    /** SME trade-finance fields (Phase 2 Track 2). All optional; service deals
     *  omit them entirely so the auction surface stays clean. The brief store
     *  (db/briefs.ts) snapshots these alongside the brief text so the buyer
     *  agent + downstream surfaces can read them without re-querying chain. */
    tradeType: z.enum(['service', 'goods', 'mixed']).optional(),
    incoterms: z.enum(['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP']).optional(),
    paymentTerms: z.enum(['immediate', 'net30', 'net60', 'net90']).optional(),
    counterpartyCompany: z
      .object({
        name: z.string().max(120).optional(),
        sector: z.string().max(40).optional(),
        region: z.string().max(80).optional(),
      })
      .optional(),
    documentRefs: z
      .array(
        z.object({
          hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
          kind: z.enum(['invoice', 'po', 'bol', 'coo', 'pod', 'other']),
          label: z.string().max(120).optional(),
        }),
      )
      .max(20)
      .optional(),
  })
  .refine((b) => b.deadlineDays != null || b.deadlineSeconds != null, {
    message: 'deadlineDays or deadlineSeconds required',
    path: ['deadlineSeconds'],
  });

export const jobsRoutes = new Hono();

/// The managed-jobs snapshot carries full negotiation state (bids, counter
/// prices, amounts, buyer agent) and so must never enumerate every buyer's
/// jobs. Scope it to a single caller address and return only that buyer's
/// jobs. The masked public market surface is /marketplace; this is the owner's
/// own dashboard feed.
jobsRoutes.get('/', (c) => {
  const caller = c.req.query('caller');
  if (!caller || !/^0x[a-fA-F0-9]{40}$/.test(caller)) {
    return c.json({ error: 'caller query param required (0x... address)' }, 400);
  }
  return c.json(getBuyerSnapshot(caller));
});

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
  const caller = viewerAddress(c);
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
  // A pending near-miss invites the asked party (and their counterparty) to act
  // on the job page, before any proposal exists. Grant them access so the
  // near-miss card renders instead of the private summary.
  const nearMiss = getPendingNearMiss(jobId);
  if (nearMiss) {
    parties.add(nearMiss.buyerUser.toLowerCase());
    parties.add(nearMiss.sellerUser.toLowerCase());
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
    trustedMatch: brief?.trustedMatch === true,
  });
});

jobsRoutes.post('/', async (c) => {
  let body;
  try {
    body = postJobSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (!isSessionSelf(c, body.posterAddress)) {
    return c.json({ error: 'You can only post a brief as your own wallet.', code: 'forbidden' }, 403);
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

  // Audit L-1: the JobBoard now DERIVES jobId = keccak256(msg.sender, salt),
  // namespaced to the poster so it can't be squatted. We generate the salt and
  // derive the same jobId off-chain (msg.sender == the buyer agent that signs
  // postJob = buyerProfile.address) so the brief we persist below is keyed by
  // the id the contract will emit. The postJob ABI selector is unchanged; the
  // first bytes32 param is now the salt.
  const salt = keccak256(toBytes(`${body.brief}|${Date.now()}|${Math.random()}`));
  // Provisional id derived the same way the contract does. It is only correct
  // when the stored buyer agent address equals the real Circle SCA that signs;
  // when it has drifted, the on-chain JobPosted event carries a different id and
  // we reconcile to it after the tx (see below).
  let jobId = keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes32' }],
      [buyerProfile.address as Address, salt],
    ),
  );
  const budgetWei = parseUnits(body.budgetUsdc.toString(), USDC_DECIMALS);
  // Prefer the explicit seconds shape when both arrive; otherwise convert days.
  const deadlineSeconds = body.deadlineSeconds ?? (body.deadlineDays ?? 1) * 86_400;
  const deadlineUnix = Math.floor(Date.now() / 1000) + deadlineSeconds;
  const termsHash = keccak256(toBytes(body.brief));

  // Persist brief metadata BEFORE the on-chain call so agents have it when the
  // JobPosted event fires. On-chain only carries termsHash for integrity.
  // Stamp the match lane once, from the poster's account type plus the trade
  // nature. A person, or a business posting a single service, lands 'service'
  // (the existing P2P flow); only a verified business posting goods/mixed lands
  // 'finance'. Matching filters on this so the two pools never cross.
  const posterAccountType = await accountTypeOf(body.posterAddress);
  createBrief({
    jobId,
    briefText: body.brief,
    postedBy: body.posterAddress,
    negotiationMaxIncreasePct: body.negotiationMaxIncreasePct,
    milestonePcts: body.milestonePcts,
    trustedMatch: body.trustedMatch === true,
    tradeLane: deriveLane(posterAccountType, body.tradeType),
    partyKind: posterAccountType,
    tradeType: body.tradeType,
    incoterms: body.incoterms,
    paymentTerms: body.paymentTerms,
    counterpartyCompany: body.counterpartyCompany,
    documentRefs: body.documentRefs,
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
        // First param is the SALT now; the contract derives + emits jobId.
        abiParameters: [salt, budgetWei.toString(), deadlineUnix.toString(), termsHash],
      },
      `postJob(${jobId})`,
    );
    // Trust the on-chain JobPosted event, not the off-chain derived id. Circle
    // reports the tx COMPLETE when the outer handleOps lands; the id it emits can
    // differ from what we derived when the stored buyer agent address has drifted
    // from the real signer (msg.sender), and no event at all means the inner
    // postJob reverted. Either way the buyer would otherwise be stranded on a
    // /jobs/<id> that 404s. See erc4337-inner-revert + own-auction-misfire notes.
    const realJobId = await readPostedJobId(result.txHash);
    if (!realJobId) {
      deleteBrief(jobId);
      logger.error(
        { jobId, txHash: result.txHash },
        'postJob completed but emitted no JobPosted event: treating as a failed post',
      );
      return c.json(
        {
          error: 'postJob reverted',
          detail: 'The request did not post on chain. Please try again.',
        },
        502,
      );
    }
    if (realJobId.toLowerCase() !== jobId.toLowerCase()) {
      logger.warn(
        { derivedJobId: jobId, realJobId, storedSigner: buyerProfile.address },
        'postJob jobId mismatch: the stored buyer agent address differs from the on-chain signer; reconciling to the emitted id',
      );
      // Move the brief to the real id so the tracked job carries its metadata,
      // and re-run keyword extraction against it in case the first pass patched
      // (and left behind) the provisional key.
      rekeyBrief(jobId, realJobId);
      extractKeywords(body.brief, `brief:${realJobId}`)
        .then((keywords) => patchBrief(realJobId, { keywords }))
        .catch(() => {});
      jobId = realJobId as `0x${string}`;
    }
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
  const caller = viewerAddress(c);
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
  // A proposal names both parties and the agreed price, so identity is the
  // signed session only. Web3 users get one via SIWE on connect; a request
  // without a session can't read anyone's matches.
  const caller = sessionAddress(c);
  if (!caller) {
    return c.json({ error: 'sign in to view your matches' }, 401);
  }
  const all = await listMatchProposalsForUser(caller);
  // Hide expired pending matches. A proposal whose agreed delivery deadline has
  // already passed is unactionable (the seller cannot deliver on time and the
  // buyer never approved), so it should drop off the home and profile lists
  // instead of lingering as "active". Funded deals are tracked separately and
  // are not affected.
  const now = Math.floor(Date.now() / 1000);
  const proposals = all.filter(
    (p) => !p.approvedAt && !p.declinedAt && (!p.deadlineUnix || p.deadlineUnix > now),
  );
  return c.json({ proposals });
});

/// Seller accepts the agent's matched proposal. The seller is the gate because
/// the agent negotiated on their behalf at a price that may differ from what
/// they'd want; the buyer already pre-committed via the brief's budget +
/// tolerance. Acceptance triggers acceptBid + fundEscrow via the BUYER's agent
/// wallet automatically (no separate buyer approval, the buyer's spending is
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
  if (!isSessionSelf(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  const proposal = await getMatchProposal(jobId);
  if (!proposal) return c.json({ error: 'no match proposal for this job' }, 404);
  // After a seller raise, the approval gate belongs to the buyer: they fund at
  // the raised price (through the near-miss proceed path) or decline it. Without
  // a raise, the seller is the gate as before.
  const pendingRaise = proposal.awaitingParty === 'buyer' && !!proposal.raisedPriceUsdc;
  const caller = body.caller.toLowerCase();
  if (pendingRaise) {
    if (caller !== proposal.buyerUser) {
      return c.json({ error: 'only the buyer can approve the raised price', code: 'forbidden' }, 403);
    }
  } else if (caller !== proposal.sellerUser) {
    return c.json({ error: 'only the seller can approve this match' }, 403);
  }
  if (inFlight.has(jobId)) {
    return c.json({ error: 'an action is already in progress for this job' }, 409);
  }

  inFlight.add(jobId);
  try {
    const result = pendingRaise
      ? await proceedAgentNearMiss(jobId, proposal.sellerAgent, proposal.raisedPriceUsdc!)
      : await approveAgentMatch(jobId);
    if (!result.ok) {
      const status = result.code === 'INSUFFICIENT_AGENT_BALANCE' ? 409 : 502;
      return c.json({ error: 'approval failed', code: result.code, detail: result.message }, status);
    }
    return c.json({ accepted: true, jobId, txHash: result.txHash }, 200);
  } finally {
    inFlight.delete(jobId);
  }
});

/// Seller raises the agent-agreed price at the approval gate (they want more
/// than the agent settled). This does no on-chain work: it flips the approval
/// gate to the buyer, who approves at the raised price or declines. The buyer's
/// pre-authorized cap stays the ceiling; an over-cap raise is surfaced to the
/// buyer, who decides with eyes open. Only the seller can call it.
jobsRoutes.post('/:jobId/raise-offer', async (c) => {
  const jobId = c.req.param('jobId');
  let body;
  try {
    body = raiseSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  const proposal = await getMatchProposal(jobId);
  if (!proposal) return c.json({ error: 'no match proposal for this job' }, 404);
  if (body.caller.toLowerCase() !== proposal.sellerUser) {
    return c.json({ error: 'only the seller can raise the offer', code: 'forbidden' }, 403);
  }
  if (inFlight.has(jobId)) {
    return c.json({ error: 'an action is already in progress for this job' }, 409);
  }
  const result = await raiseMatchOffer(jobId, String(body.priceUsdc));
  if (!result.ok) {
    return c.json({ error: result.message, code: result.code }, 409);
  }
  return c.json({ accepted: true, jobId, overCap: result.raiseOverCap }, 200);
});

/// Buyer cancels their own managed brief BEFORE a match has been approved.
/// After a match + escrow is funded the cancel lives on /deals/[id] (mutual
/// cancel + refund flow); this route only covers the pre-match window.
/// Buyer edits their own request. Minimal scope: briefText only. The on-chain
/// termsHash stays at its post-time value because updating it would require a
/// new on-chain transaction; the agent uses the off-chain briefText for
/// matching, so the live negotiation sees the latest copy. Gating: brief must
/// exist, caller must be the buyer, brief must not be expired, no active
/// match proposal (a text change mid-walk would invalidate the agent's
/// scoring), no funded deal (acceptance is the point of no return).
jobsRoutes.post('/:jobId/edit', async (c) => {
  const jobId = c.req.param('jobId');
  let body;
  try {
    body = editBriefSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  const brief = getBrief(jobId);
  if (!brief) return c.json({ error: 'brief not found' }, 404);
  if (body.caller.toLowerCase() !== brief.postedBy) {
    return c.json({ error: 'only the buyer can edit this request' }, 403);
  }
  if (brief.expiredAt) {
    return c.json({ error: 'this request has expired' }, 409);
  }
  const proposal = await getMatchProposal(jobId);
  if (proposal && !proposal.declinedAt) {
    return c.json(
      { error: 'a match proposal is in flight; decline it before editing the request' },
      409,
    );
  }
  const deal = await getDeal(jobId);
  if (deal && deal.acceptedAt) {
    return c.json(
      { error: 'this request has already accepted a match; edits live on the deal page' },
      409,
    );
  }
  const patch: Partial<typeof brief> = {};
  if (body.briefText !== undefined && body.briefText !== brief.briefText) {
    patch.briefText = body.briefText;
  }
  if (
    body.negotiationMaxIncreasePct !== undefined &&
    body.negotiationMaxIncreasePct !== brief.negotiationMaxIncreasePct
  ) {
    patch.negotiationMaxIncreasePct = body.negotiationMaxIncreasePct;
  }
  if (body.trustedMatch !== undefined && body.trustedMatch !== !!brief.trustedMatch) {
    patch.trustedMatch = body.trustedMatch;
  }
  if (Object.keys(patch).length === 0) {
    return c.json({ error: 'no changes provided' }, 400);
  }

  const next = patchBrief(jobId, patch);
  if (patch.negotiationMaxIncreasePct !== undefined || patch.trustedMatch !== undefined) {
    patchTrackedJobContext(jobId, {
      negotiationMaxIncreasePct: patch.negotiationMaxIncreasePct,
      trustedMatch: patch.trustedMatch,
    });
  }
  logger.info({ jobId, postedBy: brief.postedBy, fields: Object.keys(patch) }, 'brief edited by buyer');

  /// Keywords were extracted at post time. The agent scans them for topical
  /// match against incoming listings, so a text change should re-extract.
  /// Fire-and-forget; the API responds immediately and the agent picks up the
  /// new keywords on the next match round.
  if (patch.briefText !== undefined) {
    const textToScan = patch.briefText;
    extractKeywords(textToScan, `brief-edit:${jobId}`)
      .then((keywords) => {
        patchBrief(jobId, { keywords });
        logger.info({ jobId, keywords }, 'brief keywords re-extracted after edit');
      })
      .catch((err) => {
        logger.warn(
          { err: (err as Error).message, jobId },
          'brief keyword re-extraction failed; stale keywords will be used',
        );
      });
  }

  return c.json({ brief: next });
});

jobsRoutes.post('/:jobId/cancel', async (c) => {
  const jobId = c.req.param('jobId');
  let body;
  try {
    body = callerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
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
  if (!isSessionSelf(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  const proposal = await getMatchProposal(jobId);
  if (!proposal) return c.json({ error: 'no match proposal for this job' }, 404);
  // After a seller raise, the buyer holds the gate, so the buyer can decline the
  // raised price (the match ends; the seller chose more over the agreed price).
  // Otherwise the seller is the one who declines the match.
  const pendingRaise = proposal.awaitingParty === 'buyer' && !!proposal.raisedPriceUsdc;
  const decliner = pendingRaise ? proposal.buyerUser : proposal.sellerUser;
  if (body.caller.toLowerCase() !== decliner) {
    return c.json(
      { error: pendingRaise ? 'only the buyer can decline the raised price' : 'only the seller can decline this match' },
      403,
    );
  }
  const result = await declineAgentMatch(jobId, body.reason);
  if (!result.ok) return c.json({ error: result.message, code: result.code }, 409);
  return c.json({ accepted: true, jobId }, 200);
});

/// The pending near-miss for a job, gated to the two parties. A near-miss is the
/// agent saying "I found a deal, but the price is outside your range, proceed?"
/// when the ranges don't overlap by a small margin. Only the party being asked
/// can act on it (see POST below); both parties may read it.
jobsRoutes.get('/:jobId/near-miss', (c) => {
  const jobId = c.req.param('jobId');
  const nm = getPendingNearMiss(jobId);
  if (!nm) return c.json({ nearMiss: null });
  const caller = viewerAddress(c);
  const isParty =
    !!caller && (caller === nm.buyerUser || caller === nm.sellerUser);
  if (!isParty) return c.json({ nearMiss: null });
  return c.json({ nearMiss: nm });
});

/// The persisted overpay advisory for a job, gated to the buyer. Non-destructive
/// market check that survives a refresh (the live SSE event shows it during the
/// auction; this reappears it on load).
jobsRoutes.get('/:jobId/market-advisory', (c) => {
  const adv = getMarketAdvisory(c.req.param('jobId'));
  if (!adv) return c.json({ advisory: null });
  const caller = viewerAddress(c);
  if (!caller || caller !== adv.buyer) return c.json({ advisory: null });
  return c.json({ advisory: adv });
});

const nearMissActionSchema = z.object({
  caller: addrSchema,
  action: z.enum(['proceed', 'decline']),
});

/// Act on a near-miss. Only the party being asked may proceed or decline.
/// Proceed funds the deal at the agreed (out-of-range) price through the same
/// accept + fund path a seller-approved match uses. Decline hands the ask to the
/// other side (when the buyer passes first) or ends it.
jobsRoutes.post('/:jobId/near-miss', async (c) => {
  const jobId = c.req.param('jobId');
  let body;
  try {
    body = nearMissActionSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  const nm = getPendingNearMiss(jobId);
  if (!nm) return c.json({ error: 'no pending near-miss for this job', code: 'NO_NEAR_MISS' }, 404);
  if (body.caller.toLowerCase() !== nm.askedUser) {
    return c.json({ error: 'only the party being asked can act on this', code: 'forbidden' }, 403);
  }

  if (body.action === 'decline') {
    // Pass = end this near-miss and keep the request live for new bids instead
    // of dead-ending or hanging on a flip to a silent seller agent.
    endNearMissOnDecline(jobId);
    const reopened = reopenForNewBids(jobId);
    return c.json({ declined: true, reopened, jobId }, 200);
  }

  // proceed
  if (inFlight.has(jobId)) {
    return c.json({ error: 'an action is already in progress for this job', code: 'BUSY' }, 409);
  }
  inFlight.add(jobId);
  try {
    const result = await proceedAgentNearMiss(jobId, nm.sellerAgent, nm.proceedPriceUsdc);
    if (!result.ok) {
      const status =
        result.code === 'NO_JOB_STATE' || result.code === 'ALREADY_FUNDED' || result.code === 'ALREADY_APPROVED'
          ? 409
          : result.code === 'INSUFFICIENT_AGENT_BALANCE'
            ? 409
            : 502;
      return c.json({ error: 'could not proceed', code: result.code, detail: result.message }, status);
    }
    upsertNearMiss({ ...nm, proceededAt: Date.now() });
    bus.emitEvent({
      type: 'negotiation.near-miss.proceeded',
      jobId,
      actor: 'platform',
      payload: {
        buyer: nm.buyerUser,
        sellerUser: nm.sellerUser,
        askedSide: nm.askedSide,
        agreedPriceUsdc: nm.proceedPriceUsdc,
        txHash: result.txHash,
      },
    });
    return c.json({ proceeded: true, jobId, txHash: result.txHash }, 200);
  } finally {
    inFlight.delete(jobId);
  }
});

/// Reconsider the offer the buyer passed. When the auction found nothing cheaper
/// and only out-of-reach matches remain, the buyer can bring back the exact ask
/// they declined and proceed after all. Re-raises the near-miss from the durable
/// snapshot; the buyer then hits Proceed on the near-miss card as usual. Gated to
/// the buyer named on the out-of-reach record.
jobsRoutes.post('/:jobId/reconsider', async (c) => {
  const jobId = c.req.param('jobId');
  let body;
  try {
    body = callerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  const rec = getOutOfReach(jobId);
  if (!rec?.passed) {
    return c.json({ error: 'no passed offer to reconsider', code: 'NO_PASSED_OFFER' }, 404);
  }
  if (body.caller.toLowerCase() !== rec.passed.buyerUser) {
    return c.json({ error: 'only the buyer can reconsider this', code: 'forbidden' }, 403);
  }
  const job = getBuyerJob(jobId);
  if (!job) return c.json({ error: 'not found' }, 404);
  if (job.expiredAt || job.cancelledAt) {
    return c.json({ error: 'request is no longer live', code: 'NOT_LIVE' }, 409);
  }
  const raised = reRaiseNearMissFromPassed(jobId, job.deadlineUnix);
  if (!raised) {
    return c.json({ error: 'could not reconsider', code: 'NO_PASSED_OFFER' }, 409);
  }
  return c.json({ reconsidered: true, jobId, proceedPriceUsdc: raised.proceedPriceUsdc }, 200);
});
