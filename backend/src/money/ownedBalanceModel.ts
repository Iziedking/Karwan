import type { CctpChainKey } from '../chain/cctpChains.js';

/// The balance every surface shows, split the way the balance page splits it
/// (frontend features/money/ownedBalance.ts). The assistant answers from this,
/// so what it says in a chat is what the person sees on the page.
export interface OwnedBalance {
  /// Everything the account owns and can move. Stake is not in it.
  total: number;
  /// The sign-in wallet's USDC on Arc, with its pooled balance.
  wallet: number;
  /// The sign-in wallet's USDC on the other supported chains.
  otherChains: number;
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
  otherChains: ReadonlyArray<number | null>;
  buyer: number | null;
  seller: number | null;
  staked: number | null;
}

/// The chains the balance page counts (frontend useChainBalances ROW_KEYS):
/// the CCTP chains a backend wallet can sign a burn on. Sei, Sonic, World
/// Chain and HyperEVM are EOA-only at Circle, so no balance is shown there.
export const OWNED_OTHER_CHAINS: readonly CctpChainKey[] = [
  'baseSepolia',
  'sepolia',
  'arbitrumSepolia',
  'optimismSepolia',
  'polygonAmoy',
  'avalancheFuji',
  'unichainSepolia',
];

const cents = (n: number) => Math.round(n * 100) / 100;

export function ownedBalance(parts: OwnedBalanceParts): OwnedBalance {
  const wallet = (parts.arcWallet ?? 0) + (parts.pooled ?? 0);
  const otherChains = parts.otherChains.reduce<number>((sum, n) => sum + (n ?? 0), 0);
  const agents = (parts.buyer ?? 0) + (parts.seller ?? 0);
  return {
    total: cents(wallet + otherChains + agents),
    wallet: cents(wallet),
    otherChains: cents(otherChains),
    agents: cents(agents),
    buyer: parts.buyer,
    seller: parts.seller,
    staked: cents(parts.staked ?? 0),
    partial:
      parts.arcWallet === null ||
      parts.pooled === null ||
      parts.otherChains.some((n) => n === null) ||
      parts.staked === null,
  };
}
