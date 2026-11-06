'use client';
import { MoneyInput } from '@/features/money/components/MoneyInput';

import { CARD_CLASS } from '@/shared/components/Card';
import { buttonClasses } from '@/shared/components/Button';
import Link from 'next/link';
import { TaskEntryLink } from '@/shared/components/TaskEntryLink';
import { signInHref } from '@/shared/auth/signInHref';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, type RankedWorkOffer, type WorkCard, type WorkRequestView } from '@/core/api';
import { fill } from '@/features/deals/workspace/presentation';
import { Sheet, fieldLabel, primaryButton, quietButton } from '@/features/deals/workspace/Sheet';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ALERT } from '@/shared/ui/controls';
import { localDay, microsToUsdc } from '../workModel';
import { SellerBlock } from './SellerBlock';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';

const GREEN = buttonClasses({ size: 'lg' });
const QUIET_BUTTON = buttonClasses({ variant: 'secondary', size: 'lg' });

/// Posted hourly work (view 32). The hirer sees the offers their agent ranked,
/// best fit first, and hires one; a seller offers a rate; anyone else reads it.
export function WorkRequestPage({ id }: { id: string }) {
  const mt = useMoneyText({ compact: true });
  const all = useTranslations().work;
  const t = all.requests;
  const { locale } = useLocale();
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [r, setR] = useState<WorkRequestView | null>(null);
  const [missing, setMissing] = useState(false);
  const [hiring, setHiring] = useState<{ offer: RankedWorkOffer; card: WorkCard } | null>(null);
  const [closing, setClosing] = useState(false);
  const [rate, setRate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getWorkRequest(id).then((v) => setR(v.request)).catch((err) => { if (err instanceof ApiError && err.status === 404) setMissing(true); });
  }, [id]);
  useEffect(() => {
    load();
    const poll = window.setInterval(load, 15_000);
    return () => window.clearInterval(poll);
  }, [load]);

  if (missing) return <main className="mx-auto max-w-[760px] px-4 pt-8 sm:px-6"><p className="text-[15px] text-[var(--ink-secondary)]">{all.failed}</p></main>;
  if (!r) return null;

  const hourly = r.kind === 'hourly';
  const usdc = (m: string) => mt.text(microsToUsdc(m));
  const fail = (err: unknown) => {
    const need = err instanceof ApiError ? (err.body as { needMicros?: string } | undefined)?.needMicros : undefined;
    setError(need ? fill(all.card.short, { amount: microsToUsdc(need) }) : err instanceof ApiError ? err.message : all.failed);
  };
  const run = async (step: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await step();
      load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const openHire = async (offer: RankedWorkOffer) => {
    setError(null);
    try {
      setHiring({ offer, card: (await api.workHireCard(r.id, offer.offerId)).card });
    } catch (err) {
      fail(err);
    }
  };
  const hire = async () => {
    if (!hiring) return;
    setBusy(true);
    setError(null);
    try {
      const out = await api.hireFromWorkRequest(r.id, hiring.offer.offerId);
      router.push(`/work/${out.workId}`);
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  };
  const open = r.status === 'open' && Date.now() < r.offersCloseAt;
  const mine = r.myOffer;

  return (
    <main className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-8 sm:px-6">
      <p className="text-[14px] font-semibold text-[var(--ink-secondary)]">{t.page.status[r.status]}</p>
      <h1 dir="auto" className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)]">{r.title}</h1>
      <p className="mt-4 text-[24px] font-semibold tabular-nums text-[var(--ink)]">
        {fill(hourly ? t.market.upTo : t.market.upToMonth, { amount: microsToUsdc(r.maxRateMicros) })}
      </p>
      <p className="mt-1 text-[15px] text-[var(--ink-secondary)]">
        {[hourly ? fill(all.page.upTo, { n: r.maxHours }) : null, fill(hourly ? all.page.weeks : all.page.months, { n: r.periods }), fill(all.page.starts, { date: localDay(r.startsAt, locale) }), open ? fill(t.market.closes, { date: localDay(r.offersCloseAt, locale) }) : null].filter(Boolean).join(' · ')}
      </p>
      <p dir="auto" className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-[var(--ink)]">{r.brief}</p>
      {error && !hiring && !closing ? <p role="alert" className={`${ALERT} mt-5`}>{error}</p> : null}

      {r.mine ? (
        <section aria-labelledby="offers-title" className="mt-8">
          <h2 id="offers-title" className="text-[17px] font-semibold text-[var(--ink)]">{t.page.offers}</h2>
          {r.workId ? <Link href={`/work/${r.workId}`} className={`${GREEN} mt-4`}>{t.page.openWork}</Link> : null}
          {(r.offers ?? []).length === 0 ? <p className="mt-3 text-[15px] text-[var(--ink-secondary)]">{t.page.noOffers}</p> : null}
          <ul className={`${CARD_CLASS} mt-3 divide-y divide-[var(--line)] px-5`}>
            {(r.offers ?? []).map((o) => (
              <li key={o.offerId} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <SellerBlock offer={o} />
                  <p className="shrink-0 text-end tabular-nums">
                    <span className="block text-[18px] font-semibold text-[var(--ink)]">{usdc(o.rateMicros)}</span>
                    {o.overMost ? <span className="block text-[14px] font-medium text-[var(--ink-secondary)]">{t.page.over}</span> : null}
                  </p>
                </div>
                {o.note ? <p dir="auto" className="mt-2 ps-[52px] text-[14px] text-[var(--ink-secondary)]">{o.note}</p> : null}
                {open ? (
                  <div className="mt-3 ps-[52px]">
                    <button type="button" onClick={() => void openHire(o)} className={o.recommended ? GREEN : QUIET_BUTTON} aria-label={`${t.page.hire} ${o.name}`}>{t.page.hire}</button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {open ? <button type="button" onClick={() => setClosing(true)} className={`${QUIET_BUTTON} mt-6`}>{t.page.close}</button> : null}
        </section>
      ) : !isAuthenticated ? (
        open ? <TaskEntryLink href={signInHref(`/work/requests/${encodeURIComponent(r.id)}`)} className={`${GREEN} mt-8`}>{t.page.signIn}</TaskEntryLink> : null
      ) : (
        <section aria-labelledby="your-offer" className="mt-8">
          <h2 id="your-offer" className="text-[17px] font-semibold text-[var(--ink)]">{t.page.yourOffer}</h2>
          {mine ? <p className="mt-2 text-[15px] text-[var(--ink)]">{usdc(mine.rateMicros)} · {t.page.offerStatus[mine.status]}</p> : null}
          {open ? (
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className={fieldLabel}>{hourly ? t.page.yourRate : t.page.yourPrice}</span>
                <span className="mt-2 block"><MoneyInput value={rate} onChange={(usdc) => setRate(usdc === null ? '' : String(usdc))} className="form-input block tabular-nums" /></span>
              </label>
              <label className="block">
                <span className={fieldLabel}>{t.page.note}</span>
                <textarea className={`form-input block w-full mt-2 min-h-24 py-3`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-3">
                <button type="button" disabled={busy || !(Number(rate) > 0)} onClick={() => void run(() => api.offerOnWorkRequest(r.id, { rateUsdc: rate, note: note.trim() }))} className={GREEN}>
                  {mine?.status === 'live' ? t.page.change : t.page.send}
                </button>
                {mine?.status === 'live' ? <button type="button" disabled={busy} onClick={() => void run(() => api.withdrawWorkOffer(r.id))} className={QUIET_BUTTON}>{t.page.withdraw}</button> : null}
              </div>
            </div>
          ) : null}
        </section>
      )}

      <Sheet open={!!hiring} title={t.hireSheet.title} busy={busy} onClose={() => { setHiring(null); setError(null); }}>
        {hiring ? (
          <>
            <p className="text-[32px] font-semibold tabular-nums text-[var(--ink)]">{usdc(hiring.card.totalMicros)}</p>
            <div className="mt-4"><SellerBlock offer={hiring.offer} /></div>
            <dl className={`${CARD_CLASS} mt-4 divide-y divide-[var(--line)] px-5 text-[15px]`}>
              {[
                [hourly ? all.card.firstWeek : all.card.firstMonth, usdc(hiring.card.budgetMicros)],
                [all.card.fee, usdc(hiring.card.feeHalfMicros)],
                [fill(hourly ? all.card.mostWeeks : all.card.mostMonths, { n: hiring.card.periods }), usdc(hiring.card.mostMicros)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-3">
                  <dt className="text-[var(--ink-secondary)]">{k}</dt>
                  <dd className="font-semibold tabular-nums text-[var(--ink)]">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[14px] text-[var(--ink-secondary)]">{t.hireSheet.body}</p>
            {error ? <p role="alert" className={`${ALERT} mt-4`}>{error}</p> : null}
            <div className="mt-6 space-y-3">
              <button type="button" disabled={busy} onClick={() => void hire()} className={primaryButton}>{fill(t.hireSheet.confirm, { amount: microsToUsdc(hiring.card.totalMicros) })}</button>
              <button type="button" disabled={busy} onClick={() => setHiring(null)} className={quietButton}>{all.notNow}</button>
            </div>
          </>
        ) : null}
      </Sheet>

      <Sheet open={closing} title={t.closeSheet.title} busy={busy} onClose={() => { setClosing(false); setError(null); }}>
        <p className="text-[15px] leading-relaxed text-[var(--ink)]">{t.closeSheet.body}</p>
        {error ? <p role="alert" className={`${ALERT} mt-4`}>{error}</p> : null}
        <div className="mt-6 space-y-3">
          <button type="button" disabled={busy} onClick={() => void run(async () => { await api.closeWorkRequest(r.id); setClosing(false); })} className={primaryButton}>{t.closeSheet.confirm}</button>
          <button type="button" disabled={busy} onClick={() => setClosing(false)} className={quietButton}>{all.notNow}</button>
        </div>
      </Sheet>
    </main>
  );
}
