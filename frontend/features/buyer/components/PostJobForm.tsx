'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/core/api';
import { Hint } from '@/shared/components/Hint';

export function PostJobForm() {
  const router = useRouter();
  const [brief, setBrief] = useState('');
  const [budget, setBudget] = useState<number | ''>(10);
  const [days, setDays] = useState<number | ''>(5);
  const [submitting, setSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!submitting) return;
    startedAt.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      if (startedAt.current == null) return;
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [submitting]);

  const [insufficientBalance, setInsufficientBalance] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!brief || typeof budget !== 'number' || typeof days !== 'number') return;
    setSubmitting(true);
    setError(null);
    setInsufficientBalance(false);
    try {
      const r = await api.postJob({ brief, budgetUsdc: budget, deadlineDays: days });
      router.push(`/jobs/${r.jobId}`);
    } catch (err) {
      if (err instanceof ApiError && err.message === 'insufficient buyer balance') {
        setInsufficientBalance(true);
        setError(err.detail ? String(err.detail) : 'Buyer agent is short on USDC.');
      } else if (err instanceof ApiError && err.detail) {
        setError(String(err.detail));
      } else {
        setError((err as Error).message);
      }
      setSubmitting(false);
    }
  }

  const disabled = submitting || !brief.trim() || !budget || !days;
  const buttonLabel = submitting
    ? elapsed < 8
      ? 'Submitting tx…'
      : elapsed < 30
      ? `Waiting for Arc to confirm… ${elapsed}s`
      : `Still waiting on Circle… ${elapsed}s`
    : 'Post on chain';

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block space-y-1.5">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
          Describe the work
          <Hint>
            What do you need built? Outline the scope, key deliverables, and any must-haves. The seller agent reads this to decide whether to bid.
          </Hint>
        </span>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          disabled={submitting}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed focus:outline-none focus:border-[var(--color-ink)] resize-none disabled:opacity-60"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
            Budget (USDC)
            <Hint>
              The amount you're willing to pay, in USDC. Your buyer agent uses this as the upper bound when scoring bids and countering.
            </Hint>
          </span>
          <input
            type="number"
            min={1}
            step={1}
            value={budget}
            disabled={submitting}
            onChange={(e) => setBudget(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm mono focus:outline-none focus:border-[var(--color-ink)] disabled:opacity-60"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
            Deadline (days)
            <Hint>
              How many days from now you want the work done. Sellers won't bid if it falls outside their accepted delivery window.
            </Hint>
          </span>
          <input
            type="number"
            min={1}
            max={90}
            step={1}
            value={days}
            disabled={submitting}
            onChange={(e) => setDays(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm mono focus:outline-none focus:border-[var(--color-ink)] disabled:opacity-60"
          />
        </label>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="submit"
          disabled={disabled}
          style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {submitting && (
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              className="animate-spin"
              aria-hidden
            >
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
              <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          {buttonLabel}
        </button>
        {submitting && (
          <p className="text-[12px] text-[var(--color-ink-faint)] leading-snug">
            Circle is broadcasting and confirming on Arc. You'll be taken to the live job page when it lands.
          </p>
        )}
      </div>
      {insufficientBalance ? (
        <div className="rounded-md border border-[var(--color-warning)]/25 bg-[var(--color-warning-soft)] p-3 space-y-2">
          <p className="text-[13px] text-[var(--color-ink)] font-medium">
            Buyer agent is short on USDC.
          </p>
          <p className="text-[12px] text-[var(--color-ink-dim)] leading-snug">{error}</p>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('bridge-section');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="text-[12px] font-medium text-[var(--color-accent)] hover:underline"
          >
            Top up via CCTP →
          </button>
        </div>
      ) : (
        error && <p className="text-sm text-[var(--color-critical)]">Couldn't post: {error}</p>
      )}
    </form>
  );
}
