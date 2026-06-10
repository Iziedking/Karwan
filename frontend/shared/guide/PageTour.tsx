'use client';
import { useEffect } from 'react';
import { useGuide, type TourStep } from './GuideProvider';

/// Registers a page's guided tour with the global guide. The floating "Tour"
/// pill (bottom-left, rendered once by GuideProvider) launches it on demand.
///
/// Page tours no longer auto-open on every visit, only the first-run welcome
/// auto-starts, so a returning user is never interrupted. They tap Tour when
/// they want a walkthrough of the page they're on.
export function PageTour({
  id,
  steps,
  replayLabel = 'Tour',
}: {
  id: string;
  steps: TourStep[];
  /// Kept for back-compat with existing call sites. Tours start on click now, so
  /// the old "wait for the DOM to mount" delay is no longer needed.
  autoStartDelayMs?: number;
  replayLabel?: string;
}) {
  const { registerTour, unregisterTour } = useGuide();

  useEffect(() => {
    registerTour(id, steps, replayLabel);
    return () => unregisterTour(id);
    // Register once per page; steps + label are static per page id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return null;
}
