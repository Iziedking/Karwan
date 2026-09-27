'use client';

import { useState } from 'react';
import { api } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { START_CARD } from '@/features/signup/components/cardStyles';

export function CancelRecovery({ token }: { token: string }) {
  const t = useTranslations().recovery.cancelPage;
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'invalid'>(token.length >= 20 ? 'idle' : 'invalid');

  async function cancel() {
    setState('busy');
    try {
      await api.recoveryCancel(token);
      setState('done');
    } catch {
      setState('invalid');
    }
  }

  return (
    <div className={START_CARD}>
      <h1 className="text-[22px] font-bold leading-[1.15] tracking-[-0.03em] text-[var(--lp-dark)] sm:text-[26px]">
        {state === 'done' ? t.done : t.title}
      </h1>
      <p role="status" className="mt-2 text-[14px] leading-[1.5] text-[var(--lp-text-sub)] sm:text-[15px]">
        {state === 'done' ? t.doneBody : state === 'invalid' ? t.invalid : t.body}
      </p>
      {(state === 'idle' || state === 'busy') && (
        <button type="button" onClick={() => void cancel()} disabled={state === 'busy'}
          className="mt-6 inline-flex min-h-12 sm:min-h-[52px] w-full items-center justify-center rounded-[12px] bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)] disabled:opacity-50">
          {state === 'busy' ? t.cancelling : t.cancel}
        </button>
      )}
    </div>
  );
}
