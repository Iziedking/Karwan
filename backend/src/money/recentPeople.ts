import type { MoneyMovement } from './model.js';

type SendLike = Pick<MoneyMovement, 'kind' | 'state' | 'initiatedBy' | 'participants' | 'createdAt' | 'updatedAt' | 'completedAt'>;

/// Who the viewer paid, newest first and each once (view 50): the recipients
/// of their own completed sends, never themselves or their own wallets.
export function recentRecipients(movements: readonly SendLike[], viewer: string, ownWallets: ReadonlySet<string> = new Set()): string[] {
  const me = viewer.toLowerCase();
  const own = new Set([...ownWallets].map((w) => w.toLowerCase()));
  const sends = movements
    .filter((m) => (m.kind === 'cash_out' || m.kind === 'bridge') && m.state === 'completed' && m.initiatedBy.toLowerCase() === me)
    .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));
  const seen: string[] = [];
  for (const m of sends) {
    const to = m.participants.find((p) => p.role === 'recipient')?.address.toLowerCase();
    if (!to || to === me || own.has(to) || seen.includes(to)) continue;
    seen.push(to);
  }
  return seen;
}
