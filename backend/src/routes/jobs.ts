import { MAX_REVIEW_DAYS } from '../deals/reviewClock.js';
import { prohibitedBody, prohibitedReason } from '../policy/prohibited.js';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { keccak256, parseUnits, toBytes, type Address } from 'viem';
import { readUsdcBalance, getEscrowFeeBps } from '../chain/contracts.js';
import { BoardError, boardJobId } from '../marketplace/board.js';
import { marketBoard } from '../marketplace/chainBoard.js';
import {
  getBuyerSnapshot,
  getBuyerJob,
  getShortlist,
  quoteAgentOffer,
  reseedJobFromChain,
  getMatchProposal,
  listMatchProposalsForUser,
  approveAgentMatch,
  declineAgentMatch,
  getMarketplaceBriefs,
  cancelBriefByBuyer,
  proceedAgentNearMiss,
  chooseAgentOffer,
  raiseMatchOffer,
  patchTrackedJobContext,
  reopenForNewBids,
  rejudgeOffers,
  type MarketplaceBrief,
} from '../agents/buyer.js';
import { getPendingNearMiss, upsertNearMiss } from '../db/nearMiss.js';
import { getMarketAdvisory } from '../db/marketAdvisory.js';
import { getOutOfReach } from '../db/outOfReach.js';
import { endNearMissOnDecline, inBudgetAlternative, reRaiseNearMissFromPassed } from '../agents/nearMiss.js';
import { takeRequestLink } from '../assistant/requestLinks.js';
import { bus, recentEventsByType } from '../events.js';
import { resolveBuyerProfileForUser } from '../agents/agent-registry.js';
import { createBrief, patchBrief, getBrief, deleteBrief, rekeyBrief } from '../db/briefs.js';
import { approvalGate, isRequestOwner } from '../agents/chooseOffer.js';
import { config } from '../config.js';
import { isVerified, sealEntries, shortlistChoiceCheck } from '../agents/shortlist.js';
import { readsForRef } from '../db/recordReads.js';
import { levelOf } from '../verification/live.js';
import { matchDecliner } from '../agents/matchDecline.js';
import { accountTypeOf, deriveJobLane } from '../profile/accountType.js';
import { getDeal } from '../db/deals.js';
import { countLiveDirectOffers } from '../db/directOffers.js';
import { jobActionsInFlight } from '../offers/jobLock.js';
import { extractKeywords } from '../llm/keywords.js';
import { isSessionSelf, sessionAddress, viewerAddress } from '../auth/session.js';
import { findAgentWalletByAgentAddress, getAgentWallets } from '../db/agentWallets.js';
import { buyerFundingNeed } from '../agents/buyerFundingNeed.js';
import { logger } from '../logger.js';
import { invalidBodyMessage } from './invalidBody.js';
import {
  AGENT_WORLD_SKIP_ALLOWED,
  publishWorldCheck,
  skipWorldCheck,
  waitOnSeller,
  worldCheckView,
  worldStepForChoice,
} from '../agents/agentWorldGate.js';
import { deleteHold, getHold } from '../db/agentWorldChecks.js';
import { nextStep, type AgentWorldHold } from '../trust/agentWorldCheck.js';
import { roleIn } from '../worldid/agentChecks.js';
import { WorldSessionError } from '../worldid/dealSessions.js';
import { worldIdAgentChecks, worldIdDealSessionsConfigured } from './worldId.js';
import { enqueueLegacyReconsiderationShadow } from './jobsReengagement.js';
import { publicJobStatus } from './jobPublicStatus.js';
import { listDirectOffers } from '../db/directOffers.js';
import { requestTitle } from '../agents/bidOutcome.js';

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');
const callerSchema = z.object({ caller: addrSchema });
const declineSchema = z.object({ caller: addrSchema, reason: z.string().min(1).max(400).optional() });
const raiseSchema = z.object({ caller: addrSchema, priceUsdc: z.coerce.number().positive().max(1_000_000) });
const chooseOfferSchema = z.object({
  caller: addrSchema,
  seller: addrSchema,
  acknowledgeUnverified: z.boolean().optional(),
  expectedPriceUsdc: z.union([z.string(), z.number()]).optional(),
});
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
const inFlight = jobActionsInFlight;

const USDC_DECIMALS = 6;

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
    /** The structured agreement (items, conditions, proof, parts). It becomes
     *  the deal's terms on a match and is covered by the on-chain terms hash. */
    terms: z.string().min(1).max(4000).optional(),
    /** Days the buyer has to check each delivery; the escrow honours it. */
    reviewWindowDays: z.number().int().min(1).max(MAX_REVIEW_DAYS).optional(),
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
    /** "Agree for me" (view 30): the agent may agree with the seller it
     *  recommends, within budget; locking the money still waits for the buyer. */
    agreeForMe: z.boolean().optional(),
    /** Per-brief milestone split the buyer stated in the request ("30% then
     *  70%"). Percentages must sum to 100. Overrides the buyer profile default
     *  at escrow funding. One part (100) is a single payment; both escrows
     *  accept 1 to 5 parts. */
    milestonePcts: z
      .array(z.number().int().min(1).max(100))
      .min(1)
      .max(5)
      .refine((a) => a.reduce((s, n) => s + n, 0) === 100, {
        message: 'milestonePcts must sum to 100',
      })
      .optional(),
    /** SME trade-finance fields (Phase 2 Track 2). All optional; service deals
     *  omit them entirely so the auction surface stays clean. The brief store
     *  (db/briefs.ts) snapshots these alongside the brief text so the buyer
     *  agent + downstream surfaces can read them without re-querying chain. */
    tradeType: z.enum(['service', 'goods', 'mixed']).optional(),
    deliveryKind: z.enum(['goods', 'in_person', 'remote']).optional(),
    where: z
      .object({ scope: z.enum(['near', 'country', 'anywhere']), country: z.string().regex(/^[A-Za-z]{2}$/).optional() })
      .optional(),
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

/// Every seller judges a changed request again, without waiting for a sweep:
/// those who offered get their turn to keep, lower or withdraw (view 35), the
/// rest look at it as new.
async function offerAgain(jobId: string): Promise<void> {
  try {
    const { rescanRequest, reviseStandingOffers } = await import('../agents/seller.js');
    reviseStandingOffers(jobId, 'request-changed');
    await rescanRequest(jobId, { fresh: true });
  } catch (err) {
    logger.warn({ jobId, err: (err as Error).message }, 'offering the changed request again failed');
  }
}

export const jobsRoutes = new Hono();

/// A refusal whose message the buyer should read as it is: the chat deal limits
/// and the money-out guard.
export const saysWhy = (code: string) => code === 'CHAT_DEAL_LIMIT' || code.startsWith('MONEY_OUT_');

/// The managed-jobs snapshot carries full negotiation state (bids, counter
/// prices, amounts, buyer agent) and so must never enumerate every buyer's
/// jobs. The masked public market surface is /marketplace; this is the owner's
/// own dashboard feed.
///
/// Scoping used to come from ?caller=, which any anonymous client could set to
/// another user's buyer agent to read their whole bid book. Identity is the
/// signed session now, and the agent address is resolved server-side, so the
/// caller cannot name the account they are reading.
jobsRoutes.get('/', async (c) => {
  const caller = sessionAddress(c);
  if (!caller) return c.json({ error: 'not authenticated' }, 401);
  const agents = await getAgentWallets(caller);
  if (!agents) return c.json({ jobs: [] });
  return c.json(getBuyerSnapshot(agents.buyerAddress));
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
  const out: Array<MarketplaceBrief & { buyer: string; offerCount: number }> = [];
  const offerCounts = await countLiveDirectOffers(
    candidates.map((b) => b.jobId),
    Math.floor(Date.now() / 1000),
  );
  for (const b of candidates) {
    if (prohibitedReason(b.briefText)) continue;
    const proposal = await getMatchProposal(b.jobId);
    if (proposal && !proposal.declinedAt) continue;
    const deal = await getDeal(b.jobId);
    if (deal) continue;
    out.push({ ...b, buyer: mask(b.buyer), offerCount: offerCounts.get(b.jobId) ?? 0 });
  }
  return c.json({ briefs: out });
});

/// What "Start the search" will move before posting. Same arithmetic as the
/// post check, so the amount the sheet states is the amount the check enforces.
/// Declared before /:jobId, which would otherwise take this path as a job id.
jobsRoutes.get('/funding-quote', async (c) => {
  const caller = sessionAddress(c);
  if (!caller) return c.json({ error: 'sign in to get a funding quote' }, 401);
  const budget = Number(c.req.query('budgetUsdc'));
  if (!Number.isFinite(budget) || budget <= 0) {
    return c.json({ error: 'budgetUsdc must be a positive number' }, 400);
  }
  const agents = await getAgentWallets(caller);
  const feeBps = await getEscrowFeeBps();
  const balanceWei = agents ? await readUsdcBalance(agents.buyerAddress) : 0n;
  const need = buyerFundingNeed({ budgetUsdc: budget, feeBps, balanceWei });
  return c.json({ ...need.view, activated: !!agents });
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

  // Within the two parties, the bidder roster belongs to the buyer alone. The
  // buyer side is whoever posted the brief or holds the buyer seat on the
  // proposal/deal/near-miss; a matched seller is a party but not the buyer.
  const buyerSide = new Set<string>();
  if (brief?.postedBy) buyerSide.add(brief.postedBy.toLowerCase());
  if (proposal) buyerSide.add(proposal.buyerUser.toLowerCase());
  if (deal) buyerSide.add(deal.buyer.toLowerCase());
  if (nearMiss) buyerSide.add(nearMiss.buyerUser.toLowerCase());
  const viewerIsBuyer = !!caller && buyerSide.has(caller);

  if (!isParty) {
    // `finalized` is overloaded in the buyer agent: it covers both an
    // accepted match and a terminal decline. Resolve the distinction before
    // returning a public status so an exhausted auction is not presented as
    // an active negotiation. The event lookup also repairs the live view for
    // older briefs created before the durable terminal marker existed.
    const lifecycleEvents = await recentEventsByType(
      ['agent.declined', 'negotiation.reopened'],
      40,
      jobId,
    );
    const localLifecycleEvents = bus
      .recent(500, jobId)
      .filter((event) => event.type === 'agent.declined' || event.type === 'negotiation.reopened');
    const latestLifecycle = [...lifecycleEvents, ...localLifecycleEvents].sort(
      (a, b) => b.ts - a.ts,
    )[0];
    const buyerDeclined = latestLifecycle?.type === 'agent.declined' && latestLifecycle.actor === 'buyer';
    const ended =
      buyerDeclined ||
      (!!job.finalized && !proposal && !deal && !nearMiss && !job.escrowFunded);
    const matched = !!(proposal || deal || nearMiss) || job.escrowFunded;
    const status = publicJobStatus({
      cancelled: !!job.cancelledAt,
      expired: !!job.expiredAt,
      ended,
      matched,
    });
    return c.json({ jobId, isParty: false, status });
  }

  // Private per-party payload: never let a shared cache or the mobile bfcache
  // hand this to the next viewer on the device. Forces a fresh authenticated
  // fetch on every load / back-restore.
  c.header('Cache-Control', 'no-store');
  // Merge the off-chain brief metadata (human-readable text, negotiation
  // ceiling) into the response so the job page can render it inline. The
  // on-chain snapshot only carries the termsHash for integrity.
  return c.json({
    ...job,
    isParty: true,
    viewerIsBuyer,
    // The bidder roster is the buyer's competitive picture. A matched seller
    // gets the job page to accept their match (the proposal is a separate
    // route) but never the list of who else bid or at what price, so strip it
    // server-side rather than trusting the client to hide it.
    bids: viewerIsBuyer ? job.bids : [],
    briefText: brief?.briefText ?? null,
    keywords: brief?.keywords ?? null,
    negotiationMaxIncreasePct: brief?.negotiationMaxIncreasePct ?? null,
    trustedMatch: brief?.trustedMatch === true,
    // B2B trade context so the job page can render a business surface (lane,
    // goods vs service, Incoterms, payment terms, sourcing sector/region)
    // instead of the generic managed-deal treatment. Absent on P2P/service.
    tradeLane: brief?.tradeLane ?? 'service',
    tradeType: brief?.tradeType ?? null,
    incoterms: brief?.incoterms ?? null,
    paymentTerms: brief?.paymentTerms ?? null,
    sourcingSector: brief?.counterpartyCompany?.sector ?? null,
    sourcingRegion: brief?.counterpartyCompany?.region ?? null,
  });
});

jobsRoutes.post('/', async (c) => {
  let body;
  try {
    body = postJobSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const prohibited = prohibitedBody(body);
  if (prohibited) return c.json(prohibited, 422);
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

  // The money has to be in the agent wallet before the request goes up.
  //
  // A deal opens on the agent's balance, not the identity wallet's: when a
  // seller accepts, the escrow pulls the deal amount plus the buyer's half of
  // the platform fee straight from the agent. Posting first and discovering the
  // shortfall at accept time is how a job ends up accepted on chain against an
  // escrow that never funded, and the JobBoard has no way back from Accepted.
  //
  // So the check here uses the SAME arithmetic the escrow will use, rather than
  // a budget plus a guessed half-dollar of headroom. It also reports the exact
  // shortfall, so the client can offer funding instead of an error.
  try {
    const [agentBalance, feeBps] = await Promise.all([
      readUsdcBalance(buyerProfile.address),
      getEscrowFeeBps(),
    ]);
    const need = buyerFundingNeed({ budgetUsdc: body.budgetUsdc, feeBps, balanceWei: agentBalance });
    if (need.shortfall > 0n) {
      return c.json(
        {
          error: 'insufficient buyer balance',
          code: 'FUND_BUYER_AGENT',
          detail:
            'Your buyer agent needs the funds before a request goes up, because the escrow is funded from it the moment a seller accepts.',
          agentAddress: buyerProfile.address,
          balanceUsdc: need.view.balanceUsdc,
          requiredUsdc: need.view.requiredUsdc,
          topUpNeededUsdc: need.view.topUpNeededUsdc,
          budgetUsdc: body.budgetUsdc,
        },
        409,
      );
    }
  } catch (err) {
    // A read failure must not block posting. The accept-time pre-flight is the
    // backstop, and refusing every post because an RPC blipped is worse than
    // the shortfall this catches.
    logger.warn({ err: (err as Error).message }, 'buyer agent balance precheck skipped');
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
  let jobId = boardJobId(buyerProfile.address as Address, salt);
  const budgetWei = parseUnits(body.budgetUsdc.toString(), USDC_DECIMALS);
  // Prefer the explicit seconds shape when both arrive; otherwise convert days.
  const deadlineSeconds = body.deadlineSeconds ?? (body.deadlineDays ?? 1) * 86_400;
  const deadlineUnix = Math.floor(Date.now() / 1000) + deadlineSeconds;
  // The hash commits to everything the seller agrees to: the request and,
  // when set, its structured terms.
  const termsHash = keccak256(toBytes(body.terms ? `${body.brief}

${body.terms}` : body.brief));

  // Persist brief metadata BEFORE the on-chain call so agents have it when the
  // JobPosted event fires. On-chain only carries termsHash for integrity.
  // Stamp the match lane once, from the poster's account type plus the trade
  // nature. A person, or a business posting a single service, lands 'service'
  // (the existing P2P flow); only a verified business posting goods/mixed lands
  // 'finance'. Matching filters on this so the two pools never cross.
  const posterAccountType = await accountTypeOf(body.posterAddress);
  // A request confirmed from an assistant card carries its conversation and
  // the Agree for me choice made there.
  const link = takeRequestLink(body.posterAddress, body.brief, body.budgetUsdc);
  createBrief({
    jobId,
    briefText: body.brief,
    postedBy: body.posterAddress,
    negotiationMaxIncreasePct: body.negotiationMaxIncreasePct,
    milestonePcts: body.milestonePcts,
    terms: body.terms,
    reviewWindowDays: body.reviewWindowDays,
    trustedMatch: body.trustedMatch === true,
    tradeLane: deriveJobLane(posterAccountType, body.tradeType),
    partyKind: posterAccountType,
    tradeType: body.tradeType,
    deliveryKind: body.deliveryKind,
    where: body.where ? { scope: body.where.scope, ...(body.where.country ? { country: body.where.country.toUpperCase() } : {}) } : undefined,
    incoterms: body.incoterms,
    paymentTerms: body.paymentTerms,
    counterpartyCompany: body.counterpartyCompany,
    documentRefs: body.documentRefs,
    ...(link?.conversationId ? { conversationId: link.conversationId } : {}),
    ...(body.agreeForMe ?? link?.agreeForMe ? { agreeForMe: true } : {}),
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
    const board = marketBoard();
    let posted: { jobId: `0x${string}`; ref: string };
    try {
      posted = await board.postRequest({
        walletId: buyerProfile.walletId,
        poster: buyerProfile.address as Address,
        salt,
        budget: budgetWei,
        deadline: BigInt(deadlineUnix),
        termsHash,
      });
    } catch (err) {
      // On the old board no JobPosted event means the inner postJob reverted;
      // the buyer would otherwise be stranded on a /jobs/<id> that 404s.
      if (!(err instanceof BoardError)) throw err;
      deleteBrief(jobId);
      logger.error({ jobId, code: err.code }, 'request not posted');
      return c.json({ error: 'postJob reverted', detail: 'The request did not post. Please try again.' }, 502);
    }
    const realJobId = posted.jobId;
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
    // Only the old board leaves a transaction to link to.
    return c.json({ jobId, deadlineUnix, ...(board.kind === 'chain' ? { txHash: posted.ref } : {}) });
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
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
  const gate = approvalGate({
    shortlistMode: config.SHORTLIST_MODE,
    pendingRaise,
    caller: body.caller,
    buyer: proposal.buyerUser,
    seller: proposal.sellerUser,
  });
  if (!gate.ok) {
    const error =
      gate.code === 'buyer-chooses'
        ? 'The buyer chooses from the shortlist first.'
        : gate.code === 'not-buyer'
          ? 'only the buyer can approve the raised price'
          : 'only the seller can approve this match';
    return c.json({ error, code: gate.code === 'buyer-chooses' ? gate.code : 'forbidden' }, gate.status);
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
      const status = result.code === 'INSUFFICIENT_AGENT_BALANCE' || saysWhy(result.code) ? 409 : 502;
      const error = saysWhy(result.code) ? result.message : 'approval failed';
      return c.json({ error, code: result.code, detail: result.message }, status);
    }
    return c.json({ accepted: true, jobId, txHash: result.txHash }, 200);
  } finally {
    inFlight.delete(jobId);
  }
});

/// The shortlist for one request: who the agents found, verified or not, their
/// score and numbers, and the one the agent recommends. Only the person who
/// posted the request sees it.
jobsRoutes.get('/:jobId/shortlist', async (c) => {
  if (!config.SHORTLIST_MODE) return c.json({ error: 'not found' }, 404);
  const jobId = c.req.param('jobId');
  const caller = (c.req.query('caller') ?? '').toLowerCase();
  const brief = getBrief(jobId);
  if (!brief || !isSessionSelf(c, caller) || !isRequestOwner(caller, brief)) {
    return c.json({ error: 'Only the person who posted this request sees its shortlist.' }, 403);
  }
  const job = getBuyerJob(jobId);
  const entries = getShortlist(jobId) ?? [];
  return c.json({
    entries: config.SEALED_RECORDS ? sealEntries(entries) : entries,
    recordChecks: await readsForRef(jobId, caller).catch(() => ({ count: 0, usdc: 0 })),
    closed: !job || !!job.expiredAt || !!job.escrowFunded,
    worldCheck: worldCheckView(await getHold(jobId).catch(() => null)),
  });
});

/// Funds the buyer's held choice once every World ID check it needed is done.
/// The buyer already confirmed it, at this seller and this price.
async function fundHeldChoice(hold: AgentWorldHold): Promise<{ funded: boolean; code?: string }> {
  if (!hold.buyerConfirmed || nextStep(hold, AGENT_WORLD_SKIP_ALLOWED).kind !== 'proceed') return { funded: false };
  if (inFlight.has(hold.jobId)) return { funded: false, code: 'in-flight' };
  inFlight.add(hold.jobId);
  try {
    const result = await chooseAgentOffer(hold.jobId, hold.sellerAgent, hold.priceUsdc);
    if (!result.ok) {
      logger.warn({ jobId: hold.jobId, code: result.code }, 'held choice could not fund after the World ID check');
      return { funded: false, code: result.code };
    }
    await deleteHold(hold.jobId);
    return { funded: true };
  } finally {
    inFlight.delete(hold.jobId);
  }
}

/// The buyer chooses one of the offers on their request at that offer's price.
/// Only the person who posted the request can, and it funds escrow in the same
/// step, so the frontend opens the confirm sheet before calling it.
jobsRoutes.post('/:jobId/choose-offer', async (c) => {
  const jobId = c.req.param('jobId');
  let body;
  try {
    body = chooseOfferSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  // Every refusal is logged with its reason, so a buyer's "could not choose"
  // can be traced to the check that stopped it.
  const refuse = (reason: string) => logger.warn({ jobId, seller: body.seller, reason }, 'choose-offer refused');
  if (!isSessionSelf(c, body.caller)) {
    refuse('session-mismatch');
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  const brief = getBrief(jobId);
  if (!brief || !isRequestOwner(body.caller, brief)) {
    refuse(brief ? 'not-request-owner' : 'no-brief');
    return c.json({ error: 'only the buyer can choose an offer', code: 'forbidden' }, 403);
  }
  if (config.SHORTLIST_MODE) {
    const entries = getShortlist(jobId) ?? [];
    const listed = entries.some((e) => e.seller.toLowerCase() === body.seller.toLowerCase());
    const owner = listed ? null : await findAgentWalletByAgentAddress(body.seller).catch(() => null);
    const offListVerified = listed || (!!owner && isVerified(await levelOf(owner.userAddress)));
    const check = shortlistChoiceCheck(entries, body.seller, body.acknowledgeUnverified === true, offListVerified);
    if (!check.ok) {
      refuse(check.code);
      const error =
        check.code === 'unavailable'
          ? 'This offer is no longer available.'
          : 'This seller is not verified. Confirm that you want to go ahead.';
      return c.json({ error, code: check.code }, 409);
    }
  }
  const quote = await quoteAgentOffer(jobId, body.seller);
  if (quote.ok) {
    const { hold, step } = await worldStepForChoice({
      jobId,
      buyerUser: body.caller,
      sellerAgent: quote.seller,
      priceUsdc: quote.priceUsdc,
      acknowledgeUnverified: body.acknowledgeUnverified === true,
    });
    if (step.kind === 'buyer') {
      refuse('world-id-buyer');
      return c.json(
        { error: 'Confirm with World ID before your agent funds this deal.', code: 'WORLD_ID_REQUIRED', reason: step.reason, skipAllowed: AGENT_WORLD_SKIP_ALLOWED },
        409,
      );
    }
    if (step.kind === 'seller' && hold) {
      await waitOnSeller(hold);
      return c.json({ accepted: false, code: 'SELLER_CHECK_PENDING', reason: step.reason, jobId }, 202);
    }
  }
  if (inFlight.has(jobId)) {
    refuse('in-flight');
    return c.json({ error: 'an action is already in progress for this job' }, 409);
  }
  inFlight.add(jobId);
  try {
    const result = await chooseAgentOffer(jobId, body.seller, body.expectedPriceUsdc);
    if (!result.ok) {
      refuse(result.code);
      const status = result.code === 'INSUFFICIENT_AGENT_BALANCE' || saysWhy(result.code) || result.code === 'CLOSED' || result.code === 'PRICE_CHANGED' || result.code.startsWith('ALREADY') ? 409 : result.code === 'NO_OFFER' ? 404 : 502;
      const error = saysWhy(result.code) ? result.message : 'could not choose this offer';
      return c.json({ error, code: result.code, detail: result.message }, status);
    }
    await deleteHold(jobId).catch(() => undefined);
    return c.json({ accepted: true, jobId, txHash: result.txHash }, 200);
  } finally {
    inFlight.delete(jobId);
  }
});

const worldCallerSchema = z.object({ caller: addrSchema });
const worldVerifySchema = z.object({ caller: addrSchema, idkitResponse: z.record(z.string(), z.unknown()) });

function worldCheckFailure(c: Context, error: unknown) {
  if (error instanceof WorldSessionError) return c.json({ error: error.message, code: error.code }, error.status);
  logger.error({ err: error instanceof Error ? error.message : 'unknown' }, 'agent World ID check unavailable');
  return c.json({ error: 'World ID is unavailable. Try again shortly.', code: 'WORLD_ID_UNAVAILABLE' }, 503);
}

/// Starts the World ID check for whichever side of the request's open step the
/// caller is on.
jobsRoutes.post('/:jobId/world-check/request', async (c) => {
  c.header('Cache-Control', 'no-store');
  let body;
  try { body = worldCallerSchema.parse(await c.req.json()); }
  catch (err) { return c.json({ error: invalidBodyMessage(err) }, 400); }
  if (!isSessionSelf(c, body.caller)) return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  if (!worldIdDealSessionsConfigured()) return c.json({ error: 'World ID is unavailable. Try again shortly.', code: 'WORLD_ID_UNAVAILABLE' }, 503);
  try {
    return c.json(await worldIdAgentChecks().request(c.req.param('jobId'), body.caller), 200);
  } catch (error) { return worldCheckFailure(c, error); }
});

jobsRoutes.post('/:jobId/world-check/verify', async (c) => {
  c.header('Cache-Control', 'no-store');
  let body;
  try { body = worldVerifySchema.parse(await c.req.json()); }
  catch (err) { return c.json({ error: invalidBodyMessage(err) }, 400); }
  if (!isSessionSelf(c, body.caller)) return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  if (!worldIdDealSessionsConfigured()) return c.json({ error: 'World ID is unavailable. Try again shortly.', code: 'WORLD_ID_UNAVAILABLE' }, 503);
  try {
    const { role, hold } = await worldIdAgentChecks().verify(c.req.param('jobId'), body.caller, body.idkitResponse);
    logger.info({ jobId: hold.jobId, role }, 'agent deal World ID check passed');
    publishWorldCheck(hold);
    const funding = role === 'seller' ? await fundHeldChoice(hold) : { funded: false };
    return c.json({ verified: true, role, ...funding, worldCheck: worldCheckView(funding.funded ? null : hold) }, 200);
  } catch (error) { return worldCheckFailure(c, error); }
});

/// Testnet only: go on without the check. It is not a verification and never
/// reads as one, and mainnet refuses it.
jobsRoutes.post('/:jobId/world-check/skip', async (c) => {
  c.header('Cache-Control', 'no-store');
  if (!AGENT_WORLD_SKIP_ALLOWED) return c.json({ error: 'This check cannot be skipped on mainnet.', code: 'SKIP_NOT_ALLOWED' }, 403);
  let body;
  try { body = worldCallerSchema.parse(await c.req.json()); }
  catch (err) { return c.json({ error: invalidBodyMessage(err) }, 400); }
  if (!isSessionSelf(c, body.caller)) return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  const hold = await getHold(c.req.param('jobId'));
  const role = roleIn(hold, body.caller);
  if (!hold || !role) return c.json({ error: 'There is no World ID check for you on this request.', code: 'forbidden' }, 403);
  const skipped = await skipWorldCheck(hold, role);
  logger.info({ jobId: hold.jobId, role }, 'agent deal World ID check skipped on testnet');
  publishWorldCheck(skipped);
  const funding = role === 'seller' ? await fundHeldChoice(skipped) : { funded: false };
  return c.json({ skipped: true, role, ...funding, worldCheck: worldCheckView(funding.funded ? null : skipped) }, 200);
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const prohibited = prohibitedBody(body);
  if (prohibited) return c.json(prohibited, 422);
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

  const next = patchBrief(jobId, { ...patch, edits: (brief.edits ?? 0) + 1 });
  if (patch.negotiationMaxIncreasePct !== undefined || patch.trustedMatch !== undefined) {
    patchTrackedJobContext(jobId, {
      negotiationMaxIncreasePct: patch.negotiationMaxIncreasePct,
      trustedMatch: patch.trustedMatch,
    });
  }
  logger.info({ jobId, postedBy: brief.postedBy, fields: Object.keys(patch) }, 'brief edited by buyer');
  // The buyer's agent looks again at the offers it holds under the new terms (view 35).
  void rejudgeOffers(jobId).catch((err: Error) => logger.warn({ jobId, err: err.message }, 'judging the offers again after an edit failed'));
  // Sellers who offered by hand hear of the change once, with their price. The
  // request rides in the payload so the notice reaches only that seller.
  void listDirectOffers(jobId)
    .then((offers) => {
      const title = requestTitle(next?.briefText ?? brief.briefText) ?? '';
      for (const o of offers.filter((x) => x.state === 'pending')) {
        bus.emitEvent({
          type: 'offer.request-changed',
          actor: 'buyer',
          payload: { sellerUser: o.sellerUser, jobId: jobId.toLowerCase(), priceUsdc: o.priceUsdc, title },
        });
      }
    })
    .catch((err: Error) => logger.warn({ jobId, err: err.message }, 'telling hand sellers of an edit failed'));
  // A changed price limit or trust setting goes back to every seller now; a text
  // change waits for its new keywords below.
  if (patch.briefText === undefined) void offerAgain(jobId);

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
        return offerAgain(jobId);
      })
      .catch((err) => {
        logger.warn(
          { err: (err as Error).message, jobId },
          'brief keyword re-extraction failed; stale keywords will be used',
        );
      });
  }

  // The stored shortlist carries the agent's numbers; a person sees sealed rows
  // from the shortlist route, never these (D30).
  const { shortlist: _agentCopy, ...visible } = next ?? ({} as NonNullable<typeof next>);
  return c.json({ brief: next ? visible : next });
});

jobsRoutes.post('/:jobId/cancel', async (c) => {
  const jobId = c.req.param('jobId');
  let body;
  try {
    body = callerSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  const brief = getBrief(jobId);
  if (!brief || !isRequestOwner(body.caller, brief)) {
    return c.json({ error: 'only the buyer can cancel this request', code: 'NOT_BUYER' }, 403);
  }
  const result = cancelBriefByBuyer(jobId as `0x${string}`);
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!isSessionSelf(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  const proposal = await getMatchProposal(jobId);
  if (!proposal) return c.json({ error: 'no match proposal for this job' }, 404);
  const pendingRaise = proposal.awaitingParty === 'buyer' && !!proposal.raisedPriceUsdc;
  const who = matchDecliner(proposal, body.caller);
  if (!who.ok) return c.json({ error: who.message }, 403);
  const by = pendingRaise ? 'raise' : who.by;
  const result = await declineAgentMatch(jobId, body.reason ?? (by === 'buyer' ? 'buyer-withdrew' : undefined), by);
  if (!result.ok) return c.json({ error: result.message, code: result.code }, 409);
  // A buyer who withdraws a match the seller never answered gets the request
  // back: the other offers stay, and they can choose one or cancel the request.
  if (who.by === 'buyer' && !pendingRaise) reopenForNewBids(jobId);
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
  // A buyer is never shown an ask to stretch while an offer within their budget
  // is live or on their shortlist; the in-budget offer is the decision to make.
  if (nm.askedSide === 'buyer' && inBudgetAlternative(jobId, Number(nm.buyerCeilingUsdc), nm.sellerAgent)) {
    return c.json({ nearMiss: null });
  }
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
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
    return c.json({ error: invalidBodyMessage(err) }, 400);
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
  void enqueueLegacyReconsiderationShadow(rec, Math.floor(Date.now() / 1_000)).catch((error) => {
    logger.warn(
      { jobId, err: error instanceof Error ? error.message : String(error) },
      'legacy reconsideration shadow scheduling failed',
    );
  });
  return c.json({ reconsidered: true, jobId, proceedPriceUsdc: raised.proceedPriceUsdc }, 200);
});
