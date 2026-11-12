import { localFigure, type DisplayCurrency, type LocalCurrency, type UsdcRates } from '../rates/usdcRates.js';

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
  /// The total before it is cut to cents. A figure in the person's currency is
  /// worked out from this, as the screens do, so the two never differ by a naira.
  exact: number;
  /// The two parts Money names under the balance, cents rounded down so they
  /// never add to more than the balance.
  ready: number;
  withAgents: number;
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
const micros = (n: number) => Math.round(n * 1e6);
const centsDown = (m: number) => Math.max(0, Math.floor(m / 10_000)) / 100;

/// Only an account that signs in with its own wallet holds a Transfer balance
/// (Gateway takes only that wallet's signature on a spend). An email account
/// holds none, so nothing found there is ever counted as its money (23 Oct).
export function holdsPool(method: string | undefined): boolean {
  return method !== 'circle';
}

export function ownedBalance(parts: OwnedBalanceParts): OwnedBalance {
  const wallet = (parts.arcWallet ?? 0) + (parts.pooled ?? 0);
  const agents = (parts.buyer ?? 0) + (parts.seller ?? 0);
  return {
    total: cents(wallet + agents),
    wallet: cents(wallet),
    agents: cents(agents),
    exact: (micros(parts.arcWallet ?? 0) + micros(parts.pooled ?? 0) + micros(parts.buyer ?? 0) + micros(parts.seller ?? 0)) / 1e6,
    ready: centsDown(micros(parts.arcWallet ?? 0) + micros(parts.pooled ?? 0)),
    withAgents: centsDown(micros(parts.buyer ?? 0) + micros(parts.seller ?? 0)),
    buyer: parts.buyer,
    seller: parts.seller,
    staked: cents(parts.staked ?? 0),
    partial: parts.arcWallet === null || parts.pooled === null || parts.staked === null,
  };
}

/// The balance and its two parts in the currency the person reads, the same
/// figures Home and Money show. Null when they read USDC or there is no rate.
export function ownedInLocal(
  owned: OwnedBalance,
  currency: DisplayCurrency | undefined,
  rates: UsdcRates,
): { currency: LocalCurrency; total: string; ready: string; withAgents: string; rate: number; updatedAt: number } | null {
  const total = localFigure(owned.exact, currency, rates);
  const ready = localFigure(owned.ready, currency, rates);
  const withAgents = localFigure(owned.withAgents, currency, rates);
  if (!total || !ready || !withAgents) return null;
  return { currency: total.currency, total: total.amount, ready: ready.amount, withAgents: withAgents.amount, rate: total.rate, updatedAt: total.updatedAt };
}
