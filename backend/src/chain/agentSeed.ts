import { createWalletClient, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet, arcTransport, publicClient } from './client.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// Seed a freshly-activated agent wallet with a small USDC float from the
/// operator EOA. USDC on Arc is the native gas asset (18 decimals), so this is a
/// plain native value transfer: the agent's native balance is exactly what the
/// app and backend read as its USDC. This replaces the public faucet, which is
/// rate-limited on testnet and absent on mainnet.
///
/// Best-effort and idempotent on purpose: it no-ops when no operator key is set,
/// when the agent already holds the float, or when the operator can't cover it,
/// and it never throws into the caller. Activation must never hinge on it.
export async function seedAgentFromOperator(
  toAddress: string,
): Promise<{ ok: boolean; txHash?: string; reason?: string }> {
  const key = config.AGENT_SEED_PRIVATE_KEY;
  if (!key) return { ok: false, reason: 'no AGENT_SEED_PRIVATE_KEY set' };
  const amount = config.AGENT_SEED_USDC;
  if (!(amount > 0)) return { ok: false, reason: 'AGENT_SEED_USDC is zero' };

  const to = toAddress as `0x${string}`;
  const value = parseEther(String(amount));
  try {
    // Idempotent: never top up an agent that already holds at least the float
    // (a re-activation, or a prior identity seed, must not double-fund).
    const have = await publicClient.getBalance({ address: to });
    if (have >= value) return { ok: true, reason: 'already funded' };

    const account = privateKeyToAccount(key as `0x${string}`);
    const opBal = await publicClient.getBalance({ address: account.address });
    if (opBal < value) {
      logger.warn(
        {
          operator: account.address,
          opBalUsdc: formatEther(opBal),
          needUsdc: formatEther(value),
        },
        'agent seed skipped: operator balance below the seed amount',
      );
      return { ok: false, reason: 'operator balance too low' };
    }

    const wallet = createWalletClient({ account, chain: arcTestnet, transport: arcTransport });
    const txHash = await wallet.sendTransaction({ account, chain: arcTestnet, to, value });
    logger.info({ to, amountUsdc: amount, txHash }, 'agent seeded from operator wallet');
    return { ok: true, txHash };
  } catch (err) {
    logger.warn({ to, err: (err as Error).message }, 'agent seed transfer failed');
    return { ok: false, reason: (err as Error).message };
  }
}
