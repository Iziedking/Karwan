export const ARC_MAINNET_LAUNCH_AT = Date.parse('2026-09-16T15:30:00Z');

export type ArcCountdownParts = {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export function getArcCountdownParts(
  now = Date.now(),
  target = ARC_MAINNET_LAUNCH_AT,
): ArcCountdownParts {
  const totalMs = Math.max(0, target - now);
  const totalSeconds = Math.floor(totalMs / 1000);

  return {
    totalMs,
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function formatArcCountdownUnit(value: number): string {
  return String(value).padStart(2, '0');
}
