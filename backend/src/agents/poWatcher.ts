/// Purchase-order financing watcher. Closes out PO lines on chain so the
/// financing loop completes without a human clicking a contract call.
/// claimRepayment is permissionless on KarwanPOFinancing, so the platform relay
/// wallet is the caller; it only pays gas and is msg.sender.
///
/// There is ONE leg now. The advance reaches the seller inside the funding
/// transaction, so there is no release to drive: when the underlying escrow
/// settles, the assignment has already paid the financier, and claimRepayment
/// closes the line out, pulling only a shortfall if the deal settled for less
/// than the repay amount. The seller grants that pull first; for a Circle
/// seller the backend signs the approval from their wallet, since the backend
/// custodies it.
///
/// The proof-of-delivery release leg this watcher used to run is gone with the
/// custody rail it belonged to. It could not fire on the ordinary settlement
/// path, which is what stranded sellers' advances. See
/// contracts/test/KarwanPOCustodyAttack.t.sol.
///
/// Failure handling mirrors the factoring watcher: a failed leg keeps the line
/// in place and retries next tick, and the repay leg defaults after
/// MAX_REPAY_ATTEMPTS (most often the seller moved their settlement out before
/// the watcher fired). The off-chain dispute path pursues remediation.

import { formatUnits, parseUnits } from 'viem';
import {
  listOpenLines,
  getPOLineForInvoice,
  patchPOLine,
  type POFinancingLine,
} from '../db/poFinancing.js';
import { getDeal } from '../db/deals.js';
import { appendActivity } from '../db/activityLog.js';
import { getUserByAddress } from '../db/users.js';
import { executeContractCall } from '../chain/txs.js';
import { bus } from '../events.js';
import { addSystemMessage } from '../chat/systemMessages.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { recordHeartbeat } from '../ops/heartbeats.js';
import {
  financingOperationKey,
  readEscrowAssignmentPaid,
  recordEscrowAssignedFinancingMovement,
  recordVerifiedFinancingMovement,
} from '../money/financing.js';

const TICK_MS = Number(process.env.PO_WATCHER_TICK_MS ?? 60_000);
const MAX_REPAY_ATTEMPTS = 5;
const USDC_DECIMALS = 6;

const processing = new Set<string>();
// Per-line repay attempt counter. Kept in memory: a process restart simply
// re-tries from zero, which is safe because claimRepayment is idempotent at the
// contract (a second call on a Settled line reverts and we treat that as done).
const repayAttempts = new Map<string, number>();

/// Escrow settled -> claimRepayment. The escrow assignment has usually paid the
/// financier already, so the pull is normally zero and this just closes the
/// line. The seller grants the pull to cover a shortfall: for a Circle seller
/// the backend approves from their wallet; a web3 seller must have approved the
/// PO contract themselves (captured at consent time).
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

  const repayAtomic = parseUnits(line.repayUsdc, USDC_DECIMALS);
  let alreadyPaid = 0n;
  try {
    alreadyPaid = await readEscrowAssignmentPaid(line.invoiceId);
  } catch {
    // Older escrow deployments have no assignment view. In that case the
    // claim receipt itself remains the only usable repayment proof.
  }
  const escrowPaid = alreadyPaid > repayAtomic ? repayAtomic : alreadyPaid;
  const shortfall = repayAtomic - escrowPaid;
  const repaymentMovements: Array<{ reference: string; amountUsdc: string; txHash: string }> = [];
  if (escrowPaid > 0n) {
    const assigned = await recordEscrowAssignedFinancingMovement({
      operationKey: financingOperationKey('po', line.id, 'repayment-escrow', `escrow:${line.invoiceId}:${escrowPaid}`),
      positionId: line.invoiceId,
      amountMicros: escrowPaid,
      initiatedBy: line.financier,
      financierAddress: line.financier,
      jobId: line.invoiceId,
      summary: `Purchase-order repayment of ${formatUnits(escrowPaid, USDC_DECIMALS)} USDC from escrow on ${line.invoiceId}`,
    });
    repaymentMovements.push({ reference: assigned.movement.reference, amountUsdc: formatUnits(escrowPaid, USDC_DECIMALS), txHash: assigned.txHash });
  }
  if (shortfall > 0n) {
    const direct = await recordVerifiedFinancingMovement({
      operationKey: financingOperationKey('po', line.id, 'repayment', r.txHash),
      kind: 'financing_repayment',
      positionId: line.invoiceId,
      amountUsdc: formatUnits(shortfall, USDC_DECIMALS),
      initiatedBy: line.financier,
      sourceAddress: line.seller,
      destinationAddress: line.financier,
      txHash: r.txHash,
      contractAddress: poAddr,
      summary: `Purchase-order repayment of ${formatUnits(shortfall, USDC_DECIMALS)} USDC on ${line.invoiceId}`,
    });
    repaymentMovements.push({ reference: direct.reference, amountUsdc: formatUnits(shortfall, USDC_DECIMALS), txHash: r.txHash });
  }
  if (repaymentMovements.length === 0) {
    throw new Error('PO claim completed without an escrow or seller repayment transfer');
  }

  await patchPOLine(line.id, {
    state: 'repaid',
    repaidAt: Date.now(),
    txHashes: { ...line.txHashes, repay: r.txHash },
  });
  await addSystemMessage({ jobId: line.invoiceId, channel: 'financing', channelKey: line.id, financingKind: 'po', financingId: line.id, eventType: 'po.repaid', occurrenceKey: r.txHash, body: 'The purchase-order financing line was repaid and is now closed.' });
  repayAttempts.delete(line.id);

  bus.emitEvent({
    type: 'po.repaid',
    jobId: line.invoiceId,
    actor: 'platform',
    payload: {
      lineId: line.id,
      financier: line.financier,
      seller: line.seller,
      repayUsdc: line.repayUsdc,
      repayTxHash: r.txHash,
    },
  });
  // The watcher path claims repayment on chain without any route running, so
  // the financier's ledger row has to be written here too or an auto-claimed
  // repayment leaves no trace in their history.
  for (const repayment of repaymentMovements) {
    void appendActivity({
      address: line.financier,
      kind: 'financing_repaid',
      summary: `Repaid ${repayment.amountUsdc} USDC on purchase-order financing ${line.invoiceId}`,
      params: { t: 'financingRepaid', amount: repayment.amountUsdc, job: String(line.invoiceId) },
      amountUsdc: repayment.amountUsdc,
      txHash: repayment.txHash,
      jobId: line.invoiceId,
      counterparty: line.seller?.toLowerCase(),
      refId: repayment.reference,
    });
  }

  logger.info(
    { lineId: line.id, invoiceId: line.invoiceId, financier: line.financier, repayTxHash: r.txHash },
    'po-financing: repayment claimed on chain',
  );
}

async function markDefaulted(line: POFinancingLine, reason: string): Promise<void> {
  await patchPOLine(line.id, { state: 'defaulted', txHashes: { ...line.txHashes } });
  await addSystemMessage({ jobId: line.invoiceId, channel: 'financing', channelKey: line.id, financingKind: 'po', financingId: line.id, eventType: 'po.defaulted', occurrenceKey: String(Date.now()), body: 'The purchase-order financing line defaulted and is now closed.' });
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
  // Legacy custody-rail lines sit on a contract that is no longer configured,
  // so driving them here would call the wrong address. listOpenLines already
  // filters them out; this is the belt to that braces.
  if (line.state !== 'outstanding') return;

  const deal = await getDeal(line.invoiceId);
  if (!deal) return;

  // The deal was refunded to the buyer, so the assignment will never pay: the
  // advance is out and nothing is coming back through the escrow. Default and
  // let the collateral slash and the dispute path pursue recovery.
  if (deal.cancelledAt && !deal.settledAt) {
    await markDefaulted(line, 'deal cancelled while the advance was outstanding');
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

/// Run one line through the release/repay state machine under the processing
/// guard, so the tick and the on-settlement fast path cannot double-submit.
async function runLine(line: POFinancingLine): Promise<void> {
  if (processing.has(line.id)) return;
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

/// Pull the PO repayment the moment its deal settles, instead of waiting for the
/// next poll tick. Called from the settlement paths in deals.ts. Best-effort:
/// any failure is contained here and the periodic tick remains the safety net.
export async function settlePOFinancingForDeal(jobId: string): Promise<void> {
  if (!config.KARWAN_PO_FINANCING_ADDR) return;
  try {
    const line = await getPOLineForInvoice(jobId);
    if (line) await runLine(line);
  } catch (err) {
    logger.warn(
      { jobId, err: (err as Error).message },
      'po-financing: immediate settle-on-deal failed; the periodic watcher will retry',
    );
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
    await runLine(line);
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
    recordHeartbeat('poWatcher');
    tick().catch((err) => logger.error({ err: (err as Error).message }, 'po watcher: tick failed'));
  }, TICK_MS);
  logger.info({ tickMs: TICK_MS }, 'po watcher started');
  return () => clearInterval(id);
}
