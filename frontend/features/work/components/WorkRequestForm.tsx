'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, type WorkKind, type WorkRequestInput } from '@/core/api';
import { fieldLabel } from '@/features/deals/workspace/Sheet';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ALERT, FIELD, PRIMARY } from '@/shared/ui/controls';

/// Post hourly work on the market (view 32). Posting moves no money: sellers
/// who fit are told and offer a rate, and the hirer's agent ranks them.
export function WorkRequestForm({ prefill }: { prefill: Partial<WorkRequestInput> }) {
  const all = useTranslations().work;
  const t = all.requests;
  const router = useRouter();
  const [kind, setKind] = useState<WorkKind>(prefill.kind === 'monthly' ? 'monthly' : 'hourly');
  const [title, setTitle] = useState(prefill.title ?? '');
  const [brief, setBrief] = useState(prefill.brief ?? '');
  const [most, setMost] = useState(prefill.maxRateUsdc ?? '');
  const [hours, setHours] = useState(String(prefill.maxHours ?? ''));
  const [periods, setPeriods] = useState(String(prefill.periods ?? ''));
  const [starts, setStarts] = useState(String(prefill.startsInDays ?? 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hourly = kind === 'hourly';
  const ready = title.trim() && brief.trim() && Number(most) > 0 && Number(periods) >= 1 && (!hourly || Number(hours) >= 1);

  async function post() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.postWorkRequest({
        kind, title, brief, maxRateUsdc: most, periods: Number(periods), startsInDays: Number(starts), ...(hourly ? { maxHours: Number(hours) } : {}),
      });
      router.push(`/work/requests/${r.request.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : all.failed);
      setBusy(false);
    }
  }

  const toggle = (k: WorkKind, label: string) => (
    <button
      key={k}
      type="button"
      role="radio"
      aria-checked={kind === k}
      onClick={() => setKind(k)}
      className={`min-h-11 rounded-full border px-4 text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${kind === k ? 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-bg)]' : 'border-[var(--lp-border-light)] bg-[var(--tint)] text-[var(--lp-dark)]'}`}
    >
      {label}
    </button>
  );
  const num = (v: string, set: (s: string) => void, max: number) => set(v.replace(/\D/g, '').slice(0, max));

  return (
    <main className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-8 sm:px-6">
      <h1 className="text-[28px] font-semibold text-[var(--lp-dark)]">{t.form.title}</h1>
      <div className="mt-6 space-y-5">
        <label className="block">
          <span className={fieldLabel}>{all.form.what}</span>
          <input className={`${FIELD} mt-2`} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className={fieldLabel}>{all.form.brief}</span>
          <textarea className={`${FIELD} mt-2 min-h-28 py-3`} value={brief} maxLength={1500} onChange={(e) => setBrief(e.target.value)} />
          <span className="mt-1 block text-[14px] text-[var(--lp-text-sub)]">{t.form.briefHint}</span>
        </label>
        <fieldset>
          <legend className={fieldLabel}>{all.form.how}</legend>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
            {toggle('hourly', all.form.hourly)}
            {toggle('monthly', all.form.monthly)}
          </div>
        </fieldset>
        <label className="block">
          <span className={fieldLabel}>{hourly ? t.form.most : t.form.mostMonthly}</span>
          <input className={`${FIELD} mt-2 tabular-nums`} inputMode="decimal" value={most} onChange={(e) => setMost(e.target.value.replace(/[^0-9.]/g, ''))} />
        </label>
        {hourly ? (
          <label className="block">
            <span className={fieldLabel}>{all.form.hours}</span>
            <input className={`${FIELD} mt-2 tabular-nums`} inputMode="numeric" value={hours} onChange={(e) => num(e.target.value, setHours, 2)} />
          </label>
        ) : null}
        <label className="block">
          <span className={fieldLabel}>{hourly ? all.form.weeks : all.form.months}</span>
          <input className={`${FIELD} mt-2 tabular-nums`} inputMode="numeric" value={periods} onChange={(e) => num(e.target.value, setPeriods, 2)} />
        </label>
        <label className="block">
          <span className={fieldLabel}>{t.form.starts}</span>
          <input className={`${FIELD} mt-2 tabular-nums`} inputMode="numeric" value={starts} onChange={(e) => num(e.target.value, setStarts, 2)} />
          <span className="mt-1 block text-[14px] text-[var(--lp-text-sub)]">{t.form.startsHint}</span>
        </label>
      </div>
      {error ? <p role="alert" className={`${ALERT} mt-5`}>{error}</p> : null}
      <button type="button" disabled={!ready || busy} onClick={() => void post()} className={`${PRIMARY} mt-8 w-full sm:w-auto`}>
        {t.form.post}
      </button>
    </main>
  );
}
