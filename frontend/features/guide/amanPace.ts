/// How often Aman comes in on its own (owner, 16 Nov 2026: "it should appear
/// at longer intervals … not appear at a longest interval if a person clicks
/// not now but always appears if a new login is made").
///
/// One pace for the whole site, kept on the device: a gap after each line,
/// a long quiet after Not now, and a clean start at every sign-in. A line
/// already on screen stays until it is done; this only decides whether a new
/// one may start.

export interface Pace {
  /// When Aman last came in on its own.
  lastAt: number;
  /// Nothing new before this, after Not now.
  quietUntil: number;
}

export const PACE_KEY = 'karwan:aman:pace';
/// Between two lines Aman starts on its own.
export const GAP_MS = 20 * 60_000;
/// Something that needs the person (money arrived, a deal waiting on them)
/// may come sooner.
export const URGENT_GAP_MS = 5 * 60_000;
/// After Not now.
export const QUIET_MS = 24 * 3_600_000;

export const freshPace = (): Pace => ({ lastAt: 0, quietUntil: 0 });

export function mayCome(pace: Pace, now: number, urgent: boolean): boolean {
  if (now < pace.quietUntil) return false;
  return now - pace.lastAt >= (urgent ? URGENT_GAP_MS : GAP_MS);
}

export const afterCame = (pace: Pace, now: number): Pace => ({ ...pace, lastAt: now });

export const afterNotNow = (pace: Pace, now: number): Pace => ({ lastAt: now, quietUntil: Math.max(pace.quietUntil, now + QUIET_MS) });

export function readPace(store: Pick<Storage, 'getItem'> | null): Pace {
  try {
    const v = JSON.parse(store?.getItem(PACE_KEY) ?? 'null') as Partial<Pace> | null;
    return v && typeof v.lastAt === 'number' && typeof v.quietUntil === 'number' ? { lastAt: v.lastAt, quietUntil: v.quietUntil } : freshPace();
  } catch {
    return freshPace();
  }
}

export function writePace(store: Pick<Storage, 'setItem'> | null, pace: Pace): void {
  try { store?.setItem(PACE_KEY, JSON.stringify(pace)); } catch { /* storage blocked: the pace lasts until reload */ }
}

/// Every sign-in and sign-out starts clean, so a new sign-in always gets Aman.
export function resetPace(store: Pick<Storage, 'removeItem'> | null): void {
  try { store?.removeItem(PACE_KEY); } catch { /* storage blocked */ }
}
