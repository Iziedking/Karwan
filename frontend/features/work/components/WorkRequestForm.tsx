'use client';
import { MoneyInput, type MoneyInputHandle } from '@/features/money/components/MoneyInput';

import { buttonClasses } from '@/shared/components/Button';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, type WorkKind, type WorkRequestInput } from '@/core/api';
import { fieldLabel } from '@/features/deals/workspace/Sheet';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ALERT } from '@/shared/ui/controls';
import { SessionsField, sessionsOk } from './SessionsField';

const GREEN = buttonClasses({ size: 'lg' });

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
  const [sessions, setSessions] = useState(String(prefill.sessions ?? ''));
  const [starts, setStarts] = useState(String(prefill.startsInDays ?? 7));
  const mostField = useRef<MoneyInputHandle>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hourly = kind === 'hourly';
  const ready = title.trim() && brief.trim() && Number(most) > 0 && Number(periods) >= 1 && (!hourly || Number(hours) >= 1) && (hourly || sessionsOk(sessions));

  async function post() {
    setBusy(true);
    setError(null);
    try {
      const said = await mostField.current?.quote();
      const r = await api.postWorkRequest({
        ...(said && said.usdc === Number(most) ? { quote: said.token } : {}),
        kind, title, brief, maxRateUsdc: most, periods: Number(periods), startsInDays: Number(starts), ...(hourly ? { maxHours: Number(hours) } : Number(sessions) >= 1 ? { sessions: Number(sessions) } : {}),
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
      className={`min-h-11 rounded-[9px] px-4 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] ${kind === k ? 'bg-[var(--surface)] font-semibold text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--ink)]' : 'font-medium text-[var(--ink-secondary)]'}`}
    >
      {label}
    </button>
  );
  const num = (v: string, set: (s: string) => void, max: number) => set(v.replace(/\D/g, '').slice(0, max));

  return (
    <main className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-8 sm:px-6">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)]">{hourly ? t.form.title : all.sessions.postTitle}</h1>
      <div className="mt-6 space-y-5">
        <label className="block">
          <span className={fieldLabel}>{all.form.what}</span>
          <input className={`form-input block w-full mt-2`} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className={fieldLabel}>{all.form.brief}</span>
          <textarea className={`form-input block w-full mt-2 min-h-28 py-3`} value={brief} maxLength={1500} onChange={(e) => setBrief(e.target.value)} />
          <span className="mt-1 block text-[14px] text-[var(--ink-secondary)]">{t.form.briefHint}</span>
        </label>
        <fieldset>
          <legend className={fieldLabel}>{all.form.how}</legend>
          <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-[12px] bg-[var(--ash)] p-1">
            {toggle('hourly', all.form.hourly)}
            {toggle('monthly', all.form.monthly)}
          </div>
        </fieldset>
        <label className="block">
          <span className={fieldLabel}>{hourly ? t.form.most : t.form.mostMonthly}</span>
          <span className="mt-2 block"><MoneyInput value={most} handle={mostField} onChange={(usdc) => setMost(usdc === null ? '' : String(usdc))} className="form-input block tabular-nums" /></span>
        </label>
        {hourly ? (
          <label className="block">
            <span className={fieldLabel}>{all.form.hours}</span>
            <input className={`form-input block w-full mt-2 tabular-nums`} inputMode="numeric" value={hours} onChange={(e) => num(e.target.value, setHours, 2)} />
          </label>
        ) : <SessionsField value={sessions} onChange={setSessions} monthUsdc={most} />}
        <label className="block">
          <span className={fieldLabel}>{hourly ? all.form.weeks : all.form.months}</span>
          <input className={`form-input block w-full mt-2 tabular-nums`} inputMode="numeric" value={periods} onChange={(e) => num(e.target.value, setPeriods, 2)} />
        </label>
        <label className="block">
          <span className={fieldLabel}>{t.form.starts}</span>
          <input className={`form-input block w-full mt-2 tabular-nums`} inputMode="numeric" value={starts} onChange={(e) => num(e.target.value, setStarts, 2)} />
          <span className="mt-1 block text-[14px] text-[var(--ink-secondary)]">{t.form.startsHint}</span>
        </label>
      </div>
      {error ? <p role="alert" className={`${ALERT} mt-5`}>{error}</p> : null}
      <button type="button" disabled={!ready || busy} onClick={() => void post()} className={`${GREEN} mt-8 w-full sm:w-auto`}>
        {t.form.post}
      </button>
    </main>
  );
}
