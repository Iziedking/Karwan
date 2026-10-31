'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError, type Listing } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useActivation } from '@/shared/hooks/useActivation';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { Icon } from '@/shared/components/Icon';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';
import { fill, formatDealDate } from '@/features/deals/workspace/presentation';
import { useFundsLanded } from '@/features/deposit/useDepositWatch';
import { CATEGORY_IDS, type CategoryId } from '@/features/market/marketModel';
import { samplePhoto, sellerLine } from '@/features/market/listingFacts';
import { AddMoneyPanel } from './AddMoneyPanel';
import { orderPhase, shortfallUsdc, spendableUsdc, type OrderQuoteError } from './orderModel';
import { usePayOrder } from './usePayOrder';

const PRIMARY =
  'inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--action)] px-6 text-[15px] font-semibold text-[var(--on-action)] transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2';
const QUIET =
  'inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--tint)] px-6 text-[15px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--line)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]';

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className={strong ? 'text-[15px] font-semibold text-[var(--lp-dark)]' : 'text-[15px] text-[var(--lp-text-sub)]'}>{label}</span>
      <span className={`tabular-nums text-end ${strong ? 'text-[17px] font-semibold text-[var(--lp-dark)]' : 'text-[15px] font-medium text-[var(--lp-dark)]'}`}>{value}</span>
    </div>
  );
}

/// Review your order (view 44, Figma 05 to 09): what you get and when, one fee
/// line, your balance, then Add money or Pay. Pay asks once more in a sheet.
export function OrderPage({ listingId }: { listingId: string }) {
  const auth = useAuth();
  const router = useRouter();
  const next = `/order/${encodeURIComponent(listingId)}`;

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) router.replace(`/start?next=${encodeURIComponent(next)}`);
  }, [auth.isLoading, auth.isAuthenticated, router, next]);

  if (auth.isLoading || !auth.isAuthenticated || !auth.address) return <div aria-hidden className="min-h-[60vh]" />;
  return <OrderReview listingId={listingId} address={auth.address} circle={auth.method === 'circle'} />;
}

function OrderReview({ listingId, address, circle }: { listingId: string; address: string; circle: boolean }) {
  const t = useTranslations().orderFlow;
  const shop = useTranslations().marketShop;
  const { locale } = useLocale();
  const { agents } = useActivation();
  const money = useMoneyBalances();
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [arrived, setArrived] = useState<string | null>(null);

  const listingQuery = useQuery({
    queryKey: ['order', 'listing', listingId],
    queryFn: () => api.getListing(listingId),
    retry: false,
  });
  const quoteQuery = useQuery({
    queryKey: ['order', 'quote', listingId],
    queryFn: () => api.listingQuote(listingId),
    retry: false,
  });
  const listing: Listing | null = listingQuery.data?.listing ?? null;
  const quote = quoteQuery.data ?? null;
  const quoteError: OrderQuoteError | undefined = listingQuery.data?.viewerIsOwner
    ? 'OWN'
    : (quoteQuery.error instanceof ApiError && quoteQuery.error.code === 'CLOSED') || (listingQuery.error instanceof ApiError && listingQuery.error.status === 404)
      ? 'CLOSED'
      : undefined;

  const spendable = circle ? spendableUsdc({ balance: money.balance, buyer: money.buyer }) : money.buyer;
  const payOrder = usePayOrder({ listing, quote, address, circle, buyerAgentUsdc: money.buyer });
  const outcome = payOrder.outcome;
  const phase = outcome === 'changed' || outcome === 'closed' || outcome === 'own'
    ? outcome
    : orderPhase({ quote, quoteError, spendableUsdc: spendable, busy: payOrder.busy });

  const refetchMoney = money.refetch;
  useFundsLanded(address, useCallback((amount: string | null) => {
    if (amount) setArrived(amount);
    refetchMoney();
  }, [refetchMoney]));

  useEffect(() => {
    if (phase === 'ready') setAdding(false);
  }, [phase]);

  const usd = useMemo(() => {
    const format = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    return (value: string | number) => format.format(Number(value));
  }, [locale]);

  const name = listing ? sellerLine(listing.seller ?? null, shop) : '';
  const deliverBy = quote?.deliverByUnix ? formatDealDate(quote.deliverByUnix * 1000, locale) : null;
  const photo = listing ? ((listing as Listing & { photoUrls?: string[] }).photoUrls?.[0] ?? samplePhoto((CATEGORY_IDS as readonly string[]).includes(listing.category ?? '') ? (listing.category as CategoryId) : null)) : null;
  const backHref = `/listings/${encodeURIComponent(listingId)}`;

  if (phase === 'changed' || phase === 'closed' || phase === 'own') {
    return (
      <main className="mx-auto w-full max-w-[560px] px-4 py-8 sm:px-6">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{t.title}</h1>
        <p role="status" className="mt-4 text-[16px] text-[var(--lp-dark)]">{phase === 'changed' ? t.changed : phase === 'closed' ? t.closed : t.own}</p>
        <Link href={backHref} className={`mt-6 ${PRIMARY}`}>{t.backToOffer}</Link>
      </main>
    );
  }

  if ((listingQuery.isError || quoteQuery.isError) && !listing) {
    return (
      <main className="mx-auto w-full max-w-[560px] px-4 py-8 sm:px-6">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{t.title}</h1>
        <p role="alert" className="mt-4 text-[16px] text-[var(--lp-dark)]">{t.loadFailed}</p>
        <button type="button" onClick={() => { void listingQuery.refetch(); void quoteQuery.refetch(); }} className={`mt-6 ${QUIET}`}>{t.retry}</button>
      </main>
    );
  }

  const youPay = quote ? usd(quote.youPayUsdc) : '';
  const short = quote && spendable !== null ? shortfallUsdc(quote.youPayUsdc, spendable) : '0';
  const failure = outcome === 'failed' ? t.failed : outcome && typeof outcome === 'object' ? fill(t.totalChanged, { amount: usd(outcome.totalChanged) }) : null;

  return (
    <main className="mx-auto w-full max-w-[560px] px-4 pb-16 pt-6 sm:px-6" data-order-page>
      <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{t.title}</h1>

      <section className="mt-5 flex items-center gap-4">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-16 w-16 shrink-0 rounded-[14px] object-cover" />
        ) : (
          <div aria-hidden className="h-16 w-16 shrink-0 rounded-[14px] bg-[var(--lp-light)]" />
        )}
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold text-[var(--lp-dark)]">{listing?.title ?? ' '}</p>
          <p className="truncate text-[14px] text-[var(--lp-text-sub)]">{name || ' '}</p>
        </div>
      </section>

      <section className="mt-5 divide-y divide-[var(--lp-border-light)] rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-5 py-1">
        <Row label={t.delivery} value={deliverBy ? fill(t.deliverBy, { date: deliverBy }) : '…'} />
        <div className="py-1">
          <Row label={t.price} value={quote ? `${usd(quote.priceUsdc)} USDC` : '…'} />
          <Row label={t.fee} value={quote ? `${usd(quote.feeUsdc)} USDC` : '…'} />
        </div>
        <Row label={t.youPay} value={quote ? `${youPay} USDC` : '…'} strong />
      </section>

      <section className="mt-4 flex gap-3 rounded-[20px] bg-[var(--tint)] p-4">
        <Icon name="shield-check" size={20} className="mt-0.5 shrink-0 text-[var(--ink)]" />
        <div>
          <p className="text-[15px] font-semibold text-[var(--lp-dark)]">{t.protectedTitle}</p>
          <p className="mt-1 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
            {deliverBy ? fill(t.protectedBody, { name, date: deliverBy }) : fill(t.protectedBodyNoDate, { name })}
          </p>
        </div>
      </section>

      <section className="mt-4 rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-5 py-4" data-order-balance>
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[15px] text-[var(--lp-text-sub)]">{t.balance}</span>
          <span className="tabular-nums text-[15px] font-medium text-[var(--lp-dark)]">{spendable === null ? '…' : `${usd(spendable)} USDC`}</span>
        </div>
        {phase === 'ready' || phase === 'paying' ? (
          <p className="mt-1 text-[14px] font-medium text-[var(--color-success,var(--lp-dark))]">{t.enough}</p>
        ) : phase === 'short' ? (
          <p className="mt-1 text-[14px] font-medium text-[var(--lp-text-sub)]">{fill(t.short, { amount: usd(short) })}</p>
        ) : null}
        {arrived ? <p role="status" className="mt-1 text-[14px] text-[var(--lp-text-sub)]">{fill(t.arrived, { amount: usd(arrived) })}</p> : null}
      </section>

      {failure ? <p role="alert" className="mt-4 border-s-2 border-[var(--color-critical)] ps-3 text-[14px] text-[var(--lp-dark)]">{failure}</p> : null}

      {adding && phase === 'short' ? (
        <div className="mt-4">
          <AddMoneyPanel
            owner={address}
            circle={circle}
            buyerAgent={agents?.buyer ?? null}
            amount={Number(short)}
            amountLabel={usd(short)}
            onFunded={refetchMoney}
          />
        </div>
      ) : null}

      <div className="mt-6">
        {phase === 'short' ? (
          adding ? null : (
            <button type="button" onClick={() => setAdding(true)} className={PRIMARY}>{t.addMoney}</button>
          )
        ) : (
          <button
            type="button"
            disabled={phase !== 'ready'}
            onClick={() => { payOrder.clearOutcome(); setConfirming(true); }}
            className={PRIMARY}
          >
            {phase === 'paying' ? t.paying : fill(t.pay, { amount: youPay || '…' })}
          </button>
        )}
      </div>

      <ConfirmSheetShell open={confirming} labelledBy="order-confirm-title" busy={payOrder.busy} onClose={() => setConfirming(false)}>
        <h2 id="order-confirm-title" className="text-[20px] font-semibold text-[var(--lp-dark)]">{t.confirmTitle}</h2>
        <dl className="mt-4 divide-y divide-[var(--lp-border-light)]">
          {[
            [t.confirmFor, listing?.title ?? ''],
            [t.confirmTo, name],
            [t.confirmHeld, t.heldValue],
            [fill(t.confirmIf, { name }), t.ifValue],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-[14px] text-[var(--lp-text-sub)]">{label}</dt>
              <dd className="min-w-0 text-end text-[14px] font-medium text-[var(--lp-dark)]">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            data-testid="order-pay"
            disabled={payOrder.busy}
            onClick={() => { setConfirming(false); void payOrder.pay(); }}
            className={PRIMARY}
          >
            {fill(t.pay, { amount: youPay })}
          </button>
          <button type="button" disabled={payOrder.busy} onClick={() => setConfirming(false)} className={QUIET}>{t.notNow}</button>
        </div>
      </ConfirmSheetShell>
    </main>
  );
}
