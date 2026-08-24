/// What the assistant should say about a transfer that has not settled.
///
/// It used to say one thing about all of them:
///
///   if (status === 'minted' || status === 'error') continue;
///   inFlight.push(`Bridge of ${amount} USDC is still ${status} (track it on /bridge).`)
///
/// Two failures in those lines. A bridge that FAILED was skipped entirely, so a
/// user asking what was happening with their money heard nothing about the one
/// that did not go through. And a bridge the user declined at their wallet never
/// reaches `error` — nothing errored on the server, they simply did not sign —
/// so it sat at `approving` and was reported as in flight, with "track it" said
/// about a transfer that was never started.
///
/// The distinction that matters is not the status, it is whether a burn is on
/// chain. Before it, nothing has left anyone's wallet and the honest word is
/// "start it again". After it, money is moving and it is worth watching.

export type BridgeStanding =
  /// Settled. Not worth a line.
  | { kind: 'settled' }
  /// A burn is on chain and the mint has not landed. Genuinely in flight.
  | { kind: 'moving' }
  /// Never signed. The record was opened and nothing followed it, which is what
  /// a declined wallet prompt leaves behind.
  | { kind: 'unsigned' }
  /// Failed before anything was signed. No money moved.
  | { kind: 'failed_before_burn' }
  /// Failed after the burn. Money left and did not arrive, which is the one
  /// case that needs a person.
  | { kind: 'failed_after_burn' };

/// How long a transfer may sit unsigned before it is worth mentioning.
///
/// A wallet prompt is open for as long as it takes to read it. Calling that
/// abandoned after ten seconds would be wrong, and never calling it abandoned is
/// how "still approving" became a permanent line.
export const UNSIGNED_GRACE_MS = 5 * 60_000;

export function bridgeStanding(input: {
  status: 'approving' | 'burning' | 'relaying' | 'minted' | 'error';
  /// Empty until the burn lands. This, not the status, is the evidence that
  /// money has actually moved.
  sourceTxHash?: string | undefined;
  updatedAt?: number | undefined;
  now: number;
}): BridgeStanding {
  const burned = !!input.sourceTxHash?.trim();
  if (input.status === 'minted') return { kind: 'settled' };
  if (input.status === 'error') {
    return burned ? { kind: 'failed_after_burn' } : { kind: 'failed_before_burn' };
  }
  if (burned) return { kind: 'moving' };
  const idleFor = input.updatedAt ? input.now - input.updatedAt : 0;
  if (idleFor >= UNSIGNED_GRACE_MS) return { kind: 'unsigned' };
  // Recent and unsigned: the prompt may still be open in front of them.
  return { kind: 'moving' };
}

/// Does this need the user to do something, rather than just to know?
export function needsTheUser(standing: BridgeStanding): boolean {
  return (
    standing.kind === 'unsigned' ||
    standing.kind === 'failed_before_burn' ||
    standing.kind === 'failed_after_burn'
  );
}
