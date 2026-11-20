/// When something was listed, as the market's Listed filter asks it (view 96).
/// The website keeps the same rule in frontend/features/market/marketModel.ts;
/// both are tested with the same cases.

export type Listed = 'any' | '1h' | 'today' | 'week' | 'month';
export const LISTED = ['any', '1h', 'today', 'week', 'month'] as const satisfies readonly Listed[];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/// Midnight today in the time zone, as a time. A time zone the runtime does not
/// know reads as UTC.
function localMidnight(now: number, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now);
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
