import type { NextMoveCopyKind } from '@/shared/i18n/messages/nextMove';

/// One move from the server's rules (backend guide/nextMove.ts).
export interface NextMove {
  kind: Exclude<NextMoveCopyKind, 'add_money'>;
  ref?: string;
  href: string;
  amountUsdc?: string;
  agreedLocal?: { currency: string; amount: string; rate: string; at: number };
  days?: number;
  count?: number;
}

export interface Nudge {
  key: string;
  kind: NextMoveCopyKind;
  href: string;
  amountUsdc?: string;
  agreedLocal?: NextMove['agreedLocal'];
  days?: number;
  count?: number;
}

export const nudgeKey = (m: { kind: string; ref?: string }) => `${m.kind}:${m.ref ?? ''}`;

const samePage = (pathname: string, href: string) => pathname.replace(/\/$/, '') === href.replace(/[#?].*$/, '').replace(/\/$/, '');

/// What the nudge shows (view 57): the first move not already on screen and
/// not closed this visit. With nothing above "start", an empty balance asks
/// for money first.
export function pickNudge(input: {
  moves: readonly NextMove[];
  balanceTotal: number | null;
  pathname: string;
  closed: ReadonlySet<string>;
}): Nudge | null {
  const open = input.moves.filter((m) => !input.closed.has(nudgeKey(m)) && !samePage(input.pathname, m.href));
  const top = open[0];
  if ((!top || top.kind === 'first_post') && input.balanceTotal === 0 && input.moves.every((m) => m.kind === 'first_post')) {
    const add: Nudge = { key: 'add_money:', kind: 'add_money', href: '/add' };
    if (!input.closed.has(add.key) && !samePage(input.pathname, add.href)) return add;
  }
  if (!top) return null;
  return { key: nudgeKey(top), ...top };
}
