'use client';

import { useRef, useState, type PointerEvent } from 'react';

type SwipeToPayProps = {
  disabled?: boolean;
  label: string;
  onConfirm: () => void;
};

const SWIPE_THRESHOLD = 0.78;

export function SwipeToPay({ disabled = false, label, onConfirm }: SwipeToPayProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  const setCurrentProgress = (next: number) => {
    progressRef.current = next;
    setProgress(next);
  };

  const updateProgress = (event: PointerEvent<HTMLButtonElement>) => {
    const track = trackRef.current;
    if (!track) return;
    const bounds = track.getBoundingClientRect();
    const handleWidth = 48;
    const usableWidth = Math.max(bounds.width - handleWidth - 8, 1);
    const next = Math.min(
      Math.max((event.clientX - bounds.left - handleWidth / 2 - 4) / usableWidth, 0),
      1,
    );
    setCurrentProgress(next);
  };

  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    if (progressRef.current >= SWIPE_THRESHOLD) {
      setCurrentProgress(1);
      onConfirm();
    } else {
      setCurrentProgress(0);
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    updateProgress(event);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onConfirm();
  };

  return (
    <div className="w-full space-y-2 md:hidden">
      <div
        ref={trackRef}
        className="relative min-h-14 overflow-hidden rounded-[14px] border border-[var(--lp-accent)]/50 bg-[var(--lp-workspace-raised)] p-1"
      >
        <span
          aria-hidden
          className="absolute inset-y-1 start-1 rounded-[10px] bg-[var(--lp-accent)] transition-[width] duration-200 ease-out"
          style={{ width: `calc(${progress * 100}% - ${progress > 0 ? 4 : 0}px)` }}
        />
        <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center px-14 text-center text-[12px] font-semibold text-[var(--lp-workspace-ink)]">
          {label}
          <span className="ms-2 text-[16px]" aria-hidden>→</span>
        </span>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${label}. Swipe to continue. Review is shown before funding.`}
          onPointerDown={handlePointerDown}
          onPointerMove={updateProgress}
          onPointerUp={finish}
          onPointerCancel={finish}
          onKeyDown={handleKeyDown}
          className="relative z-[2] grid size-12 place-items-center rounded-[10px] bg-[var(--lp-accent)] text-[18px] font-bold text-[var(--accent-ink)] shadow-[0_2px_0_rgba(0,0,0,0.16)] transition-[transform,opacity] duration-200 disabled:cursor-not-allowed disabled:opacity-50 motion-safe:hover:scale-[1.02]"
          style={{ transform: `translateX(${progress * 100}%)`, touchAction: 'none' }}
        >
          →
        </button>
      </div>
      <p className="mono text-center text-[9px] uppercase tracking-[0.14em] text-[var(--lp-workspace-muted)]">
        Swipe to review and continue
      </p>
    </div>
  );
}
