'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useWalletClient } from 'wagmi';
import { ApiError, api, type DirectDeal, type FactoringOffer } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { factoringOfferable } from '@/shared/deals/financingEligibility';
import { acceptErrorKind, acceptOfferOnChain, rawAcceptError, WalletNeededError, type AcceptErrorKind } from '@/features/factoring/acceptOffer';
import { fill, formatUsdcAmount } from './presentation';
import { Sheet, fieldLabel, primaryButton, quietButton } from './Sheet';

/// Invoice factoring on the deal page (view 18): the seller of a delivered
/// trade-finance order asks to be paid now, reviews financiers' offers and
/// accepts one. Private to the seller; the buyer never sees it.
export function GetPaidNow({ deal, viewerIsSeller, onChanged }: { deal: DirectDeal; viewerIsSeller: boolean; onChanged: () => void }) {
  const g = useTranslations().dealWorkspace.getPaid;
  const { locale } = useLocale();
  const auth = useAuth();
  const { data: walletClient } = useWalletClient();
  const eligible = factoringOfferable(deal, viewerIsSeller);
  const [requestedAt, setRequestedAt] = useState(deal.factoringRequestedAt);
  const [offers, setOffers] = useState<FactoringOffer[]>([]);
  const [asking, setAsking] = useState(false);
  const [amount, setAmount] = useState(deal.factoringRequestedAdvanceUsdc ?? deal.dealAmountUsdc);
  const [reviewing, setReviewing] = useState<FactoringOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usdc = (value: string) => formatUsdcAmount(value, locale);
  const max = deal.dealAmountUsdc;

  useEffect(() => setRequestedAt(deal.factoringRequestedAt), [deal.factoringRequestedAt]);

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    const refresh = () => {
      api.listOffersForInvoice(deal.jobId)
        .then((r) => {
          if (!cancelled) setOffers(r.offers.filter((o) => (o.status === 'offered' && Date.now() < o.expiresAt) || o.status === 'pending_receipt'));
        })
        .catch(() => {});
    };
    refresh();
    const poll = window.setInterval(refresh, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [eligible, deal.jobId]);

  const sorted = useMemo(() => [...offers].sort((a, b) => Number(b.offeredAdvanceUsdc) - Number(a.offeredAdvanceUsdc)), [offers]);

  if (!viewerIsSeller || deal.tradeLane !== 'finance') return null;

  if (deal.factoringOfferId) {
    return (
      <section aria-labelledby="get-paid-title" className="mt-8 border-t border-[var(--lp-border-light)] pt-6">
        <h2 id="get-paid-title" className="text-[17px] font-medium text-[var(--lp-dark)]">{g.paidTitle}</h2>
        <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">{g.paidBody}</p>
        <Link href={`/financier/factoring/${deal.factoringOfferId}`} className="mt-3 inline-flex min-h-11 items-center text-[15px] font-medium text-[var(--lp-dark)] underline underline-offset-4">
          {g.viewFinancing}
        </Link>
      </section>
    );
  }
  if (!eligible) return null;

  async function request() {
    const value = amount.trim();
    if (!value || !Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) > Number(max)) {
      setError(fill(g.amountInvalid, { max: usdc(max) }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.requestFactoring({ invoiceId: deal.jobId, requestedAdvanceUsdc: value });
      setRequestedAt(r.deal?.factoringRequestedAt ?? Date.now());
      setAsking(false);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : g.errRequest);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      await api.withdrawFactoringRequest({ invoiceId: deal.jobId });
      setRequestedAt(undefined);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : g.errRequest);
    } finally {
      setBusy(false);
    }
  }

  async function accept(offer: FactoringOffer) {
    setBusy(true);
    setError(null);
    try {
      await acceptOfferOnChain({ offer, isCircleUser: auth.method === 'circle', walletClient, address: auth.address });
      setReviewing(null);
      onChanged();
    } catch (e) {
      if (e instanceof WalletNeededError) {
        setError(g.errWallet);
      } else {
        const raw = rawAcceptError(e);
        const kind = acceptErrorKind(raw);
        const words: Record<AcceptErrorKind, string> = {
          authorization: g.errAuthorization,
          reconcile: g.errReconcile,
          alreadyAssigned: g.errAlreadyAssigned,
          windowClosed: g.errWindowClosed,
          notAccepted: g.errNotAccepted,
        };
        setError(kind ? words[kind] : raw);
      }
    } finally {
      setBusy(false);
    }
  }

  const errorLine = error ? (
    <p role="alert" className="mt-4 border-s-2 border-[var(--color-critical)] ps-3 text-[14px] text-[var(--lp-dark)]">{error}</p>
  ) : null;

  return (
    <section aria-labelledby="get-paid-title" className="mt-8 border-t border-[var(--lp-border-light)] pt-6">
      <h2 id="get-paid-title" className="text-[17px] font-medium text-[var(--lp-dark)]">{requestedAt ? g.requestedTitle : g.title}</h2>
      <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">{requestedAt ? g.requestedBody : g.body}</p>

      {sorted.length ? (
        <ul className="mt-4 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
          {sorted.map((offer) => (
            <li key={offer.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
              <span className="text-[15px] tabular-nums text-[var(--lp-dark)]">
                {fill(g.offerLine, { advance: usdc(offer.offeredAdvanceUsdc), repay: usdc(offer.expectedReturnUsdc) })}
              </span>
              <button type="button" onClick={() => { setError(null); setReviewing(offer); }} className={`${quietButton} w-auto shrink-0`}>
                {g.review}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!reviewing && !asking ? errorLine : null}
      <div className="mt-4">
        {requestedAt ? (
          <button type="button" disabled={busy} onClick={() => void withdraw()} className={`${quietButton} sm:w-auto`}>{g.withdraw}</button>
        ) : (
          <button type="button" disabled={busy} onClick={() => { setError(null); setAsking(true); }} className={`${quietButton} sm:w-auto`}>{g.ask}</button>
        )}
      </div>

      <Sheet open={asking} title={g.ask} onClose={() => setAsking(false)} busy={busy}>
        <label className={fieldLabel}>
          {g.amountLabel}
          <span className="mt-1.5 block">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} className="form-input form-input-num" />
          </span>
          <span className="mt-1.5 block text-[14px] font-normal text-[var(--lp-text-sub)]">{fill(g.amountNote, { max: usdc(max) })}</span>
        </label>
        {errorLine}
        <div className="mt-6">
          <button type="button" disabled={busy} onClick={() => void request()} className={primaryButton}>{g.request}</button>
        </div>
      </Sheet>

      <Sheet open={!!reviewing} title={reviewing ? fill(g.acceptTitle, { advance: usdc(reviewing.offeredAdvanceUsdc) }) : ''} onClose={() => setReviewing(null)} busy={busy}>
        {reviewing ? (
          <>
            <p className="text-[15px] text-[var(--lp-dark)]">
              {fill(g.consequence, { advance: usdc(reviewing.offeredAdvanceUsdc), repay: usdc(reviewing.expectedReturnUsdc) })}
            </p>
            {errorLine}
            <div className="mt-6">
              <button type="button" disabled={busy} onClick={() => void accept(reviewing)} className={primaryButton}>{g.accept}</button>
            </div>
          </>
        ) : null}
      </Sheet>
    </section>
  );
}
