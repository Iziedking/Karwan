import { createPublicClient, http, fallback, formatUnits, type PublicClient } from 'viem';
import { CCTP_CHAIN_KEYS, CCTP_CHAINS, type CctpChainKey } from './cctpChains.js';

/// Optional private RPC per chain, e.g. CCTP_RPC_URL_SEPOLIA=https://eth-sepolia.g.alchemy.com/v2/KEY
/// Without one, viem falls back to the chain's public endpoint, which on
/// Ethereum Sepolia is throttled hard enough that balance reads time out
/// outright (an audit had 6 of 6 Sepolia reads fail while every other chain
/// answered). Set the ones you care about; the public endpoint stays as a
/// backup either way, so a bad key degrades rather than breaks.
function rpcEnvName(key: CctpChainKey): string {
  return `CCTP_RPC_URL_${key.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`;
}

function transportFor(key: CctpChainKey) {
  const override = process.env[rpcEnvName(key)]?.trim();
  const publicHttp = http(undefined, { retryCount: 2, timeout: 10_000 });
  return override
    ? fallback([http(override, { retryCount: 2, timeout: 10_000 }), publicHttp])
    : publicHttp;
}

/// Lightweight public clients per CCTP chain for source/destination balance and
/// allowance reads. Created once and reused (viem's HTTP client allocates a
/// fetch pool). Keyed by chain key so any registered chain works. Shared by the
/// bridge routes and the assistant, which both need to read what is sitting in
/// a user's source-chain deposit wallet.
export const sourceClients = Object.fromEntries(
  CCTP_CHAIN_KEYS.map((k) => [
    k,
    createPublicClient({ chain: CCTP_CHAINS[k].viemChain, transport: transportFor(k) }),
  ]),
) as Record<CctpChainKey, PublicClient>;

/// Which chains have a private RPC configured. Printed by the audit so a
/// timed-out read is attributable to a missing key rather than a mystery.
export function configuredRpcOverrides(): string[] {
  return CCTP_CHAIN_KEYS.filter((k) => !!process.env[rpcEnvName(k)]?.trim());
}

const balanceOfAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const USDC_DECIMALS = 6;

/// USDC held by `owner` on a CCTP source chain, as a decimal string. Returns
/// null when the RPC read fails so callers can degrade instead of throwing.
export async function readSourceUsdcBalance(
  chainKey: CctpChainKey,
  owner: string,
): Promise<string | null> {
  try {
    const raw = (await sourceClients[chainKey].readContract({
      address: CCTP_CHAINS[chainKey].usdc as `0x${string}`,
      abi: balanceOfAbi,
      functionName: 'balanceOf',
      args: [owner as `0x${string}`],
    })) as bigint;
    return formatUnits(raw, USDC_DECIMALS);
  } catch {
    return null;
  }
}
