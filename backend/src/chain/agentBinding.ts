/// Whether an agent wallet is bound to the identity wallet that holds its stake.
///
/// Agent wallets hold no funds. They sign for deals; everything that is owned
/// belongs to the identity wallet. KarwanVault implements that: `freeStakeOf`
/// resolves its argument through `agentOwner` before reading a balance, so
/// `KarwanEscrow.acceptEscrow` can pass the seller AGENT as `msg.sender` and
/// still be answered about the identity's stake.
///
/// That resolution only works once the pair is bound, and binding is a consented
/// two-step handshake:
///
///   1. the identity calls `approveAgent(agent)`
///   2. the agent calls `registerOwner(identity)`, which reverts
///      `AgentNotApproved` unless step 1 already happened
///
/// Step 1 was never called anywhere in the product, so step 2 reverted every
/// time. It runs fire-and-forget with a `logger.warn`, so activation reported
/// success while the binding silently never happened, and every stake-backed
/// deal then failed at `acceptEscrow` with the identity's stake sitting
/// untouched a resolution away. This module is the read side of fixing that.

export type AgentBindingState =
  /// Bound to the expected identity. Stake resolves.
  | { kind: 'bound'; owner: string }
  /// The vault resolves the agent to itself, meaning `agentOwner` is unset.
  /// Nothing is wrong with the stake; the handshake has not been completed.
  | { kind: 'unbound' }
  /// Bound to a DIFFERENT identity. `registerOwner` refuses to move a binding
  /// (`AgentOwnerAlreadySet`), so this cannot be repaired by signing again and
  /// must never be reported as merely missing.
  | { kind: 'foreign'; owner: string }
  /// The chain could not be asked. Distinct from `unbound`, which is a fact
  /// about the vault: this is a fact about the RPC. Counting the two together
  /// put thirteen agents on a list headed "these need their owner to sign" when
  /// nothing at all was known about them.
  | { kind: 'unknown' };

/// `resolveOwner` returns the address unchanged when the agent is unbound, so
/// "resolves to itself" is the test for a missing binding.
export function bindingStateFor(input: {
  agent: string;
  resolvedOwner: string;
  identity: string;
}): AgentBindingState {
  const agent = input.agent.trim().toLowerCase();
  const resolved = input.resolvedOwner.trim().toLowerCase();
  const identity = input.identity.trim().toLowerCase();
  if (!agent || !resolved) return { kind: 'unbound' };
  if (resolved === agent) return { kind: 'unbound' };
  if (resolved === identity) return { kind: 'bound', owner: resolved };
  return { kind: 'foreign', owner: resolved };
}

/// Can a stake-backed deal activate for this pair?
///
/// The question `acceptEscrow` is really asking, phrased once so the UI, the
/// route and the error path cannot disagree about it.
export function stakeResolvesForAgent(state: AgentBindingState): boolean {
  return state.kind === 'bound';
}
