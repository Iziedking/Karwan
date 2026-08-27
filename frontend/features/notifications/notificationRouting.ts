export interface NotificationRouteInput {
  href?: string | null;
  jobId?: string | null;
}

/**
 * Notifications can outlive a frontend release in local storage. Older
 * versions used the `/deals` collection path, but Karwan only exposes
 * `/deals/[id]`. Repair that stale shape at the boundary instead of sending a
 * user to a guaranteed 404 page. A notification without an id has no safe
 * detail target, so it lands on the authenticated dashboard.
 */
export function safeNotificationHref(input: NotificationRouteInput): string {
  const href = input.href?.trim() ?? '';
  const jobId = input.jobId?.trim() ?? '';
  if (href === '/deals' || href === '/deals/') {
    return jobId ? `/deals/${encodeURIComponent(jobId)}` : '/app';
  }
  if (href === '/jobs' || href === '/jobs/') {
    return jobId ? `/jobs/${encodeURIComponent(jobId)}` : '/app';
  }
  return href || '/app';
}
