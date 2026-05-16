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
}

export interface BidContext {
  seller: string;
  priceUsdc: string;
  deadlineUnix: number;
  sellerReputationBps: number;
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
    'Output rules:',
    '- decision: "bid" ONLY if topical match passes AND budget-in-range AND deadline-in-range. Otherwise "skip".',
    "- suggestedPrice: digits only USDC amount. PRICING RULE: when the buyer's posted budget is within the seller's acceptable range, bid AT the buyer's posted budget — DO NOT undercut. The seller is here to earn the asking price, not to win a race-to-the-bottom. Only bid above the buyer's posted budget if seller.minBudgetUsdc forces it (in which case bid at minBudgetUsdc and let the buyer agent counter). Only bid below the buyer's posted budget if the seller's max is below the budget (in which case bid at seller.maxBudgetUsdc).",
    `- suggestedPrice MUST satisfy: between ${seller.minBudgetUsdc} and ${seller.maxBudgetUsdc} (seller bounds), and SHOULD equal ${Math.min(seller.maxBudgetUsdc, Math.max(seller.minBudgetUsdc, budgetN))} (buyer's budget clamped to seller's range).`,
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
    '',
    'Output rules:',
    '- score: 0..100 composite (higher is better). Weight reputation, price-vs-budget, delivery timing.',
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

export function buildCounterEvaluationPrompt(
  job: JobContext,
  party: CounterPartyConstraints,
  ourLastPriceUsdc: string,
  theirCounterPriceUsdc: string,
  theirCounterDeadlineUnix: number,
): string {
  const daysToTheirDeadline = daysFromNow(theirCounterDeadlineUnix);
  const role = party.side;
  const other = role === 'buyer' ? 'seller' : 'buyer';
  const theirPriceN = Number(theirCounterPriceUsdc);
  const priceInRange =
    theirPriceN >= party.minAcceptablePriceUsdc && theirPriceN <= party.maxAcceptablePriceUsdc;
  const deadlineInRange =
    daysToTheirDeadline >= party.minDeadlineDays && daysToTheirDeadline <= party.maxDeadlineDays;
  return [
    `You are the ${role} agent. The ${other} has sent a counter-offer.`,
    'Decide whether to accept, counter again, or decline.',
    '',
    `Hard constraints, apply mechanically:`,
    `- Minimum acceptable price: ${party.minAcceptablePriceUsdc} USDC`,
    `- Maximum acceptable price: ${party.maxAcceptablePriceUsdc} USDC`,
    `- Minimum acceptable days to delivery: ${party.minDeadlineDays}`,
    `- Maximum acceptable days to delivery: ${party.maxDeadlineDays}`,
    `- Pre-computed: their-price-in-range=${priceInRange}, their-deadline-in-range=${deadlineInRange}.`,
    '',
    'Job:',
    `- Original budget posted: ${job.budgetUsdc} USDC`,
    `- Days until original deadline: ${daysFromNow(job.deadlineUnix)}`,
    '',
    'Negotiation state:',
    `- Our last price on the table: ${ourLastPriceUsdc} USDC`,
    `- Their counter price: ${theirCounterPriceUsdc} USDC`,
    `- Their counter deadline: ${daysToTheirDeadline} days from now`,
    '',
    'Output rules:',
    '- If their-price-in-range AND their-deadline-in-range, accept unless you have strong reason to counter further.',
    '- decision: "accept" | "counter" | "decline"',
    `- If counter: counterPrice must be in [${party.minAcceptablePriceUsdc}, ${party.maxAcceptablePriceUsdc}] and counterDeadlineDays must be in [${party.minDeadlineDays}, ${party.maxDeadlineDays}].`,
    '- confidence: 0..1',
    '- reasoning: one or two sentences',
  ].join('\n');
}
