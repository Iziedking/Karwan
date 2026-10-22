/// Send uses the whole balance (architecture view 22). The part of a send the
/// wallet alone cannot cover moves from the pooled balance first. Rounded up
/// to the cent, the same as the backend, so the wallet is never a fraction short.
export function sendShortfall(amount: number, wallet: number | null): number {
  if (wallet === null || amount <= wallet) return 0;
  return Math.ceil(Math.round((amount - wallet) * 1e6) / 1e4) / 100;
}

/// What a send can reach: the wallet and the pool together, once both are read.
export function sendAvailable(wallet: number | null, pool: number, poolLoaded: boolean): number | null {
  if (wallet === null) return null;
  return poolLoaded ? Math.round((wallet + pool) * 1e6) / 1e6 : wallet;
}
