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
  return [
    'You are a freelancer agent evaluating whether to bid on a cross-border SME job.',
    '',
    'Seller profile:',
    `- Skills: ${seller.skills.join(', ')}`,
    `- Bio: ${seller.bio}`,
    `- Accepted budget range: ${seller.minBudgetUsdc} to ${seller.maxBudgetUsdc} USDC`,
    `- Accepted deadline range: ${seller.minDeadlineDays} to ${seller.maxDeadlineDays} days`,
    '',
    'Job:',
    `- Buyer reputation: ${job.buyerReputationBps} / 10000 (5000 = neutral)`,
    `- Budget posted by buyer: ${job.budgetUsdc} USDC`,
    `- Days until buyer's deadline: ${daysToBuyerDeadline}`,
    `- Terms hash: ${job.termsHash}`,
    '',
    'Output rules:',
    '- decision: "bid" or "skip"',
    '- suggestedPrice: digits only, inside the seller budget range',
    `- suggestedDeadlineDays: integer 1..${Math.min(60, daysToBuyerDeadline)}`,
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
    `- suggestedCounterDeadlineDays: integer 1..${Math.min(60, daysFromNow(job.deadlineUnix))}, normally tighter than the bid.`,
    '- confidence: 0..1 in this assessment',
    '- reasoning: one or two sentences',
  ].join('\n');
}

export function buildCounterEvaluationPrompt(
  job: JobContext,
  buyer: BuyerProfile,
  buyerLastCounterUsdc: string,
  sellerCounterPriceUsdc: string,
  sellerCounterDeadlineUnix: number,
): string {
  const daysToSellerDeadline = daysFromNow(sellerCounterDeadlineUnix);
  return [
    'You are a buyer agent. The seller has responded to your counter-offer with their own counter.',
    'Decide whether to accept, counter again, or decline.',
    '',
    'Buyer profile:',
    `- Max budget acceptable: ${buyer.maxBudgetUsdc} USDC`,
    `- Acceptable delivery window: ${buyer.minDeadlineDays} to ${buyer.maxDeadlineDays} days`,
    '',
    'Job:',
    `- Original budget: ${job.budgetUsdc} USDC`,
    `- Days until original deadline: ${daysFromNow(job.deadlineUnix)}`,
    '',
    'Negotiation:',
    `- Buyer's last counter price: ${buyerLastCounterUsdc} USDC`,
    `- Seller's counter price: ${sellerCounterPriceUsdc} USDC`,
    `- Seller's counter deadline: ${daysToSellerDeadline} days from now`,
    '',
    'Output rules:',
    '- decision: "accept" | "counter" | "decline"',
    '- If counter: counterPrice (digits only) and counterDeadlineDays (integer 1..60) are required.',
    '- confidence: 0..1',
    '- reasoning: one or two sentences',
  ].join('\n');
}
