import { Hono } from 'hono';
import { z } from 'zod';
import { AppKit } from '@circle-fin/app-kit';
import { sessionAddress } from '../auth/session.js';
import { getUserByAddress } from '../db/users.js';
import { depositToGateway, readUserGatewayBalance, sweepToUnifiedBalance } from '../gateway/balance.js';
import { fundAgentFromGateway, cashOutFromGateway } from '../gateway/spend.js';
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
  /// Which of the user's own wallets funds the deposit. 'identity' is Circle-only;
  /// 'buyer'/'seller' agent wallets work for every account type (the web3 path).
  source: z.enum(['identity', 'buyer', 'seller']).optional(),
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

/// Deposit USDC from one of the caller's own wallets into their unified balance.
gatewayRoutes.post('/deposit', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'unauthorized' }, 401);

  let body;
  try {
    body = depositSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const source = body.source ?? 'identity';
  // The identity source signs the identity SCA, which only Circle accounts have.
  // Agent sources are Circle DCWs for everyone, so the web3 path uses those.
  if (source === 'identity' && !getUserByAddress(address)) {
    return c.json(
      {
        error: 'Depositing from your sign-in wallet is available for email/passkey accounts. Fund an agent wallet and deposit from there instead.',
        code: 'web3_identity_unsupported',
      },
      409,
    );
  }

  if (depositInFlight.has(address)) {
    return c.json({ error: 'a deposit is already in progress', code: 'in_flight' }, 409);
  }
  depositInFlight.add(address);
  try {
    const result = await depositToGateway(address, body.amountUsdc, source);
    cache.delete(address); // bust the read cache so the new balance shows on next poll
    return c.json({ ok: true, ...result });
  } catch (err) {
    logger.warn({ address, err: (err as Error).message }, 'gateway deposit failed');
    return c.json({ error: 'deposit failed', detail: (err as Error).message }, 502);
  } finally {
    depositInFlight.delete(address);
  }
});

/// Sweep loose identity-wallet USDC into the unified balance. The "into the
/// unified balance" step after a top-up (incl. a Solana top-up, which mints to
/// the identity wallet). Self-healing: safe to call anytime; a no-op when there
/// is nothing to sweep. Circle-only.
gatewayRoutes.post('/sweep', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'unauthorized' }, 401);
  if (!getUserByAddress(address)) {
    return c.json(
      { error: 'Sweeping into your unified balance is available for email/passkey accounts.', code: 'web3_unsupported' },
      409,
    );
  }
  if (depositInFlight.has(address)) {
    return c.json({ error: 'a deposit is already in progress', code: 'in_flight' }, 409);
  }
  depositInFlight.add(address);
  try {
    const result = await sweepToUnifiedBalance(address);
    cache.delete(address);
    return c.json({ ok: true, ...result });
  } catch (err) {
    logger.warn({ address, err: (err as Error).message }, 'gateway sweep failed');
    return c.json({ error: 'sweep failed', detail: (err as Error).message }, 502);
  } finally {
    depositInFlight.delete(address);
  }
});

const fundAgentSchema = z.object({
  agent: z.enum(['buyer', 'seller']),
  amountUsdc: z.number().positive().max(5_000_000),
});

// One spend at a time per user, so a double-click can't fire two burn intents.
const spendInFlight = new Set<string>();

/// Fund one of the caller's agent wallets from their unified Gateway balance.
/// Same-chain Arc spend, backend-signed by the caller's Gateway EOA (no delegate).
gatewayRoutes.post('/fund-agent', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'unauthorized' }, 401);

  let body;
  try {
    body = fundAgentSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }

  if (spendInFlight.has(address)) {
    return c.json({ error: 'a transfer is already in progress', code: 'in_flight' }, 409);
  }
  spendInFlight.add(address);
  try {
    const result = await fundAgentFromGateway(address, body.agent, body.amountUsdc);
    cache.delete(address); // unified balance dropped; bust the read cache
    return c.json({ ok: true, ...result });
  } catch (err) {
    logger.warn({ address, err: (err as Error).message }, 'gateway fund-agent failed');
    return c.json({ error: 'transfer failed', detail: (err as Error).message }, 502);
  } finally {
    spendInFlight.delete(address);
  }
});

const cashOutSchema = z.object({
  destChainKey: z.enum(['baseSepolia', 'arbitrumSepolia', 'optimismSepolia', 'sepolia', 'polygonAmoy']),
  recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  amountUsdc: z.number().positive().max(5_000_000),
});

/// Cash out from the caller's unified balance to another chain (cross-chain
/// Gateway spend). Works for every account type — the Gateway EOA signs.
gatewayRoutes.post('/cash-out', async (c) => {
  const address = sessionAddress(c);
  if (!address) return c.json({ error: 'unauthorized' }, 401);

  let body;
  try {
    body = cashOutSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }

  if (spendInFlight.has(address)) {
    return c.json({ error: 'a transfer is already in progress', code: 'in_flight' }, 409);
  }
  spendInFlight.add(address);
  try {
    const result = await cashOutFromGateway(address, body.destChainKey, body.recipient, body.amountUsdc);
    cache.delete(address);
    return c.json({ ok: true, ...result });
  } catch (err) {
    logger.warn({ address, err: (err as Error).message }, 'gateway cash-out failed');
    return c.json({ error: 'cash-out failed', detail: (err as Error).message }, 502);
  } finally {
    spendInFlight.delete(address);
  }
});
