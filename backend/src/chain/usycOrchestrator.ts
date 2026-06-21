import { createWalletClient, formatUnits, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet, arcTransport, publicClient } from './client.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// USYC wrap orchestration, shared by the CLI (`npm run usyc:wrap`) and the
/// admin route (`POST /api/admin/usyc/run`). Operator-signed, two legs:
///   1. Vault rebalance: keep USYC_VAULT_BUFFER_USDC liquid, subscribe the
///      excess into USYC via the operator EOA (the vault is NotPermissioned, so
///      it routes withdrawForYield -> operator deposits). Unwind under buffer.
///   2. Treasury sweep: move fee-EOA USDC into the treasury, then sweepToUSYC
///      (the treasury is entitled and subscribes directly).
///
/// On testnet the operator key (USYC_OPERATOR_PRIVATE_KEY) is the deployer EOA,
/// which holds the USYC whitelist and is the vault operator + treasury keeper.
/// `dryRun` reads balances and reports intended actions without signing.

const TELLER = getAddress('0x9fdF14c5B14173D74C08Af27AebFf39240dC105A');
const USYC = getAddress('0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C');
const SIX = 6;

const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;
const vaultAbi = [
  { type: 'function', name: 'operator', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'withdrawForYield', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'depositFromYield', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
] as const;
const tellerAbi = [
  { type: 'function', name: 'deposit', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'redeem', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;
const oracleAbi = [
  { type: 'function', name: 'latestRoundData', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' }] },
] as const;
const treasuryAbi = [
  { type: 'function', name: 'oracle', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'deposit', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'sweepToUSYC', stateMutability: 'nonpayable', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

const cfg = config as unknown as Record<string, string | undefined>;
const usdc = config.USDC_ADDR as `0x${string}`;
const toUnits = (n: number) => BigInt(Math.round(n * 1e6));
const fmt = (v: bigint) => formatUnits(v, SIX);

export interface UsycStep {
  action: string;
  detail: string;
  txHash?: string;
  skipped?: boolean;
  failed?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/// Spacing between sequential transactions so a burst does not trip the public
/// RPC rate limiter (the cause of the 429s on the first live wrap).
const SEND_GAP_MS = 600;

/// A rate-limit / overload response is safe to retry: the request was rejected
/// before execution, so retrying never double-sends. We retry ONLY these, never
/// an ambiguous error, to avoid resubmitting a tx that may have landed.
function isRateLimited(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  if (e?.status === 429) return true;
  const m = (e?.message ?? '').toLowerCase();
  return m.includes('429') || m.includes('too many requests') || m.includes('rate limit');
}
export interface UsycRunResult {
  operator: string | null;
  dryRun: boolean;
  steps: UsycStep[];
}

type Wallet = ReturnType<typeof createWalletClient>;

async function balanceOf(token: `0x${string}`, holder: `0x${string}`): Promise<bigint> {
  return (await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [holder] })) as bigint;
}

async function rebalance(
  wallet: Wallet,
  account: `0x${string}`,
  dryRun: boolean,
  steps: UsycStep[],
): Promise<void> {
  const vault = cfg.KARWAN_VAULT_ADDR as `0x${string}` | undefined;
  if (!vault) {
    steps.push({ action: 'vault-rebalance', detail: 'KARWAN_VAULT_ADDR unset', skipped: true });
    return;
  }
  const operator = (await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'operator' })) as `0x${string}`;
  if (getAddress(operator) !== getAddress(account)) {
    steps.push({
      action: 'vault-rebalance',
      detail: `signer ${account} is not the vault operator ${operator}`,
      skipped: true,
    });
    return;
  }

  const buffer = toUnits(config.USYC_VAULT_BUFFER_USDC);
  const margin = toUnits(config.USYC_REBALANCE_MARGIN_USDC);
  const liquid = await balanceOf(usdc, vault);

  if (liquid > buffer + margin) {
    const amount = liquid - buffer;
    const step: UsycStep = {
      action: 'vault-wrap',
      detail: `wrap ${fmt(amount)} USDC into USYC (liquid ${fmt(liquid)}, buffer ${fmt(buffer)})`,
    };
    steps.push(step);
    if (dryRun) return;
    try {
      await send(wallet, { address: vault, abi: vaultAbi, functionName: 'withdrawForYield', args: [amount], account, chain: arcTestnet });
      await send(wallet, { address: usdc, abi: erc20Abi, functionName: 'approve', args: [TELLER, amount], account, chain: arcTestnet });
      step.txHash = await send(wallet, { address: TELLER, abi: tellerAbi, functionName: 'deposit', args: [amount, account], account, chain: arcTestnet });
    } catch (err) {
      step.failed = true;
      step.detail += ` — failed: ${(err as Error).message.slice(0, 100)}`;
    }
    return;
  }

  if (liquid + margin < buffer) {
    const need = buffer - liquid;
    const treasuryForOracle = (cfg.KARWAN_TREASURY_USYC_ADDR ?? cfg.KARWAN_TREASURY_CONTRACT_ADDR) as `0x${string}` | undefined;
    const oracle = treasuryForOracle
      ? ((await publicClient.readContract({ address: treasuryForOracle, abi: treasuryAbi, functionName: 'oracle' }).catch(() => null)) as `0x${string}` | null)
      : null;
    if (!oracle) {
      steps.push({ action: 'vault-unwind', detail: 'cannot resolve oracle to size the unwind', skipped: true });
      return;
    }
    const round = (await publicClient.readContract({ address: oracle, abi: oracleAbi, functionName: 'latestRoundData' })) as readonly [bigint, bigint, bigint, bigint, bigint];
    const price = round[1] > 0n ? round[1] : 10n ** 18n;
    let shares = (need * 10n ** 18n) / price;
    const held = await balanceOf(USYC, account);
    if (shares > held) shares = held;
    if (shares === 0n) {
      steps.push({ action: 'vault-unwind', detail: `under buffer but no USYC to unwind (need ${fmt(need)})`, skipped: true });
      return;
    }
    const step: UsycStep = { action: 'vault-unwind', detail: `unwind ${fmt(shares)} USYC to restore ${fmt(need)} USDC` };
    steps.push(step);
    if (dryRun) return;
    try {
      await send(wallet, { address: USYC, abi: erc20Abi, functionName: 'approve', args: [TELLER, shares], account, chain: arcTestnet });
      await send(wallet, { address: TELLER, abi: tellerAbi, functionName: 'redeem', args: [shares, account, account], account, chain: arcTestnet });
      const usdcOut = await balanceOf(usdc, account);
      await send(wallet, { address: usdc, abi: erc20Abi, functionName: 'approve', args: [vault, usdcOut], account, chain: arcTestnet });
      step.txHash = await send(wallet, { address: vault, abi: vaultAbi, functionName: 'depositFromYield', args: [usdcOut], account, chain: arcTestnet });
    } catch (err) {
      step.failed = true;
      step.detail += ` — failed: ${(err as Error).message.slice(0, 100)}`;
    }
    return;
  }

  steps.push({ action: 'vault-rebalance', detail: `within buffer, nothing to wrap (liquid ${fmt(liquid)}, buffer ${fmt(buffer)})`, skipped: true });
}

async function sweep(
  wallet: Wallet,
  account: `0x${string}`,
  dryRun: boolean,
  steps: UsycStep[],
): Promise<void> {
  const treasury = (cfg.KARWAN_TREASURY_USYC_ADDR ?? cfg.KARWAN_TREASURY_CONTRACT_ADDR) as `0x${string}` | undefined;
  if (!treasury) {
    steps.push({ action: 'treasury-sweep', detail: 'treasury contract unset', skipped: true });
    return;
  }
  const feeEoa = cfg.KARWAN_TREASURY_ADDR as `0x${string}` | undefined;

  if (feeEoa && getAddress(feeEoa) === getAddress(account)) {
    const feeBal = await balanceOf(usdc, feeEoa);
    if (feeBal >= toUnits(config.USYC_TREASURY_SWEEP_MIN_USDC)) {
      const step: UsycStep = { action: 'treasury-fund', detail: `move ${fmt(feeBal)} USDC of fees into the treasury` };
      steps.push(step);
      if (!dryRun) {
        try {
          await send(wallet, { address: usdc, abi: erc20Abi, functionName: 'approve', args: [treasury, feeBal], account, chain: arcTestnet });
          step.txHash = await send(wallet, { address: treasury, abi: treasuryAbi, functionName: 'deposit', args: [feeBal], account, chain: arcTestnet });
        } catch (err) {
          step.failed = true;
          step.detail += ` — failed: ${(err as Error).message.slice(0, 100)}`;
        }
      }
    }
  }

  const idle = await balanceOf(usdc, treasury);
  const step: UsycStep = { action: 'treasury-sweep', detail: `sweepToUSYC (idle ${fmt(idle)} USDC subscribes into USYC above the threshold)` };
  steps.push(step);
  if (dryRun) return;
  try {
    step.txHash = await send(wallet, { address: treasury, abi: treasuryAbi, functionName: 'sweepToUSYC', args: [], account, chain: arcTestnet });
  } catch (err) {
    // A rate-limit is a real failure to surface; a plain revert here is the
    // benign "below idleThreshold / not keeper" no-op.
    if (isRateLimited(err)) {
      step.failed = true;
      step.detail += ` — failed: ${(err as Error).message.slice(0, 100)}`;
    } else {
      step.skipped = true;
      step.detail += ` — no-op or not keeper (${(err as Error).message.slice(0, 80)})`;
    }
  }
}

async function send(wallet: Wallet, params: Parameters<Wallet['writeContract']>[0]): Promise<string> {
  // Retry only on rate-limit (429) with exponential backoff; a 429 means the
  // request never executed, so this can't double-send. Space every send so a
  // multi-tx run does not burst the public RPC into throttling.
  const MAX = 4;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const hash = await wallet.writeContract(params);
      await publicClient.waitForTransactionReceipt({ hash });
      logger.info({ hash }, `usyc-orchestrator: ${params.functionName} mined`);
      await sleep(SEND_GAP_MS);
      return hash;
    } catch (err) {
      if (isRateLimited(err) && attempt < MAX) {
        const wait = 1000 * 2 ** attempt;
        logger.warn({ fn: params.functionName, attempt, wait }, 'usyc-orchestrator: rate limited, backing off');
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
}

/// Run both legs. Returns the steps taken (or that would be taken in dryRun).
/// Throws if the operator key is not configured.
export async function runUsycWrap(opts: { dryRun?: boolean } = {}): Promise<UsycRunResult> {
  const dryRun = !!opts.dryRun;
  if (!config.USYC_OPERATOR_PRIVATE_KEY) {
    throw new Error('USYC_OPERATOR_PRIVATE_KEY not set');
  }
  const account = privateKeyToAccount(config.USYC_OPERATOR_PRIVATE_KEY as `0x${string}`);
  // Share the public client's fallback transport so a rate-limited primary
  // rotates to a backup RPC instead of failing the wrap.
  const wallet = createWalletClient({ account, chain: arcTestnet, transport: arcTransport });
  logger.info({ operator: account.address, dryRun }, `usyc-orchestrator: start${dryRun ? ' (dry-run)' : ''}`);

  const steps: UsycStep[] = [];
  await rebalance(wallet, account.address, dryRun, steps).catch((err) =>
    steps.push({ action: 'vault-rebalance', detail: `failed: ${(err as Error).message}`, skipped: true }),
  );
  await sweep(wallet, account.address, dryRun, steps).catch((err) =>
    steps.push({ action: 'treasury-sweep', detail: `failed: ${(err as Error).message}`, skipped: true }),
  );

  return { operator: account.address, dryRun, steps };
}
