import type { SellerProfile } from '../agents/seller-profile.js';
import type { BuyerProfile } from '../agents/buyer-profile.js';

export interface JobContext {
  jobId: string;
  buyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  termsHash: string;
  buyerReputationBps: number;
  /** Buyer's per-brief tolerance: agent may accept counters up to
   *  budgetUsdc * (1 + pct/100). Undefined means strict (no tolerance). */
  negotiationMaxIncreasePct?: number;
  /** Human-readable brief text. Sourced from the off-chain briefs store; absent
   *  for jobs posted before we tracked it, in which case the LLM falls back to
   *  budget/deadline matching only. */
  briefText?: string;
  /// Optional deterministic signals on the buyer. Passed through so the seller
  /// agent can see "is this a real buyer or a probable bot/scammer" before it
  /// commits gas to a bid that will never close.
  buyerRepTier?: 'new' | 'cold' | 'established' | 'strong' | 'elite';
  buyerCompletionRate?: number;
  buyerVelocity24h?: number;
}

export interface BidContext {
  seller: string;
  priceUsdc: string;
  deadlineUnix: number;
  sellerReputationBps: number;
  /// Deterministic risk + reliability features computed by `agents/signals.ts`
  /// and passed in so the LLM can reason about the *pattern* rather than the
  /// raw numbers. Optional for backward-compat with code paths that haven't
  /// been threaded yet — the prompt soft-degrades when missing.
  repTier?: 'new' | 'cold' | 'established' | 'strong' | 'elite';
  completionRate?: number;
  velocity24h?: number;
  priceMultiple?: number;
  priceAnomaly?: number | null;
}

const DAY_SECONDS = 86_400;

function daysFromNow(unix: number): number {
  return Math.max(1, Math.floor((unix - Math.floor(Date.now() / 1000)) / DAY_SECONDS));
}

export function buildBidEvaluationPrompt(job: JobContext, seller: SellerProfile): string {
  const daysToBuyerDeadline = daysFromNow(job.deadlineUnix);
  const budgetN = Number(job.budgetUsdc);
  const inBudgetRange = budgetN >= seller.minBudgetUsdc && budgetN <= seller.maxBudgetUsdc;
  const inDeadlineRange =
    daysToBuyerDeadline >= seller.minDeadlineDays && daysToBuyerDeadline <= seller.maxDeadlineDays;
  const briefLine = job.briefText
    ? `- Brief: ${job.briefText}`
    : `- Brief: (not provided; only terms hash ${job.termsHash} is available)`;
  return [
    'You are a freelancer agent deciding whether to bid on a job for your principal.',
    'You must apply BOTH a topical-match check and the hard range checks below.',
    '',
    'Seller profile:',
    `- Skills: ${seller.skills.join(', ')}`,
    `- Bio: ${seller.bio}`,
    '',
    'Job:',
    briefLine,
    `- Buyer reputation: ${job.buyerReputationBps} / 10000 (5000 = neutral)`,
    job.buyerRepTier ? `- Buyer rep tier: ${job.buyerRepTier}` : '',
    job.buyerCompletionRate != null
      ? `- Buyer completion rate: ${(job.buyerCompletionRate * 100).toFixed(0)}%`
      : '',
    job.buyerVelocity24h != null
      ? `- Buyer 24h activity count: ${job.buyerVelocity24h}`
      : '',
    `- Buyer-posted budget: ${job.budgetUsdc} USDC`,
    `- Days until buyer's deadline: ${daysToBuyerDeadline}`,
    '',
    'Topical match (apply FIRST):',
    "- Decide if the brief is in the seller's wheelhouse, based on the brief text against the seller's skills + bio.",
    '- Match generously on synonyms and abbreviations (e.g. "WL" ≈ "whitelist", "ETH dev" ≈ "Ethereum developer", "Morse NFT" matches any NFT-related skill).',
    '- If the brief is clearly outside the seller\'s skills (e.g. brief asks for graphic design but the seller does smart contracts), decision MUST be "skip" with low confidence. Do NOT bid out of topic.',
    '',
    'Hard range checks (apply SECOND, only if topical match passes):',
    `- Minimum acceptable price: ${seller.minBudgetUsdc} USDC`,
    `- Maximum acceptable price: ${seller.maxBudgetUsdc} USDC`,
    `- Minimum days to delivery: ${seller.minDeadlineDays}`,
    `- Maximum days to delivery: ${seller.maxDeadlineDays}`,
    `- Pre-computed: budget-in-range=${inBudgetRange}, deadline-in-range=${inDeadlineRange}.`,
    '',
    'Pricing (the system sets the exact opening price; you do not):',
    "- The buyer's posted budget is their committed valuation and the FLOOR. The system opens your bid between that budget and the buyer's tolerance ceiling (budget x (1 + their max increase %)), biased UP when demand for your skill is high and DOWN toward the budget for trusted or repeat buyers. Your agent never bids below the buyer's posted budget.",
    '- So you are not racing to the bottom: you start at or above what the buyer offered and negotiate from there. Sellers want a premium; the buyer holds near their budget; you meet in between.',
    '',
    'Output rules:',
    '- decision: "bid" ONLY if topical match passes AND budget-in-range AND deadline-in-range. Otherwise "skip".',
    `- suggestedPrice: digits only USDC amount between ${seller.minBudgetUsdc} and ${seller.maxBudgetUsdc}. This is only a hint for the reasoning; the system sets the actual opening inside [budget, ceiling]. A sensible hint is ${Math.min(seller.maxBudgetUsdc, Math.max(seller.minBudgetUsdc, budgetN))} USDC or above.`,
    `- suggestedDeadlineDays: integer in [${seller.minDeadlineDays}, ${Math.min(seller.maxDeadlineDays, daysToBuyerDeadline)}]`,
    '- confidence: 0..1. Lower confidence (≤ 0.5) means weak topical match or borderline range.',
    '- reasoning: one or two sentences explaining the topical fit (or lack of it) and price logic.',
  ].join('\n');
}

export function buildBidRankingPrompt(
  job: JobContext,
  bid: BidContext,
  buyer: BuyerProfile,
): string {
  const daysToDelivery = daysFromNow(bid.deadlineUnix);
  return [
    'You are a buyer agent reviewing a single bid on a job you posted.',
    '',
    'Buyer profile:',
    `- Max budget acceptable: ${buyer.maxBudgetUsdc} USDC`,
    `- Acceptable delivery window: ${buyer.minDeadlineDays} to ${buyer.maxDeadlineDays} days`,
    '',
    'Job:',
    `- Original budget posted: ${job.budgetUsdc} USDC`,
    `- Days until original deadline: ${daysFromNow(job.deadlineUnix)}`,
    '',
    'Bid:',
    `- Seller reputation: ${bid.sellerReputationBps} / 10000 (5000 = neutral)`,
    `- Bid price: ${bid.priceUsdc} USDC`,
    `- Proposed delivery in ${daysToDelivery} days`,
    bid.repTier ? `- Seller rep tier: ${bid.repTier}` : '',
    bid.completionRate != null
      ? `- Seller completion rate: ${(bid.completionRate * 100).toFixed(0)}%`
      : '',
    bid.velocity24h != null ? `- Seller 24h activity count: ${bid.velocity24h}` : '',
    bid.priceMultiple != null
      ? `- Price multiple vs budget: ${bid.priceMultiple.toFixed(2)}× (1.0 = at budget)`
      : '',
    bid.priceAnomaly != null
      ? `- Price anomaly: ${bid.priceAnomaly.toFixed(2)}σ vs network median`
      : '',
    '',
    'Pattern guide (use this to read the signals together, not just the price):',
    '- "windfall": bid price well above budget + established/strong/elite rep → score high; this is a real buyer paying generously.',
    '- "honey trap": bid price well above budget + new/cold rep → mark medium-low score and lower confidence; could be urgent legit demand or scam bait. The human will judge, not the agent.',
    '- "reliable deal": bid at or near budget + established/strong/elite rep + completion rate > 80% → score high; this is a normal acceptable deal.',
    '- "suspicious lowball": bid far below budget + new/cold rep → score low; probable probe pricing.',
    '- "spammy": 24h activity ≥ 20 → score low regardless of price; likely bot.',
    '',
    'Tier-aware finalization (applied deterministically after your score per docs/reputation-model.md §6):',
    '- seller ELITE → auction skipped, top bid accepted within profile cap. Score elite bids generously when they fit the brief.',
    '- seller STRONG → if top bid is within 5% of the next-best, it is accepted without a counter round.',
    '- seller ESTABLISHED → standard flow.',
    '- seller COLD → a single -5% counter is forced even when the bid is already at/under budget.',
    '- seller NEW → full counter cycle, and a bottom-decile price routes the final accept to a human.',
    'You do not need to apply these yourself. Score the bid honestly and the system will route.',
    '',
    'Output rules:',
    '- score: 0..100 composite (higher is better). Weight reputation, completionRate, price-vs-budget, delivery timing, and the pattern above.',
    `- suggestedCounterPrice: digits only USDC amount. COUNTER RULE: if the bid is at or below the buyer's posted budget (${job.budgetUsdc} USDC), set suggestedCounterPrice EQUAL to the bid price — the bid is already favorable, do NOT counter down. Only when the bid is ABOVE the buyer's posted budget should you counter down toward the budget (suggest at or near ${job.budgetUsdc} USDC). The buyer's hard cap is ${buyer.maxBudgetUsdc} USDC.`,
    `- suggestedCounterDeadlineDays: integer days from now. KEEP this equal to the seller's proposed delivery (${daysToDelivery} days). Do not tighten further. Only push back on price.`,
    '- confidence: 0..1 in this assessment',
    '- reasoning: one or two sentences',
  ].join('\n');
}

export interface CounterPartyConstraints {
  side: 'buyer' | 'seller';
  minAcceptablePriceUsdc: number;
  maxAcceptablePriceUsdc: number;
  minDeadlineDays: number;
  maxDeadlineDays: number;
}

/// State that lets the prompt write tier-aware, urgency-aware,
/// concession-aware reasoning. All fields are optional so callers can ramp
/// up incrementally without breaking the existing flow.
export interface NegotiationContext {
  /// 0 on first counter response, 1 on the next, etc. Used to set
  /// expectations about how much more room to give.
  round: number;
  /// Hard cap; once `round >= maxRounds` the agent walks away.
  maxRounds: number;
  /// Counterparty's reputation tier. Drives elasticity: a STRONG seller
  /// earns a slightly faster concession than a NEW one.
  counterpartyTier?: 'new' | 'cold' | 'established' | 'strong' | 'elite';
  /// Deterministic next-counter price the strategy module computed for us,
  /// using concession decay + tier elasticity + urgency. The LLM should
  /// either echo this price (preferred) or override with a small deviation
  /// when it can justify the deviation in the reasoning.
  suggestedCounterPrice?: number;
  /// Median price of recent settlements in the brief's skill area. Helps the
  /// LLM ground its reasoning in market context rather than the bare numbers.
  marketMedianPrice?: number;
  /// Sample size behind the median so the LLM weighs it appropriately.
  marketSampleCount?: number;
  /// 0..1 market demand for the skill (agents/marketDemand.ts). High demand lets
  /// the seller hold firmer and signals the buyer to expect to pay nearer the cap.
  marketHeat?: number;
}

export function buildCounterEvaluationPrompt(
  job: JobContext,
  party: CounterPartyConstraints,
  ourLastPriceUsdc: string,
  theirCounterPriceUsdc: string,
  theirCounterDeadlineUnix: number,
  ctx?: NegotiationContext,
): string {
  const daysToTheirDeadline = daysFromNow(theirCounterDeadlineUnix);
  const daysToJobDeadline = daysFromNow(job.deadlineUnix);
  const role = party.side;
  const other = role === 'buyer' ? 'seller' : 'buyer';
  const theirPriceN = Number(theirCounterPriceUsdc);
  const priceInRange =
    theirPriceN >= party.minAcceptablePriceUsdc && theirPriceN <= party.maxAcceptablePriceUsdc;
  const deadlineInRange =
    daysToTheirDeadline >= party.minDeadlineDays && daysToTheirDeadline <= party.maxDeadlineDays;

  // Role-specific persona. Buyer and seller agents each have their own
  // posture; same hard constraints, different default mindset.
  const persona =
    role === 'buyer'
      ? [
          `You are the BUYER's agent. Your principal posted this brief at ${job.budgetUsdc} USDC — what they have decided the work is worth. That is your FLOOR (${party.minAcceptablePriceUsdc} USDC), never a number to undercut. The ${other} wants a premium above it, up to your hard cap of ${party.maxAcceptablePriceUsdc} USDC. Their counter is ${theirCounterPriceUsdc} USDC.`,
          'Posture: hold near the posted budget and make the seller earn any premium. Concede UPWARD toward the cap only when the seller has credible reputation OR demand for this skill is high. Never offer below the posted budget; never exceed the cap.',
        ]
      : [
          `You are the SELLER's agent. The buyer committed ${job.budgetUsdc} USDC, which is the floor; your principal wants more, up to ${party.maxAcceptablePriceUsdc} USDC. Your last price on the table is ${ourLastPriceUsdc} USDC; the buyer's counter is ${theirCounterPriceUsdc} USDC.`,
          `Posture: defend your asking price and earn a premium above the buyer's budget. Concede DOWNWARD toward the buyer's budget only when their reputation is strong OR demand for your skill is soft. Never drop below your acceptable floor (${party.minAcceptablePriceUsdc} USDC).`,
        ];

  const concessionGuide = ctx
    ? [
        '',
        'Concession curve (you are on round ' + ctx.round + ' of up to ' + ctx.maxRounds + '):',
        '- Round 0: concede up to 50% of the remaining gap.',
        '- Round 1: concede up to 25%.',
        '- Round 2: concede up to 10%. After this round the agent walks.',
        '- Tighter deadlines tilt the curve slightly more generous.',
        ctx.counterpartyTier
          ? `- Counterparty tier: ${ctx.counterpartyTier.toUpperCase()}. ELITE/STRONG earn a small concession boost; NEW/COLD get less.`
          : '',
        ctx.suggestedCounterPrice != null
          ? `- Strategy module suggests counter at ${ctx.suggestedCounterPrice} USDC. Echo this unless you can justify a small deviation.`
          : '',
        ctx.marketMedianPrice != null
          ? `- Recent settlement median for this skill: ${ctx.marketMedianPrice} USDC (n=${ctx.marketSampleCount ?? '?'}).`
          : '',
        ctx.marketHeat != null
          ? `- Market demand for this skill: ${
              ctx.marketHeat >= 0.66 ? 'HIGH' : ctx.marketHeat >= 0.4 ? 'MODERATE' : 'LOW'
            }. High demand: the seller holds firmer and the buyer should expect to pay nearer the cap. Low demand: the seller concedes faster and the buyer holds near the budget.`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  return [
    ...persona,
    'Decide whether to accept, counter again, or decline. Cite at most one public fact (reputation, market median, urgency) in the reasoning — do not reference the other side\'s tolerance.',
    '',
    'Hard constraints, apply mechanically:',
    `- Minimum acceptable price: ${party.minAcceptablePriceUsdc} USDC`,
    `- Maximum acceptable price: ${party.maxAcceptablePriceUsdc} USDC`,
    `- Minimum acceptable days to delivery: ${party.minDeadlineDays}`,
    `- Maximum acceptable days to delivery: ${party.maxDeadlineDays}`,
    `- Pre-computed: their-price-in-range=${priceInRange}, their-deadline-in-range=${deadlineInRange}.`,
    `- Days until original deadline: ${daysToJobDeadline}.`,
    '',
    'Negotiation state:',
    `- Our last price on the table: ${ourLastPriceUsdc} USDC`,
    `- Their counter price: ${theirCounterPriceUsdc} USDC`,
    `- Their counter deadline: ${daysToTheirDeadline} days from now`,
    concessionGuide,
    '',
    'Output rules:',
    '- DEFAULT TO ACCEPT when their-price-in-range AND their-deadline-in-range. Each counter round costs the user time and trust. Don\'t haggle over single-digit USDC.',
    '- Counter ONLY if ALL three are true: (a) counterparty tier is NEW or COLD, (b) the saving you can extract is at least 10% of their-price, (c) at least one counter round remains after this one.',
    '- decision: "accept" | "counter" | "decline"',
    `- If counter: counterPrice must be in [${party.minAcceptablePriceUsdc}, ${party.maxAcceptablePriceUsdc}] and counterDeadlineDays must be in [${party.minDeadlineDays}, ${party.maxDeadlineDays}].`,
    '- confidence: 0..1. Use 0.8+ when accepting an in-range offer.',
    '- reasoning: one or two sentences citing reputation, market median, or urgency. Never quote the counterparty\'s tolerance or floor.',
  ].join('\n');
}
