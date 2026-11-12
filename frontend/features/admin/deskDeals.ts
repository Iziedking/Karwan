import type { AdminDealRow, AdminDisputeRow } from '@/core/api';
import type { PillTone } from './desk/StatusPill';

/// Deals and Disputes on the desk (view 79): the words for each deal and the
/// ready-made lists.

export type DealView = 'progress' | 'buyer' | 'late' | 'dispute' | 'done';

export interface DealLine {
  view: DealView;
  step: string;
  status: string;
  tone: PillTone;
}

const DAY = 86_400_000;

export const DEAL_VIEWS: { key: DealView; label: string }[] = [
  { key: 'progress', label: 'In progress' },
  { key: 'buyer', label: 'Waiting on the buyer' },
  { key: 'late', label: 'Late' },
  { key: 'dispute', label: 'In dispute' },
  { key: 'done', label: 'Done' },
];

const STEP: Record<string, string> = {
  open: 'Waiting for the seller',
  accepted: 'Work started',
  delivered: 'Delivered, buyer checks',
  disputed: 'Statements in',
  settled: 'Paid out',
  cancelled: 'Cancelled',
};

export function dealLine(d: AdminDealRow, now: number): DealLine {
  const step = STEP[d.stage] ?? d.stage;
  if (d.stage === 'settled') return { view: 'done', step, status: 'Done', tone: 'green' };
  if (d.stage === 'cancelled') return { view: 'done', step, status: 'Cancelled', tone: 'grey' };
  if (d.stage === 'disputed' || d.disputed) return { view: 'dispute', step: STEP.disputed!, status: 'In dispute', tone: 'red' };
  if (d.dueAt !== null && now > d.dueAt) {
    const days = Math.floor((now - d.dueAt) / DAY);
    return { view: 'late', step, status: days >= 1 ? `Late ${days} ${days === 1 ? 'day' : 'days'}` : 'Late today', tone: 'red' };
  }
  if (d.stage === 'delivered') return { view: 'buyer', step, status: 'Waiting on buyer', tone: 'amber' };
  if (d.stage === 'open') return { view: 'progress', step, status: 'Not started', tone: 'grey' };
  return { view: 'progress', step, status: 'On time', tone: 'green' };
}

/// In progress holds every deal that is still open (late and waiting ones too);
/// a search looks across every list.
export function dealsShown(rows: AdminDealRow[], view: DealView, query: string, now: number): AdminDealRow[] {
  const q = query.trim().toLowerCase().replace(/^@/, '');
  if (q) {
    return rows.filter((d) =>
      d.jobId.toLowerCase().includes(q)
      || d.title.toLowerCase().includes(q)
      || (d.buyerTag ?? '').toLowerCase().includes(q)
      || (d.sellerTag ?? '').toLowerCase().includes(q),
    );
  }
  return rows.filter((d) => {
    const v = dealLine(d, now).view;
    if (view === 'progress') return v === 'progress' || v === 'buyer' || v === 'late';
    return v === view;
  });
}

export type DisputeView = 'ruling' | 'waiting';

export const DISPUTE_VIEWS: { key: DisputeView; label: string }[] = [
  { key: 'ruling', label: 'Needs a ruling' },
  { key: 'waiting', label: 'Waiting on a party' },
];

/// Ready to rule once both sides have given their account or the judge has
/// proposed a ruling; otherwise it waits on whoever has not spoken.
export function disputeList(rows: AdminDisputeRow[], view: DisputeView): AdminDisputeRow[] {
  const ready = (d: AdminDisputeRow) => Boolean(d.proposal) || Boolean(d.statements?.buyer && d.statements?.seller);
  return rows.filter((d) => (view === 'ruling' ? ready(d) : !ready(d)));
}
