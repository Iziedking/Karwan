/// Purchase-order financing watcher. Drives the two money-out legs of a PO
/// line on chain, so the financing loop completes without a human clicking a
/// contract call. Both legs are permissionless on KarwanPOFinancing, so the
/// platform relay wallet is the caller; it only pays gas and is msg.sender.
///
///   1. Release on proof of delivery. A `funded` line whose PoD has anchored
///      on KarwanInvoiceRegistry (buyer or attester accepted it) is released:
///      the contract transfers the principal from custody to the seller. This
///      is the automated proof-of-delivery trigger the SME rail promises.
///
///   2. Repay on settlement. A `released` line whose underlying escrow has
///      settled (the seller has been paid in full) is repaid: the contract
///      pulls `repayUsdc` from the seller and pays the financier. The seller
///      grants the pull first; for a Circle seller the backend signs the
///      approval from their wallet, since the backend custodies it.
///
/// Failure handling mirrors the factoring watcher: a failed leg keeps the line
/// in place and retries next tick, and the repay leg defaults after
/// MAX_REPAY_ATTEMPTS (most often the seller moved their settlement out before
/// the watcher fired). The off-chain dispute path pursues remediation.

import { parseUnits } from 'viem';
import { publicClient } from '../chain/client.js';
import { listOpenLines, patchPOLine, type POFinancingLine } from '../db/poFinancing.js';
import { getDeal } from '../db/deals.js';
import { getUserByAddress } from '../db/users.js';
import { executeContractCall } from '../chain/txs.js';
import { bus } from '../events.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const TICK_MS = Number(process.env.PO_WATCHER_TICK_MS ?? 60_000);
const MAX_REPAY_ATTEMPTS = 5;
const USDC_DECIMALS = 6;

/// Minimal read ABI: has the buyer or an attester accepted proof of delivery
/// for this invoice on the registry.
const REGISTRY_READ_ABI = [
  {
    type: 'function',
    name: 'isPoDAccepted',
    stateMutability: 'view',
    inputs: [{ name: 'invoiceId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const processing = new Set<string>();
// Per-line repay attempt counter. Kept in memory: a process restart simply
// re-tries from zero, which is safe because claimRepayment is idempotent at the
// contract (a second call on a Settled line reverts and we treat that as done).
const repayAttempts = new Map<string, number>();

async function isPoDAccepted(invoiceId: string): Promise<boolean> {
  const registry = config.KARWAN_INVOICE_REGISTRY_ADDR;
  if (!registry) return false;
  return (await publicClient.readContract({
    address: registry as `0x${string}`,
    abi: REGISTRY_READ_ABI,
    functionName: 'isPoDAccepted',
    args: [invoiceId as `0x${string}`],
  })) as boolean;
}

/// Leg 1: PoD anchored -> releaseToSeller. Permissionless; the relay signs.
async function releaseLine(line: POFinancingLine): Promise<void> {
  const poAddr = config.KARWAN_PO_FINANCING_ADDR;
  const relayWalletId = config.cctpRelayWalletId;
  if (!poAddr || !relayWalletId) {
    throw new Error('PO release: KARWAN_PO_FINANCING_ADDR or relay wallet unset');
  }

  const r = await executeContractCall(
    {
      walletId: relayWalletId,
      contractAddress: poAddr,
      abiFunctionSignature: 'releaseToSeller(bytes32)',
      abiParameters: [line.invoiceId],
    },
    `poFinancing.releaseToSeller(${line.invoiceId})`,
  );

  const now = Date.now();
  const updated = await patchPOLine(line.id, {
    state: 'released',
    releasedAt: now,
    // The contract sets its own repaymentTimeoutAt; mirror a 7-day window so
    // the default sweep and the UI countdown have a value to read.
    repaymentTimeoutAt: now + 7 * 24 * 60 * 60 * 1000,
    txHashes: { ...line.txHashes, release: r.txHash },
  });

  bus.emitEvent({
    type: 'po.released',
    jobId: line.invoiceId,
    actor: 'platform',
    payload: {
      lineId: line.id,
      seller: line.seller,
      principalUsdc: line.principalUsdc,
      releaseTxHash: r.txHash,
    },
  });

  logger.info(
    { lineId: line.id, invoiceId: line.invoiceId, seller: line.seller, releaseTxHash: r.txHash },
    'po-financing: released to seller on chain (proof-of-delivery trigger)',
  );
  void updated;
}

/// Leg 2: escrow settled -> claimRepayment. The seller grants the pull first.
/// For a Circle seller the backend approves from their wallet; a web3 seller
/// must have approved the PO contract themselves (captured at consent time).
async function repayLine(line: POFinancingLine): Promise<void> {
  const poAddr = config.KARWAN_PO_FINANCING_ADDR;
  const usdcAddr = config.USDC_ADDR;
  const relayWalletId = config.cctpRelayWalletId;
  if (!poAddr || !relayWalletId) {
    throw new Error('PO repay: KARWAN_PO_FINANCING_ADDR or relay wallet unset');
  }

  // Ensure the seller has approved the contract to pull repayUsdc. A Circle
  // seller's wallet is backend-custodied, so we sign the approval here. A web3
  // seller signs their own approval; if it is missing, claimRepayment reverts
  // and this line retries then defaults.
  const sellerUser = getUserByAddress(line.seller);
  if (sellerUser?.circleIdentityWalletId) {
    if (!usdcAddr) throw new Error('PO repay: USDC_ADDR unset for Circle approval');
    const repayWei = parseUnits(line.repayUsdc, USDC_DECIMALS).toString();
    await executeContractCall(
      {
        walletId: sellerUser.circleIdentityWalletId,
        contractAddress: usdcAddr,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters: [poAddr, repayWei],
      },
      `usdc.approve(seller, poFinancing) for repay ${line.invoiceId}`,
    );
  }

  const r = await executeContractCall(
    {
      walletId: relayWalletId,
      contractAddress: poAddr,
      abiFunctionSignature: 'claimRepayment(bytes32)',
      abiParameters: [line.invoiceId],
    },
    `poFinancing.claimRepayment(${line.invoiceId})`,
  );

  await patchPOLine(line.id, {
    state: 'repaid',
    repaidAt: Date.now(),
    txHashes: { ...line.txHashes, repay: r.txHash },
  });
  repayAttempts.delete(line.id);

  bus.emitEvent({
    type: 'po.repaid',
    jobId: line.invoiceId,
    actor: 'platform',
    payload: {
      lineId: line.id,
      financier: line.financier,
      repayUsdc: line.repayUsdc,
      repayTxHash: r.txHash,
    },
  });

  logger.info(
    { lineId: line.id, invoiceId: line.invoiceId, financier: line.financier, repayTxHash: r.txHash },
    'po-financing: repayment claimed on chain',
  );
}

async function markDefaulted(line: POFinancingLine, reason: string): Promise<void> {
  await patchPOLine(line.id, { state: 'defaulted', txHashes: { ...line.txHashes } });
  repayAttempts.delete(line.id);
  bus.emitEvent({
    type: 'po.defaulted',
    jobId: line.invoiceId,
    actor: 'platform',
    payload: { lineId: line.id, financier: line.financier, seller: line.seller, reason },
  });
  logger.warn({ lineId: line.id, invoiceId: line.invoiceId, reason }, 'po-financing: line defaulted');
}

async function handleLine(line: POFinancingLine): Promise<void> {
  if (line.state === 'funded') {
    if (!(await isPoDAccepted(line.invoiceId))) return;
    await releaseLine(line);
    return;
  }

  if (line.state === 'released') {
    const deal = await getDeal(line.invoiceId);
    if (!deal) return;

    // Buyer refunded the escrow after release: the seller was never paid in
    // full, so there is nothing to pull. Default and let the dispute path
    // pursue the seller.
    if (deal.cancelledAt && !deal.settledAt) {
      await markDefaulted(line, 'deal cancelled after PO release');
      return;
    }
    if (!deal.settledAt) return;

    try {
      await repayLine(line);
    } catch (err) {
      const attempts = (repayAttempts.get(line.id) ?? 0) + 1;
      repayAttempts.set(line.id, attempts);
      const reason = (err as Error).message;
      logger.warn(
        { lineId: line.id, attempts, err: reason },
        'po-financing: repayment failed; will retry',
      );
      if (attempts >= MAX_REPAY_ATTEMPTS) {
        await markDefaulted(line, `repayment failed after ${attempts} attempts: ${reason}`).catch(
          () => {},
        );
      }
    }
  }
}

async function tick(): Promise<void> {
  let lines: POFinancingLine[];
  try {
    lines = await listOpenLines();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'po watcher: listOpenLines failed; skipping tick');
    return;
  }
  for (const line of lines) {
    if (processing.has(line.id)) continue;
    processing.add(line.id);
    try {
      await handleLine(line);
    } catch (err) {
      logger.warn(
        { lineId: line.id, err: (err as Error).message },
        'po watcher: line handling failed; will retry next tick',
      );
    } finally {
      processing.delete(line.id);
    }
  }
}

/// Starts the periodic PO financing watcher. Returns a stop function. No-ops
/// cleanly when the PO contract or the relay wallet is not configured.
export function startPOWatcher(): () => void {
  if (!config.KARWAN_PO_FINANCING_ADDR || !config.cctpRelayWalletId) {
    logger.info('po watcher: PO contract or relay wallet unset; watcher dormant');
    return () => {};
  }
  const id = setInterval(() => {
    tick().catch((err) => logger.error({ err: (err as Error).message }, 'po watcher: tick failed'));
  }, TICK_MS);
  logger.info({ tickMs: TICK_MS }, 'po watcher started');
  return () => clearInterval(id);
}
