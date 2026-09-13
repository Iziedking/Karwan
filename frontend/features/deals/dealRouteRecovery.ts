const RECOVERY_PREFIX = 'karwan:deal-route-recovery:';
export const DEAL_ROUTE_RECOVERY_WINDOW_MS = 30_000;

export function dealRouteRecoveryKey(pathname: string): string {
  return `${RECOVERY_PREFIX}${pathname}`;
}

export function shouldAutomaticallyReloadDeal(
  previousAttempt: string | null,
  now: number,
): boolean {
  if (previousAttempt == null) return true;
  const attemptedAt = Number(previousAttempt);
  return !Number.isFinite(attemptedAt) || now - attemptedAt > DEAL_ROUTE_RECOVERY_WINDOW_MS;
}

