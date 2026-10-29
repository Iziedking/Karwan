'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, type WorkCard, type WorkInput, type WorkKind } from '@/core/api';
import { fill } from '@/features/deals/workspace/presentation';
import { Sheet, fieldLabel, primaryButton, quietButton } from '@/features/deals/workspace/Sheet';
import { useTagRecipient } from '@/features/money/hooks/useTagRecipient';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ALERT, FIELD, PRIMARY } from '@/shared/ui/controls';
import { localDay, microsToUsdc } from '../workModel';

/// Hire someone by the hour or monthly (view 32): who, how you pay, the rate
/// and how long; then one sheet with every figure before the buying agent
/// pays for the first week.
export function WorkForm({ prefill }: { prefill: Partial<WorkInput> }) {
  const t = useTranslations().work;
  const { locale } = useLocale();
  const router = useRouter();
  const [who, setWho] = useState((prefill.worker ?? '').replace(/^@/, ''));
  const [kind, setKind] = useState<WorkKind>(prefill.kind === 'monthly' ? 'monthly' : 'hourly');
  const [rate, setRate] = useState(prefill.rateUsdc ?? '');
  const [hours, setHours] = useState(String(prefill.maxHours ?? ''));
  const [periods, setPeriods] = useState(String(prefill.periods ?? ''));
  const [starts, setStarts] = useState(String(prefill.startsInDays ?? 2));
  const [title, setTitle] = useState(prefill.title ?? '');
  const [brief, setBrief] = useState(prefill.brief ?? '');
  const [card, setCard] = useState<WorkCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tag = who.trim().replace(/^@/, '').toLowerCase();
  const lookup = useTagRecipient(tag.length >= 2 ? tag : null);
  const found = lookup?.state === 'done' && lookup.result.found && !lookup.result.self ? lookup.result : null;
  const hourly = kind === 'hourly';

  const input = (): WorkInput => ({
    worker: `@${tag}`, kind, rateUsdc: rate, periods: Number(periods), startsInDays: Number(starts), title, brief,
    ...(hourly ? { maxHours: Number(hours) } : {}),
  });
  const usdc = (m: string) => `${microsToUsdc(m)} USDC`;

  async function review() {
    setError(null);
    setBusy(true);
    try {
      setCard((await api.draftWork(input())).card);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.offerWork(input());
      router.push(`/work/${r.work.id}`);
    } catch (err) {
      const need = err instanceof ApiError ? (err.body as { needMicros?: string } | undefined)?.needMicros : undefined;
      setError(need ? fill(t.card.short, { amount: microsToUsdc(need) }) : err instanceof ApiError ? err.message : t.failed);
      setBusy(false);
    }
  }

  const ready = !!found && Number(rate) > 0 && Number(periods) >= 1 && (!hourly || Number(hours) >= 1) && title.trim().length > 0;
  const tagLine = !tag || tag.length < 2 || !lookup || lookup.state === 'checking'
    ? t.form.whoHint
    : lookup.state === 'done' && lookup.result.found
      ? (lookup.result.self ? t.form.whoSelf : fill(t.form.whoFound, { name: lookup.result.displayName, tag: lookup.result.tag }))
      : t.form.whoMissing;
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

  return (
    <main className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-8 sm:px-6">
      <h1 className="text-[28px] font-semibold text-[var(--lp-dark)]">{t.form.title}</h1>
      <p className="mt-2 text-[15px] text-[var(--lp-text-sub)]">
        {t.requests.findBody}{' '}
        <Link href="/work/requests/new" className="font-semibold text-[var(--lp-dark)] underline underline-offset-2">{t.requests.findTitle}</Link>
      </p>
      <div className="mt-6 space-y-5">
        <label className="block">
          <span className={fieldLabel}>{t.form.who}</span>
          <input className={`${FIELD} mt-2`} value={who} maxLength={40} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => setWho(e.target.value)} />
          <span aria-live="polite" className={`mt-1 block text-[14px] ${found ? 'font-semibold text-[var(--lp-dark)]' : 'text-[var(--lp-text-sub)]'}`}>{tagLine}</span>
        </label>
        <fieldset>
          <legend className={fieldLabel}>{t.form.how}</legend>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
            {toggle('hourly', t.form.hourly)}
            {toggle('monthly', t.form.monthly)}
          </div>
        </fieldset>
        <label className="block">
          <span className={fieldLabel}>{hourly ? t.form.rate : t.form.rateMonthly}</span>
          <input className={`${FIELD} mt-2 tabular-nums`} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ''))} />
        </label>
        {hourly ? (
          <label className="block">
            <span className={fieldLabel}>{t.form.hours}</span>
            <input className={`${FIELD} mt-2 tabular-nums`} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </label>
        ) : null}
        <label className="block">
          <span className={fieldLabel}>{hourly ? t.form.weeks : t.form.months}</span>
          <input className={`${FIELD} mt-2 tabular-nums`} inputMode="numeric" value={periods} onChange={(e) => setPeriods(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        </label>
        <label className="block">
          <span className={fieldLabel}>{t.form.starts}</span>
          <input className={`${FIELD} mt-2 tabular-nums`} inputMode="numeric" value={starts} onChange={(e) => setStarts(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          <span className="mt-1 block text-[14px] text-[var(--lp-text-sub)]">{t.form.startsHint}</span>
        </label>
        <label className="block">
          <span className={fieldLabel}>{t.form.what}</span>
          <input className={`${FIELD} mt-2`} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className={fieldLabel}>{t.form.brief}</span>
          <textarea className={`${FIELD} mt-2 min-h-28 py-3`} value={brief} maxLength={1500} onChange={(e) => setBrief(e.target.value)} />
        </label>
      </div>
      {error && !card ? <p role="alert" className={`${ALERT} mt-5`}>{error}</p> : null}
      <button type="button" disabled={!ready || busy} onClick={() => void review()} className={`${PRIMARY} mt-8 w-full sm:w-auto`}>
        {t.form.review}
      </button>

      <Sheet open={!!card} title={t.card.title} busy={busy} onClose={() => { setCard(null); setError(null); }}>
        {card ? (
          <>
            <p className="text-[32px] font-semibold tabular-nums text-[var(--lp-dark)]">{usdc(card.totalMicros)}</p>
            {found ? <p className="mt-1 text-[15px] font-semibold text-[var(--lp-dark)]">{fill(t.form.whoFound, { name: found.displayName, tag: found.tag })}</p> : null}
            <dl className="mt-4 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)] text-[15px]">
              {[
                [hourly ? t.card.firstWeek : t.card.firstMonth, usdc(card.budgetMicros)],
                [t.card.fee, usdc(card.feeHalfMicros)],
                [fill(hourly ? t.card.mostWeeks : t.card.mostMonths, { n: card.periods }), usdc(card.mostMicros)],
                [t.card.starts, localDay(card.startsAt, locale)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-3">
                  <dt className="text-[var(--lp-text-sub)]">{k}</dt>
                  <dd className="font-semibold tabular-nums text-[var(--lp-dark)]">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[14px] text-[var(--lp-text-sub)]">{card.note}</p>
            {error ? <p role="alert" className={`${ALERT} mt-4`}>{error}</p> : null}
            <div className="mt-6 space-y-3">
              <button type="button" disabled={busy} onClick={() => void confirm()} className={primaryButton}>
                {fill(t.card.confirm, { amount: microsToUsdc(card.totalMicros) })}
              </button>
              <button type="button" disabled={busy} onClick={() => setCard(null)} className={quietButton}>{t.notNow}</button>
            </div>
          </>
        ) : null}
      </Sheet>
    </main>
  );
}
