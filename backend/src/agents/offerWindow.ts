/// Whether a request still takes offers. The reconciler uses it to stop paying
/// the model to re-evaluate sellers for requests that are matched, funded,
/// expired or cancelled. Cancelling a request marks it expired.
export function closedForOffers(
  state: { finalized: boolean; escrowFunded: boolean; expired: boolean },
  nearMissPending: boolean,
): boolean {
  if (state.escrowFunded || state.expired) return true;
  return state.finalized && !nearMissPending;
}
