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
    if (c.status !== 'open' || i.now >= c.awardBy) return { next: 'none' };
    const shown = (c.entryList ?? []).filter((e) => e.status === 'in').length;
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
