'use client';
import { useEffect } from 'react';
import { useGuide, type TourStep } from './GuideProvider';

/// Drop this on any page to give it a guided tour. It auto-opens once on a
/// newcomer's first visit, remembers it per `id`, and afterwards offers a
/// quiet "Tour" pill to replay. People who hit "skip all tips" see nothing.
///
/// Spotlight steps point at elements tagged with `data-guide="<value>"`;
/// targetless steps render as centered intro/outro cards.
export function PageTour({
  id,
  steps,
  autoStartDelayMs = 700,
  replayLabel = 'Tour',
}: {
  id: string;
  steps: TourStep[];
  /// Small delay so the page DOM (and its data-guide targets) is mounted
  /// before the first spotlight tries to find them.
  autoStartDelayMs?: number;
  replayLabel?: string;
}) {
  const { startTour, disabled, isSeen, hasActive } = useGuide();

  useEffect(() => {
    if (disabled || isSeen(id)) return;
    const t = setTimeout(() => startTour(id, steps), autoStartDelayMs);
    return () => clearTimeout(t);
    // Re-run only when the page identity changes; steps are static per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // While a tour is running, or for users who turned tips off entirely, show
  // nothing. Once this page's tour has been seen, a quiet replay pill remains.
  if (hasActive || disabled || !isSeen(id)) return null;

  return (
    <button
      type="button"
      onClick={() => startTour(id, steps, { force: true })}
      className="fixed bottom-5 left-5 z-[60] inline-flex items-center gap-1.5 px-3 py-2 mono text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--lp-dark)] bg-[var(--lp-card)] border border-[var(--lp-border-light)] hover:border-[var(--lp-accent)] transition-colors"
      style={{
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 3,
        boxShadow: '0 6px 18px -10px rgba(0,0,0,0.3)',
      }}
      title="Replay the guided tour for this page"
    >
      <span
        aria-hidden
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-bold"
        style={{ background: 'var(--lp-accent)', color: 'var(--lp-band-dark)' }}
      >
        ?
      </span>
      {replayLabel}
    </button>
  );
}
