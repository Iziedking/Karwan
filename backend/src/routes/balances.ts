import { Hono } from 'hono';
import { formatUnits, type Address } from 'viem';
import { arcTestnet, publicClient } from '../chain/client.js';
import { config } from '../config.js';

const NATIVE_DECIMALS = arcTestnet.nativeCurrency.decimals;

export const balancesRoutes = new Hono();

/// Server-side cache so N frontend tabs polling every few seconds collapse to a
/// single on-chain read per window instead of one per tab per poll.
const BALANCES_TTL_MS = 15_000;
let balancesCache: { at: number; body: unknown } | null = null;

balancesRoutes.get('/', async (c) => {
  if (balancesCache && Date.now() - balancesCache.at < BALANCES_TTL_MS) {
    return c.json(balancesCache.body as Record<string, unknown>);
  }
  const wallets: Array<{ label: string; address?: string }> = [
    { label: 'buyer', address: config.BUYER_AGENT_ADDRESS },
    { label: 'seller', address: config.SELLER_AGENT_ADDRESS },
  ];

  const result = await Promise.all(
    wallets.map(async (w) => {
      if (!w.address) return { label: w.label, address: null, balanceUsdc: null };
      try {
        const balance = await publicClient.getBalance({ address: w.address as Address });
        return {
          label: w.label,
          address: w.address,
          balanceUsdc: formatUnits(balance, NATIVE_DECIMALS),
          balanceWei: balance.toString(),
        };
      } catch (err) {
        return { label: w.label, address: w.address, error: (err as Error).message };
      }
    }),
  );

  const body = { wallets: result, fetchedAt: Date.now() };
  balancesCache = { at: Date.now(), body };
  return c.json(body);
});
