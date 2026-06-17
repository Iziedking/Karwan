'use client';
import { useEffect, useRef } from 'react';
import { useGuide, GUIDE_MASTERY_XP, type TourStep } from './GuideProvider';
import { WELCOME_ID } from './tours';

/// Registers a page's guided tour with the global guide AND auto-opens it once
/// for a newcomer, so a first-time user is taught the page without having to
/// find the Tour pill. The public review showed the tips were too easy to miss.
///
/// Auto-open rules (kept deliberately gentle):
///   - Only when tips are enabled (the global "skip all" / five-skips cutoff
///     turns this off), the user has not mastered the app, and has not already
///     seen this page's tour.
///   - Only after the first-run welcome has been seen, so the very first app
///     page belongs to the welcome and two tours never fight for the screen.
///   - Never while another tour is open.
/// The floating Tour pill (bottom-left) remains the on-demand trigger on every
/// page, and the same responsive overlay serves desktop and mobile.
export function PageTour({
  id,
  steps,
  replayLabel = 'Tour',
  autoStartDelayMs = 700,
}: {
  id: string;
  steps: TourStep[];
  /// Delay before the auto-open fires, giving the spotlight targets time to
  /// mount so the first step lands on a real element.
  autoStartDelayMs?: number;
  replayLabel?: string;
}) {
  const { registerTour, unregisterTour, startTour, hasActive, disabled, experience, isSeen } =
    useGuide();
  // One auto-open attempt per mount; the pill stays available regardless.
  const autoTried = useRef(false);

  useEffect(() => {
    registerTour(id, steps, replayLabel);
    return () => unregisterTour(id);
    // Register once per page; steps + label are static per page id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (autoTried.current) return;
    if (disabled || hasActive) return;
    if (experience >= GUIDE_MASTERY_XP) return;
    if (!isSeen(WELCOME_ID)) return; // let the first-run welcome go first
    if (isSeen(id)) return; // newcomer already saw this page's tour
    const t = window.setTimeout(() => {
      autoTried.current = true;
      startTour(id, steps);
    }, autoStartDelayMs);
    return () => window.clearTimeout(t);
    // Re-evaluates when an open tour closes (hasActive) or the seen/welcome
    // state changes, so the page tour opens right after the welcome finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, hasActive, disabled, experience, isSeen]);

  return null;
}
