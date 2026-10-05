export interface OwnedParts {
  /// The sign-in wallet's USDC on Arc; null until it loads.
  wallet: number | null;
  /// A confirmed Gateway balance; it is wallet money that can be spent on Arc.
  pool: number;
  /// The same wallet's USDC on the other supported chains; null while loading.
  otherChains: number | null;
  /// The buying and selling agents' USDC; null when not set up or loading.
  buyer: number | null;
  seller: number | null;
}

export interface Owned {
  total: number | null;
  wallet: number;
  otherChains: number;
  agents: number;
}

/// The one balance every screen shows: everything the account owns, split the
/// same way everywhere. Money locked in escrow is not here; it shows as In deals.
export function ownedBalance(parts: OwnedParts): Owned {
  const wallet = (parts.wallet ?? 0) + parts.pool;
  const otherChains = parts.otherChains ?? 0;
  const agents = (parts.buyer ?? 0) + (parts.seller ?? 0);
  return { total: parts.wallet === null ? null : wallet + otherChains + agents, wallet, otherChains, agents };
}
