import { Skeleton } from '@/shared/components/Skeleton';

/// What a page shows while its route loads. Quiet on purpose: a title line and
/// a few rows in the current look, never the shape of an older page, so a
/// slow load does not flash a layout the page no longer has (8 Nov 2026).
export function RouteLoading() {
  return (
    <div data-route-loading className="mx-auto w-full max-w-[var(--workspace-measure,72rem)] space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
