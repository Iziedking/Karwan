'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useWalletClient } from 'wagmi';
import { api, type DirectDeal, type FactoringOffer } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { formatUsdc } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import {
  buildTransferAuthorization,
  serializeAuthorization,
} from '@/features/factoring/usdcAuthorization';

/// Seller-side factoring CTA on the deal detail page. Polls
/// /api/factoring/offers/:invoiceId when the viewer is the deal's seller
/// and the deal is eligible (accepted, not delivered, not factored).
/// Renders nothing when no open offers exist, service-flow deals never
/// see this band. Top-level component per Vercel
/// `rerender-no-inline-components`.
export function SellerOfferBanner({
  deal,
  viewerIsSeller,
}: {
  deal: DirectDeal;
  viewerIsSeller: boolean;
}) {
  // Eligibility gate. Fires the fetch only when the seller-side
  // conditions hold; service-flow deals skip the network call entirely.
  const eligible =
    viewerIsSeller &&
    !!deal.acceptedAt &&
    !deal.delivered &&
    !deal.settledAt &&
    !deal.cancelledAt &&
    !deal.disputed &&
    !deal.factoringOfferId;

  const [offers, setOffers] = useState<FactoringOffer[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!eligible) {
      setOffers(null);
      return;
    }
    let cancelled = false;
    api
      .listOffersForInvoice(deal.jobId)
      .then((r) => {
        if (cancelled) return;
        const open = r.offers.filter(
          (o) => o.status === 'offered' && Date.now() < o.expiresAt,
        );
        setOffers(open);
      })
      .catch(() => {
        if (!cancelled) setOffers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [eligible, deal.jobId]);

  // Sort once per offers update, derive during render per
  // `rerender-derived-state-no-effect`.
  const sortedOffers = useMemo(() => {
    if (!offers) return [];
    return [...offers].sort(
      (a, b) => Number(b.offeredAdvanceUsdc) - Number(a.offeredAdvanceUsdc),
    );
  }, [offers]);

  if (!eligible || !offers || offers.length === 0) return null;
  const best = sortedOffers[0];
  const bestDiscount = (best.discountBps / 100).toFixed(1);
  const bestSpread = (Number(best.faceValueUsdc) - Number(best.offeredAdvanceUsdc)).toFixed(2);

  return (
    <>
      <section
        className="mt-7 px-5 py-4 md:px-6 md:py-5 flex items-center justify-between gap-4 flex-wrap"
        style={{
          background: 'rgba(175, 201, 91, 0.12)',
          border: '1px solid rgba(175, 201, 91, 0.45)',
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 3,
        }}
      >
        <div className="min-w-0">
          <p className="mono text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--lp-dark)]">
            [:EARLY PAYOUT AVAILABLE:]
          </p>
          <p className="mt-1.5 text-[14px] text-[var(--lp-dark)] leading-snug">
            Settle now instead of waiting for buyer release.
          </p>
          <p className="mt-1 mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] tabular-nums">
            {offers.length} {offers.length === 1 ? 'offer' : 'offers'} · best:{' '}
            <span className="text-[var(--lp-dark)] font-bold">
              {formatUsdc(best.offeredAdvanceUsdc, { withSuffix: false })} USDC
            </span>{' '}
            ({bestDiscount}% discount, +{bestSpread} USDC)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-2 bg-[var(--lp-dark)] text-[var(--lp-bg)]"
          style={{
            borderTopLeftRadius: 6,
            borderTopRightRadius: 6,
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 2,
          }}
        >
          See offers →
        </button>
      </section>
      {modalOpen ? (
        <OffersModal
          deal={deal}
          offers={sortedOffers}
          onClose={() => setModalOpen(false)}
          onAccepted={() => {
            setModalOpen(false);
            // Best-effort: clear local state so the banner disappears.
            // The deal's factoringOfferId will be set on next poll.
            setOffers(null);
          }}
        />
      ) : null}
    </>
  );
}

// Offers modal

/// How long the seller's repayment authorization stays valid. Must clear
/// the backend's 60-day floor with room for slow deals.
const REPAY_VALIDITY_DAYS = 180;

function OffersModal({
  deal,
  offers,
  onClose,
  onAccepted,
}: {
  deal: DirectDeal;
  offers: FactoringOffer[];
  onClose: () => void;
  onAccepted: (offer: FactoringOffer) => void;
}) {
  const auth = useAuth();
  const { data: walletClient } = useWalletClient();
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isCircleUser = auth.method === 'circle';

  async function accept(offer: FactoringOffer) {
    setAcceptingId(offer.id);
    setError(null);
    try {
      // Accepting moves real money: the financier's advance pays out the
      // moment the backend confirms. Web3 sellers also sign the
      // repayment authorization here (USDC EIP-3009, no gas, nothing
      // moves now); the settlement watcher submits it when the escrow
      // settles. Circle sellers skip the signature; the backend signs
      // from their identity wallet at settle time.
      let repayAuthorization;
      if (!isCircleUser) {
        if (!walletClient || !auth.address) {
          setError('Connect your wallet to sign the repayment authorization.');
          setAcceptingId(null);
          return;
        }
        const typed = buildTransferAuthorization({
          from: auth.address as `0x${string}`,
          to: offer.financier as `0x${string}`,
          valueUsdc: offer.expectedReturnUsdc,
          validForSeconds: REPAY_VALIDITY_DAYS * 24 * 3600,
        });
        const signature = await walletClient.signTypedData({
          account: auth.address as `0x${string}`,
          ...typed,
        });
        repayAuthorization = serializeAuthorization(typed.message, signature);
      }
      const r = await api.acceptFactoringOffer({
        offerId: offer.id,
        repayAuthorization,
      });
      onAccepted(r.offer);
    } catch (e) {
      setError((e as Error).message);
      setAcceptingId(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-3 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="bg-[var(--lp-light)] border border-[var(--lp-border-light)] w-full max-w-[520px] overflow-hidden my-6"
        style={{
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          borderBottomLeftRadius: 14,
          borderBottomRightRadius: 3,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--lp-border-light)] flex items-center justify-between gap-3">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:OFFERS:]
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[18px] leading-none text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)]"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-5 md:p-6 space-y-3">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              FACE VALUE
            </p>
            <p className="mt-1 serif text-[24px] tabular-nums leading-none tracking-[-0.02em] text-[var(--lp-dark)]">
              {formatUsdc(deal.dealAmountUsdc, { withSuffix: false })}{' '}
              <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                USDC
              </span>
            </p>
          </div>
          <p className="text-[12px] text-[var(--lp-text-sub)] leading-snug">
            Accept an offer to take immediate payout. Settlement on buyer release
            routes the agreed amount to the financier.
          </p>
          <ul className="space-y-3">
            {offers.map((o, i) => (
              <OfferRow
                key={o.id}
                offer={o}
                isBest={i === 0}
                acceptingId={acceptingId}
                onAccept={accept}
              />
            ))}
          </ul>
          {error ? (
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-critical)]">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OfferRow({
  offer,
  isBest,
  acceptingId,
  onAccept,
}: {
  offer: FactoringOffer;
  isBest: boolean;
  acceptingId: string | null;
  onAccept: (offer: FactoringOffer) => void;
}) {
  const advance = Number(offer.offeredAdvanceUsdc);
  const face = Number(offer.faceValueUsdc);
  const discountPct = (offer.discountBps / 100).toFixed(1);
  const spread = (face - advance).toFixed(2);
  const expiresInHours = Math.max(0, Math.round((offer.expiresAt - Date.now()) / 3_600_000));
  const isAccepting = acceptingId === offer.id;
  const anyAccepting = acceptingId !== null;
  return (
    <li
      className={cn(
        'p-4 border',
        isBest
          ? 'border-[var(--lp-accent)] bg-[var(--lp-bg)]'
          : 'border-black/10 bg-[var(--lp-bg)]',
      )}
      style={{
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 3,
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {isBest ? (
            <span className="inline-block mono text-[9px] uppercase tracking-[0.18em] font-bold px-1.5 py-0.5 mb-2 bg-[var(--lp-accent)] text-[var(--lp-dark)]">
              BEST
            </span>
          ) : null}
          <p className="serif text-[22px] tabular-nums leading-none tracking-[-0.02em] text-[var(--lp-dark)]">
            {advance.toFixed(2)}{' '}
            <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              USDC
            </span>
          </p>
          <p className="mt-2 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] tabular-nums">
            {discountPct}% discount · +{spread} USDC spread
          </p>
          <p className="mt-0.5 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] tabular-nums">
            Expires in {expiresInHours}h
          </p>
          <Link
            href={`/credit-passport/${offer.financier}`}
            target="_blank"
            className="inline-block mt-2 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
          >
            Financier passport ↗
          </Link>
        </div>
        <button
          type="button"
          onClick={() => onAccept(offer)}
          disabled={anyAccepting}
          className={cn(
            'mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-2 disabled:opacity-60',
            isBest
              ? 'bg-[var(--lp-dark)] text-[var(--lp-bg)]'
              : 'bg-transparent text-[var(--lp-dark)] border border-black/15 hover:border-black/40',
          )}
          style={{
            borderTopLeftRadius: 6,
            borderTopRightRadius: 6,
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 2,
          }}
        >
          {isAccepting ? 'Accepting…' : 'Accept'}
        </button>
      </div>
    </li>
  );
}
