'use client';
import { Price } from '@/features/money/components/Price';
import { PageTour } from '@/shared/guide/PageTour';
import { STAKE_STEPS, STAKE_TOUR_ID } from '@/shared/guide/tours';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { Hint } from '@/shared/components/Hint';
import { YieldClaimPanel } from '@/features/reputation/components/YieldClaimPanel';
import { UsycReservesWidget } from '@/features/reputation/components/UsycReservesWidget';
import { ReservesWidget } from '@/features/reputation/components/ReservesWidget';
import { guaranteeStepHref } from '@/features/money/moneyRoutes';
import { guaranteeView } from './guaranteeView';
import { useGuarantee } from './useGuarantee';

const fillIn = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));

/// Money's Deal guarantee tab (view 51, fifth round), laid out like Balance:
/// the label with its tip, the figure, Add and Withdraw, one card, then the
/// earnings. Each move opens its own page.
export function GuaranteeTab() {
  const { locale, t } = useLocale();
  const g = t.moneyPages.guarantee;
  const tips = t.moneyPages.tips;
  const c = t.dealGuarantee;
  const { query, data } = useGuarantee();
  const [earningsOpen, setEarningsOpen] = useState(false);
  const view = guaranteeView(data);
  const day = (unix: number) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(unix * 1000));

  // The page keeps its one heading while the guarantee loads, fails or is off.
  const plainTitle = <h1 id="money-guarantee" className="flex items-center gap-1.5 text-[13px] text-[var(--ink-secondary)]">{t.moneyPages.tabs.guarantee}<Hint>{tips.guarantee}</Hint></h1>;
  if (query.isError && !data) {
    return (
      <div className="space-y-3">
        {plainTitle}
        <div role="alert" className="space-y-3">
          <p className="text-[15px] text-[var(--ink)]">{c.notAvailable}</p>
          <button type="button" className={buttonClasses({ variant: 'secondary' })} onClick={() => void query.refetch()}>{c.refresh}</button>
        </div>
      </div>
    );
  }
  if (!view || !data) {
    return <div className="space-y-3">{plainTitle}<div aria-busy="true" className="h-40 rounded-[16px] bg-[var(--raised)] motion-safe:animate-pulse" /></div>;
  }
  if (view.kind === 'off' || !data.available) return <div className="space-y-3">{plainTitle}<p role="status" className="text-[15px] text-[var(--ink-secondary)]">{g.off}</p></div>;

  const comingBack = Number(data.comingBackUsdc);
  const rows: [string, ReactNode][] = [
    [g.earns, g.earnsValue],
    [g.holding, <Price key="held" usdc={Number(view.held)} size="inline" />],
    [g.ready, <Price key="free" usdc={Number(view.free)} size="inline" />],
    ...(comingBack > 0 && !data.ready && data.readyAt ? [[g.comingBack, fillIn(g.comingBackValue, { amount: data.comingBackUsdc, date: day(data.readyAt) })] as [string, ReactNode]] : []),
    ...(comingBack > 0 && data.ready ? [[g.comingBack, fillIn(g.readyToCollect, { amount: data.comingBackUsdc })] as [string, ReactNode]] : []),
  ];

  return (
    <div data-guarantee-tab data-guide="guarantee" className="space-y-5">
      <PageTour id={STAKE_TOUR_ID} steps={STAKE_STEPS} />
      <h1 id="money-guarantee" className="space-y-1.5">
        <span className="flex items-center gap-1.5 text-[13px] text-[var(--ink-secondary)]">{t.moneyPages.tabs.guarantee}<Hint>{tips.guarantee}</Hint></span>
        <span data-guaranteed className="block"><Price usdc={Number(view.guaranteed)} size="block" /></span>
        <span className="block text-[13px] font-medium text-[var(--ink-secondary)]">{g.inPlace}. {g.notCounted}</span>
      </h1>
      <div data-guarantee-actions data-guide="guarantee-actions" className="grid grid-cols-2 gap-2 sm:gap-3">
        <Link href={guaranteeStepHref('put_up')} className={buttonClasses({ size: 'lg' })}>{g.add}</Link>
        {Number(data.freeUsdc) > 0 ? <Link href={guaranteeStepHref('take_out')} className={buttonClasses({ variant: 'secondary', size: 'lg' })}>{g.withdraw}</Link> : null}
        {comingBack > 0 && data.ready ? <Link href="/account/guarantee?step=collect" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>{g.collect}</Link> : null}
        {comingBack > 0 ? <Link href="/account/guarantee?step=cancel" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>{g.cancel}</Link> : null}
      </div>
      <dl data-guide="guarantee-facts" className={`${CARD_CLASS} divide-y divide-[var(--line)] px-5`}>
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-h-[52px] items-center justify-between gap-3 py-3 text-[15px] tabular-nums">
            <dt className="text-[var(--ink-secondary)]">{k}</dt>
            <dd className="font-medium text-[var(--ink)]">{v}</dd>
          </div>
        ))}
      </dl>
      {Number(data.previousUsdc) > 0 ? (
        <p className="text-[14px] font-medium text-[var(--ink-secondary)]">
          {fillIn(c.previous.line, { amount: data.previousUsdc })}{' '}
          <Link href="/legacy#previous-guarantee" className="font-semibold text-[var(--ink)] underline underline-offset-4">{c.previous.link}</Link>
        </p>
      ) : null}
      <section aria-labelledby="guarantee-earnings" className="space-y-3">
        <button
          type="button"
          id="guarantee-earnings"
          aria-expanded={earningsOpen}
          onClick={() => setEarningsOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between text-[17px] font-semibold text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
        >
          {g.earnings}
          <span aria-hidden className={`text-[var(--ink-secondary)] transition-transform ${earningsOpen ? 'rotate-180' : ''}`}>⌄</span>
        </button>
        {earningsOpen ? (
          <div className="grid gap-4">
            <div className={`${CARD_CLASS} p-5`}><YieldClaimPanel /></div>
            <UsycReservesWidget />
            <ReservesWidget />
          </div>
        ) : null}
      </section>
    </div>
  );
}
