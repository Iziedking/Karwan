import type { SellerProfile } from '../agents/seller-profile.js';
import type { BuyerProfile } from '../agents/buyer-profile.js';

export interface JobContext {
  jobId: string;
  buyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  termsHash: string;
  buyerReputationBps: number;
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
  return [
    'You are a freelancer agent deciding whether to bid on a job.',
    '',
    'Hard rules, apply mechanically, do not override with your own intuition:',
    `- Minimum acceptable price: ${seller.minBudgetUsdc} USDC`,
    `- Maximum acceptable price: ${seller.maxBudgetUsdc} USDC`,
    `- Minimum days to delivery: ${seller.minDeadlineDays}`,
    `- Maximum days to delivery: ${seller.maxDeadlineDays}`,
    `- If buyer budget is inside [${seller.minBudgetUsdc}, ${seller.maxBudgetUsdc}] USDC, the seller WILL consider bidding regardless of perceived market rate.`,
    `- If days-to-deadline is inside [${seller.minDeadlineDays}, ${seller.maxDeadlineDays}], the timeline is acceptable.`,
    `- Pre-computed: budget-in-range=${inBudgetRange}, deadline-in-range=${inDeadlineRange}.`,
    '',
    'Seller skills:',
    `- ${seller.skills.join(', ')}`,
    `- Bio: ${seller.bio}`,
    '',
    'Job:',
    `- Buyer reputation: ${job.buyerReputationBps} / 10000 (5000 = neutral)`,
    `- Buyer-posted budget: ${job.budgetUsdc} USDC`,
    `- Days until buyer's deadline: ${daysToBuyerDeadline}`,
    `- Terms hash: ${job.termsHash}`,
    '',
    'Output rules:',
    '- decision: "bid" if budget-in-range AND deadline-in-range AND skills are at least partially relevant. Otherwise "skip".',
    `- suggestedPrice: digits only USDC amount, must be between ${seller.minBudgetUsdc} and Math.min(buyer budget, ${seller.maxBudgetUsdc}). For tiny jobs bid close to buyer's posted budget.`,
    `- suggestedDeadlineDays: integer in [${seller.minDeadlineDays}, ${Math.min(seller.maxDeadlineDays, daysToBuyerDeadline)}]`,
    '- confidence: 0..1',
    '- reasoning: one or two sentences',
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
    '- suggestedCounterPrice: digits only USDC amount the buyer should propose. Aim to negotiate down 5-20% off the bid unless the bid is already a great deal.',
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
