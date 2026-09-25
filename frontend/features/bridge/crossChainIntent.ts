export type CrossChainIntent = 'add' | 'move' | 'send' | 'pay';

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/// A transfer older than this, still in flight, is not what a returning person
/// came for. It stays in Transfer history instead of taking over the page.
export const RESUME_WINDOW_MS = 60 * 60_000;

/// What the page is for, from its link. Links from before this page (the old
/// direction and intent pair, a payment request's recipient) keep landing on the
/// right thing.
export function intentFromParams(params: URLSearchParams): CrossChainIntent {
  const asked = params.get('intent');
  if (asked === 'add' || asked === 'move' || asked === 'send' || asked === 'pay') return asked;
  if (ADDRESS.test(params.get('recipient') ?? '')) return 'pay';
  if (params.get('direction') === 'out') return 'move';
  return 'add';
}

export function amountFromParams(params: URLSearchParams): number | null {
  const value = Number(params.get('amount'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

type TransferRecord = {
  id: string;
  startedAt: number;
  direction?: 'in' | 'out';
  sourceChainKey: string;
  phase: string;
};

/// The transfer this page just started. The pipeline's start functions do not
/// return the record id, so the page finds the record that appeared after its
/// own press. Records are kept newest first.
export function startedRecord<T extends TransferRecord>(
  records: readonly T[],
  since: number,
  match: { direction: 'in' | 'out'; chainKey: string },
): T | null {
  return (
    records.find(
      (r) => r.startedAt >= since && (r.direction ?? 'in') === match.direction && r.sourceChainKey === match.chainKey,
    ) ?? null
  );
}

const FINISHED = new Set(['done', 'error']);

/// The transfer to show when a person comes back to the page: the newest one
/// still in flight from the last hour, going the way this page goes (a deposit
/// arriving must not take over the Send page). Same-chain sends finish in the
/// sheet and never resume here.
export function resumableRecord<T extends TransferRecord>(
  records: readonly T[],
  now: number,
  direction: 'in' | 'out',
): T | null {
  return (
    records.find(
      (r) =>
        !FINISHED.has(r.phase) &&
        now - r.startedAt <= RESUME_WINDOW_MS &&
        r.sourceChainKey !== 'arc' &&
        (r.direction ?? 'in') === direction,
    ) ?? null
  );
}

/// Whether a notification will come when this transfer lands. Arrivals reach
/// the account that receives them: money coming onto Arc, or moved to the
/// person's own wallet elsewhere. A send or payment to someone else does not.
export function willNotifyOnArrival(intent: CrossChainIntent): boolean {
  return intent === 'add' || intent === 'move';
}
