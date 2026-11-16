import type { NextMoveCopyKind, SetupCopyKey } from '@/shared/i18n/messages/nextMove';
import type { AmanMood } from './amanDots';
import { isMoneyFlow } from './amanMotion';

/// The six steps to fully set up (backend guide/setupSteps.ts, view 57, 15 Nov).
export type SetupKey = SetupCopyKey;
export interface SetupView {
  steps: { key: SetupKey; done: boolean; href: string }[];
  next: SetupKey | null;
  complete: boolean;
  known: boolean;
}

export type NextMoveKind = NextMoveCopyKind | 'setup_step';

/// One move from the server's rules (backend guide/nextMove.ts).
export interface NextMove {
  kind: NextMoveKind;
  ref?: string;
  href: string;
  /// The setup step a setup_step move names.
  step?: SetupKey;
  amountUsdc?: string;
  agreedLocal?: { currency: string; amount: string; rate: string; at: number };
  days?: number;
  count?: number;
}

/// One notable thing on the account, said once (backend guide/moments.ts, view 57, 15 Nov evening).
export interface Moment {
  id: string;
  at: number;
  mood: 'excited' | 'sad' | 'hurt';
  line: 'paid' | 'released' | 'tier' | 'lapsed' | 'late' | 'pocketPaid';
  href: string;
  amountUsdc?: string;
}

export interface Nudge {
  key: string;
  kind: NextMoveKind | 'moment';
  moment?: Moment;
  href: string;
  step?: SetupKey;
  amountUsdc?: string;
  agreedLocal?: NextMove['agreedLocal'];
  days?: number;
  count?: number;
}

export const nudgeKey = (m: { kind: string; ref?: string; step?: string }) => `${m.kind}:${m.ref ?? m.step ?? ''}`;

const samePage = (pathname: string, href: string) => pathname.replace(/\/$/, '') === href.replace(/[#?].*$/, '').replace(/\/$/, '');

/// What Aman says (view 57): the first move not already on screen and not
/// closed this visit. The server ranks deal moves, then the next setup step,
/// then market moves.
export function pickNudge(input: { moves: readonly NextMove[]; pathname: string; closed: ReadonlySet<string>; moment?: Moment | null }): Nudge | null {
  const open = input.moves.filter((m) => !input.closed.has(nudgeKey(m)) && !samePage(input.pathname, m.href));
  const deal = open.find((m) => DEAL_MOVES.has(m.kind));
  if (deal) return { key: nudgeKey(deal), ...deal };
  // A moment comes before setup and market moves (view 57, 15 Nov evening).
  const m = input.moment;
  if (m && !input.closed.has(`moment:${m.id}`)) return { key: `moment:${m.id}`, kind: 'moment', href: m.href, moment: m, ...(m.amountUsdc ? { amountUsdc: m.amountUsdc } : {}) };
  const top = open[0];
  if (!top) return null;
  return { key: nudgeKey(top), ...top };
}

/// Aman's face for what it says: the moment's own, waiting for a deal that
/// waits on the person, talking for the rest.
export function moodFor(n: Nudge): AmanMood {
  if (n.kind === 'moment' && n.moment) return n.moment.mood;
  return DEAL_MOVES.has(n.kind) ? 'waiting' : 'talking';
}

/// The day's hello: once a local day, on Home only, never where money moves.
export function helloDue(lastHelloOn: string | undefined, today: string, pathname: string): boolean {
  return pathname.replace(/\/$/, '') === '/app' && !isMoneyFlow(pathname) && lastHelloOn !== today;
}

/// True once the server stops naming the setup step Aman last spoke about: the
/// person did it, so Aman can be pleased for a moment (view 57, 15 Nov).
export function stepFinished(spoken: SetupKey | null, moves: readonly NextMove[]): boolean {
  if (!spoken) return false;
  return !moves.some((m) => m.kind === 'setup_step' && m.step === spoken);
}

const DEAL_MOVES: ReadonlySet<NextMoveKind | 'moment'> = new Set([
  'dispute_statement',
  'approve_delivery',
  'answer_cancel',
  'answer_extension',
  'take_back',
  'fund_deal',
  'agree_terms',
  'deliver_soon',
]);

/// The part of the page a move is about (a `data-guide-anchor` value), so Aman
/// sits beside it (view 57). A web concern only: the server's moves stay as they are.
export function anchorFor(n: Nudge): string | null {
  if (n.kind === 'moment') return null;
  if (n.kind === 'setup_step') return n.step === 'money' ? 'balance' : n.step === 'agent_money' || n.step === 'agent_limits' ? 'agent' : null;
  if (n.kind === 'choose_offer' || n.kind === 'approve_match') {
    const ref = n.key.slice(n.key.indexOf(':') + 1);
    return ref ? `request:${ref}` : null;
  }
  return DEAL_MOVES.has(n.kind) ? 'deal-move' : null;
}
