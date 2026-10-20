import { AppKit } from '@circle-fin/app-kit';
import { CCTP_CHAINS, CCTP_CHAIN_KEYS } from '../chain/cctpChains.js';
import { ARC } from '../chain/client.js';

/// Circle Gateway unified balance (read side).
///
/// Gateway reports what a depositor has locked in the GatewayWallet contract,
/// NOT what sits in their wallet. An address holding 487 USDC on Base Sepolia
/// reads 0.000000 here until it deposits, so never label this "your USDC" —
/// it is the pooled balance, spendable on any supported chain.
///
/// The read needs no adapter, no signer and no Circle credentials: an
/// address-only source is a plain query against Circle's Gateway API. The
/// balance page and the assistant both read it here, so they cannot disagree.

/// Every EVM chain Gateway supports on the active network: the CCTP set plus
/// Arc. Chain count is NOT a cost here: measured warm, six chains and twelve
/// both land around 330-370ms, and the ~4.9s seen on a first call is connection
/// cold-start, not fan-out. So the list is pinned for determinism (we render a
/// fixed set of chain marks), not for latency.
///
/// Solana is Gateway-supported but deliberately absent: Gateway keys accounts
/// by address, so a Solana address is a SEPARATE depositor from the user's EOA
/// rather than part of the same pool.
const CHAINS = [...CCTP_CHAIN_KEYS.map((k) => CCTP_CHAINS[k].appKit), ARC.appKitChain];

/// App Kit's chain names -> the keys ChainLogo and the bridge config already
/// speak, so the panel reuses the existing chain marks.
const CHAIN_KEY: Record<string, string> = {
  ...Object.fromEntries(CCTP_CHAIN_KEYS.map((k) => [CCTP_CHAINS[k].appKit, k])),
  [ARC.appKitChain]: 'arc',
};

export interface GatewayChainBalance {
  chain: string;
  key: string;
  confirmed: string;
  pending: string;
}

export interface GatewayBalance {
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

/// The pooled balance, cached 30s so several surfaces cost one upstream read.
/// A stale reading is served over an error: a momentary Gateway blip should
/// not blank a balance the user was just looking at. Throws only when there is
/// nothing to serve.
export async function readPooledBalance(address: string): Promise<{ balance: GatewayBalance; stale: boolean }> {
  const hit = cache.get(address);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return { balance: hit, stale: false };
  try {
    const balance = await readBalance(address);
    cache.set(address, balance);
    return { balance, stale: false };
  } catch (err) {
    if (hit) return { balance: hit, stale: true };
    throw err;
  }
}

/// Drop the cached reading after a deposit or spend, so the next read is fresh.
export function forgetPooledBalance(address: string): void {
  cache.delete(address);
}
