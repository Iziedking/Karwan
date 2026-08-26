/// Proof-only repair for historical invoice-factoring ledger rows.
///
/// This command never submits a transaction and never marks an offer settled on
/// the basis of an application flag. It first checks a successful Arc receipt
/// for the exact USDC transfer, then reuses the existing KWN movement (or
/// creates one with the supplied on-chain hash) and idempotently projects the
/// user-facing activity rows.
///
/// Run a report first, inspect every `proof: yes`, then opt into writes:
///   npm run finance:backfill -- --invoice 0x...            (dry run)
///   npm run finance:backfill -- --invoice 0x... --execute

import { getDeal } from '../db/deals.js';
import { listAllFactoringOffers, type FactoringOffer } from '../db/factoring.js';
import { ensureSchema } from '../db/client.js';
import {
  financingOperationKey,
  inspectFinancingTransfer,
  projectFinancingActivity,
  recordVerifiedFinancingMovement,
} from '../money/financing.js';
import { factoringAdvanceRecipient } from '../routes/factoringRecipient.js';
import { config } from '../config.js';

const execute = process.argv.includes('--execute');

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1]?.trim();
}

const onlyOffer = flag('--offer')?.toLowerCase();
const onlyInvoice = flag('--invoice')?.toLowerCase();

function amount(value: string): string {
  return Number(value).toFixed(6);
}

function line(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function repairAdvance(offer: FactoringOffer, seller: string, recipient: string): Promise<void> {
  if (!offer.advanceTxHash) {
    line(`  advance: no hash recorded; skipped (no inference)`);
    return;
  }
  const proof = await inspectFinancingTransfer({
    txHash: offer.advanceTxHash,
    sourceAddress: offer.financier,
    destinationAddress: recipient,
    amountUsdc: offer.offeredAdvanceUsdc,
    contractAddress: config.KARWAN_INVOICE_REGISTRY_ADDR,
  });
  line(`  advance: ${offer.offeredAdvanceUsdc} USDC ${offer.financier} -> ${recipient}; proof: ${proof.ok ? 'yes' : `no (${proof.reason})`}`);
  if (!execute || !proof.ok) return;

  const movement = await recordVerifiedFinancingMovement({
    operationKey: financingOperationKey('factoring', offer.id, 'advance', offer.advanceTxHash),
    kind: 'financing_advance',
    positionId: offer.invoiceId,
    amountUsdc: amount(offer.offeredAdvanceUsdc),
    initiatedBy: seller,
    sourceAddress: offer.financier,
    destinationAddress: recipient,
    txHash: offer.advanceTxHash,
    contractAddress: config.KARWAN_INVOICE_REGISTRY_ADDR,
    summary: `Financing advance of ${offer.offeredAdvanceUsdc} USDC for invoice ${offer.invoiceId}`,
  });
  await projectFinancingActivity({
    offerId: offer.id,
    phase: 'advance-funded',
    address: offer.financier,
    kind: 'financing_funded',
    summary: `Funded a ${offer.offeredAdvanceUsdc} USDC advance against invoice ${offer.invoiceId}`,
    amountUsdc: amount(offer.offeredAdvanceUsdc),
    invoiceId: offer.invoiceId,
    txHash: offer.advanceTxHash,
    reference: movement.reference,
    counterparty: seller,
  });
  await projectFinancingActivity({
    offerId: offer.id,
    phase: 'advance-received',
    address: seller,
    kind: 'financing_received',
    summary: `Received a ${offer.offeredAdvanceUsdc} USDC advance against invoice ${offer.invoiceId}`,
    amountUsdc: amount(offer.offeredAdvanceUsdc),
    invoiceId: offer.invoiceId,
    txHash: offer.advanceTxHash,
    reference: movement.reference,
    counterparty: offer.financier,
  });
  line(`  advance: repaired movement ${movement.reference}`);
}

async function repairRepayment(offer: FactoringOffer, seller: string): Promise<void> {
  if (offer.status !== 'settled') {
    line(`  repayment: offer status ${offer.status}; no settlement backfill attempted`);
    return;
  }
  if (!offer.settleTxHash) {
    line(`  repayment: no settlement hash recorded; skipped (no inference)`);
    return;
  }

  const sources = [config.KARWAN_ESCROW_ADDR, seller]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.findIndex((other) => other.toLowerCase() === value.toLowerCase()) === index);
  for (const source of sources) {
    const proof = await inspectFinancingTransfer({
      txHash: offer.settleTxHash,
      sourceAddress: source,
      destinationAddress: offer.financier,
      amountUsdc: offer.expectedReturnUsdc,
      contractAddress: source.toLowerCase() === config.KARWAN_ESCROW_ADDR?.toLowerCase() ? config.KARWAN_ESCROW_ADDR : undefined,
    });
    line(`  repayment: ${offer.expectedReturnUsdc} USDC ${source} -> ${offer.financier}; proof: ${proof.ok ? 'yes' : `no (${proof.reason})`}`);
    if (!proof.ok || !execute) continue;
    const movement = await recordVerifiedFinancingMovement({
      operationKey: financingOperationKey('factoring', offer.id, 'repayment', offer.settleTxHash),
      kind: 'financing_repayment',
      positionId: offer.invoiceId,
      amountUsdc: amount(offer.expectedReturnUsdc),
      initiatedBy: seller,
      sourceAddress: source,
      destinationAddress: offer.financier,
      txHash: offer.settleTxHash,
      contractAddress: source.toLowerCase() === config.KARWAN_ESCROW_ADDR?.toLowerCase() ? config.KARWAN_ESCROW_ADDR : undefined,
      summary: `Financing repayment of ${offer.expectedReturnUsdc} USDC for invoice ${offer.invoiceId}`,
    });
    await projectFinancingActivity({
      offerId: offer.id,
      phase: 'repayment',
      address: offer.financier,
      kind: 'financing_repaid',
      summary: `Repaid ${offer.expectedReturnUsdc} USDC on invoice ${offer.invoiceId}`,
      amountUsdc: amount(offer.expectedReturnUsdc),
      invoiceId: offer.invoiceId,
      txHash: offer.settleTxHash,
      reference: movement.reference,
      counterparty: seller,
    });
    line(`  repayment: repaired movement ${movement.reference}`);
    return;
  }
}

async function run(): Promise<void> {
  await ensureSchema();
  const offers = (await listAllFactoringOffers()).filter((offer) =>
    (!onlyOffer || offer.id.toLowerCase() === onlyOffer) &&
    (!onlyInvoice || offer.invoiceId.toLowerCase() === onlyInvoice),
  );
  line(`factoring ledger backfill (${execute ? 'execute' : 'dry-run'}) — ${offers.length} offer(s)`);
  for (const offer of offers) {
    const deal = await getDeal(offer.invoiceId);
    if (!deal) {
      line(`${offer.id} invoice ${offer.invoiceId}: deal not found; skipped`);
      continue;
    }
    const seller = deal.seller.toLowerCase();
    const recipient = factoringAdvanceRecipient(deal);
    line(`${offer.id} invoice ${offer.invoiceId} status=${offer.status}`);
    await repairAdvance(offer, seller, recipient);
    await repairRepayment(offer, seller);
  }
  line(execute ? 'done: only exact proofs were written' : 'report only: no rows changed; rerun with --execute after review');
}

run().catch((error) => {
  process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
  process.exitCode = 1;
});
