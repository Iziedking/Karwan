import type { AppNotification } from './hooks/useNotifications';
import { WALLET_TYPES } from './notificationTypes';

export interface NotificationGroup {
  /// The newest note in the run; its words and time stand for the group.
  lead: AppNotification;
  ids: string[];
  count: number;
  /// Read only when every note in the run is.
  read: boolean;
}

/// Notes that say the same thing, back to back, fold into one row with a
/// count, so five identical deposits read as one line. Money notes each open
/// their own receipt, so they fold on their words and the row opens the
/// newest; any other note folds only when it opens the same place.
export function groupNotifications(list: AppNotification[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  for (const n of list) {
    const last = groups.at(-1);
    if (last && last.lead.type === n.type && last.lead.summary === n.summary && (WALLET_TYPES.has(n.type) || last.lead.href === n.href)) {
      last.ids.push(n.id);
      last.count += 1;
      last.read = last.read && n.read;
      continue;
    }
    groups.push({ lead: n, ids: [n.id], count: 1, read: n.read });
  }
  return groups;
}

/// Saved notes plus the server's latest copy of them, newest first. A fresh
/// copy brings its current words and link, so old wording never lingers; a
/// note read on this device stays read.
export function mergeNotifications(saved: AppNotification[], fresh: AppNotification[], max: number): AppNotification[] {
  const byId = new Map(saved.map((n) => [n.id, n]));
  for (const n of fresh) {
    const old = byId.get(n.id);
    byId.set(n.id, old ? { ...old, summary: n.summary, href: n.href, read: old.read || n.read } : n);
  }
  return [...byId.values()].sort((a, b) => b.ts - a.ts).slice(0, max);
}

const OLD_WALLET: Record<string, string> = {
  'identity wallet': 'balance',
  wallet: 'balance',
  'buyer agent wallet': 'buying agent',
  'seller agent wallet': 'selling agent',
};

/// Notes saved on this device before the plain wording keep their old text;
/// read them back in today's words. Other languages only lose the sign.
export function plainSavedSummary(summary: string): string {
  const en = /^[+-]?([\d.,]+) USDC (landed in|left) your (identity wallet|buyer agent wallet|seller agent wallet|wallet)\.$/.exec(summary);
  if (en) return `${en[1]} USDC ${en[2] === 'left' ? 'left' : 'arrived in'} your ${OLD_WALLET[en[3]]}.`;
  return /^[+-][\d]/.test(summary) ? summary.slice(1) : summary;
}
