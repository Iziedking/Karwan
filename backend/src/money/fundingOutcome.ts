/// Did a funding transfer actually move money, when the code that was recording
/// it threw?
///
/// A transfer from the identity wallet to an agent goes: submit to Circle, poll
/// until it lands, read the receipt, then write down what happened. Only the
/// first three of those are the transfer. The last one is bookkeeping, and it
/// throws for its own reasons: an optimistic-concurrency conflict on the
/// movement row, a provider read that timed out, a database blip.
///
/// The route used to treat any throw as a failed transfer:
///
///   catch { markMoneyMovementNeedsAttention(ref, 'AGENT_FUNDING_UNKNOWN_OUTCOME') }
///
/// so a user watched 500 USDC leave their wallet and land, and was shown
/// "Failed" beside the very transaction that moved it. Worse, `onConfirmed`
/// runs OUTSIDE executeContractCall's own try, so a bookkeeping failure there
/// throws before the caller is ever handed the hash: the route had no idea a
/// transaction existed, while the movement leg was already holding it.
///
/// The question is answerable. Find the hash wherever it was written, ask the
/// chain, and only claim failure when something actually says so.

/// What the chain had to say about a transaction.
export type ReceiptStanding =
  /// Mined and successful.
  | 'success'
  /// Mined and reverted. Nothing moved.
  | 'reverted'
  /// No receipt yet. Usually still in the mempool.
  | 'not_found'
  /// The node could not be asked. Says nothing about the transfer.
  | 'unreadable';

export type FundingVerdict =
  /// The money moved. Say so, whatever the recording code did.
  | 'landed'
  /// Something authoritative says it did not. Safe to report as failed.
  | 'did_not_land'
  /// Not known. Never reported as either, because both would be a guess.
  | 'unknown';

/// The transaction this attempt put on chain, from whichever of the three
/// places knows about it. The leg comes first: it is written durably by the
/// lifecycle at confirmation time, and it survives the throw that loses the
/// in-memory result.
export function fundingTxHash(input: {
  legTxHash?: string | null | undefined;
  sentTxHash?: string | null | undefined;
  providerTxHash?: string | null | undefined;
}): string | null {
  const candidates = [input.legTxHash, input.sentTxHash, input.providerTxHash];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/// Provider states that mean Circle will never send this. Anything else,
/// including every in-progress state, leaves the question open.
const TERMINAL_PROVIDER_STATES = new Set(['FAILED', 'DENIED', 'CANCELLED']);

export function fundingVerdict(input: {
  txHash: string | null | undefined;
  receipt: ReceiptStanding;
  providerState?: string | null | undefined;
}): FundingVerdict {
  if (input.txHash) {
    if (input.receipt === 'success') return 'landed';
    if (input.receipt === 'reverted') return 'did_not_land';
    // A hash with no receipt yet is a transfer in the mempool, not a failed one.
    return 'unknown';
  }
  const state = input.providerState?.trim().toUpperCase();
  if (state && TERMINAL_PROVIDER_STATES.has(state)) return 'did_not_land';
  return 'unknown';
}

/// May a fresh transfer be started against a movement that needs attention?
///
/// Both web3 funding routes used to refuse outright:
///
///   if (movement.state === 'needs_attention') return c.json({ ... }, 409)
///
/// which made the state permanent. The completion route's entire job is to
/// prove a transfer against the Arc receipt, and proof is exactly what should
/// clear the flag, so refusing to look meant a transfer the user had signed and
/// the chain had mined could never be recorded. Retry hit the same 409, the
/// resume pass hit the same 409, and the row read Failed beside a transaction
/// worth 500 USDC that had landed.
///
/// Restarting is the one case that stays guarded, and for a different reason:
/// a movement already carrying a hash may have moved money, and sending again
/// would move it twice. Those are completed against their proof, never redone.
export function canRestartFunding(
  legs: readonly { txHash?: string | null | undefined }[],
): boolean {
  return !legs.some((leg) => leg.txHash?.trim());
}
