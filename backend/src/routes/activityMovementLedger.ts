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

export function movementToPersonalLedgerItem(
  movement: MoneyMovement,
  viewerAddress?: string,
): PersonalLedgerItem {
  const viewer = viewerAddress?.toLowerCase();
  let kind: string = movement.kind;
  const leg = movement.legs.find((candidate) => candidate.attempt === movement.attempt);
  const source = leg?.sourceAddress?.toLowerCase();
  const destination = leg?.destinationAddress?.toLowerCase();
  if (movement.kind === 'financing_repayment' && viewer) {
    // The durable kind names the rail; the UI kind names the user's view.
    if (viewer === destination) kind = 'financing_repaid';
    else if (viewer === source) kind = 'financing_repayment_sent';
  } else if (movement.kind === 'financing_advance' && viewer) {
    if (viewer === destination || (viewer === movement.initiatedBy.toLowerCase() && viewer !== source)) kind = 'financing_received';
    else if (viewer === source) kind = 'financing_funded';
  }
  return {
    id: movement.reference,
    ts: movement.completedAt ?? movement.updatedAt,
    kind,
    summary: movement.summary,
    params: null,
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
): PersonalLedgerItem[] {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit) || 100));
  const references = new Set(
    movements.map((movement) => movement.reference.toUpperCase()),
  );
  const preserved = legacy.filter(
    (item) => !item.refId || !references.has(item.refId.toUpperCase()),
  );
  return [...preserved, ...movements.map((movement) => movementToPersonalLedgerItem(movement, viewerAddress))]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, safeLimit);
}
