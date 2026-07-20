import { createPublicClient, http, formatUnits, type PublicClient } from 'viem';
import { CCTP_CHAIN_KEYS, CCTP_CHAINS, type CctpChainKey } from './cctpChains.js';

/// Lightweight public clients per CCTP chain for source/destination balance and
/// allowance reads. Created once and reused (viem's HTTP client allocates a
/// fetch pool). Keyed by chain key so any registered chain works. Shared by the
/// bridge routes and the assistant, which both need to read what is sitting in
/// a user's source-chain deposit wallet.
export const sourceClients = Object.fromEntries(
  CCTP_CHAIN_KEYS.map((k) => [
    k,
    createPublicClient({ chain: CCTP_CHAINS[k].viemChain, transport: http() }),
  ]),
) as Record<CctpChainKey, PublicClient>;

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
