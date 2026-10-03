import { vault } from '../chain/contracts.js';
import { bindingStateFor, type AgentBindingState } from '../chain/agentBinding.js';
import { logger } from '../logger.js';

/// Whose record a deal writes to is fixed when the escrow is funded: the escrow
/// snapshots the seller agent's owner through the vault. An agent that is not
/// bound resolves to itself, so the deal would be recorded against a wallet
/// instead of the person who did the work. Records belong to people, so no
/// escrow is funded and no offer is sent until the seller's agent is bound.

export const SELLER_NOT_BOUND = 'SELLER_NOT_BOUND';

const CACHE_MS = 60_000;
const cache = new Map<string, { state: AgentBindingState; at: number }>();

export async function sellerAgentBinding(
  agent: string,
  identity: string,
  read: (agent: `0x${string}`) => Promise<string> = (a) =>
    vault.read.resolveOwner([a]) as Promise<string>,
  now = Date.now(),
): Promise<AgentBindingState> {
  const key = `${agent.toLowerCase()}:${identity.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.state;
  try {
    const resolvedOwner = await read(agent as `0x${string}`);
    const state = bindingStateFor({ agent, resolvedOwner, identity });
    cache.set(key, { state, at: now });
    return state;
  } catch (err) {
    logger.warn({ agent, err: (err as Error).message }, 'seller agent binding read failed');
    return { kind: 'unknown' };
  }
}

/// The buyer-facing refusal, or null when funding may go ahead. A read that
/// failed refuses too: funding is retryable, a record written to the wrong
/// owner is not.
export function sellerBindingRefusal(
  state: AgentBindingState,
): { code: typeof SELLER_NOT_BOUND; message: string } | null {
  if (state.kind === 'bound') return null;
  const message =
    state.kind === 'unbound'
      ? 'The seller has not linked their agent to their account yet. We asked them to. No funds moved.'
      : state.kind === 'foreign'
        ? 'The seller\'s agent is linked to a different account. No funds moved.'
        : 'We could not confirm the seller\'s account link. No funds moved. Try again in a minute.';
  return { code: SELLER_NOT_BOUND, message };
}

/// Offers are held back only on a known missing or foreign link. An RPC hiccup
/// must not drop a real offer; the funding check still stands behind it.
export function blocksOffer(state: AgentBindingState): boolean {
  return state.kind === 'unbound' || state.kind === 'foreign';
}

export const SELLER_LINK_DETAIL = 'Link your agent to your account on Stake so your offers can go out.';

export function clearSellerBindingCache(): void {
  cache.clear();
}
