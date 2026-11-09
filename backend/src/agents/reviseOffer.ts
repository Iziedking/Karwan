/// A seller's agent answers a change to a request it offered on (view 35):
/// keep the offer, lower it with a new submitBid (the JobBoard replaces the
/// seller's offer), or withdraw. The buyer's agent hears the lower offer from
/// the chain and records the move; nothing here reaches the buyer directly.

import { sellerRevision, type RandomSource, type SellerSidePrice } from './sellerPricing.js';

export interface ReviseDeps {
  /// The agent's standing offer on the request, with the budget and the
  /// seller's own floor; null when it has none.
  /// With bargaining on it carries `side` in place of the budget (view 73).
  standing(): Promise<
    | ({ priceUsdc: number; deadlineUnix: number; floorUsdc: number } & ({ budgetUsdc: number } | { side: SellerSidePrice }))
    | null
  >;
  /// Whether the seller named their own price here; the agent never touches that.
  handOffer(): Promise<boolean>;
  revisionsSoFar(): Promise<number>;
  saveRevisions(n: number): Promise<void>;
  submit(priceUsdc: number, deadlineUnix: number): Promise<void>;
  withdraw(): void;
  random: RandomSource;
}

export type ReviseOutcome = 'kept' | 'lowered' | 'withdrawn' | 'skipped';

export async function reviseStandingOffer(
  _jobId: string,
  _sellerAgent: string,
  reason: 'request-changed' | 'best-and-final',
  deps: ReviseDeps,
  lowestOtherUsdc?: number,
): Promise<ReviseOutcome> {
  const standing = await deps.standing();
  if (!standing || (await deps.handOffer())) return 'skipped';
  const revisionsSoFar = await deps.revisionsSoFar();
  const step = sellerRevision({
    standingUsdc: standing.priceUsdc,
    floorUsdc: standing.floorUsdc,
    reason,
    ...('side' in standing ? { side: standing.side } : { budgetUsdc: standing.budgetUsdc }),
    revisionsSoFar,
    random: deps.random,
    ...(lowestOtherUsdc !== undefined ? { lowestOtherUsdc } : {}),
  });
  if (step.action === 'keep') return 'kept';
  if (step.action === 'withdraw') {
    deps.withdraw();
    return 'withdrawn';
  }
  await deps.submit(step.priceUsdc, standing.deadlineUnix);
  await deps.saveRevisions(revisionsSoFar + 1);
  return 'lowered';
}
