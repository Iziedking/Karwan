'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Rate a settled deal from 1 to 5 with an optional note. It shows at once.
export function RatingCard({ jobId }: { jobId: string }) {
  const t = useTranslations().ratings;
  const [state, setState] = useState<'loading' | 'open' | 'done' | 'hidden'>('loading');
  const [stars, setStars] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .dealRating(jobId)
      .then((r) => setState(r.rated ? 'done' : 'open'))
      .catch(() => setState('hidden'));
  }, [jobId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!stars || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      const r = await api.rateDeal(jobId, stars, note.trim() || undefined);
      setResult(r.revealed ? t.savedBoth : t.saved);
      setState('done');
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (state === 'loading' || state === 'hidden') return null;
  if (state === 'done') {
    return <p className="border-t border-[var(--lp-workspace-border)] pt-4 text-[14px] text-[var(--lp-workspace-muted)]">{result ?? t.already}</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-[var(--lp-workspace-border)] pt-4">
      <h3 className="text-[16px] font-semibold text-[var(--lp-workspace-ink)]">{t.cardTitle}</h3>
      <p className="text-[14px] text-[var(--lp-workspace-muted)]">{t.cardBody}</p>
      <div role="radiogroup" aria-label={t.cardTitle} className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={t.star.replace('{n}', String(n))}
            onClick={() => setStars(n)}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] border text-[16px] font-semibold tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
              stars === n
                ? 'border-2 border-[var(--lp-workspace-ink)] bg-[var(--lp-workspace-raised)] text-[var(--lp-workspace-ink)]'
                : 'border-[var(--lp-workspace-border)] text-[var(--lp-workspace-ink)]'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <label className="block text-[14px] font-semibold text-[var(--lp-workspace-ink)]" htmlFor={`rating-note-${jobId}`}>
        {t.note}
      </label>
      <textarea
        id={`rating-note-${jobId}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={280}
        rows={2}
        placeholder={t.notePlaceholder}
        className="w-full resize-y rounded-[10px] border border-[var(--lp-workspace-border)] bg-transparent px-3 py-2 text-[15px] text-[var(--lp-workspace-ink)]"
      />
      {failed ? (
        <p role="alert" className="text-[14px] text-[var(--lp-workspace-ink)]">
          {t.failed}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!stars || saving}
        className="inline-flex min-h-11 items-center rounded-full border border-[var(--lp-workspace-border)] px-5 text-[14px] font-semibold text-[var(--lp-workspace-ink)] disabled:opacity-50"
      >
        {saving ? t.saving : t.submit}
      </button>
    </form>
  );
}
