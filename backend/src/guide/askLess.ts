import type { SetupKey } from './setupSteps.js';

/// Aman asks less (view 57, 15 Nov evening). Not now on a setup step holds it
/// for 3 days, then 14 every time after, on the account, so every device and
/// every channel agree. At most one setup step is asked on a given day.

const DAY_MS = 86_400_000;
export const SNOOZE_FIRST_MS = 3 * DAY_MS;
export const SNOOZE_AGAIN_MS = 14 * DAY_MS;

export interface Snooze { until: number; count: number }

export interface AskSettings {
  guideSnooze?: Partial<Record<SetupKey, Snooze>>;
  guideAskedOn?: string;
  guideAskedStep?: SetupKey;
}

export function afterSnooze(prev: Snooze | undefined, now: number): Snooze {
  const count = (prev?.count ?? 0) + 1;
  return { until: now + (count === 1 ? SNOOZE_FIRST_MS : SNOOZE_AGAIN_MS), count };
}

/// The UTC date, as YYYY-MM-DD.
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function setupAllowed(settings: AskSettings, step: SetupKey, now: number): boolean {
  const snooze = settings.guideSnooze?.[step];
  if (snooze && snooze.until > now) return false;
  if (settings.guideAskedOn === utcDay(now) && settings.guideAskedStep && settings.guideAskedStep !== step) return false;
  return true;
}
