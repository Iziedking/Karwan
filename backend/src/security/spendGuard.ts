import { logger } from '../logger.js';

/// Per-deal spend cap for the agents' paid intelligence calls (x402 credit
/// passports, market reads). Without a ceiling, a pathological loop — many bids
/// on one job, each triggering a paid counterparty pull — could drain the payer
/// on a single deal. This bounds the total paid spend attributable to one job so
/// the market-intelligence layer stays cheap and predictable
/// (audit/AGENTIC_WORKFLOW_REVIEW.md — spend caps).
///
/// In-memory only: the cap is a runtime safety rail, not accounting. Real spend
/// accounting is the on-chain x402 settlement history; this just stops a runaway
/// within a process lifetime. Resets on restart, which is fine — a restart is
/// not a path a loop can exploit.

/// Default ceiling on total paid-call spend per deal, in USDC. At $0.01 per
/// credit-passport pull that's ~10 pulls; a healthy deal uses 1-2. Env override.
const PER_DEAL_CAP_USDC = Number(process.env.PAID_CALL_PER_DEAL_CAP_USDC ?? 0.1);

const spentByDeal = new Map<string, number>();

/// Total paid-call spend recorded against a deal so far (USDC).
export function spentOnDeal(jobId: string): number {
  return spentByDeal.get(jobId) ?? 0;
}

/// Whether spending `estUsdc` more on this deal would exceed the per-deal cap.
/// Callers check this BEFORE making a paid call and skip the call when it would.
export function wouldExceedCap(jobId: string, estUsdc: number): boolean {
  return spentOnDeal(jobId) + Math.max(0, estUsdc) > PER_DEAL_CAP_USDC + 1e-9;
}

/// Record actual spend after a paid call settles. Best-effort; over-cap recording
/// is still tracked (so the next check trips) but logged.
export function recordSpend(jobId: string, usdc: number): void {
  if (!Number.isFinite(usdc) || usdc <= 0) return;
  const next = spentOnDeal(jobId) + usdc;
  spentByDeal.set(jobId, next);
  if (next > PER_DEAL_CAP_USDC + 1e-9) {
    logger.warn({ jobId, spentUsdc: next, capUsdc: PER_DEAL_CAP_USDC }, 'per-deal paid-call cap exceeded');
  }
}

export const PAID_CALL_PER_DEAL_CAP_USDC = PER_DEAL_CAP_USDC;
