'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { isNoTourRoute } from './routes';
import { useGuide } from './GuideProvider';
import { GUIDE_COPY, routeGuidance } from './routeGuidance';
import { TOUR_LAUNCHER_VISIBLE_MS, tourLauncherStorageKey } from './tourLauncher';

export function PageTourButton({ pathname, enabled }: { pathname: string; enabled: boolean }) {
  const { locale } = useLocale();
  const { currentTour, startTour } = useGuide();
  const fallback = routeGuidance(pathname, locale);
  const tour = fallback ?? currentTour;
  const tourId = tour?.id;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!tourId) {
      setVisible(false);
      return;
    }
    const key = tourLauncherStorageKey(tourId);
    try {
      if (window.localStorage.getItem(key)) {
        setVisible(false);
        return;
      }
    } catch {
      // Storage can be unavailable in privacy modes. The timer still works.
    }
    setVisible(true);
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(key, 'seen');
      } catch {
        // Hiding the affordance does not depend on storage being writable.
      }
      setVisible(false);
    }, TOUR_LAUNCHER_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [tourId]);

  if (!enabled || isNoTourRoute(pathname) || !tour || !visible) return null;
  return (
    <button
      type="button"
      data-page-tour
      aria-haspopup="dialog"
      onClick={() => {
        try {
          window.localStorage.setItem(tourLauncherStorageKey(tour.id), 'opened');
        } catch {
          // The tour remains available without persistence.
        }
        setVisible(false);
        startTour(tour.id, tour.steps, { force: true });
      }}
      className="ms-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-4 font-sans text-[13px] font-semibold text-[var(--lp-dark)] transition-colors hover:border-[var(--lp-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]"
    >
      <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2.5 M12 16v1" /></svg>
      {GUIDE_COPY[locale].launch}
    </button>
  );
}
