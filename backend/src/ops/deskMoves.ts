import type { LocalAmount } from '../rates/quote.js';
import type { MoneyMovement, MoneyMovementKind } from '../money/model.js';
import { lagosMidnight } from './deskHome.js';

/// Money moves on the desk (view 79). A row is an allowlist: it never carries
/// wallet ids, provider ids, operation keys, summaries or participants.

export type DeskMoveStatus = 'stuck' | 'moving' | 'failed' | 'done';

export interface DeskMoveRow {
  reference: string;
  what: string;
  who: string;
  amountUsdc: string;
  local?: LocalAmount;
  route: string;
  since: number;
  status: DeskMoveStatus;
  statusLabel: string;
  txHashes: string[];
}

const HOUR = 3_600_000;

const WHAT: Record<MoneyMovementKind, string> = {
  deposit: 'Top-up',
  cash_out: 'Withdraw',
  owed_withdrawal: 'Withdraw what is owed',
  bridge: 'Move to another network',
  escrow_funding: 'Pay into a deal',
  milestone_payout: 'Deal payout',
  escrow_refund: 'Deal refund',
  agent_funding: 'Fund an agent',
  stake: 'Stake',
  financing_advance: 'Financing advance',
  financing_repayment: 'Financing repayment',
};

const LEAVES: ReadonlySet<MoneyMovementKind> = new Set(['cash_out', 'owed_withdrawal', 'bridge']);

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

function usdc(micros: string): string {
  const n = BigInt(micros);
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}

function routeOf(m: MoneyMovement): string {
  const offArc = m.legs.some((l) => l.rail === 'cctp' || l.rail === 'gateway');
  if (m.kind === 'deposit') return offArc ? 'Another network → Arc' : 'Arc';
  if (m.kind === 'bridge') return 'Arc → another network';
  if (m.kind === 'cash_out' || m.kind === 'owed_withdrawal') return 'Arc → outside';
  return 'Arc';
}

function statusOf(m: MoneyMovement, now: number): { status: DeskMoveStatus; statusLabel: string; since: number } {
  if (m.state === 'completed') return { status: 'done', statusLabel: 'Done', since: m.completedAt ?? m.updatedAt };
  if (m.state === 'cancelled') return { status: 'failed', statusLabel: 'Did not go through', since: m.cancelledAt ?? m.updatedAt };
  if (m.state === 'needs_attention') return { status: 'stuck', statusLabel: m.attempt >= 2 ? 'Failed twice' : 'Needs a person', since: m.createdAt };
  const due = m.expectedArrivalAt ?? m.createdAt + HOUR;
  if (now > due) {
    const left = LEAVES.has(m.kind) && m.legs.some((l) => l.txHash && (l.state === 'confirmed' || l.state === 'verified'));
    return { status: 'stuck', statusLabel: left ? 'Left, not arrived' : 'Late', since: m.createdAt };
  }
  return { status: 'moving', statusLabel: m.state === 'verifying' ? 'Waiting on network' : 'Moving', since: m.createdAt };
}

export function deskMoveRow(m: MoneyMovement, now: number, handleOf: (address: string) => string | null): DeskMoveRow {
  const handle = handleOf(m.initiatedBy.toLowerCase()) ?? handleOf(m.initiatedBy);
  return {
    reference: m.reference,
    what: WHAT[m.kind] ?? 'Money move',
    who: handle ? `@${handle}` : short(m.initiatedBy),
    amountUsdc: usdc(m.amountMicros),
    ...(m.local ? { local: m.local } : {}),
    route: routeOf(m),
    ...statusOf(m, now),
    txHashes: m.legs.flatMap((l) => (l.txHash ? [l.txHash] : [])),
  };
}

const ORDER: Record<DeskMoveStatus, number> = { stuck: 0, moving: 1, failed: 2, done: 3 };

/// Stuck first, oldest first; then moving, failed, and what finished today
/// (from midnight in Lagos).
export function deskMoves(movements: MoneyMovement[], now: number, handleOf: (address: string) => string | null) {
  const midnight = lagosMidnight(now);
  const rows = movements
    .map((m) => deskMoveRow(m, now, handleOf))
    .filter((r) => r.status !== 'done' || r.since >= midnight)
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.status === 'stuck' ? a.since - b.since : b.since - a.since));
  const count = (s: DeskMoveStatus) => rows.filter((r) => r.status === s).length;
  return { rows, counts: { stuck: count('stuck'), moving: count('moving'), failed: count('failed'), done: count('done') } };
}
