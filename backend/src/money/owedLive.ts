/// Money owed to you, wired to Arc (view 66): live reads of `owed` on each
/// contract for each of a person's wallets, the collect call for a wallet
/// Karwan holds, the proof for an own-wallet collect, and the support list
/// fed by a scan of `PayoutCredited` and `OwedWithdrawn`.

import { readSession } from '../auth/session.js';
import { erc20Abi, formatUnits, parseAbi, parseAbiItem, parseEventLogs, type Hex, type TransactionReceipt } from 'viem';
import { ARC, publicClient } from '../chain/client.js';
import { usdc } from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import { suiteAddresses, suiteJobsAddress, suiteTimeAddress, suiteVaultAddress } from '../chain/suiteConfig.js';
import { parseCreSettings } from '../cre/settings.js';
import { appendActivity } from '../db/activityLog.js';
import { findAgentWalletByAgentAddress, getAgentWallets } from '../db/agentWallets.js';
import { deleteRecord, getRecord, listRecords, putRecord } from '../db/evidence.js';
import { ensureMoneyMovement, getMoneyMovementByOperationKey } from '../db/moneyMovements.js';
import { getUserByAddress } from '../db/users.js';
import { logger } from '../logger.js';
import { leased } from '../ops/leasedLoop.js';
import type { OwedDeps } from '../routes/owed.js';
import { formatUsdcMicros } from './model.js';
import {
  owedAddressKey,
  owedOperationKey,
  owedSources,
  personWallets,
  proveOwedWithdrawal,
  readOwedLines,
  scanOwedSource,
  withdrawOwedCall,
  type OwedAddress,
  type OwedLine,
  type OwedScanIo,
  type OwedSource,
} from './owed.js';
import {
  completeMoneyMovement,
  currentMoneyMovement,
  markMoneyMovementNeedsAttention,
  prepareMoneyMovementContractLeg,
  verifyMoneyMovementLeg,
} from './service.js';
import { receiptParties } from './vaultStake.js';

const owedAbi = parseAbi([
  'function owed(address asset, address who) view returns (uint256)',
  'function owedTotal(address asset) view returns (uint256)',
]);
const creOwedAbi = parseAbi(['function owed(address who) view returns (uint256)', 'function owedTotal() view returns (uint256)']);
const eventsAbi = parseAbi([
  'event OwedWithdrawn(address indexed asset, address indexed to, uint256 amount)',
  'event PayoutCredited(address indexed asset, address indexed to, uint256 amount)',
]);
const creEventsAbi = parseAbi(['event OwedWithdrawn(address indexed to, uint256 amount)', 'event PayoutCredited(address indexed to, uint256 amount)']);

export function liveOwedSources(): OwedSource[] {
  return owedSources({
    agreement: suiteAddresses()?.agreement ?? null,
    jobs: suiteJobsAddress(),
    time: suiteTimeAddress(),
    vault: suiteVaultAddress(),
    cre: parseCreSettings(process.env).fees ?? null,
  });
}

export function readOwedOf(source: OwedSource, who: string): Promise<bigint> {
  return source.perAsset
    ? publicClient.readContract({ address: source.address as Hex, abi: owedAbi, functionName: 'owed', args: [usdc as Hex, who as Hex] })
    : publicClient.readContract({ address: source.address as Hex, abi: creOwedAbi, functionName: 'owed', args: [who as Hex] });
}

export async function owedLinesOf(address: string) {
  const key = address.toLowerCase();
  const wallets = personWallets({
    address: key,
    identityWalletId: getUserByAddress(key)?.circleIdentityWalletId ?? null,
    agents: await getAgentWallets(key).catch(() => null),
  });
  return readOwedLines(liveOwedSources(), wallets, (source, wallet) => readOwedOf(source, wallet.address));
}

const LEG_KEY = 'owed';
const SUMMARY = (amount: string) => `Collected ${amount} USDC owed to you`;

function ensureOwedMovement(line: OwedLine, requestId: string) {
  return ensureMoneyMovement({
    operationKey: owedOperationKey(line.id, requestId),
    kind: 'owed_withdrawal',
    amountMicros: line.amountMicros,
    initiatedBy: line.wallet,
    participants: [
      { address: line.wallet, role: 'owner' },
      { address: line.contractAddress, role: 'source' },
      { address: line.wallet, role: 'recipient' },
    ],
    summary: SUMMARY(formatUsdcMicros(line.amountMicros)),
    nextActor: 'karwan',
  });
}

function legPlan(line: OwedLine, rail: 'arc_contract' | 'circle_wallets') {
  return {
    key: LEG_KEY,
    label: 'Collect money owed',
    rail,
    ...(line.walletId ? { walletId: line.walletId } : {}),
    signerAddress: line.wallet,
    sourceAddress: line.contractAddress,
    destinationAddress: line.wallet,
    contractAddress: line.contractAddress,
    amountMicros: line.amountMicros,
  };
}

function proveReceipt(receipt: TransactionReceipt, line: OwedLine): void {
  const parties = receiptParties(receipt, line.wallet);
  const withdrawn = parseEventLogs({ abi: line.perAsset ? eventsAbi : creEventsAbi, eventName: 'OwedWithdrawn', logs: receipt.logs, strict: false }).map((e) => ({
    emitter: e.address,
    ...(e.args as { to?: string; amount?: bigint }),
  }));
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs, strict: false }).map((e) => ({
    tokenAddress: e.address,
    ...(e.args as { from?: string; to?: string; value?: bigint }),
  }));
  proveOwedWithdrawal({
    status: receipt.status,
    receiptFrom: parties.receiptFrom,
    contractAddress: line.contractAddress,
    wallet: line.wallet,
    usdc: usdc as string,
    amountMicros: line.amountMicros,
    withdrawn,
    transfers,
  });
}

/// A wallet Karwan holds: read what is owed right before sending, send, prove.
export async function collectHeldLine(line: OwedLine, requestId: string): Promise<{ reference: string; txHash: string | null }> {
  if (!line.walletId) throw new Error('this wallet signs for itself');
  const ensured = await ensureOwedMovement(line, requestId);
  const reference = ensured.movement.reference;
  if (ensured.movement.state === 'completed') return { reference, txHash: ensured.movement.legs.find((l) => l.key === LEG_KEY)?.txHash ?? null };
  if (ensured.movement.state === 'needs_attention') throw new Error(`collect needs attention (${reference})`);
  const source = liveOwedSources().find((s) => s.contract === line.contract);
  if (!source) throw new Error('that contract is not set up');
  try {
    const leg = await prepareMoneyMovementContractLeg(reference, legPlan(line, 'circle_wallets'));
    if (leg.leg.state === 'verified') return { reference, txHash: leg.leg.txHash ?? null };
    const call = withdrawOwedCall(source, usdc as string);
    const sent = await executeContractCall(
      {
        walletId: line.walletId,
        contractAddress: line.contractAddress,
        abiFunctionSignature: call.signature,
        abiParameters: call.params,
        idempotencyKey: leg.idempotencyKey,
        lifecycle: leg.lifecycle,
      },
      `owed.collect.${line.contract}`,
    );
    const receipt = await publicClient.getTransactionReceipt({ hash: sent.txHash as Hex });
    proveReceipt(receipt, line);
    await verifyMoneyMovementLeg(reference, leg.leg.id, { amountMicros: line.amountMicros });
    await completeMoneyMovement(reference, { amountMicros: line.amountMicros });
    return { reference, txHash: sent.txHash };
  } catch (error) {
    await markMoneyMovementNeedsAttention(reference, 'OWED_COLLECT_PROOF_MISMATCH');
    throw error;
  }
}

export async function prepareOwnLine(line: OwedLine, requestId: string): Promise<{ reference: string }> {
  const ensured = await ensureOwedMovement(line, requestId);
  if (ensured.movement.state === 'needs_attention') throw new Error(`collect needs attention (${ensured.movement.reference})`);
  const prepared = await prepareMoneyMovementContractLeg(ensured.movement.reference, legPlan(line, 'arc_contract'));
  return { reference: prepared.movement.reference };
}

export async function completeOwnLine(line: OwedLine, requestId: string, txHash: string): Promise<{ reference: string }> {
  const found = await getMoneyMovementByOperationKey(owedOperationKey(line.id, requestId));
  if (!found) throw new Error('collect is not prepared');
  const movement = await currentMoneyMovement(found.reference);
  if (movement.state === 'completed') return { reference: movement.reference };
  const leg = movement.legs.find((l) => l.attempt === movement.attempt && l.key === LEG_KEY);
  if (!leg) throw new Error('collect is not prepared');
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hex });
    proveReceipt(receipt, line);
    const plan = await prepareMoneyMovementContractLeg(movement.reference, legPlan(line, 'arc_contract'));
    await plan.lifecycle.onSubmitted?.({ txId: txHash, estimatedFee: null });
    await plan.lifecycle.onConfirmed?.({ txId: txHash, txHash, explorerUrl: `${ARC.explorer}/tx/${txHash}` });
    await verifyMoneyMovementLeg(movement.reference, leg.id, { amountMicros: line.amountMicros });
    await completeMoneyMovement(movement.reference, { amountMicros: line.amountMicros });
    return { reference: movement.reference };
  } catch (error) {
    await markMoneyMovementNeedsAttention(movement.reference, 'OWED_COLLECT_PROOF_MISMATCH');
    throw error;
  }
}

export const liveOwedDeps: OwedDeps = {
  session: readSession,
  usdc: usdc as string,
  sources: liveOwedSources,
  lines: owedLinesOf,
  collectHeld: collectHeldLine,
  prepareOwn: prepareOwnLine,
  completeOwn: completeOwnLine,
  findIntent: async (operationKey) => {
    const m = await getMoneyMovementByOperationKey(operationKey).catch(() => null);
    return m ? { reference: m.reference, amountMicros: m.amountMicros } : null;
  },
  activity: ({ address, lineId, amountMicros, txHash, reference }) => {
    const a = formatUsdcMicros(amountMicros);
    void appendActivity({
      id: `owed:${lineId}:${reference}`,
      address,
      kind: 'payout',
      summary: SUMMARY(a),
      params: { t: 'owedCollected', amount: a },
      amountUsdc: a,
      txHash: txHash ?? undefined,
      refId: reference,
    }).catch((err) => logger.warn({ err: (err as Error).message }, 'owed activity write failed'));
  },
};

// ---------------------------------------------------------------- support list

const EVERY_MS = 10 * 60_000;

interface Cursor {
  block: string;
}

const creditedAsset = parseAbiItem('event PayoutCredited(address indexed asset, address indexed to, uint256 amount)');
const creditedPlain = parseAbiItem('event PayoutCredited(address indexed to, uint256 amount)');

const liveScanIo: OwedScanIo = {
  getLogs: async (source, fromBlock, toBlock) =>
    source.perAsset
      ? (await publicClient.getLogs({ address: source.address as Hex, event: creditedAsset, fromBlock, toBlock })).map((l) => ({ to: l.args.to }))
      : (await publicClient.getLogs({ address: source.address as Hex, event: creditedPlain, fromBlock, toBlock })).map((l) => ({ to: l.args.to })),
  cursor: async (contract) => {
    const saved = await getRecord<Cursor>('owed-scan', contract);
    return saved ? BigInt(saved.block) : null;
  },
  saveCursor: (contract, block) => putRecord<Cursor>('owed-scan', contract, { block: block.toString() }),
  known: async (key) => !!(await getRecord<OwedAddress>('owed-address', key)),
  remember: (key, entry) => putRecord<OwedAddress>('owed-address', key, entry),
  now: Date.now,
};

/// Every open owed balance with its amount read now, and the total per contract.
export async function owedForSupport(): Promise<{
  open: Array<OwedAddress & { amountUsdc: string; userAddress: string | null }>;
  totals: Array<{ contract: OwedSource['contract']; totalUsdc: string | null }>;
}> {
  const sources = liveOwedSources();
  const known = (await listRecords<OwedAddress>('owed-address')).map((r) => r.data);
  const open: Array<OwedAddress & { amountUsdc: string; userAddress: string | null }> = [];
  for (const entry of known) {
    const source = sources.find((s) => s.contract === entry.contract);
    if (!source) continue;
    const amount = await readOwedOf(source, entry.wallet).catch(() => null);
    if (amount === null) continue;
    if (amount === 0n) {
      await deleteRecord('owed-address', owedAddressKey(entry.contract, entry.wallet));
      continue;
    }
    open.push({ ...entry, amountUsdc: formatUnits(amount, 6), userAddress: await ownerOf(entry.wallet) });
  }
  const totals = await Promise.all(
    sources.map(async (s) => {
      const total = await (s.perAsset
        ? publicClient.readContract({ address: s.address as Hex, abi: owedAbi, functionName: 'owedTotal', args: [usdc as Hex] })
        : publicClient.readContract({ address: s.address as Hex, abi: creOwedAbi, functionName: 'owedTotal' })
      ).catch(() => null);
      return { contract: s.contract, totalUsdc: total === null ? null : formatUnits(total, 6) };
    }),
  );
  return { open, totals };
}

/// The account an owed wallet belongs to, when Karwan knows it.
async function ownerOf(wallet: string): Promise<string | null> {
  if (getUserByAddress(wallet)) return wallet;
  return (await findAgentWalletByAgentAddress(wallet).catch(() => null))?.userAddress ?? null;
}

export function startOwedScan(): () => void {
  const sources = liveOwedSources();
  if (sources.length === 0) return () => {};
  const run = leased('owedScan', EVERY_MS, async () => {
    try {
      const head = await publicClient.getBlockNumber();
      for (const source of sources) await scanOwedSource(source, head, liveScanIo);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'owed scan failed, tried again in 10 minutes');
    }
  });
  void run();
  const timer = setInterval(() => void run(), EVERY_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
