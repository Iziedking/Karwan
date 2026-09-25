import type { LifetimeDay } from '@/core/api';

/// One bar per calendar week (Monday, UTC), with empty weeks kept as zero so a
/// quiet week reads as quiet rather than disappearing from the axis.

export interface WeekPoint {
  /// Monday of the week, YYYY-MM-DD, UTC.
  weekStart: string;
  fundedUsdc: number;
  deals: number;
  releasedUsdc: number;
  refundedUsdc: number;
  transactions: number;
}

const DAY_MS = 86_400_000;

export function mondayOf(isoDay: string): string {
  const t = Date.parse(`${isoDay}T00:00:00Z`);
  const dow = new Date(t).getUTCDay(); // 0 = Sunday
  const back = (dow + 6) % 7;
  return new Date(t - back * DAY_MS).toISOString().slice(0, 10);
}

export function weekly(days: LifetimeDay[]): WeekPoint[] {
  if (days.length === 0) return [];
  const byWeek = new Map<string, WeekPoint>();
  for (const d of days) {
    const key = mondayOf(d.day);
    const w = byWeek.get(key) ?? {
      weekStart: key,
      fundedUsdc: 0,
      deals: 0,
      releasedUsdc: 0,
      refundedUsdc: 0,
      transactions: 0,
    };
    w.fundedUsdc += Number(d.fundedUsdc);
    w.deals += d.deals;
    w.releasedUsdc += Number(d.releasedUsdc);
    w.refundedUsdc += Number(d.refundedUsdc);
    w.transactions += d.transactions;
    byWeek.set(key, w);
  }
  const keys = [...byWeek.keys()].sort();
  const out: WeekPoint[] = [];
  for (let t = Date.parse(`${keys[0]}T00:00:00Z`), end = Date.parse(`${keys[keys.length - 1]}T00:00:00Z`); t <= end; t += 7 * DAY_MS) {
    const key = new Date(t).toISOString().slice(0, 10);
    out.push(
      byWeek.get(key) ?? { weekStart: key, fundedUsdc: 0, deals: 0, releasedUsdc: 0, refundedUsdc: 0, transactions: 0 },
    );
  }
  return out;
}

/// A rounded axis maximum and 3 to 5 evenly spaced ticks from zero.
export function niceTicks(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

/// Money for reading at a glance: whole USDC with grouping, cents only below 100.
export function glanceUsdc(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  return value.toLocaleString('en-US', {
    minimumFractionDigits: abs > 0 && abs < 100 ? 2 : 0,
    maximumFractionDigits: abs < 100 ? 2 : 0,
  });
}

/// Axis labels: 1.5k, 20k, 1.2M.
export function compactUsdc(value: number): string {
  if (value >= 1_000_000) return `${+(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${+(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}
