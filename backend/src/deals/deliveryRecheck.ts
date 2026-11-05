import { getDeal, patchDeal, type DirectDeal } from '../db/deals.js';
import { logger } from '../logger.js';
import { verifyDeliverable, type RequirementCheck } from '../security/requirementCheck.js';

/// Karwan's delivery check gives no verdict when every model provider fails.
/// The delivery then waits for the buyer's own review; this runs the check
/// again, in the background a few minutes later and when either side asks for
/// Check again on the deal page or from the assistant (view 43, owner 5 Nov 2026).

export interface RecheckDeps {
  get(jobId: string): Promise<DirectDeal | null>;
  check(input: { requirement: string; deliveryProof: string }): Promise<RequirementCheck>;
  save(jobId: string, patch: Partial<DirectDeal>): Promise<boolean>;
}

export type RecheckResult =
  | { status: 'checked'; verdict: RequirementCheck['verdict'] }
  | { status: 'not-needed' }
  | { status: 'still-unknown' };

/// Same rule as the delivery itself: a described deliverable against agreed
/// terms, never goods, and only while there is no verdict.
function needsCheck(deal: DirectDeal | null): deal is DirectDeal & { terms: string; deliveryProof: string } {
  return !!deal
    && deal.delivered === true
    && deal.tradeType !== 'goods'
    && !!deal.terms
    && !!deal.deliveryProof
    && deal.deliveryMatch?.verdict === 'unknown';
}

export async function recheckDelivery(jobId: string, deps: RecheckDeps = liveDeps): Promise<RecheckResult> {
  const before = await deps.get(jobId);
  if (!needsCheck(before)) return { status: 'not-needed' };
  const check = await deps.check({ requirement: before.terms, deliveryProof: before.deliveryProof });
  if (check.verdict === 'unknown') return { status: 'still-unknown' };
  const now = await deps.get(jobId);
  // A newer delivery arrived while the check ran: its own check stands.
  if (!needsCheck(now) || now.deliveryRevision !== before.deliveryRevision || now.deliveryProof !== before.deliveryProof) {
    return { status: 'not-needed' };
  }
  const history = now.deliveryHistory ?? [];
  const last = history.at(-1);
  await deps.save(jobId, {
    deliveryMatch: check,
    ...(last ? { deliveryHistory: [...history.slice(0, -1), { ...last, deliveryMatch: check }] } : {}),
  });
  logger.info({ jobId, verdict: check.verdict }, 'delivery check ran again');
  return { status: 'checked', verdict: check.verdict };
}

/// Minutes after a delivery came back without a verdict.
export const RECHECK_DELAYS_MS = [2 * 60_000, 10 * 60_000, 30 * 60_000];

/// Tries again in the background until there is a verdict or the tries run
/// out. In memory: after a restart, Check again is still there for either side.
export function scheduleRecheck(jobId: string, deps: RecheckDeps = liveDeps, delays = RECHECK_DELAYS_MS): void {
  const [first, ...rest] = delays;
  if (first === undefined) return;
  const timer = setTimeout(() => {
    recheckDelivery(jobId, deps)
      .then((r) => { if (r.status === 'still-unknown') scheduleRecheck(jobId, deps, rest); })
      .catch((err: Error) => logger.warn({ jobId, err: err.message }, 'delivery check retry failed'));
  }, first);
  timer.unref?.();
}

const liveDeps: RecheckDeps = {
  get: getDeal,
  check: verifyDeliverable,
  save: async (jobId, patch) => !!(await patchDeal(jobId, patch)),
};
