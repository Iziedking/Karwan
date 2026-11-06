/// A token that is not USDC, landing on an address Karwan holds. It is never
/// credited and never moved by itself; it is written down once so the person
/// sees it and support can send it back (view 59, audit M-04).

import type { ActivityEntry } from '../db/activityLog.js';

/// A symbol is shown only when it is short, plain and cannot pass for USDC.
/// Anyone can deploy a token called "USDC" or "Visit claim.xyz" and airdrop it.
export function safeTokenSymbol(symbol: string | undefined): string | null {
  const value = symbol?.trim() ?? '';
  if (!/^[A-Za-z0-9.]{1,10}$/.test(value)) return null;
  if (/usd\.?c/i.test(value)) return null;
  return value;
}

export function wrongTokenEntry(input: {
  address: string;
  txId: string;
  amount: string;
  symbol: string | undefined;
  chain: string;
}): Omit<ActivityEntry, 'ts'> {
  const token = safeTokenSymbol(input.symbol);
  const what = token ? `${input.amount} ${token}` : `${input.amount} of a token that is not USDC`;
  return {
    // The transfer id makes the row its own dedupe: a redelivery writes nothing.
    id: `wrong-token-${input.txId}`,
    address: input.address.toLowerCase(),
    kind: 'wrong_token',
    summary: `Received ${what} on ${input.chain}. Karwan takes only USDC, so it is not in your balance. Ask support to send it back.`,
    params: token
      ? { t: 'wrongToken', amount: input.amount, token, chain: input.chain }
      : { t: 'wrongTokenUnnamed', amount: input.amount, chain: input.chain },
    refId: `token-${input.txId}`,
  };
}
