import type { WorkView, WorkWeekView } from '@/core/api';
import { microsToUsdc } from '../contests/contestModel';

/// Hourly work (view 32): how its numbers read, and the one next step each
/// side has on a week.

export { microsToUsdc };

/// "12 h 30 m", "45 m", "3 h".
export function hoursText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} h ${m} m`;
  return h ? `${h} h` : `${m} m`;
}

/// A whole number of hours and minutes, or null when either is not one.
export function minutesFrom(hours: string, minutes: string): number | null {
  const h = hours.trim() === '' ? 0 : Number(hours);
  const m = minutes.trim() === '' ? 0 : Number(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) return null;
  const total = h * 60 + m;
  return total > 0 ? total : null;
}

/// A date in the viewer's own calendar, from the UTC instant the contract keeps.
export function localDay(ms: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(ms);
}

export type WeekLine = 'not-started' | 'logging' | 'in-review' | 'with-review' | 'settled';

export function weekLine(w: WorkWeekView, now: number): WeekLine {
  if (w.status === 'settled') return 'settled';
  if (w.status === 'objected') return 'with-review';
  if (now < w.start) return 'not-started';
  if (now < w.logBy) return 'logging';
  return 'in-review';
}

/// What the person can do on the work as a whole, besides the weeks.
export function workActions(v: WorkView): Array<'accept' | 'decline' | 'takeBack' | 'fund' | 'notice'> {
  const out: Array<'accept' | 'decline' | 'takeBack' | 'fund' | 'notice'> = [];
  if (v.canAccept) out.push('accept', 'decline');
  if (v.canTakeBack) out.push('takeBack');
  if (v.role === 'hirer' && v.nextWeek) out.push('fund');
  if (v.canGiveNotice) out.push('notice');
  return out;
}

/// Monthly work counted in sessions (view 76): every log entry is one session.
export interface SessionRow { n: number; at: number; note: string; link?: string; flagged?: { at: number; note: string } }

/// The month's sessions, newest first, each with its number in the month.
export function sessionRows(w: WorkWeekView): SessionRow[] {
  return w.log.map((x, i) => ({ n: i + 1, at: x.at, note: x.note, ...(x.link ? { link: x.link } : {}), ...(x.flagged ? { flagged: x.flagged } : {}) })).reverse();
}

/// What one session is worth, or null when the month does not divide evenly.
export function sessionPrice(rateMicros: string, sessions: number | undefined): string | null {
  if (!sessions) return null;
  const rate = BigInt(rateMicros);
  return rate % BigInt(sessions) === 0n ? (rate / BigInt(sessions)).toString() : null;
}

/// The link on a session is optional; when given it is https and short, as the server asks.
export function validLink(link: string): boolean {
  const s = link.trim();
  return s === '' || (s.length <= 300 && /^https:\/\/\S+$/.test(s));
}

export type MonthLine = 'not-started' | 'review-after' | 'record-by' | 'review-by' | 'with-review' | 'settled';

/// The one date each side needs on a month of sessions: the hirer reviews after
/// it ends, the worker records until two days past it.
export function monthLine(w: WorkWeekView, role: 'hirer' | 'worker', now: number): MonthLine {
  if (w.status === 'settled') return 'settled';
  if (w.status === 'objected') return 'with-review';
  if (now < w.start) return 'not-started';
  if (role === 'hirer') return now < w.end ? 'review-after' : 'review-by';
  return now < w.logBy ? 'record-by' : 'review-by';
}

/// The request form's "How you pay" opens the posting form with what was typed.
export function workRequestHref(kind: 'hourly' | 'monthly', brief: string): string {
  const q = new URLSearchParams({ kind });
  if (brief.trim()) q.set('brief', brief.trim().slice(0, 1500));
  return `/work/requests/new?${q}`;
}
