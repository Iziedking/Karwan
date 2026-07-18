'use client';
import { useState } from 'react';
import { api } from '@/core/api';
import { useLocale } from '@/shared/i18n/LocaleProvider';

/// Plain-language help for a failed action. Sits beside the raw error and, on
/// tap, asks the backend supervisor to explain what went wrong and what the user
/// can do. Party-gated + rate-limited server-side; the response is written in the
/// user's locale. Opt-in (a tap, not auto) so a failure never fires a model call
/// the user didn't ask for. Pass `jobId` when the failure was on a deal.
export function FailureHelp({
  error,
  action,
  jobId,
}: {
  error: string;
  action: string;
  jobId?: string;
}) {
  const { t, locale } = useLocale();
  const eh = t.errorHelp;
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [diagnosis, setDiagnosis] = useState<{ summary: string; suggestedFix: string } | null>(null);

  async function explain() {
    setState('loading');
    try {
      const r = await api.diagnose({ action, errorMessage: error, jobId, locale });
      setDiagnosis(r.diagnosis);
      setState('done');
    } catch {
      setState('error');
    }
  }

  if (state === 'idle') {
    return (
      <button
        type="button"
        onClick={explain}
        className="mono text-[11px] uppercase tracking-[0.1em] underline underline-offset-2 text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors"
      >
        {eh.explainCta}
      </button>
    );
  }

  if (state === 'loading') {
    return <p className="text-[11px] text-[var(--color-ink-dim)]">{eh.explaining}</p>;
  }

  if (state === 'error') {
    return <p className="text-[11px] text-[var(--color-ink-dim)]">{eh.failed}</p>;
  }

  return (
    <div
      className="mt-1 p-3 space-y-2.5"
      style={{
        background: 'var(--color-surface, #fff)',
        border: '1px solid var(--color-line, rgba(0,0,0,0.1))',
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 3,
      }}
    >
      <div>
        <p className="mono text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-dim)]">
          {eh.whatHappened}
        </p>
        <p className="mt-1 text-[12.5px] leading-snug text-[var(--color-ink)]">{diagnosis?.summary}</p>
      </div>
      <div>
        <p className="mono text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-dim)]">
          {eh.whatToDo}
        </p>
        <p className="mt-1 text-[12.5px] leading-snug text-[var(--color-ink)]">{diagnosis?.suggestedFix}</p>
      </div>
    </div>
  );
}
