export const FEEDBACK_NUDGE_DELAY_MS = 30_000;
export const FEEDBACK_NUDGE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1_000;
export const FEEDBACK_NUDGE_SESSION_KEY = 'karwan-feedback-nudge-shown';
export const FEEDBACK_NUDGE_LAST_SHOWN_KEY = 'karwan-feedback-nudge-last-shown';

const SAFE_WORKSPACE_HUBS = [
  '/app',
  '/buyer',
  '/seller',
  '/market',
  '/listings',
  '/partners',
  '/activity',
  '/profile',
] as const;

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function isFeedbackNudgeRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return SAFE_WORKSPACE_HUBS.some((route) => matchesRoute(pathname, route));
}

export function shouldOfferFeedbackNudge({
  pathname,
  sessionShown,
  lastShownAt,
  now,
}: {
  pathname: string | null | undefined;
  sessionShown: boolean;
  lastShownAt: number | null;
  now: number;
}): boolean {
  if (!isFeedbackNudgeRoute(pathname) || sessionShown) return false;
  if (lastShownAt === null) return true;
  return now - lastShownAt >= FEEDBACK_NUDGE_COOLDOWN_MS;
}
