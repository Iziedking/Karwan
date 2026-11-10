'use client';
import { Hint } from '@/shared/components/Hint';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError, type Listing } from '@/core/api';
import { signInHref } from '@/shared/auth/signInHref';
import { useAuth } from '@/shared/hooks/useAuth';
import { useActivation } from '@/shared/hooks/useActivation';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { Icon } from '@/shared/components/Icon';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { FactRows } from '@/shared/components/FactRows';
import { StepsTrack } from '@/features/deals/workspace/StepsTrack';
import { dealReference } from '@/features/deals/dealReference';
import { FactsConfirmSheet } from '@/shared/components/FactsConfirmSheet';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';
import { fill, formatDealDate } from '@/features/deals/workspace/presentation';
import { useFundsLanded } from '@/features/deposit/useDepositWatch';
import { CATEGORY_IDS, type CategoryId } from '@/features/market/marketModel';
import { samplePhoto, sellerLine } from '@/features/market/listingFacts';
import { AddMoneyPanel } from './AddMoneyPanel';
import { orderPhase, shortfallUsdc, spendableUsdc, type OrderQuoteError } from './orderModel';
import { usePayOrder, type PaidIn } from './usePayOrder';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';

const PRIMARY = `w-full ${buttonClasses({ variant: 'primary', size: 'lg' })}`;
const QUIET = `w-full ${buttonClasses({ variant: 'secondary', size: 'lg' })}`;

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className={strong ? 'text-[15px] font-semibold text-[var(--ink)]' : 'text-[15px] text-[var(--ink-secondary)]'}>{label}</span>
      <span className={`tabular-nums text-end ${strong ? 'text-[17px] font-semibold text-[var(--ink)]' : 'text-[15px] font-medium text-[var(--ink)]'}`}>{value}</span>
    </div>
  );
}

/// Review your order (view 44, Figma 05 to 09): what you get and when, one fee
/// line, your balance, then Add money or Pay. Pay asks once more in a sheet
/// that turns while the money goes in, then the page is the Paid in result
/// (view 48).
export function OrderPage({ listingId }: { listingId: string }) {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) router.replace(signInHref(window.location.pathname + window.location.search + window.location.hash));
  }, [auth.isLoading, auth.isAuthenticated, router]);

  if (auth.isLoading || !auth.isAuthenticated || !auth.address) return <div aria-hidden className="min-h-[60vh]" />;
  return <OrderReview listingId={listingId} address={auth.address} circle={auth.method === 'circle'} />;
}

function OrderReview({ listingId, address, circle }: { listingId: string; address: string; circle: boolean }) {
  const copy = useTranslations();
  const t = copy.orderFlow;
  const mt = useMoneyText();
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
  useEffect(() => {
    if (payOrder.paid || outcome === 'changed' || outcome === 'closed' || outcome === 'own') setConfirming(false);
  }, [payOrder.paid, outcome]);

  const usd = useMemo(() => {
    const format = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    return (value: string | number) => format.format(Number(value));
  }, [locale]);

  const name = listing ? sellerLine(listing.seller ?? null, shop) : '';
  const deliverBy = quote?.deliverByUnix ? formatDealDate(quote.deliverByUnix * 1000, locale) : null;
  const photo = listing ? ((listing as Listing & { photoUrls?: string[] }).photoUrls?.[0] ?? samplePhoto((CATEGORY_IDS as readonly string[]).includes(listing.category ?? '') ? (listing.category as CategoryId) : null, listing.id, listing.deliveryKind, listing.examplePhoto)) : null;
  const backHref = `/listings/${encodeURIComponent(listingId)}`;
  const firstName = listing?.seller?.name?.split(/\s+/)[0] || name;

  if (payOrder.paid && listing && quote) {
    return <PaidInResult paid={payOrder.paid} name={firstName} amount={quote.youPayUsdc} tag={listing.seller?.tag ?? null} listingId={listing.id} />;
  }

  if (phase === 'changed' || phase === 'closed' || phase === 'own') {
    return (
      <main className="mx-auto w-full max-w-[560px] px-4 py-8 sm:px-6">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{t.title}</h1>
        <p role="status" className="mt-4 text-[16px] text-[var(--ink)]">{phase === 'changed' ? t.changed : phase === 'closed' ? t.closed : t.own}</p>
        <Link href={backHref} className={`mt-6 ${PRIMARY}`}>{t.backToOffer}</Link>
      </main>
    );
  }

  if ((listingQuery.isError || quoteQuery.isError) && !listing) {
    return (
      <main className="mx-auto w-full max-w-[560px] px-4 py-8 sm:px-6">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{t.title}</h1>
        <p role="alert" className="mt-4 text-[16px] text-[var(--ink)]">{t.loadFailed}</p>
        <button type="button" onClick={() => { void listingQuery.refetch(); void quoteQuery.refetch(); }} className={`mt-6 ${QUIET}`}>{t.retry}</button>
      </main>
    );
  }

  const held = !!quote?.waitsForSeller;
  const payUsdc = quote?.youPayUsdc ?? null;
  const short = quote && spendable !== null ? shortfallUsdc(quote.youPayUsdc, spendable) : '0';
  const failure = outcome === 'failed' ? t.failed : outcome && typeof outcome === 'object' ? mt.fill(t.totalChanged, { amount: outcome.totalChanged }, {}, { exact: true }) : null;

  return (
    <main className="mx-auto w-full max-w-[560px] px-4 pb-16 pt-6 sm:px-6" data-order-page>
      <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--ink)]">{t.title}</h1>
      <p data-order-deal className="mt-2 text-[14px] leading-relaxed text-[var(--ink-secondary)]">{t.dealNext}</p>

      <section className="mt-5 flex items-center gap-4">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-16 w-16 shrink-0 rounded-[12px] object-cover" />
        ) : (
          <div aria-hidden className="h-16 w-16 shrink-0 rounded-[14px] bg-[var(--raised)]" />
        )}
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold text-[var(--ink)]">{listing?.title ?? ' '}</p>
          <p className="truncate text-[14px] text-[var(--ink-secondary)]">{name || ' '}</p>
        </div>
      </section>

      <section className={`${CARD_CLASS} mt-5 divide-y divide-[var(--line)] px-5 py-1`}>
        <Row label={t.delivery} value={deliverBy ? fill(t.deliverBy, { date: deliverBy }) : '…'} />
        <div className="py-1">
          <Row label={t.price} value={quote ? mt.text(quote.priceUsdc, { exact: true }) : '…'} />
          <Row label={t.fee} value={quote ? mt.text(quote.feeUsdc, { exact: true }) : '…'} />
        </div>
        <Row label={t.youPay} value={quote ? mt.text(quote.youPayUsdc, { exact: true }) : '…'} strong />
      </section>

      <section className={`${CARD_CLASS} mt-4 flex gap-3 p-4`}>
        <Icon name="shield-check" size={20} className="mt-0.5 shrink-0 text-[var(--ink)]" />
        <div>
          <p className="flex items-center gap-2 text-[15px] font-semibold text-[var(--ink)]">
            {t.protectedTitle}
            <Hint>{deliverBy ? fill(t.protectedBody, { name, date: deliverBy }) : fill(t.protectedBodyNoDate, { name })}</Hint>
          </p>
          <Link href="/docs/escrow" className="mt-2 inline-flex min-h-11 items-center text-[14px] font-medium underline underline-offset-4">{copy.landingEditorial.rulesLink}</Link>
        </div>
      </section>

      {held ? (
        <>
          <p role="status" className="mt-4 text-[15px] leading-relaxed text-[var(--ink)]" data-order-held>{fill(quote?.waitReason === 'asks' ? t.asksNote : t.heldNote, { name })}</p>
          {failure ? <p role="alert" className="mt-4 border-s-2 border-[var(--color-critical)] ps-3 text-[14px] text-[var(--ink)]">{failure}</p> : null}
          <button type="button" disabled={payOrder.busy} onClick={() => void payOrder.pay()} className={`mt-6 ${PRIMARY}`}>
            {fill(t.askSeller, { name })}
          </button>
        </>
      ) : (
      <>
      <section className={`${CARD_CLASS} mt-4 px-5 py-4`} data-order-balance>
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[15px] text-[var(--ink-secondary)]">{t.balance}</span>
          <span className="tabular-nums text-[15px] font-medium text-[var(--ink)]">{spendable === null ? '…' : mt.text(spendable, { exact: true })}</span>
        </div>
        {phase === 'ready' || phase === 'paying' ? (
          <p className="mt-1 text-[14px] font-medium text-[var(--ink)]">{t.enough}</p>
        ) : phase === 'short' ? (
          <p className="mt-1 text-[14px] font-medium text-[var(--ink-secondary)]">{mt.fill(t.short, { amount: short }, {}, { exact: true })}</p>
        ) : null}
        {arrived ? <p role="status" className="mt-1 text-[14px] text-[var(--ink-secondary)]">{mt.fill(t.arrived, { amount: arrived }, {}, { exact: true })}</p> : null}
      </section>

      {failure ? <p role="alert" className="mt-4 border-s-2 border-[var(--color-critical)] ps-3 text-[14px] text-[var(--ink)]">{failure}</p> : null}

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
            {phase === 'paying' ? mt.fill(t.paying, { amount: payUsdc }, {}, { exact: true }) : quote ? mt.fill(t.pay, { amount: payUsdc }, {}, { exact: true }) : fill(t.pay, { amount: '…' })}
          </button>
        )}
      </div>
      </>
      )}

      <FactsConfirmSheet
        open={confirming}
        title={mt.fill(t.confirmTitle, { amount: payUsdc }, {}, { exact: true })}
        rows={[
          [t.confirmFor, [listing?.title, name].filter(Boolean).join(', ')],
          [t.amount, mt.text(payUsdc, { exact: true })],
          [t.confirmFrom, t.balance],
          ...(spendable !== null && quote ? [[t.leftAfter, mt.text(Math.max(0, spendable - Number(quote.youPayUsdc)), { exact: true })] as [string, string]] : []),
          [t.confirmHeld, t.heldValue],
          [fill(t.confirmIf, { name }), t.ifValue],
        ]}
        primaryLabel={mt.fill(t.pay, { amount: payUsdc }, {}, { exact: true })}
        busyLabel={mt.fill(t.paying, { amount: payUsdc }, {}, { exact: true })}
        quietLabel={t.notNow}
        busy={payOrder.busy}
        error={failure}
        onConfirm={() => void payOrder.pay()}
        onClose={() => setConfirming(false)}
      />
    </main>
  );
}

/// The money is in (view 48, Figma Paid in): who has the order, where the
/// money sits, the route with Paid in as the stop you are at, and the facts.
function PaidInResult({ paid, name, amount, tag, listingId }: { paid: PaidIn; name: string; amount: string; tag: string | null; listingId: string }) {
  const copy = useTranslations();
  const t = copy.orderFlow;
  const dp = copy.dealPage;
  const money = useMoneyText();
  const { locale } = useLocale();
  const at = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(paid.at);
  const reference = dealReference(paid.jobId);
  return (
    <main data-order-paid className="mx-auto w-full max-w-[560px] space-y-5 px-4 pb-16 pt-10 sm:px-6">
      <span aria-hidden className="grid size-14 place-items-center rounded-full bg-[var(--ash)] text-[var(--ink)]">
        <Icon name="check" size={24} />
      </span>
      <div>
        <h1 className="text-[24px] font-semibold leading-[1.25] tracking-[-0.02em] text-[var(--ink)]">{fill(t.paidTitle, { name })}</h1>
        <p className="mt-1 text-[15px] text-[var(--ink-secondary)]">{money.fill(t.paidHeld, { amount }, {}, { exact: true })}</p>
      </div>
      <div className={`${CARD_CLASS} p-5`}>
        <StepsTrack steps={[
          { key: 'agreed', state: 'done' },
          { key: 'paidIn', state: 'current' },
          { key: 'delivered', state: 'upcoming' },
          { key: 'paidOut', state: 'upcoming' },
        ]} />
        <div className="mt-5 border-t border-[var(--line)] pt-1">
          <FactRows facts={[
            { label: dp.steps.paidIn, value: at },
            { label: dp.amount, value: money.text(amount, { exact: true }) },
            ...(reference ? [{ label: dp.release.deal, value: <span dir="ltr">{reference}</span>, id: 'reference' }] : []),
          ]} />
        </div>
      </div>
      <div className="grid gap-2">
        <Link href={`/deals/${paid.jobId}`} className={PRIMARY}>{t.done}</Link>
        {tag ? (
          <Link href={`/messages/${encodeURIComponent(tag)}?about=listing:${encodeURIComponent(listingId)}`} className={QUIET}>
            {copy.marketShop.listing.message.replace('{name}', name)}
          </Link>
        ) : null}
      </div>
    </main>
  );
}
