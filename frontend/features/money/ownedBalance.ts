export interface OwnedParts {
  /// The sign-in wallet's USDC on Arc; null until it loads.
  wallet: number | null;
  /// A confirmed Gateway balance; it is wallet money that can be spent on Arc.
  pool: number;
  /// The buying and selling agents' USDC; null when not set up or loading.
  buyer: number | null;
  seller: number | null;
}

export interface Owned {
  total: number | null;
  wallet: number;
  agents: number;
}

/// The one balance every screen shows: everything the account holds on Arc,
/// split the same way everywhere. Other networks are only a way to bring money
/// in, so they are never counted. Money locked in escrow shows as In deals.
export function ownedBalance(parts: OwnedParts): Owned {
  const wallet = (parts.wallet ?? 0) + parts.pool;
  const agents = (parts.buyer ?? 0) + (parts.seller ?? 0);
  return { total: parts.wallet === null ? null : wallet + agents, wallet, agents };
}
