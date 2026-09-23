/// Does the RPC we are pointed at serve the chain we are configured for?
///
/// A mainnet config aimed at a testnet endpoint, or the reverse, would sign
/// and read against the wrong chain while every screen looked normal. A wrong
/// chain id is therefore fatal in production. An unreachable RPC is not: a
/// provider blip must not crash-loop the API, and /health keeps reporting it.

export type ChainCheck =
  | { status: 'match'; chainId: number }
  | { status: 'mismatch'; chainId: number; expected: number }
  | { status: 'unreachable'; error: string };

export async function checkChain(getChainId: () => Promise<number>, expected: number): Promise<ChainCheck> {
  try {
    const chainId = await getChainId();
    return chainId === expected ? { status: 'match', chainId } : { status: 'mismatch', chainId, expected };
  } catch (err) {
    return { status: 'unreachable', error: (err as Error).message };
  }
}

/// Whether the process must stop for this result.
export function mustStop(result: ChainCheck, production: boolean): boolean {
  return production && result.status === 'mismatch';
}
