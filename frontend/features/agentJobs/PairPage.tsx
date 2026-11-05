'use client';

import { useState } from 'react';
import { api } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ALERT, PRIMARY } from '@/shared/ui/controls';
import { usePersonSession } from './usePersonSession';

/// The one-time pairing an outside agent sends its person (view 15): one World
/// ID check, after which only this person can approve paying a seller.
export function PairPage({ token }: { token: string }) {
  const t = useTranslations().agentJobs;
  const [done, setDone] = useState(false);
  const check = usePersonSession({
    copy: t.errors,
    request: () => api.agentPairRequest(token),
    verify: async (result) => {
      await api.agentPair(token, result);
      setDone(true);
    },
  });

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-12 sm:py-16">
      <h1 className="text-[28px] font-semibold leading-tight text-[var(--lp-ink)]">{done ? t.pair.done : t.pair.title}</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-[var(--ink-secondary)]">{done ? t.pair.doneLead : t.pair.lead}</p>
      {done ? null : (
        <button type="button" onClick={() => void check.begin()} disabled={check.phase !== 'idle'} aria-busy={check.phase !== 'idle'} className={`mt-8 ${PRIMARY}`}>
          {check.phase === 'idle' ? t.pair.start : t.checking}
        </button>
      )}
      {check.error ? <p role="alert" className={`mt-4 ${ALERT}`}>{check.error}</p> : null}
      {check.widget}
    </main>
  );
}
