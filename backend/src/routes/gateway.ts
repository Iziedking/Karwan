import { Hono } from 'hono';
import { z } from 'zod';
import { AppKit } from '@circle-fin/app-kit';
import { sessionAddress } from '../auth/session.js';
import { getUserByAddress } from '../db/users.js';
import { depositIdentityToGateway, readUserGatewayBalance } from '../gateway/balance.js';
import { logger } from '../logger.js';

/// Circle Gateway unified balance (read side).
///
/// Gateway reports what a depositor has locked in the GatewayWallet contract,
/// NOT what sits in their wallet. An address holding 487 USDC on Base Sepolia
/// reads 0.000000 here until it deposits, so never label this "your USDC" —
/// it is the pooled balance, spendable on any supported chain.
///
/// The read needs no adapter, no signer and no Circle credentials: an
/// address-only source is a plain query against Circle's Gateway API. That is
/// why this lives on the backend (cacheable, no wallet popup) while deposit
/// stays client-side on the user's EOA, which is the only signer Gateway
/// accepts for burn intents.

export const gatewayRoutes = new Hono();

/// Every EVM chain Gateway supports on testnet. Chain count is NOT a cost here:
/// measured warm, six chains and twelve both land around 330-370ms, and the
/// ~4.9s seen on a first call is connection cold-start, not fan-out. So the list
/// is pinned for determinism (we render a fixed set of chain marks), not for
/// latency.
///
/// Solana Devnet is Gateway-supported but deliberately absent: Gateway keys
/// accounts by address, so a Solana address is a SEPARATE depositor from the
/// user's EOA rather than part of the same pool.
const CHAINS = [
  'Ethereum_Sepolia',
  'Optimism_Sepolia',
  'Arbitrum_Sepolia',
  'Base_Sepolia',
  'Polygon_Amoy_Testnet',
  'Avalanche_Fuji',
  'Unichain_Sepolia',
  'Sei_Testnet',
  'Sonic_Testnet',
  'World_Chain_Sepolia',
  'HyperEVM_Testnet',
  'Arc_Testnet',
] as const;

/// App Kit's chain names -> the keys ChainLogo and the bridge config already
/// speak, so the panel reuses the existing chain marks.
const CHAIN_KEY: Record<string, string> = {
  Ethereum_Sepolia: 'sepolia',
  Optimism_Sepolia: 'optimismSepolia',
  Arbitrum_Sepolia: 'arbitrumSepolia',
  Base_Sepolia: 'baseSepolia',
  Polygon_Amoy_Testnet: 'polygonAmoy',
  Avalanche_Fuji: 'avalancheFuji',
  Unichain_Sepolia: 'unichainSepolia',
  Sei_Testnet: 'seiTestnet',
  Sonic_Testnet: 'sonicTestnet',
  World_Chain_Sepolia: 'worldchainSepolia',
  HyperEVM_Testnet: 'hyperevmTestnet',
  Arc_Testnet: 'arc',
};

interface GatewayChainBalance {
  chain: string;
  key: string;
  confirmed: string;
  pending: string;
}

interface GatewayBalance {
  address: string;
  confirmed: string;
  pending: string;
  chains: GatewayChainBalance[];
  fetchedAt: number;
}

const TTL_MS = 30_000;
const cache = new Map<string, GatewayBalance>();

/// One kit for the process. The read path touches no credentials, so unlike
/// chain/appKit.ts this never needs CIRCLE_API_KEY and works in every env.
const kit = new AppKit();

async function readBalance(address: string): Promise<GatewayBalance> {
  const res = await kit.unifiedBalance.getBalances({
    token: 'USDC',
    networkType: 'testnet',
    includePending: true,
    sources: { address, chains: [...CHAINS] },
  } as never);

  const account = res.breakdown?.[0];
  const chains: GatewayChainBalance[] = (account?.breakdown ?? []).map((b) => ({
    chain: b.chain as string,
    key: CHAIN_KEY[b.chain as string] ?? (b.chain as string),
    confirmed: b.confirmedBalance ?? '0',
    pending: b.pendingBalance ?? '0',
  }));

  return {
    address,
    confirmed: res.totalConfirmedBalance ?? '0',
    pending: res.totalPendingBalance ?? '0',
    chains,
    fetchedAt: Date.now(),
  };
}

/// Session-scoped, never `?address=`. A pooled balance is financial data, so
/// the caller reads their own or nothing.
gatewayRoutes.get('/balance', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'unauthorized' }, 401);

  const hit = cache.get(address);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return c.json({ balance: hit });

  try {
    const balance = await readBalance(address);
    cache.set(address, balance);
    return c.json({ balance });
  } catch (err) {
    // Serve a stale reading over an error: a momentary Gateway blip should not
    // blank a balance the user was just looking at.
    if (hit) return c.json({ balance: hit, stale: true });
    const message = err instanceof Error ? err.message : 'gateway_unavailable';
    return c.json({ error: 'gateway_unavailable', message }, 502);
  }
});

/// A deposit only shows up once Gateway has indexed the source-chain tx, so the
/// client calls this straight after depositing to drop the cached zero instead
/// of waiting out the TTL.
gatewayRoutes.post('/refresh', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'unauthorized' }, 401);
  cache.delete(address);
  return c.json({ ok: true });
});

// --- Unified-balance WRITE side (autonomy Stage 2: deposit + read) ------------
// Deposit into the user's own Gateway balance (owned by a dedicated EOA DCW), and
// read it back. Backend-signed from the identity SCA, so Circle-only. Not yet
// surfaced in the product: the balance becomes spendable in Stage 3.

const depositSchema = z.object({
  amountUsdc: z.number().positive().max(5_000_000),
});

// One deposit at a time per user, so a double-click can't fire two approves.
const depositInFlight = new Set<string>();

/// The user's unified Gateway balance (available USD on Arc). Session-scoped.
gatewayRoutes.get('/unified', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'unauthorized' }, 401);
  try {
    const bal = await readUserGatewayBalance(address);
    if (!bal) return c.json({ available: '0', gatewayAddress: null });
    return c.json({ available: bal.available.toString(), gatewayAddress: bal.gatewayAddress });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'gateway_unavailable';
    return c.json({ error: 'gateway_unavailable', message }, 502);
  }
});

/// Deposit USDC from the caller's identity wallet into their unified balance.
gatewayRoutes.post('/deposit', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'unauthorized' }, 401);
  // Circle-only: the backend signs the identity SCA. Web3 users self-custody
  // their identity EOA and would fund a Gateway balance from their own wallet.
  if (!getUserByAddress(address)) {
    return c.json(
      {
        error: 'Depositing to your unified balance is available for email/passkey accounts.',
        code: 'web3_unsupported',
      },
      409,
    );
  }

  let body;
  try {
    body = depositSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }

  if (depositInFlight.has(address)) {
    return c.json({ error: 'a deposit is already in progress', code: 'in_flight' }, 409);
  }
  depositInFlight.add(address);
  try {
    const result = await depositIdentityToGateway(address, body.amountUsdc);
    cache.delete(address); // bust the read cache so the new balance shows on next poll
    return c.json({ ok: true, ...result });
  } catch (err) {
    logger.warn({ address, err: (err as Error).message }, 'gateway deposit failed');
    return c.json({ error: 'deposit failed', detail: (err as Error).message }, 502);
  } finally {
    depositInFlight.delete(address);
  }
});
