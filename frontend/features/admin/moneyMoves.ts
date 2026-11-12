import type { AdminMoneyMove } from '@/core/api';

export type MoveView = AdminMoneyMove['status'];

export const MOVE_VIEWS: { key: MoveView; label: string }[] = [
  { key: 'stuck', label: 'Stuck' },
  { key: 'moving', label: 'Moving' },
  { key: 'failed', label: 'Did not go through' },
  { key: 'done', label: 'Done today' },
];

/// A chip's rows; a search looks across every chip, so a teammate finds a
/// move without knowing its state.
export function movesShown(rows: AdminMoneyMove[], view: MoveView, query: string): AdminMoneyMove[] {
  const q = query.trim().toLowerCase().replace(/^@/, '');
  if (!q) return rows.filter((r) => r.status === view);
  return rows.filter((r) =>
    r.who.toLowerCase().replace(/^@/, '').includes(q)
    || r.reference.toLowerCase().includes(q)
    || r.amountUsdc === q
    || r.amountUsdc.startsWith(`${q}.`)
    || r.txHashes.some((h) => h.toLowerCase().includes(q)),
  );
}
