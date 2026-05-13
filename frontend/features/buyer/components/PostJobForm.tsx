'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/core/api';

export function PostJobForm() {
  const router = useRouter();
  const [brief, setBrief] = useState('');
  const [budget, setBudget] = useState<number | ''>(10);
  const [days, setDays] = useState<number | ''>(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!brief || typeof budget !== 'number' || typeof days !== 'number') return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.postJob({ brief, budgetUsdc: budget, deadlineDays: days });
      router.push(`/jobs/${r.jobId}`);
    } catch (err) {
      if (err instanceof ApiError && err.detail) {
        setError(String(err.detail));
      } else {
        setError((err as Error).message);
      }
      setSubmitting(false);
    }
  }

  const disabled = submitting || !brief.trim() || !budget || !days;

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block space-y-1.5">
        <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
          Describe the work
        </span>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          placeholder="What do you need built? Outline the scope, key deliverables, and any must-haves. The seller agent reads this verbatim to decide whether to bid."
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed focus:outline-none focus:border-[var(--color-ink)] resize-none"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
            Budget (USDC)
          </span>
          <input
            type="number"
            min={1}
            step={1}
            value={budget}
            onChange={(e) => setBudget(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm mono focus:outline-none focus:border-[var(--color-ink)]"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
            Deadline (days)
          </span>
          <input
            type="number"
            min={1}
            max={90}
            step={1}
            value={days}
            onChange={(e) => setDays(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm mono focus:outline-none focus:border-[var(--color-ink)]"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={disabled}
        style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
        className="px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      >
        {submitting ? 'Posting on chain…' : 'Post on chain'}
      </button>
      {error && <p className="text-sm text-[var(--color-critical)] mono">{error}</p>}
    </form>
  );
}
