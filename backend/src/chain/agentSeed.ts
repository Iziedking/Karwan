import { createWalletClient, parseUnits, formatUnits, erc20Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet, arcTransport } from './client.js';
import { usdc, readUsdcBalance } from './contracts.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const USDC_DECIMALS = 6;

/// All seeds come from one operator EOA. Two sends fired together (buyer +
/// seller on activation, or the admin backfill's Promise.all) would otherwise
/// grab the same nonce, so only one lands. Chain them: each send waits for the
/// previous to be submitted, giving sequential nonces. Outcome-independent so
/// one failure does not wedge the queue.
let operatorChain: Promise<unknown> = Promise.resolve();
function runOnOperator<T>(fn: () => Promise<T>): Promise<T> {
  const result = operatorChain.then(fn, fn);
  operatorChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/// Seed a freshly-activated agent wallet with a small USDC float from the
/// operator EOA, replacing the public faucet (rate-limited on testnet, absent
/// on mainnet).
///
/// On Arc, native and ERC-20 USDC are ONE balance, but the agent wallets are
/// Circle smart accounts, and Arc does not guarantee a raw native value send to
/// a contract succeeds (see Arc "value transfer rules"). So we move the float
/// with the ERC-20 `transfer()` at 6 decimals, the same interface fundAgent
/// uses to top these accounts up and the one the app reads via balanceOf. The
/// operator pays gas in USDC (the same balance), so it just needs to hold a
/// little more than the seed amount.
///
/// Best-effort and idempotent: no-ops when no operator key is set, when the
/// agent already holds the float, or when the operator can't cover it, and it
/// never throws into the caller. Activation must never hinge on it.
export async function seedAgentFromOperator(
  toAddress: string,
): Promise<{ ok: boolean; txHash?: string; reason?: string }> {
  const key = config.AGENT_SEED_PRIVATE_KEY;
  if (!key) return { ok: false, reason: 'no AGENT_SEED_PRIVATE_KEY set' };
  const amount = config.AGENT_SEED_USDC;
  if (!(amount > 0)) return { ok: false, reason: 'AGENT_SEED_USDC is zero' };

  const to = toAddress as `0x${string}`;
  const value = parseUnits(String(amount), USDC_DECIMALS);
  try {
    // Idempotent: never top up an agent that already holds at least the float.
    const have = await readUsdcBalance(to);
    if (have >= value) return { ok: true, reason: 'already funded' };

    const account = privateKeyToAccount(key as `0x${string}`);
    const opBal = await readUsdcBalance(account.address);
    if (opBal < value) {
      logger.warn(
        {
          operator: account.address,
          opBalUsdc: formatUnits(opBal, USDC_DECIMALS),
          needUsdc: formatUnits(value, USDC_DECIMALS),
        },
        'agent seed skipped: operator USDC balance below the seed amount',
      );
      return { ok: false, reason: 'operator balance too low' };
    }

    const wallet = createWalletClient({ account, chain: arcTestnet, transport: arcTransport });
    const txHash = await runOnOperator(() =>
      wallet.writeContract({
        account,
        chain: arcTestnet,
        address: usdc,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to, value],
      }),
    );
    logger.info({ to, amountUsdc: amount, txHash }, 'agent seeded from operator wallet');
    return { ok: true, txHash };
  } catch (err) {
    logger.warn({ to, err: (err as Error).message }, 'agent seed transfer failed');
    return { ok: false, reason: (err as Error).message };
  }
}
