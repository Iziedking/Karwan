/// How often Aman explains a part on its own (view 57, 19 Nov): it counts each
/// person's visits to each page and comes on visits 1, 2, 4 and 8, about half
/// as often each time, then not on its own there. Someone who knows Karwan
/// gets a check-in now and then instead. Counts live on the account; when a
/// page was last counted lives on the device.

export const VISIT_SCHEDULE = [1, 2, 4, 8] as const;
export const VISIT_GAP_MS = 30 * 60_000;
export const CHECK_IN_MS = 14 * 86_400_000;
export const SEEN_AT_KEY = 'karwan:aman:seen-at';

const MAX_PAGES = 200;
const MAX_HEARD = 300;
const KNOWN_VISITS = 8;
const KNOWN_PAGES = 4;
const PAGE_KEY = /^[a-z0-9/*._-]{1,80}$/;
const PART_ID = /^[a-z0-9-]{2,40}$/;
const ID_SEGMENT = /^(0x[0-9a-f]+|\d+|[0-9a-f-]{16,}|[A-Za-z0-9_-]{20,})$/i;

export function pageKey(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] || '/';
  const parts = path.split('/').filter(Boolean).map((s) => (ID_SEGMENT.test(s) ? '*' : s.toLowerCase()));
  return parts.length ? `/${parts.join('/')}` : '/';
}

export const comesOnVisit = (n: number): boolean => (VISIT_SCHEDULE as readonly number[]).includes(n);

export function countVisit(a: { counts: Record<string, number>; seenAt: Record<string, number>; key: string; now: number }): {
  counts: Record<string, number>; seenAt: Record<string, number>; counted: boolean; visit: number;
} {
  const before = a.counts[a.key] ?? 0;
  const last = a.seenAt[a.key];
  if (last !== undefined && a.now - last < VISIT_GAP_MS) return { counts: a.counts, seenAt: a.seenAt, counted: false, visit: before };
  const visit = before + 1;
  return { counts: { ...a.counts, [a.key]: visit }, seenAt: { ...a.seenAt, [a.key]: a.now }, counted: true, visit };
}

const goodCount = (k: string, v: unknown): v is number => PAGE_KEY.test(k) && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10_000;

export function mergeCounts(server?: Record<string, number>, local?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const src of [server, local]) {
    for (const [k, v] of Object.entries(src ?? {})) if (goodCount(k, v)) out[k] = Math.max(out[k] ?? 0, v);
  }
  const keys = Object.keys(out);
  if (keys.length <= MAX_PAGES) return out;
  return Object.fromEntries(keys.sort((x, y) => out[y]! - out[x]!).slice(0, MAX_PAGES).map((k) => [k, out[k]!]));
}

export function mergeHeard(server?: string[], local?: string[]): string[] {
  const out: string[] = [];
  for (const id of [...(server ?? []), ...(local ?? [])]) if (typeof id === 'string' && PART_ID.test(id) && !out.includes(id)) out.push(id);
  return out.slice(-MAX_HEARD);
}

export const knowsKarwan = (counts: Record<string, number>): boolean =>
  Object.values(counts).filter((n) => n >= KNOWN_VISITS).length >= KNOWN_PAGES;

export const checkInDue = (counts: Record<string, number>, lastCheckInAt: number | undefined, now: number): boolean =>
  knowsKarwan(counts) && (lastCheckInAt === undefined || now - lastCheckInAt >= CHECK_IN_MS);

export function readSeenAt(store: Pick<Storage, 'getItem'> | null): Record<string, number> {
  try {
    const v: unknown = JSON.parse(store?.getItem(SEEN_AT_KEY) ?? 'null');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const entries = Object.entries(v as Record<string, unknown>);
    return entries.every(([, t]) => typeof t === 'number') ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function writeSeenAt(store: Pick<Storage, 'setItem'> | null, seenAt: Record<string, number>): void {
  try { store?.setItem(SEEN_AT_KEY, JSON.stringify(seenAt)); } catch { /* storage blocked: counts last until reload */ }
}

export type VisitOffer = 'hello' | 'parts' | 'check-in';

/// What Aman may bring on this page visit: the first hello until it has been
/// said, then part lines on the scheduled visits, then a check-in for someone
/// who knows Karwan. A page reopened inside the half hour brings nothing new.
export function visitOffer(a: { hiDone: boolean; counted: boolean; visit: number; counts: Record<string, number>; lastCheckInAt: number | undefined; now: number }): VisitOffer | null {
  if (!a.hiDone) return 'hello';
  if (!a.counted) return null;
  if (comesOnVisit(a.visit)) return 'parts';
  return checkInDue(a.counts, a.lastCheckInAt, a.now) ? 'check-in' : null;
}
