'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePublicClient } from 'wagmi';
import { ApiError, ConfirmCancelled, api, type DirectDeal, type FactoringOffer } from '@/core/api';
import { recordFirst } from '@/features/record/recordFirst';
import { runRecordSetup } from '@/features/record/runRecordSetup';
import { useOwnWalletSend } from '@/shared/chain/useOwnWalletSend';
import { runWalletGuarantee } from '@/features/guarantee/walletGuarantee';
import { ARC_CHAIN_ID } from '@/features/profile/config';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill, formatUsdcAmount } from './presentation';
import { getPaidNowView, takePlan } from './getPaidNow';
import { Sheet, fieldLabel, primaryButton, quietButton } from './Sheet';

/// Get paid now on the deal page (view 18): the seller of a business order on
/// the escrow family asks from acceptance, reviews financiers' offers and takes
/// one. Private to the seller; the buyer never sees it.
type GetPaidOffer = ReturnType<typeof getPaidNowView>['offers'][number];

export function GetPaidNow({ deal, viewerIsSeller, onChanged }: { deal: DirectDeal; viewerIsSeller: boolean; onChanged: () => void }) {
  const copy = useTranslations();
  const g = copy.dealWorkspace.getPaid;
  const { locale } = useLocale();
  const ownWallet = useOwnWalletSend();
  const { method } = useAuth();
  const arc = usePublicClient({ chainId: ARC_CHAIN_ID });
  const [requestedAt, setRequestedAt] = useState(deal.factoringRequestedAt);
  const [offers, setOffers] = useState<FactoringOffer[]>([]);
  const [asking, setAsking] = useState(false);
  const [amount, setAmount] = useState(deal.factoringRequestedAdvanceUsdc ?? deal.dealAmountUsdc);
  const [now, setNow] = useState(() => Date.now());
  const view = getPaidNowView({ deal, viewerIsSeller, offers, now });
  const eligible = view.canAsk || !!view.waiting;
  const [reviewing, setReviewing] = useState<GetPaidOffer | null>(null);
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
          if (cancelled) return;
          setOffers(r.offers);
          setNow(Date.now());
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
    // Asking sends no Arc transaction of its own, so a person's own wallet
    // signs the record steps still missing first (view 27, decision 10).
    try {
      if (recordFirst(await api.recordSetupStatus().catch(() => null))) await runRecordSetup(ownWallet);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : g.errRequest);
      setBusy(false);
      return;
    }
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

  // The server answers in plain words; a short guarantee is put up in the same
  // confirmation when the button said so.
  async function accept(offer: GetPaidOffer) {
    setBusy(true);
    setError(null);
    try {
      // Karwan deposits a short guarantee from a wallet it holds; a person's own
      // wallet signs that deposit here first, then the offer is taken.
      const plan = takePlan(offer, method);
      if (plan.walletDeposits) {
        if (!arc) throw new Error(g.errNotAccepted);
        await runWalletGuarantee({ step: 'put_up', amountUsdc: plan.walletDeposits, ownWallet, arcClient: arc, revertedText: copy.chainErrors.reverted });
      }
      const r = await api.acceptFactoringOffer({ offerId: offer.id, ...(plan.karwanDeposits ? { putUpGap: true } : {}) });
      setReviewing(null);
      if (r.state === 'awaiting_financier') {
        const refreshed = await api.listOffersForInvoice(deal.jobId).catch(() => null);
        if (refreshed) setOffers(refreshed.offers);
      }
      onChanged();
    } catch (e) {
      // A wallet that was closed or refused leaves nothing moved and needs no line.
      if (e instanceof ConfirmCancelled) return;
      setError(e instanceof ApiError && e.message ? e.message : g.errNotAccepted);
    } finally {
      setBusy(false);
    }
  }

  const errorLine = error ? (
    <p role="alert" className="mt-4 border-s-2 border-[var(--color-critical)] ps-3 text-[14px] text-[var(--lp-dark)]">{error}</p>
  ) : null;

  return (
    <section aria-labelledby="get-paid-title" className="mt-8 border-t border-[var(--lp-border-light)] pt-6">
      {view.waiting ? (
        <>
          <h2 id="get-paid-title" className="text-[17px] font-medium text-[var(--lp-dark)]">{g.waitingTitle}</h2>
          <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">
            {fill(g.waitingBody, { time: new Intl.DateTimeFormat(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(view.waiting.deadline) })}
          </p>
        </>
      ) : (
        <>
          <h2 id="get-paid-title" className="text-[17px] font-medium text-[var(--lp-dark)]">{requestedAt ? g.requestedTitle : g.title}</h2>
          <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">{requestedAt ? g.requestedBody : g.body}</p>
        </>
      )}

      {view.offers.length ? (
        <ul className="mt-4 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
          {view.offers.map((offer) => (
            <li key={offer.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[17px] font-semibold tabular-nums text-[var(--lp-dark)]">
                  {fill(g.offerNow, { advance: usdc(offer.nowUsdc) })}
                  {offer.recommended ? (
                    <span className="rounded-full bg-[var(--lp-accent)] px-2.5 py-0.5 text-[13px] font-semibold text-[var(--accent-ink)]">{g.recommended}</span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-[14px] tabular-nums text-[var(--lp-text-sub)]">{fill(g.offerRepay, { repay: usdc(offer.backUsdc) })}</p>
                {offer.holdUsdc ? <p className="mt-0.5 text-[14px] tabular-nums text-[var(--lp-text-sub)]">{fill(g.hold, { amount: usdc(offer.holdUsdc) })}</p> : null}
                {!offer.funded ? <p className="mt-0.5 text-[14px] text-[var(--lp-text-sub)]">{g.waitingOnFinancier}</p> : null}
              </div>
              <button type="button" onClick={() => { setError(null); setReviewing(offer); }} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[var(--tint)] px-5 text-[15px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]">
                {g.review}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!reviewing && !asking ? errorLine : null}
      {view.waiting ? null : <div className="mt-4">
        {requestedAt ? (
          <button type="button" disabled={busy} onClick={() => void withdraw()} className={`${quietButton} sm:w-auto`}>{g.withdraw}</button>
        ) : (
          <button type="button" disabled={busy} onClick={() => { setError(null); setAsking(true); }} className={`${quietButton} sm:w-auto`}>{g.ask}</button>
        )}
      </div>}

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

      <Sheet open={!!reviewing} title={reviewing ? fill(g.acceptTitle, { advance: usdc(reviewing.nowUsdc) }) : ''} onClose={() => setReviewing(null)} busy={busy}>
        {reviewing ? (
          <>
            <p className="text-[15px] text-[var(--lp-dark)]">
              {fill(g.consequence, { advance: usdc(reviewing.nowUsdc), repay: usdc(reviewing.backUsdc) })}
            </p>
            {reviewing.holdUsdc ? <p className="mt-2 text-[15px] text-[var(--lp-text-sub)]">{fill(g.hold, { amount: usdc(reviewing.holdUsdc) })}</p> : null}
            {errorLine}
            <div className="mt-6">
              <button type="button" disabled={busy} onClick={() => void accept(reviewing)} className={primaryButton}>
                {reviewing.gapUsdc ? fill(g.putUpAndTake, { gap: usdc(reviewing.gapUsdc) }) : g.accept}
              </button>
            </div>
          </>
        ) : null}
      </Sheet>
    </section>
  );
}
