import type { AssistantTipsCopy, TipKind } from '../i18n/messages/assistantTips';

const KINDS: TipKind[] = ['deal', 'money', 'safety', 'record'];

const PAGES: Array<[TipKind, string[]]> = [
  ['deal', ['/deals', '/jobs']],
  ['money', ['/account', '/add', '/send', '/pocket', '/money']],
  ['safety', ['/profile/security', '/settings']],
  ['record', ['/record']],
];

/// The kind of tip that fits the page the person came from, if any.
export function tipKindFor(from: string | null): TipKind | null {
  if (!from) return null;
  const path = from.split(/[?#]/)[0]!;
  for (const [kind, prefixes] of PAGES) {
    if (prefixes.some((p) => path === p || path.startsWith(`${p}/`))) return kind;
  }
  return null;
}

/// Every tip once: the page's own kind first, then the rest, each list turned
/// by the seed so the same tip is not always first (view 84).
export function pickTips(from: string | null, seed: number, tips: AssistantTipsCopy): { kind: TipKind; text: string }[] {
  const first = tipKindFor(from);
  const order = first ? [first, ...KINDS.filter((k) => k !== first)] : rotate(KINDS, seed);
  return order.flatMap((kind) => rotate(tips[kind], seed).map((text) => ({ kind, text })));
}

function rotate<T>(list: readonly T[], seed: number): T[] {
  if (list.length === 0) return [];
  const n = ((Math.trunc(seed) % list.length) + list.length) % list.length;
  return [...list.slice(n), ...list.slice(0, n)];
}
