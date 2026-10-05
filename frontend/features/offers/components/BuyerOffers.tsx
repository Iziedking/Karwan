'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { api, ApiError } from '@/core/api';
import { Button } from '@/shared/components/Button';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { FundAgentOptions } from '@/features/deposit/components/FundAgentOptions';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { formatUsdc } from '@/shared/utils/format';
import { budgetDifference, offerErrorKey, orderOffers, topUpAmount, type Offer } from '../model';

function sellerName(address: string): string {
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function shortDate(unix: number, locale: string): string {
  return new Date(unix * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/// The offers sellers sent on the buyer's own request, cheapest first. Renders
/// nothing until there is at least one, so a request without offers looks as
/// it always did.
export function BuyerOffers({ jobId, budgetUsdc }: { jobId: string; budgetUsdc: string }) {
  const t = useTranslations().offers;
  const { locale } = useLocale();
  const auth = useAuth();
  const money = useMoneyBalances();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [chosen, setChosen] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof offerErrorKey> | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [fundingAmount, setFundingAmount] = useState<number | null>(null);
  const [fundingBusy, setFundingBusy] = useState(false);
  const returnToAccept = useRef(false);
  const titleId = useId();

  useEffect(() => {
    if (!chosen || fundingAmount !== null || !returnToAccept.current) return;
    returnToAccept.current = false;
    document.getElementById(`${titleId}-accept`)?.focus();
  }, [chosen, fundingAmount, titleId]);

  const load = useCallback(async () => {
    try {
      const view = await api.offers(jobId);
      setOffers(view.role === 'buyer' ? orderOffers(view.offers) : []);
    } catch {
      setOffers([]);
    }
  }, [jobId]);

  useEffect(() => {
    if (auth.isLoading) return;
    void load();
  }, [load, auth.isLoading, auth.address]);

  if (accepted) {
    return (
      <section className="mx-auto w-full max-w-[720px] px-4 pt-8">
        <p role="status" className="rounded-[20px] bg-[var(--lp-card)] p-6 text-[16px] text-[var(--lp-dark)]">
          {t.accepted}
        </p>
      </section>
    );
  }
  if (offers.length === 0) return null;

  async function accept(offer: Offer) {
    setBusy(true);
    setError(null);
    try {
      await api.acceptOffer(jobId, offer.id);
      setChosen(null);
      setAccepted(true);
    } catch (err) {
      setError(offerErrorKey(err instanceof ApiError ? err.code ?? '' : ''));
    } finally {
      setBusy(false);
    }
  }

  const top = offers[0]!;
  const diff = chosen ? budgetDifference(chosen.priceUsdc, budgetUsdc) : null;
  const shortfall = chosen && money.buyer !== null
    ? topUpAmount({ needUsdc: chosen.fundedUsdc ?? chosen.priceUsdc, agentUsdc: money.buyer })
    : null;
  const funding = fundingAmount !== null;

  function closeConfirmation() {
    if (busy || fundingBusy) return;
    setChosen(null);
    setError(null);
    setFundingAmount(null);
    returnToAccept.current = false;
  }

  return (
    <section aria-labelledby={`${titleId}-list`} className="mx-auto w-full max-w-[720px] px-4 pt-8">
      <h2 id={`${titleId}-list`} className="text-[22px] font-medium text-[var(--lp-dark)]">
        {offers.length === 1 ? t.countOne : t.listTitle.replace('{n}', String(offers.length))}
      </h2>
      <ul className="mt-5 space-y-3">
        {offers.map((offer) => (
          <li key={offer.id} className="rounded-[20px] bg-[var(--lp-card)] p-6">
            <div className="flex items-baseline justify-between gap-4">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[16px] font-medium text-[var(--lp-dark)]">{sellerName(offer.sellerUser)}</span>
                {/^0x[a-fA-F0-9]{40}$/.test(offer.sellerUser) ? <ReputationBadge address={offer.sellerUser} size="sm" appearance="quiet" /> : null}
              </span>
              <span className="shrink-0 text-[16px] font-medium tabular-nums text-[var(--lp-dark)]">
                {formatUsdc(offer.priceUsdc)}
              </span>
            </div>
            <p className="mt-1 text-[14px] text-[var(--lp-text-sub)] font-medium">
              {t.deliverByOn.replace('{date}', shortDate(offer.deliverByUnix, locale))}
            </p>
            {offer.note ? <p dir="auto" className="mt-3 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">{offer.note}</p> : null}
            {offer.id !== top.id ? (
              <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={() => setChosen(offer)}>
                {t.acceptShort}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <Button variant={chosen ? 'outline' : undefined} size="lg" className="mt-5 w-full rounded-full" onClick={() => setChosen(top)}>
        {t.accept.replace('{seller}', sellerName(top.sellerUser)).replace('{price}', formatUsdc(top.priceUsdc, { withSuffix: false }))}
      </Button>
      <p className="mt-3 text-center text-[14px] text-[var(--lp-text-sub)] font-medium">{t.agentLine}</p>

      <ConfirmSheetShell open={!!chosen} labelledBy={titleId} busy={busy || fundingBusy} onClose={closeConfirmation}>
        {chosen ? (
          <div className="space-y-5">
            <h2 id={titleId} className="text-[22px] font-medium text-[var(--lp-dark)]">
              {t.confirmTitle}
            </h2>
            {/* The amount that leaves the wallet, fee included, is the loudest number. */}
            <p className="text-[36px] font-medium leading-none tabular-nums text-[var(--lp-dark)]">
              {formatUsdc(chosen.fundedUsdc ?? chosen.priceUsdc)}
            </p>
            {chosen.fundedUsdc && chosen.fundedUsdc !== chosen.priceUsdc ? (
              <p className="text-[14px] tabular-nums text-[var(--lp-text-sub)] font-medium">
                {t.includesFee.replace('{price}', formatUsdc(chosen.priceUsdc, { withSuffix: false }))}
              </p>
            ) : null}
            <p className="text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
              {t.confirmBody.replace('{price}', formatUsdc(chosen.fundedUsdc ?? chosen.priceUsdc, { withSuffix: false }))}
            </p>
            {diff ? <p className="text-[14px] text-[var(--color-warning)]">{t.aboveBudget.replace('{diff}', diff)}</p> : null}
            {error ? (
              <p role="alert" className="text-[14px] text-[var(--color-critical)]">
                {t.errors[error]}
              </p>
            ) : null}
            {error === 'topUp' && !funding && shortfall !== null && shortfall > 0 && money.agents?.buyer ? (
              <Button variant="outline" size="lg" className="w-full rounded-full" onClick={() => setFundingAmount(shortfall)}>
                {t.topUpCta.replace('{amount}', formatUsdc(shortfall, { withSuffix: false }))}
              </Button>
            ) : null}
            {fundingAmount !== null && money.agents?.buyer ? (
              <div data-testid="offer-top-up" className="rounded-[20px] bg-[var(--tint)] p-4">
                <FundAgentOptions
                  agent="buyer"
                  amountUsdc={fundingAmount}
                  recipient={money.agents.buyer}
                  otherAgentAddress={money.agents.seller}
                  circleAccount={auth.method !== 'web3'}
                  onBusyChange={setFundingBusy}
                  onFunded={() => {
                    returnToAccept.current = true;
                    setFundingAmount(null);
                    setError(null);
                    money.refetch();
                  }}
                />
              </div>
            ) : null}
            {!funding ? (
              <Button id={`${titleId}-accept`} size="lg" className="w-full rounded-full" loading={busy} onClick={() => void accept(chosen)}>
                {t.accept.replace('{seller}', sellerName(chosen.sellerUser)).replace('{price}', formatUsdc(chosen.priceUsdc, { withSuffix: false }))}
              </Button>
            ) : null}
            <Button variant="ghost" className="w-full rounded-full" disabled={busy || fundingBusy} onClick={closeConfirmation}>
              {t.cancel}
            </Button>
          </div>
        ) : null}
      </ConfirmSheetShell>
    </section>
  );
}
