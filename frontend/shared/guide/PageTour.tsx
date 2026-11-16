'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useGuide, type TourStep } from './GuideProvider';

/// Registers a page's guided tour with the global guide. A tour never opens by
/// itself: someone new is offered it by Aman on Home, Market, a deal and Money,
/// and anyone opens it from Page tour or Aman's menu (view 57, 15 Nov evening).
export function PageTour({ id, steps, replayLabel = 'Tour' }: { id: string; steps: TourStep[]; replayLabel?: string }) {
  const { registerTour, unregisterTour, startTour } = useGuide();
  const pathname = usePathname();
  const serializedSteps = JSON.stringify(steps);

  useEffect(() => {
    // Dynamic forms rebuild their tour when direction or visible controls change.
    const currentSteps: TourStep[] = JSON.parse(serializedSteps);
    registerTour(id, currentSteps, replayLabel, pathname);
    return () => unregisterTour(id);
  }, [id, serializedSteps, replayLabel, pathname, registerTour, unregisterTour]);

  // The assistant's "show me around" link opens the page with ?tour=1: start
  // its tour once, then drop the parameter so a reload does not start it again.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('tour') !== '1') return;
    const t = window.setTimeout(() => {
      url.searchParams.delete('tour');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      startTour(id, JSON.parse(serializedSteps) as TourStep[], { force: true });
    }, 600);
    return () => window.clearTimeout(t);
  }, [id, serializedSteps, startTour]);

  return null;
}
