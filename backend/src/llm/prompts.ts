import type { SellerProfile } from '../agents/seller-profile.js';

export interface JobContext {
  jobId: string;
  buyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  termsHash: string;
  buyerReputationBps: number;
}

const DAY_SECONDS = 86_400;

export function buildBidEvaluationPrompt(job: JobContext, seller: SellerProfile): string {
  const daysToBuyerDeadline = Math.max(
    1,
    Math.floor((job.deadlineUnix - Math.floor(Date.now() / 1000)) / DAY_SECONDS),
  );

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
    `- Buyer reputation: ${job.buyerReputationBps} / 10000 (5000 = neutral, no history)`,
    `- Budget posted by buyer: ${job.budgetUsdc} USDC`,
    `- Days until buyer's deadline: ${daysToBuyerDeadline}`,
    `- Terms hash: ${job.termsHash}`,
    '',
    'Output rules:',
    '- decision: "bid" or "skip"',
    '- suggestedPrice: digits only USDC amount. No "USDC" suffix, no currency symbol. Must be inside the seller budget range.',
    `- suggestedDeadlineDays: integer days from now (1..${Math.min(60, daysToBuyerDeadline)}). Pick something the seller can comfortably deliver in. Must not exceed the buyer's deadline.`,
    '- confidence: 0..1. Skips below 0.7 will be human-reviewed.',
    '- reasoning: one or two sentences. Plain text.',
  ].join('\n');
}
