import { formatUsdcMicros, type MoneyMovement } from '../money/model.js';

export interface PersonalLedgerItem {
  id: string;
  ts: number;
  kind: string;
  summary: string;
  params: Record<string, string> | null;
  amountUsdc: string | null;
  txHash: string | null;
  refId: string | null;
  chain: string | null;
  jobId: string | null;
  status: 'done' | 'pending' | 'failed';
  movementState: MoneyMovement['state'] | null;
}

function statusFor(state: MoneyMovement['state']): PersonalLedgerItem['status'] {
  if (state === 'completed') return 'done';
  if (state === 'needs_attention' || state === 'cancelled') return 'failed';
  return 'pending';
}

function receiptHash(movement: MoneyMovement): string | null {
  return (
    [...movement.legs]
      .filter((leg) => leg.attempt === movement.attempt && leg.txHash)
      .sort(
        (a, b) =>
          (b.verifiedAt ?? b.confirmedAt ?? b.submittedAt ?? 0) -
          (a.verifiedAt ?? a.confirmedAt ?? a.submittedAt ?? 0),
      )[0]?.txHash ?? null
  );
}

/// How a counterparty reads on a ledger row: their Karwan tag when they have
/// one, otherwise the shortened address.
export function counterpartyLabel(address: string, names?: ReadonlyMap<string, string>): string {
  const key = address.toLowerCase();
  const handle = names?.get(key);
  if (handle) return `@${handle}`;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

/// The other party of a direct USDC transfer on Arc, which is the only leg a
/// send or an Arc withdrawal has. Null for anything else.
export function transferCounterparty(movement: MoneyMovement): { from: string; to: string } | null {
  if (movement.kind !== 'cash_out') return null;
  const leg = movement.legs.find((candidate) => candidate.attempt === movement.attempt && candidate.key === 'arc_transfer');
  if (!leg?.destinationAddress) return null;
  return { from: movement.initiatedBy.toLowerCase(), to: leg.destinationAddress.toLowerCase() };
}

export function movementToPersonalLedgerItem(
  movement: MoneyMovement,
  viewerAddress?: string,
  names?: ReadonlyMap<string, string>,
): PersonalLedgerItem {
  const viewer = viewerAddress?.toLowerCase();
  let kind: string = movement.kind;
  let params: Record<string, string> | null = null;
  const leg = movement.legs.find((candidate) => candidate.attempt === movement.attempt);
  const source = leg?.sourceAddress?.toLowerCase();
  const destination = leg?.destinationAddress?.toLowerCase();
  if (movement.kind === 'financing_repayment' && viewer) {
    // The durable kind names the rail; the UI kind names the user's view.
    if (viewer === destination) kind = 'financing_repaid';
    else if (viewer === source) kind = 'financing_repayment_sent';
  } else if (movement.kind === 'cash_out' && viewer && transferCounterparty(movement)) {
    // One transfer, two readers: the sender sent it, the recipient received it.
    const transfer = transferCounterparty(movement)!;
    const amount = formatUsdcMicros(movement.amountMicros);
    if (viewer === transfer.to && viewer !== transfer.from) {
      kind = 'transfer_in';
      params = { t: 'received', amount, who: counterpartyLabel(transfer.from, names) };
    } else {
      kind = 'transfer_out';
      params = { t: 'sent', amount, who: counterpartyLabel(transfer.to, names) };
    }
  } else if (movement.kind === 'financing_advance' && viewer) {
    if (viewer === destination || (viewer === movement.initiatedBy.toLowerCase() && viewer !== source)) kind = 'financing_received';
    else if (viewer === source) kind = 'financing_funded';
  } else if (movement.kind === 'milestone_payout' && viewer) {
    // A payout is one durable movement with two user-facing meanings: the
    // buyer released funds, while the seller received them. Resolve the
    // direction from the recorded party role instead of guessing in the UI.
    const party = movement.participants.find(
      (candidate) => candidate.address.toLowerCase() === viewer,
    );
    if (party?.role === 'recipient') kind = 'payout';
    else if (party?.role === 'buyer') kind = 'release';
  } else if (movement.kind === 'escrow_funding' && viewer) {
    const party = movement.participants.find(
      (candidate) => candidate.address.toLowerCase() === viewer,
    );
    if (party?.role === 'buyer') kind = 'release';
  } else if (movement.kind === 'escrow_refund' && viewer) {
    const party = movement.participants.find(
      (candidate) => candidate.address.toLowerCase() === viewer,
    );
    if (party?.role === 'owner' || party?.role === 'recipient' || party?.role === 'buyer') {
      kind = 'refund';
    }
  }
  return {
    id: movement.reference,
    ts: movement.completedAt ?? movement.updatedAt,
    kind,
    summary: movement.summary,
    params,
    amountUsdc: formatUsdcMicros(movement.amountMicros),
    txHash: receiptHash(movement),
    refId: movement.reference,
    chain: 'arc',
    jobId: movement.jobId ?? null,
    status: statusFor(movement.state),
    movementState: movement.state,
  };
}

/**
 * Movement projections were written to activity_log during the migration.
 * Remove only rows carrying the same immutable reference, then add the
 * durable movement itself. Historical rows without a reference stay intact.
 */
export function mergeMovementLedger(
  legacy: readonly PersonalLedgerItem[],
  movements: readonly MoneyMovement[],
  limit: number,
  viewerAddress?: string,
  names?: ReadonlyMap<string, string>,
): PersonalLedgerItem[] {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit) || 100));
  const references = new Set(
    movements.map((movement) => movement.reference.toUpperCase()),
  );
  const preserved = legacy.filter(
    (item) => !item.refId || !references.has(item.refId.toUpperCase()),
  );
  return [...preserved, ...movements.map((movement) => movementToPersonalLedgerItem(movement, viewerAddress, names))]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, safeLimit);
}
