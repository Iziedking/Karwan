import type { AdminAccountRow, AdminAccountStatus } from '@/core/api';
import type { PillTone } from './desk/StatusPill';

/// Accounts on the desk (view 79): the lists, the status words, the search.

export type AccountView = 'all' | 'stuck' | 'new' | 'setting_up' | 'paused';

const WEEK = 7 * 86_400_000;

export const ACCOUNT_VIEWS: { key: AccountView; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'stuck', label: 'Money stuck' },
  { key: 'new', label: 'New this week' },
  { key: 'setting_up', label: 'Setting up' },
  { key: 'paused', label: 'Paused' },
];

export const ACCOUNT_STATUS: Record<AdminAccountStatus, { label: string; tone: PillTone }> = {
  money_stuck: { label: 'Money stuck', tone: 'red' },
  paused: { label: 'Paused', tone: 'amber' },
  setting_up: { label: 'Setting up', tone: 'grey' },
  active: { label: 'Active', tone: 'green' },
};

export function looksLikeEmail(q: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim());
}

export function accountsShown(rows: AdminAccountRow[], view: AccountView, query: string, now: number): AdminAccountRow[] {
  const q = query.trim().toLowerCase().replace(/^@/, '');
  if (q) {
    return rows.filter((r) => r.name.toLowerCase().includes(q) || (r.handle ?? '').toLowerCase().includes(q) || r.address.toLowerCase().includes(q));
  }
  switch (view) {
    case 'all':
      return rows;
    case 'stuck':
      return rows.filter((r) => r.status === 'money_stuck');
    case 'new':
      return rows.filter((r) => now - r.joinedAt <= WEEK);
    case 'setting_up':
      return rows.filter((r) => r.status === 'setting_up');
    case 'paused':
      return rows.filter((r) => r.status === 'paused');
  }
}

export function recordLine(r: { dealsDone: number; onTime: number }): string {
  if (r.dealsDone === 0) return 'No deals yet';
  const deals = `${r.dealsDone} ${r.dealsDone === 1 ? 'deal' : 'deals'}`;
  if (r.onTime === r.dealsDone) return r.dealsDone === 1 ? `${deals}, on time` : `${deals}, all on time`;
  return `${deals}, ${r.onTime} on time`;
}
