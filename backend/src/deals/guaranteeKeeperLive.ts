/// The live side of deals/guaranteeKeeper.ts (view 62): chain reads and the two
/// calls anyone may make, the StakeHookFailed scan with its saved block, holds
/// in the records table, the support alert, and the pass every 10 minutes.

import { createWalletClient, decodeEventLog, formatUnits, parseAbi, parseAbiItem, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { agreementEscrowAbi as escrowAbi } from '../chain/abis/agreementEscrow.js';
import { arcChain, arcTransport, publicClient } from '../chain/client.js';
import { suiteAddresses, suiteVaultAddress } from '../chain/suiteConfig.js';
import { config } from '../config.js';
import { listAllDeals } from '../db/deals.js';
import { deleteRecord, getRecord, listRecords, putRecord } from '../db/evidence.js';
import { logger } from '../logger.js';
import { leased } from '../ops/leasedLoop.js';
import { sendTelegramMessage, supportOperatorChatId } from '../telegram/bot.js';
import { runGuaranteePass, type GuaranteeDeps, type GuaranteeHold, type GuaranteeReport } from './guaranteeKeeper.js';

const vaultAbi = parseAbi([
  'function expiryOf(address family, bytes32 ref) view returns (uint64)',
  'function releaseStale(address family, bytes32 ref)',
]);
const stakeHookFailed = parseAbiItem('event StakeHookFailed(bytes32 indexed dealId, uint8 hook)');
const HOOK_SLASH = 1;

/// Arc's `eth_getLogs` refuses more than 10,000 blocks (docs, rpc-endpoints).
const SCAN_STEP = 9_999n;
/// Steps per pass, so a long gap is caught up over several passes.
const SCAN_STEPS_PER_PASS = 50;
/// How far back the first scan reaches: 30 days at about 2 blocks a second.
const FIRST_SCAN_BLOCKS = 5_200_000n;
/// A closed deal's guarantee is reserved at most 210 days past its horizon.
const CLOSED_LOOKBACK_MS = 240 * 86_400_000;

const EVERY_MS = 10 * 60_000;

interface Cursor {
  block: string;
}

let lastReport: (GuaranteeReport & { at: number }) | null = null;

export function guaranteeKeeperReport() {
  return lastReport;
}

/// Holds a person has to look at: the alerted ones, newest first.
export async function listGuaranteeHolds(): Promise<GuaranteeHold[]> {
  return (await listRecords<GuaranteeHold>('guarantee-hold'))
    .map((r) => r.data)
    .filter((h) => h.alertedAt !== null)
    .sort((a, b) => b.at - a.at);
}

/// The same holds with each guarantee's amount read from the escrow, for the admin page.
export async function listGuaranteeHoldsWithStake(): Promise<Array<GuaranteeHold & { sellerStakeUsdc: string | null }>> {
  const agreement = suiteAddresses()?.agreement as Hex | undefined;
  return Promise.all(
    (await listGuaranteeHolds()).map(async (h) => {
      if (!agreement) return { ...h, sellerStakeUsdc: null };
      const terms = await publicClient
        .readContract({ address: agreement, abi: escrowAbi, functionName: 'getTerms', args: [h.dealId as Hex] })
        .catch(() => null);
      return { ...h, sellerStakeUsdc: terms ? formatUnits(BigInt(terms.sellerStake), 6) : null };
    }),
  );
}

async function scanFailedPayouts(agreement: Hex): Promise<Array<{ dealId: string; txHash: string }>> {
  const head = await publicClient.getBlockNumber();
  const saved = await getRecord<Cursor>('guarantee-scan', 'cursor');
  let from = saved ? BigInt(saved.block) + 1n : head > FIRST_SCAN_BLOCKS ? head - FIRST_SCAN_BLOCKS : 0n;
  const found: Array<{ dealId: string; txHash: string }> = [];
  for (let step = 0; step < SCAN_STEPS_PER_PASS && from <= head; step++) {
    const to = from + SCAN_STEP - 1n > head ? head : from + SCAN_STEP - 1n;
    const logs = await publicClient.getLogs({ address: agreement, event: stakeHookFailed, fromBlock: from, toBlock: to });
    for (const log of logs) {
      const { args } = decodeEventLog({ abi: [stakeHookFailed], data: log.data, topics: log.topics });
      if (Number(args.hook) === HOOK_SLASH && log.transactionHash) found.push({ dealId: args.dealId, txHash: log.transactionHash });
      else logger.warn({ dealId: args.dealId, hook: Number(args.hook), txHash: log.transactionHash }, 'deal guarantee hook failed on chain');
    }
    await putRecord<Cursor>('guarantee-scan', 'cursor', { block: to.toString() });
    from = to + 1n;
  }
  return found;
}

export function startGuaranteeKeeper(): () => void {
  const addrs = suiteAddresses();
  const vault = suiteVaultAddress();
  if (!addrs || !vault) return () => {};
  const key = config.OPERATOR_PRIVATE_KEY as Hex | undefined;
  if (!key) {
    logger.warn('guarantee keeper: no operator key, deal guarantees are only read, not kept');
  }
  const agreement = addrs.agreement as Hex;
  const wallet = key ? createWalletClient({ account: privateKeyToAccount(key), chain: arcChain, transport: arcTransport }) : null;

  const send = async (address: Hex, abi: typeof escrowAbi | typeof vaultAbi, functionName: string, args: unknown[]) => {
    if (!wallet) throw new Error('no operator key');
    const hash = await wallet.writeContract({ address, abi: abi as never, functionName: functionName as never, args: args as never });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`${functionName} reverted`);
    logger.info({ functionName, txHash: hash }, 'deal guarantee call landed');
  };

  const deps: GuaranteeDeps = {
    deals: async () => {
      const cutoff = Date.now() - CLOSED_LOOKBACK_MS;
      return (await listAllDeals())
        .filter((d) => d.escrowVersion === 'suite' && !!d.escrowDealId)
        .filter((d) => !d.escrowAddress || d.escrowAddress.toLowerCase() === agreement.toLowerCase())
        .filter((d) => {
          const stake = (d.escrowTerms as { sellerStake?: string } | undefined)?.sellerStake;
          return !!stake && stake !== '0';
        })
        .filter((d) => (d.settledAt ?? d.cancelledAt ?? Date.now()) >= cutoff)
        .map((d) => ({ jobId: d.jobId, dealId: d.escrowDealId! }));
    },
    read: async (dealId) => {
      const id = dealId as Hex;
      const [deal, account, terms, expiry] = await Promise.all([
        publicClient.readContract({ address: agreement, abi: escrowAbi, functionName: 'getDeal', args: [id] }),
        publicClient.readContract({ address: agreement, abi: escrowAbi, functionName: 'accountOf', args: [id] }),
        publicClient.readContract({ address: agreement, abi: escrowAbi, functionName: 'getTerms', args: [id] }),
        publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'expiryOf', args: [agreement, id] }),
      ]);
      return { state: Number(deal.state), sellerStake: BigInt(terms.sellerStake), horizon: BigInt(account.horizon), expiry: BigInt(expiry) };
    },
    keep: (dealId) => send(agreement, escrowAbi, 'keepStake', [dealId]),
    releaseStale: (dealId) => send(vault, vaultAbi, 'releaseStale', [agreement, dealId]),
    failedPayouts: () => scanFailedPayouts(agreement),
    getHold: (dealId) => getRecord<GuaranteeHold>('guarantee-hold', dealId.toLowerCase()),
    putHold: (h) => putRecord('guarantee-hold', h.dealId.toLowerCase(), h),
    clearHold: (dealId) => deleteRecord('guarantee-hold', dealId.toLowerCase()),
    alert: async (text) => {
      logger.error({ text }, 'deal guarantee held for support');
      const chat = supportOperatorChatId();
      if (chat) await sendTelegramMessage(chat, text).catch((err) => logger.warn({ err: (err as Error).message }, 'guarantee alert send failed'));
    },
    now: Date.now,
  };

  const run = leased('guaranteeKeeper', EVERY_MS, async () => {
    try {
      const report = await runGuaranteePass(deps);
      lastReport = { ...report, at: Date.now() };
      if (report.kept.length || report.freed.length || report.held.length || report.errors.length) {
        logger.info(report, 'deal guarantee pass');
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'deal guarantee pass failed, tried again in 10 minutes');
    }
  });
  void run();
  const timer = setInterval(() => void run(), EVERY_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
