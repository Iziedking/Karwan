/// What the page policy blocked (view 70). Browsers send reports in two
/// shapes; both reduce to a rule and the origin that was blocked. Paths and
/// query strings are dropped, so no address, token or page a person visited
/// is kept.

export interface Blocked {
  directive: string;
  blocked: string;
}

export type DayCounts = Record<string, number>;

export const MAX_KEYS_PER_DAY = 500;
export const SUMMARY_DAYS = 30;

const KEYWORDS = new Set(['inline', 'eval', 'data', 'wasm-eval', 'trusted-types-policy', 'trusted-types-sink']);

export function blockedOrigin(raw: string): string {
  const value = raw.trim();
  if (KEYWORDS.has(value)) return value;
  if (value.startsWith('blob:')) return 'blob';
  if (value.startsWith('data:')) return 'data';
  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return 'other';
    return url.origin;
  } catch {
    return 'other';
  }
}

function directiveName(raw: unknown): string {
  const first = typeof raw === 'string' ? raw.trim().split(/\s+/)[0] ?? '' : '';
  return /^[a-z-]{3,40}$/.test(first) ? first : 'other';
}

function one(directive: unknown, blocked: unknown): Blocked | null {
  if (typeof blocked !== 'string' || (typeof directive !== 'string')) return null;
  return { directive: directiveName(directive), blocked: blockedOrigin(blocked) };
}

export function parseCspReports(body: unknown): Blocked[] {
  if (Array.isArray(body)) {
    return body.flatMap((r) => {
      if (!r || typeof r !== 'object' || (r as { type?: unknown }).type !== 'csp-violation') return [];
      const b = (r as { body?: Record<string, unknown> }).body ?? {};
      const item = one(b.effectiveDirective ?? b.violatedDirective, b.blockedURL);
      return item ? [item] : [];
    });
  }
  if (body && typeof body === 'object' && 'csp-report' in body) {
    const r = (body as { 'csp-report': Record<string, unknown> | null })['csp-report'] ?? {};
    const item = one(r['effective-directive'] ?? r['violated-directive'], r['blocked-uri']);
    return item ? [item] : [];
  }
  return [];
}

export function addCounts(day: DayCounts, items: Blocked[], cap = MAX_KEYS_PER_DAY): DayCounts {
  const next = { ...day };
  for (const { directive, blocked } of items) {
    const key = `${directive} ${blocked}`;
    const seen = next[key];
    if (seen !== undefined) next[key] = seen + 1;
    else if (Object.keys(next).length < cap) next[key] = 1;
  }
  return next;
}

export interface PolicySummary {
  since: string;
  total: number;
  blocked: { directive: string; blocked: string; count: number; lastSeen: string }[];
}

function daysBefore(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/// `days` are keyed YYYY-MM-DD; only the last 30 days, today included, count.
export function summarise(days: { key: string; data: DayCounts }[], today: string): PolicySummary {
  const since = daysBefore(today, SUMMARY_DAYS - 1);
  const rows = new Map<string, { count: number; lastSeen: string }>();
  let total = 0;
  for (const { key, data } of days) {
    if (key < since || key > today) continue;
    for (const [k, n] of Object.entries(data)) {
      total += n;
      const row = rows.get(k) ?? { count: 0, lastSeen: key };
      row.count += n;
      if (key > row.lastSeen) row.lastSeen = key;
      rows.set(k, row);
    }
  }
  const blocked = [...rows.entries()]
    .map(([k, v]) => {
      const space = k.indexOf(' ');
      return { directive: k.slice(0, space), blocked: k.slice(space + 1), count: v.count, lastSeen: v.lastSeen };
    })
    .sort((a, b) => b.count - a.count || a.directive.localeCompare(b.directive) || a.blocked.localeCompare(b.blocked));
  return { since, total, blocked };
}
