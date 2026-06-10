import { createWalletClient, http, formatUnits, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet, publicClient } from '../chain/client.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// USYC yield cron. Two jobs in one daily run, both signed by the operator EOA:
///   1. Vault rebalance, keep USYC_VAULT_BUFFER_USDC liquid in the vault to
///      cover slashable reservations + soon-to-claim cooling positions, wrap
///      everything above it into USYC (via the entitlement-agnostic
///      withdrawForYield -> Teller path, since the vault itself is
///      NotPermissioned), and unwind when liquid dips below the buffer.
///   2. Treasury sweep, move fee-EOA USDC into the treasury contract and call
///      sweepToUSYC (the treasury IS entitled, so it subscribes directly).
///
/// Testnet operation: the operator key lives in USYC_OPERATOR_PRIVATE_KEY (same
/// raw-key pattern as X402_BASE_PRIVATE_KEY). Unset = no-op. Buffer logic uses a
/// configurable floor; computing reserved+cooling exactly needs position
/// enumeration and is a later refinement.
///
///   npm run usyc:cron   (from backend/)

const TELLER = getAddress('0x9fdF14c5B14173D74C08Af27AebFf39240dC105A');
const USYC = getAddress('0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C');
const SIX = 6;

const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;
const vaultAbi = [
  { type: 'function', name: 'operator', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'outForYield', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'withdrawForYield', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'depositFromYield', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
] as const;
const tellerAbi = [
  { type: 'function', name: 'deposit', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'redeem', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;
const oracleAbi = [
  { type: 'function', name: 'latestRoundData', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' }] },
  { type: 'function', name: 'oracle', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const;
const treasuryAbi = [
  { type: 'function', name: 'oracle', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'keeper', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'deposit', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'sweepToUSYC', stateMutability: 'nonpayable', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

type Wallet = ReturnType<typeof createWalletClient>;

const cfg = config as unknown as Record<string, string | undefined>;
const usdc = config.USDC_ADDR as `0x${string}`;
const toUnits = (n: number) => BigInt(Math.round(n * 1e6)); // USDC/USYC are 6dp
const fmt = (v: bigint) => formatUnits(v, SIX);

async function balanceOf(token: `0x${string}`, holder: `0x${string}`): Promise<bigint> {
  return (await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [holder] })) as bigint;
}

async function send(wallet: Wallet, params: Parameters<Wallet['writeContract']>[0]): Promise<void> {
  const hash = await wallet.writeContract(params);
  await publicClient.waitForTransactionReceipt({ hash });
  logger.info({ hash }, `usyc-cron: ${params.functionName} mined`);
}

async function rebalanceVault(wallet: Wallet, account: `0x${string}`): Promise<void> {
  const vault = cfg.KARWAN_VAULT_ADDR as `0x${string}` | undefined;
  if (!vault) {
    logger.info('usyc-cron: KARWAN_VAULT_ADDR unset, skipping vault rebalance');
    return;
  }
  const operator = (await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'operator' })) as `0x${string}`;
  if (getAddress(operator) !== getAddress(account)) {
    logger.warn({ operator, account }, 'usyc-cron: operator key is not the vault operator, skipping vault rebalance');
    return;
  }

  const buffer = toUnits(config.USYC_VAULT_BUFFER_USDC);
  const margin = toUnits(config.USYC_REBALANCE_MARGIN_USDC);
  const liquid = await balanceOf(usdc, vault);

  if (liquid > buffer + margin) {
    // Wrap the excess: pull USDC out, subscribe from the operator EOA.
    const amount = liquid - buffer;
    logger.info({ wrap: fmt(amount), liquid: fmt(liquid), buffer: fmt(buffer) }, 'usyc-cron: vault over buffer, wrapping');
    await send(wallet, { address: vault, abi: vaultAbi, functionName: 'withdrawForYield', args: [amount], account, chain: arcTestnet });
    await send(wallet, { address: usdc, abi: erc20Abi, functionName: 'approve', args: [TELLER, amount], account, chain: arcTestnet });
    await send(wallet, { address: TELLER, abi: tellerAbi, functionName: 'deposit', args: [amount, account], account, chain: arcTestnet });
    return;
  }

  if (liquid + margin < buffer) {
    // Under buffer: redeem enough USYC to restore the floor.
    const need = buffer - liquid;
    const treasuryForOracle = (cfg.KARWAN_TREASURY_USYC_ADDR ??
      cfg.KARWAN_TREASURY_CONTRACT_ADDR) as `0x${string}` | undefined;
    const oracle = treasuryForOracle
      ? ((await publicClient
          .readContract({ address: treasuryForOracle, abi: treasuryAbi, functionName: 'oracle' })
          .catch(() => null)) as `0x${string}` | null)
      : null;
    if (!oracle) {
      logger.warn('usyc-cron: cannot resolve oracle to size the unwind, skipping');
      return;
    }
    const round = (await publicClient.readContract({ address: oracle, abi: oracleAbi, functionName: 'latestRoundData' })) as readonly [bigint, bigint, bigint, bigint, bigint];
    const price = round[1] > 0n ? round[1] : 10n ** 18n;
    let shares = (need * 10n ** 18n) / price; // 6dp USDC need -> 6dp USYC shares
    const held = await balanceOf(USYC, account);
    if (shares > held) shares = held;
    if (shares === 0n) {
      logger.warn({ need: fmt(need) }, 'usyc-cron: under buffer but no USYC to unwind');
      return;
    }
    logger.info({ unwindShares: fmt(shares), need: fmt(need) }, 'usyc-cron: vault under buffer, unwinding');
    await send(wallet, { address: USYC, abi: erc20Abi, functionName: 'approve', args: [TELLER, shares], account, chain: arcTestnet });
    const redeemHash = await wallet.writeContract({ address: TELLER, abi: tellerAbi, functionName: 'redeem', args: [shares, account, account], account, chain: arcTestnet });
    await publicClient.waitForTransactionReceipt({ hash: redeemHash });
    const usdcOut = await balanceOf(usdc, account);
    await send(wallet, { address: usdc, abi: erc20Abi, functionName: 'approve', args: [vault, usdcOut], account, chain: arcTestnet });
    await send(wallet, { address: vault, abi: vaultAbi, functionName: 'depositFromYield', args: [usdcOut], account, chain: arcTestnet });
    return;
  }

  logger.info({ liquid: fmt(liquid), buffer: fmt(buffer) }, 'usyc-cron: vault within buffer, nothing to do');
}

async function sweepTreasury(wallet: Wallet, account: `0x${string}`): Promise<void> {
  const treasury = (cfg.KARWAN_TREASURY_USYC_ADDR ?? cfg.KARWAN_TREASURY_CONTRACT_ADDR) as `0x${string}` | undefined;
  if (!treasury) {
    logger.info('usyc-cron: treasury contract unset, skipping sweep');
    return;
  }
  const feeEoa = cfg.KARWAN_TREASURY_ADDR as `0x${string}` | undefined;

  // Move fees into the treasury contract when the fee collector is this key.
  if (feeEoa && getAddress(feeEoa) === getAddress(account)) {
    const feeBal = await balanceOf(usdc, feeEoa);
    if (feeBal >= toUnits(config.USYC_TREASURY_SWEEP_MIN_USDC)) {
      logger.info({ move: fmt(feeBal) }, 'usyc-cron: moving fees into treasury');
      await send(wallet, { address: usdc, abi: erc20Abi, functionName: 'approve', args: [treasury, feeBal], account, chain: arcTestnet });
      await send(wallet, { address: treasury, abi: treasuryAbi, functionName: 'deposit', args: [feeBal], account, chain: arcTestnet });
    }
  } else if (feeEoa) {
    logger.info({ feeEoa, account }, 'usyc-cron: fee collector is a different wallet, sweeping existing treasury balance only');
  }

  // Sweep idle treasury USDC into USYC. Keeper-gated; reverts NothingToSweep
  // when below idleThreshold, which is benign.
  try {
    await send(wallet, { address: treasury, abi: treasuryAbi, functionName: 'sweepToUSYC', args: [], account, chain: arcTestnet });
  } catch (err) {
    logger.info({ err: (err as Error).message.slice(0, 120) }, 'usyc-cron: sweepToUSYC no-op or not keeper');
  }
}

async function main() {
  if (!config.USYC_OPERATOR_PRIVATE_KEY) {
    logger.info('usyc-cron: USYC_OPERATOR_PRIVATE_KEY unset, nothing to do');
    return;
  }
  const account = privateKeyToAccount(config.USYC_OPERATOR_PRIVATE_KEY as `0x${string}`);
  const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(config.ARC_TESTNET_RPC_URL) });
  logger.info({ operator: account.address }, 'usyc-cron: start');

  await rebalanceVault(wallet, account.address).catch((err) =>
    logger.error({ err: (err as Error).message }, 'usyc-cron: vault rebalance failed'),
  );
  await sweepTreasury(wallet, account.address).catch((err) =>
    logger.error({ err: (err as Error).message }, 'usyc-cron: treasury sweep failed'),
  );
  logger.info('usyc-cron: done');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err: (err as Error).message }, 'usyc-cron: fatal');
    process.exit(1);
  });
