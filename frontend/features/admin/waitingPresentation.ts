import type { AdminMoneyRequest } from '@/core/api';
import { deskTime } from './desk/homeWords';

/// Waiting for you (view 79): each request a second teammate decides, in
/// plain words. The rule itself lives on the backend (middleware/twoPeople.ts).

export type WaitingTab = 'waiting' | 'approved' | 'turned_down';

export interface WaitingCard {
  kindLabel: string;
  askedBy: string;
  title: string;
  line: string;
  caseRef: string | null;
  ref: string | null;
  amountUsdc: string | null;
  canApprove: boolean;
  note: string | null;
  outcome: string | null;
}

const CASE_REF = /^(K[ST]-\d{4,})\s*:\s*/;

function kindOf(action: string): string {
  if (action.startsWith('payout')) return 'Payout retry';
  if (action === 'release') return 'Release';
  if (action === 'resolve') return 'Rule a dispute';
  if (action === 'force-cancel') return 'Close a deal';
  if (action === 'account-unpause') return 'Lift a pause';
  if (action === 'deal-rules-off') return 'Deal rules off';
  if (action.startsWith('usyc') || action.startsWith('treasury')) return 'Treasury move';
  if (action.startsWith('attestation') || action.startsWith('reputation')) return 'Chain write';
  return 'Money move';
}

function nameOf(p: { email: string | null; name: string | null } | undefined): string {
  return p?.name ?? p?.email ?? 'a teammate';
}

function dealOf(path: string): string | null {
  const id = path.match(/\/deals\/([^/]+)\//)?.[1];
  if (!id) return null;
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

function amountOf(body: unknown): string | null {
  const v = (body as { amountUsdc?: unknown } | null)?.amountUsdc;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) return v;
  return null;
}

function outcomeOf(r: AdminMoneyRequest): string | null {
  switch (r.status) {
    case 'pending':
      return null;
    case 'running':
      return `Approved by ${nameOf(r.approvedBy)}. Running.`;
    case 'done':
      return `Approved by ${nameOf(r.approvedBy)}. Done.`;
    case 'failed':
      return `Approved by ${nameOf(r.approvedBy)}. It did not go through.`;
    case 'turned_down':
      return `Turned down by ${nameOf(r.turnedDownBy)}.`;
    case 'cancelled':
      return `Withdrawn by ${nameOf(r.requestedBy)}.`;
    case 'expired':
      return 'Nobody approved it within 24 hours.';
    case 'refused':
      return 'Refused: the deal changed after it was asked for.';
  }
}

export function waitingCard(r: AdminMoneyRequest, meId: string | null, now: number): WaitingCard {
  const caseRef = r.reason.match(CASE_REF)?.[1] ?? null;
  const deal = dealOf(r.path);
  const ref = [caseRef, deal ? `deal ${deal}` : null].filter(Boolean).join(' · ') || null;
  const mine = meId !== null && r.requestedBy.memberId === meId;
  return {
    kindLabel: kindOf(r.action),
    askedBy: `Asked by ${nameOf(r.requestedBy)} · ${deskTime(r.requestedAt, now)}`,
    title: r.label,
    line: r.reason.replace(CASE_REF, ''),
    caseRef,
    ref,
    amountUsdc: amountOf(r.body),
    canApprove: !mine,
    note: mine ? 'You asked for this. Someone else approves it.' : null,
    outcome: outcomeOf(r),
  };
}

/// Approved holds what a second teammate let run; Turned down holds every
/// request that will never run, each with how it ended.
export function waitingTab(r: AdminMoneyRequest): WaitingTab {
  if (r.status === 'pending') return 'waiting';
  if (r.status === 'running' || r.status === 'done' || r.status === 'failed') return 'approved';
  return 'turned_down';
}

export function waitingTabs(rows: AdminMoneyRequest[]): { key: WaitingTab; label: string; count: number }[] {
  const count = (key: WaitingTab) => rows.filter((r) => waitingTab(r) === key).length;
  return [
    { key: 'waiting', label: 'Waiting', count: count('waiting') },
    { key: 'approved', label: 'Approved', count: count('approved') },
    { key: 'turned_down', label: 'Turned down', count: count('turned_down') },
  ];
}
