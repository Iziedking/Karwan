'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/core/api';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';

export function ReleaseMilestonesButton({
  jobId,
  totalMilestones,
}: {
  jobId: string;
  totalMilestones: number;
}) {
  const events = useLiveEvents(jobId, 50);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const { releasedCount, settled } = useMemo(() => {
    let released = 0;
    let settledHit = false;
    for (const e of events) {
      if (startedAt && e.ts < startedAt) continue;
      if (e.type === 'escrow.milestone.released' && e.jobId === jobId) released += 1;
      if (e.type === 'escrow.settled' && e.jobId === jobId) settledHit = true;
    }
    return { releasedCount: released, settled: settledHit };
  }, [events, startedAt, jobId]);

  const running = submitting || (startedAt !== null && !settled);

  useEffect(() => {
    if (settled) setSubmitting(false);
  }, [settled]);

  async function go() {
    setSubmitting(true);
    setError(null);
    setStartedAt(Date.now());
    try {
      await api.releaseMilestones(jobId, totalMilestones);
    } catch (err) {
      setError((err as Error).message);
      setStartedAt(null);
      setSubmitting(false);
    }
  }

  const label = settled
    ? 'Released'
    : running
      ? `Releasing milestone ${Math.min(releasedCount + 1, totalMilestones)} of ${totalMilestones}…`
      : `Release ${totalMilestones} milestones`;

  return (
    <div className="space-y-3">
      <button
        onClick={go}
        disabled={running || settled}
        style={{
          backgroundColor: settled ? 'var(--color-positive)' : 'var(--color-ink)',
          color: 'var(--color-surface)',
        }}
        className="px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-80 disabled:cursor-not-allowed transition-opacity inline-flex items-center gap-2"
      >
        {running && (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden>
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
            <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        {label}
      </button>
      {running && releasedCount > 0 && (
        <p className="text-[12px] text-[var(--color-ink-dim)]">
          {releasedCount} of {totalMilestones} confirmed on chain.
        </p>
      )}
      {settled && (
        <p className="text-[12px] text-[var(--color-positive)]">All milestones released. Escrow settled.</p>
      )}
      {error && <p className="text-xs text-[var(--color-critical)] mono">{error}</p>}
    </div>
  );
}
