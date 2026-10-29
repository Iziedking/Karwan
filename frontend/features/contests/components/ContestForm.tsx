'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, type ContestCard, type ContestInput } from '@/core/api';
import { fill } from '@/features/deals/workspace/presentation';
import { Sheet, fieldLabel, primaryButton, quietButton } from '@/features/deals/workspace/Sheet';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ALERT, FIELD, PRIMARY } from '@/shared/ui/controls';
import { microsToUsdc } from '../contestModel';

/// Run a contest (view 40): what it is for, the prize, how many winners and
/// how long entries stay open; then one sheet with every figure before the
/// buying agent puts up the prize.
export function ContestForm({ prefill }: { prefill: Partial<ContestInput> }) {
  const t = useTranslations().contests;
  const { locale } = useLocale();
  const router = useRouter();
  const [title, setTitle] = useState(prefill.title ?? '');
  const [brief, setBrief] = useState(prefill.brief ?? '');
  const [prize, setPrize] = useState(prefill.prizeUsdc ?? '');
  const [places, setPlaces] = useState(prefill.places && prefill.places >= 1 && prefill.places <= 3 ? prefill.places : 1);
  const [days, setDays] = useState(String(prefill.entriesDays ?? 7));
  const [card, setCard] = useState<ContestCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = (): ContestInput => ({ title, brief, prizeUsdc: prize, places, entriesDays: Number(days), ...(prefill.awardDays ? { awardDays: prefill.awardDays } : {}) });
  const date = (ms: number) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(ms);
  const usdc = (m: string) => `${microsToUsdc(m)} USDC`;

  async function review() {
    setError(null);
    setBusy(true);
    try {
      setCard((await api.draftContest(input())).card);
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
      const r = await api.postContest(input());
      router.push(`/contests/${r.contest.id}`);
    } catch (err) {
      const need = err instanceof ApiError ? (err.body as { needMicros?: string } | undefined)?.needMicros : undefined;
      setError(need ? fill(t.card.short, { amount: microsToUsdc(need) }) : err instanceof ApiError ? err.message : t.failed);
      setBusy(false);
    }
  }

  const ready = title.trim() && brief.trim() && Number(prize) > 0 && Number(days) >= 1 && Number(days) <= 30;
  return (
    <main className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-8 sm:px-6">
      <h1 className="text-[28px] font-semibold text-[var(--lp-dark)]">{t.form.title}</h1>
      <div className="mt-6 space-y-5">
        <label className="block">
          <span className={fieldLabel}>{t.form.what}</span>
          <input className={`${FIELD} mt-2`} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className={fieldLabel}>{t.form.brief}</span>
          <textarea className={`${FIELD} mt-2 min-h-32 py-3`} value={brief} maxLength={1500} onChange={(e) => setBrief(e.target.value)} />
          <span className="mt-1 block text-[14px] text-[var(--lp-text-sub)]">{t.form.briefHint}</span>
        </label>
        <label className="block">
          <span className={fieldLabel}>{t.form.prize}</span>
          <input className={`${FIELD} mt-2 tabular-nums`} inputMode="decimal" value={prize} onChange={(e) => setPrize(e.target.value.replace(/[^0-9.]/g, ''))} />
        </label>
        <fieldset>
          <legend className={fieldLabel}>{t.form.places}</legend>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
            {t.form.placesOptions.map((label, i) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={places === i + 1}
                onClick={() => setPlaces(i + 1)}
                className={`min-h-11 rounded-full border px-4 text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${places === i + 1 ? 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-bg)]' : 'border-[var(--lp-border-light)] bg-[var(--tint)] text-[var(--lp-dark)]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className={fieldLabel}>{t.form.days}</span>
          <input className={`${FIELD} mt-2 tabular-nums`} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          <span className="mt-1 block text-[14px] text-[var(--lp-text-sub)]">{t.form.daysHint}</span>
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
            <dl className="mt-4 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)] text-[15px]">
              {[
                [t.card.prize, usdc(card.prizeMicros)],
                [t.card.fee, usdc(card.feeHalfMicros)],
                ...card.placeNetMicros.map((m, i) => [t.card.placeGets[i]!, usdc(m)] as const),
                [t.card.closes, date(card.entriesBy)],
                [t.card.pickBy, date(card.awardBy)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-3">
                  <dt className="text-[var(--lp-text-sub)]">{k}</dt>
                  <dd className="font-semibold tabular-nums text-[var(--lp-dark)]">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[14px] text-[var(--lp-text-sub)]">{card.ifNobody}</p>
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
