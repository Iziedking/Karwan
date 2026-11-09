import type { QuietHours } from '../agents/mandate.js';
import { inQuietHours } from '../agents/personAgent.js';

/// When a deal alert or a pitch is reminded (view 72, decisions 3 and 8), in
/// the person's own time. Pure.
///
/// A deal alert is reminded at most three times: two hours after it was sent,
/// the next morning at 9, and the evening of the next day at 6. A pitch is
/// reminded once, the next morning at 9. A time inside the person's quiet
/// hours moves to the end of them. After the last, nothing is due.

const HOUR_MS = 3_600_000;
export const ALERT_REMINDERS = 3;
export const PITCH_REMINDERS = 1;

/// The local wall clock of an instant: year, month (0-11), day and hour.
function wall(ms: number, timeZone: string): { y: number; m: number; d: number; h: number; offset: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(ms);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const y = get('year'), m = get('month') - 1, d = get('day'), h = get('hour');
  const asUtc = Date.UTC(y, m, d, h, get('minute'), get('second'));
  return { y, m, d, h, offset: asUtc - Math.floor(ms / 1000) * 1000 };
}

/// The instant of `hour`:00 local time, `days` after the local day of `from`.
export function localAt(from: number, days: number, hour: number, timeZone: string): number {
  const w = wall(from, timeZone);
  const guess = Date.UTC(w.y, w.m, w.d + days, hour) - w.offset;
  // Correct once for a change of offset between the two days.
  const again = wall(guess, timeZone);
  return Date.UTC(w.y, w.m, w.d + days, hour) - again.offset;
}

/// Moves a time out of quiet hours, to the hour they end.
export function outOfQuiet(at: number, timeZone: string, quiet: QuietHours | null): number {
  const w = wall(at, timeZone);
  if (!inQuietHours(w.h, quiet)) return at;
  const sameDay = quiet!.to > w.h;
  return localAt(at, sameDay ? 0 : 1, quiet!.to, timeZone);
}

export function nextReminderAt(
  c: { kind: 'alert' | 'pitch'; sentAt: number; reminders: number },
  timeZone: string,
  quiet: QuietHours | null,
): number | null {
  let at: number;
  if (c.kind === 'pitch') {
    if (c.reminders >= PITCH_REMINDERS) return null;
    at = localAt(c.sentAt, 1, 9, timeZone);
  } else {
    if (c.reminders >= ALERT_REMINDERS) return null;
    at = c.reminders === 0 ? c.sentAt + 2 * HOUR_MS : localAt(c.sentAt, 1, c.reminders === 1 ? 9 : 18, timeZone);
  }
  return outOfQuiet(at, timeZone, quiet);
}
