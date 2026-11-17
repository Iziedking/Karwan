import type { ContestView } from '@/core/api';

/// What the contest page offers whoever is looking (view 40): one next step.
export type ContestNext = 'sign_in' | 'enter' | 'replace' | 'closed' | 'take_back' | 'pick' | 'none';

export function microsToUsdc(micros: string): string {
  const v = BigInt(micros);
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function contestScreen(c: ContestView, i: { signedIn: boolean; now: number }): { next: ContestNext } {
  if (c.mine) {
    // On a contest that protects entrants the buyer can still pick in the
    // 3 days after judging ends (view 88).
    if (c.status !== 'open' || i.now >= (c.payoutFrom ?? c.awardBy)) return { next: 'none' };
    const shown = (c.entryList ?? []).filter((e) => e.status === 'in' && !e.notValid).length;
    return { next: shown === 0 ? (i.now < c.entriesBy ? 'take_back' : 'none') : 'pick' };
  }
  if (c.status !== 'open' || i.now >= c.entriesBy) return { next: c.myEntry ? 'none' : 'closed' };
  if (!i.signedIn) return { next: 'sign_in' };
  return { next: c.myEntry && c.myEntry.status !== 'failed' ? 'replace' : 'enter' };
}

/// The buyer's picks, first place first, are enough to pay out.
export function picksReady(c: ContestView, picks: string[], now: number): boolean {
  if (picks.length === 0 || picks.length > c.shares.length) return false;
  return now >= c.entriesBy || picks.length === c.shares.length;
}

/// One to eight winners (view 88 decision 6); both job escrows take up to 8 places.
export const MAX_WINNERS = 8;
const DAY = 86_400_000;

/// The suggested split for each number of winners, in basis points. The same
/// table as the server's DEFAULT_SHARES.
export const SUGGESTED: Record<number, number[]> = {
  1: [10_000],
  2: [7_000, 3_000],
  3: [5_000, 3_000, 2_000],
  4: [4_000, 3_000, 2_000, 1_000],
  5: [3_500, 2_500, 2_000, 1_200, 800],
  6: [3_000, 2_200, 1_700, 1_300, 1_000, 800],
  7: [2_800, 2_000, 1_500, 1_200, 1_000, 800, 700],
  8: [2_500, 1_800, 1_400, 1_200, 1_000, 800, 700, 600],
};

export type Split = 'suggested' | 'equal' | 'own';

/// Equal shares; what cannot split evenly goes to the first places.
export function equalShares(n: number): number[] {
  const base = Math.floor(10_000 / n);
  const extra = 10_000 - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/// Each place's part of the prize, in USDC, for the line under the split.
export function splitAmounts(prize: number, shares: number[]): number[] {
  return shares.map((s) => Math.floor((prize * s) / 10_000 * 1_000_000) / 1_000_000);
}

/// The person's own amounts for each place, against the prize, both in USDC.
/// `left` is what is still to share (negative when over). Shares come back
/// only when every place has an amount and they add up within a cent; what
/// rounding leaves goes to the first place.
export function ownShares(amounts: (number | null)[], prize: number): { shares: number[] | null; left: number } {
  const sum = amounts.reduce<number>((a, b) => a + (b ?? 0), 0);
  const left = Math.round((prize - sum) * 1_000_000) / 1_000_000;
  if (!(prize > 0) || amounts.some((a) => a === null || !(a > 0)) || Math.abs(left) > 0.01) return { shares: null, left };
  const bps = amounts.map((a) => Math.floor(((a as number) / sum) * 10_000));
  if (bps.some((b) => b <= 0)) return { shares: null, left };
  bps[0]! += 10_000 - bps.reduce((a, b) => a + b, 0);
  return { shares: bps, left };
}

/// Where a contest that protects its entrants stands (view 88), with the days
/// left until the next date. Older contests have no phase.
export type ContestPhase = 'entries' | 'judging' | 'waiting' | 'paidEarliest';
export function contestPhase(c: ContestView, now: number): { phase: ContestPhase; daysLeft: number } | null {
  if (!c.protects) return null;
  if (c.auto && c.status === 'awarded') return { phase: 'paidEarliest', daysLeft: 0 };
  if (c.status !== 'open') return null;
  const left = (to: number) => Math.max(1, Math.ceil((to - now) / DAY));
  if (now < c.entriesBy) return { phase: 'entries', daysLeft: left(c.entriesBy) };
  if (now < c.awardBy) return { phase: 'judging', daysLeft: left(c.awardBy) };
  const payout = c.payoutFrom ?? c.awardBy;
  return now < payout ? { phase: 'waiting', daysLeft: left(payout) } : null;
}

/// The buyer can mark an entry not valid while the contest is open and the
/// payout has not opened (view 88).
export function canMark(c: ContestView, now: number): boolean {
  return !!c.mine && !!c.protects && c.status === 'open' && now < (c.payoutFrom ?? c.awardBy);
}
