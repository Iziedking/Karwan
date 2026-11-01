/// A request whose search ended without a deal is still the buyer's until its
/// date passes (view 46): they can cancel it, or edit it and the search runs again.

export type CancelBlock = { code: 'ESCROW_FUNDED' | 'ALREADY_MATCHED' | 'ALREADY_TERMINAL'; message: string };

/// Why the buyer may not cancel, or null when they may. A search that ended
/// without a deal is finalized too, but nothing is held, so it cancels.
export function cancelBlock(s: {
  escrowFunded: boolean;
  finalized: boolean;
  negotiationEndedAt?: number;
  expired?: boolean;
}): CancelBlock | null {
  if (s.escrowFunded) {
    return { code: 'ESCROW_FUNDED', message: 'this brief already matched and escrow is funded; cancel on the deal page' };
  }
  if (s.expired) return { code: 'ALREADY_TERMINAL', message: 'this brief is already terminal' };
  if (s.finalized && !s.negotiationEndedAt) {
    return { code: 'ALREADY_MATCHED', message: 'this brief has a pending match; decline it on the deal page instead' };
  }
  return null;
}

/// Whether an edit should reopen the search: it ended without a deal and the
/// request is still open.
export function reopensOnEdit(s: { negotiationEndedAt?: number; escrowFunded: boolean; expired?: boolean }): boolean {
  return !!s.negotiationEndedAt && !s.escrowFunded && !s.expired;
}

/// The sellers the agent gave up on whose offers it still holds. An edit
/// changes the terms, so each of them is judged again; a seller who withdrew
/// has no offer left and stays out.
export function sellersToJudgeAgain<K extends string>(tried: ReadonlySet<K>, held: Iterable<K>): K[] {
  return [...held].filter((s) => tried.has(s));
}
