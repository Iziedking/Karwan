/// How long a payment link asks for money. The backend holds the same limits:
/// 7 days unless the person picks, 90 days at most (owner, 6 Nov 2026).

export type LinkExpiry = { kind: 'days'; days: number } | { kind: 'date'; date: string };

export const EXPIRY_DAYS = [1, 7, 30] as const;
export const MAX_EXPIRY_DAYS = 90;
export const DEFAULT_EXPIRY: LinkExpiry = { kind: 'days', days: 7 };

const DAY_MS = 86_400_000;
const MIN_MINUTES = 5;

const localDay = (time: number) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/// Minutes the backend is asked for. A date runs to the end of that day where
/// the person is.
export function expiryMinutes(choice: LinkExpiry, now = Date.now()): number {
  const max = MAX_EXPIRY_DAYS * 24 * 60;
  if (choice.kind === 'days') return Math.min(max, choice.days * 24 * 60);
  const end = new Date(`${choice.date}T23:59:59`).getTime();
  return Math.min(max, Math.max(MIN_MINUTES, Math.ceil((end - now) / 60_000)));
}

export function expiryAt(choice: LinkExpiry, now = Date.now()): number {
  return now + expiryMinutes(choice, now) * 60_000;
}

/// The calendar's first and last day: tomorrow, and the last full day inside 90.
export function dateBounds(now = Date.now()): { min: string; max: string } {
  return { min: localDay(now + DAY_MS), max: localDay(now + (MAX_EXPIRY_DAYS - 1) * DAY_MS) };
}
