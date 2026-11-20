/// When something was listed, as the market's Listed filter asks it (view 96).
/// The server keeps the same rule in backend/src/marketplace/listedWindow.ts;
/// both are tested with the same cases.

export type Listed = 'any' | '1h' | 'today' | 'week' | 'month';
export type MarketOrder = 'newest' | 'oldest' | 'closing';
export const LISTED: readonly Listed[] = ['any', '1h', 'today', 'week', 'month'];
export const MARKET_ORDERS: readonly MarketOrder[] = ['newest', 'oldest', 'closing'];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/// Midnight today in the time zone, as a time. A time zone the browser does not
/// know reads as UTC.
function localMidnight(now: number, timeZone: string): number {
  const options = { hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' } as const;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { ...options, timeZone }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).formatToParts(now);
  }
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return now - ((n('hour') * 60 + n('minute')) * 60 + n('second')) * 1000 - (now % 1000);
}

/// The earliest listing time the filter keeps, or null for any time.
export function sinceFor(listed: Listed, now: number, timeZone: string): number | null {
  switch (listed) {
    case '1h': return now - HOUR;
    case 'today': return localMidnight(now, timeZone);
    case 'week': return now - 7 * DAY;
    case 'month': return now - 30 * DAY;
    default: return null;
  }
}

/// The items listed inside the window, in the order asked. Closing soonest puts
/// items with no closing time last; ties read newest first.
export function listedWithin<T>(
  items: readonly T[],
  at: (item: T) => number,
  closesAt: (item: T) => number | null,
  listed: Listed,
  order: MarketOrder,
  now: number,
  timeZone: string,
): T[] {
  const since = sinceFor(listed, now, timeZone);
  const kept = since === null ? [...items] : items.filter((item) => at(item) >= since);
  const ends = (item: T) => closesAt(item) ?? Number.MAX_SAFE_INTEGER;
  return kept.sort((a, b) =>
    order === 'oldest' ? at(a) - at(b)
      : order === 'closing' ? ends(a) - ends(b) || at(b) - at(a)
        : at(b) - at(a));
}

/// The browser's own time zone, Lagos when it cannot say.
export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Lagos';
  } catch {
    return 'Africa/Lagos';
  }
}
