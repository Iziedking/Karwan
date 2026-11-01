/// The balance every surface shows, split the way the balance page splits it
/// (frontend features/money/ownedBalance.ts). The assistant answers from this,
/// so what it says in a chat is what the person sees on the page. It is one
/// balance on Arc: other networks are only a way to bring money in and are
/// never counted.
export interface OwnedBalance {
  /// Everything the account holds on Arc and can move. Stake is not in it.
  total: number;
  /// The sign-in wallet's USDC on Arc, with its Gateway balance.
  wallet: number;
  agents: number;
  buyer: number | null;
  seller: number | null;
  /// Locked in the stake vault behind the person's deals. Shown beside the
  /// total, never added to it: it cannot be spent until it is unstaked.
  staked: number;
  /// A source that could not be read counted as zero, so the total may be low.
  partial: boolean;
}

export interface OwnedBalanceParts {
  arcWallet: number | null;
  pooled: number | null;
  buyer: number | null;
  seller: number | null;
  staked: number | null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function ownedBalance(parts: OwnedBalanceParts): OwnedBalance {
  const wallet = (parts.arcWallet ?? 0) + (parts.pooled ?? 0);
  const agents = (parts.buyer ?? 0) + (parts.seller ?? 0);
  return {
    total: cents(wallet + agents),
    wallet: cents(wallet),
    agents: cents(agents),
    buyer: parts.buyer,
    seller: parts.seller,
    staked: cents(parts.staked ?? 0),
    partial: parts.arcWallet === null || parts.pooled === null || parts.staked === null,
  };
}
