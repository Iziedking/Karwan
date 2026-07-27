'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useWalletClient } from 'wagmi';
import {
  api,
  ApiError,
  type DirectDeal,
  type FactoringOffer,
  type FactoringQualification,
} from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { formatUsdc } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';

/// Seller-side factoring CTA on the deal detail page. Polls
/// /api/factoring/offers/:invoiceId when the viewer is the deal's seller
/// and the deal is eligible (accepted, not settled, not factored).
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
  // Eligibility gate. Mirrors the backend's factoring eligibility exactly
  // (routes/factoring.ts: accepted, not settled/cancelled/disputed, not already
  // factored). Delivery is NOT a gate: a seller who has delivered and is waiting
  // on the buyer's release is precisely who wants early payout, and the backend
  // both lists and lets a financier post offers on a delivered-not-settled deal,
  // so requiring `!delivered` here hid the accept UI for a live, notified offer.
  const eligible =
    viewerIsSeller &&
    // Finance-lane only: factoring never applies to a P2P service deal.
    deal.tradeLane === 'finance' &&
    !!deal.acceptedAt &&
    !deal.settledAt &&
    !deal.cancelledAt &&
    !deal.disputed &&
    !deal.factoringOfferId;

  const [offers, setOffers] = useState<FactoringOffer[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  /// Mirrors deal.factoringRequestedAt so the band flips the moment the seller
  /// acts, without waiting for the parent to refetch the deal.
  const [requestedAt, setRequestedAt] = useState<number | undefined>(deal.factoringRequestedAt);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    setRequestedAt(deal.factoringRequestedAt);
  }, [deal.factoringRequestedAt]);

  async function askForEarlyPayout() {
    setRequestBusy(true);
    setRequestError(null);
    try {
      const r = await api.requestFactoring({ invoiceId: deal.jobId });
      setRequestedAt(r.deal?.factoringRequestedAt ?? Date.now());
    } catch (e) {
      setRequestError(e instanceof ApiError ? e.message : 'Could not send the request.');
    } finally {
      setRequestBusy(false);
    }
  }

  async function withdrawEarlyPayout() {
    setRequestBusy(true);
    setRequestError(null);
    try {
      await api.withdrawFactoringRequest({ invoiceId: deal.jobId });
      setRequestedAt(undefined);
    } catch (e) {
      setRequestError(e instanceof ApiError ? e.message : 'Could not withdraw the request.');
    } finally {
      setRequestBusy(false);
    }
  }

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

  if (!eligible) return null;

  // Nothing is shown to financiers until the seller asks. Before that, this is
  // the only place the option appears at all.
  if (!requestedAt) {
    return (
      <FactoringRequestBand
        tone="idle"
        tag="[:GET PAID EARLY:]"
        line="Open this invoice to financiers instead of waiting for buyer release."
        cta={requestBusy ? 'Sending…' : 'Ask for early payout'}
        onClick={askForEarlyPayout}
        busy={requestBusy}
        error={requestError}
      />
    );
  }

  if (!offers || offers.length === 0) {
    return (
      <FactoringRequestBand
        tone="waiting"
        tag="[:EARLY PAYOUT REQUESTED:]"
        line="Financiers can see this invoice and bid. You accept or ignore."
        cta={requestBusy ? 'Working…' : 'Withdraw request'}
        onClick={withdrawEarlyPayout}
        busy={requestBusy}
        error={requestError}
      />
    );
  }

  const best = sortedOffers[0];
  const bestDiscount = (best.discountBps / 100).toFixed(1);
  // What early payout actually costs the seller: what the financier takes on
  // settlement, minus what they hand over now. Measuring from face was wrong on
  // an invoice that has already released a tranche, because the financier is
  // only ever repaid out of what is left.
  const bestSpread = (
    Number(best.expectedReturnUsdc) - Number(best.offeredAdvanceUsdc)
  ).toFixed(2);

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

/// registry.assignReceivable: the seller relays the financier's signed advance
/// and assigns the receivable in one call.
const assignReceivableAbi = [
  {
    type: 'function',
    name: 'assignReceivable',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'invoiceId', type: 'bytes32' },
      { name: 'financier', type: 'address' },
      { name: 'repayUsdc', type: 'uint128' },
      { name: 'advanceUsdc', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

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
  const [needsStake, setNeedsStake] = useState(false);
  const [qual, setQual] = useState<FactoringQualification | null>(null);

  // The seller's tier + free stake, so the requirement to take an advance shows
  // BEFORE they try to accept. Same for every offer; the per-offer amount is
  // advance × requiredBps / 10000.
  useEffect(() => {
    let cancelled = false;
    api
      .myFactoringQualification()
      .then((q) => {
        if (!cancelled) setQual(q);
      })
      .catch(() => {
        /* best-effort; the accept route still enforces the gate */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isCircleUser = auth.method === 'circle';

  async function accept(offer: FactoringOffer) {
    setAcceptingId(offer.id);
    setError(null);
    setNeedsStake(false);
    try {
      // Accepting is one on-chain call: the registry relays the financier's
      // signed advance to the seller and assigns the receivable to them in the
      // same transaction. Neither half can happen without the other, so there
      // is no moment where the seller is unpaid but already assigned.
      //
      // The call is seller-gated on chain, so a web3 seller sends it. Circle
      // sellers have it signed from their identity wallet by the backend and
      // never see a prompt. No repayment signature is collected any more: the
      // escrow pays the financier out of the settlement.
      let assignTxHash: string | undefined;
      if (!isCircleUser) {
        if (!walletClient || !auth.address) {
          setError('Connect your wallet to accept this offer.');
          setAcceptingId(null);
          return;
        }
        const p = await api.factoringAssignmentParams(offer.id);
        assignTxHash = await walletClient.writeContract({
          address: p.registry,
          abi: assignReceivableAbi,
          functionName: 'assignReceivable',
          args: [
            p.invoiceId,
            p.financier,
            BigInt(p.repayUsdc),
            BigInt(p.advanceUsdc),
            BigInt(p.validAfter),
            BigInt(p.validBefore),
            p.nonce,
            p.v,
            p.r,
            p.s,
          ],
          chain: walletClient.chain,
          account: auth.address as `0x${string}`,
        });
      }
      const r = await api.acceptFactoringOffer({
        offerId: offer.id,
        assignTxHash,
      });
      onAccepted(r.offer);
    } catch (e) {
      setError((e as Error).message);
      // A reputation-tiered stake shortfall: point the seller at staking. The
      // financier's default risk is backed by stake, so an elite is waived and
      // a new wallet must collateralize the advance.
      if (e instanceof ApiError && e.code === 'INSUFFICIENT_STAKE') {
        setNeedsStake(true);
      }
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
          {qual ? (
            <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-snug">
              Your tier{' '}
              <span className="font-bold text-[var(--lp-dark)]">{qual.tier.toUpperCase()}</span>
              {qual.requiredBps === 0
                ? ' waives the stake requirement.'
                : ` backs ${qual.requiredBps / 100}% of the advance.`}
              {qual.freeStakeUsdc != null
                ? ` You have ${Number(qual.freeStakeUsdc).toFixed(2)} USDC staked.`
                : ''}
            </p>
          ) : null}
          <ul className="space-y-3">
            {offers.map((o, i) => (
              <OfferRow
                key={o.id}
                offer={o}
                isBest={i === 0}
                acceptingId={acceptingId}
                onAccept={accept}
                qual={qual}
              />
            ))}
          </ul>
          {error ? (
            <div className="space-y-1.5">
              <p className="text-[12px] leading-snug text-[var(--lp-critical)]">{error}</p>
              {needsStake ? (
                <Link
                  href="/stake"
                  className="inline-block mono text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--lp-dark)] underline underline-offset-2"
                >
                  Stake to qualify →
                </Link>
              ) : null}
            </div>
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
  qual,
}: {
  offer: FactoringOffer;
  isBest: boolean;
  acceptingId: string | null;
  onAccept: (offer: FactoringOffer) => void;
  qual: FactoringQualification | null;
}) {
  const advance = Number(offer.offeredAdvanceUsdc);
  const face = Number(offer.faceValueUsdc);
  const discountPct = (offer.discountBps / 100).toFixed(1);
  // The cost of taking the money early is what the financier collects on
  // settlement minus what they pay now. On an invoice that has already released
  // a tranche this is not face minus advance, because the financier is repaid
  // only out of what remains.
  const spread = (Number(offer.expectedReturnUsdc) - advance).toFixed(2);
  const expiresInHours = Math.max(0, Math.round((offer.expiresAt - Date.now()) / 3_600_000));
  const isAccepting = acceptingId === offer.id;
  const anyAccepting = acceptingId !== null;

  // Stake this advance needs at the seller's tier, and whether they're short.
  const requiredStake = qual && qual.requiredBps > 0 ? (advance * qual.requiredBps) / 10_000 : 0;
  const freeStake = qual?.freeStakeUsdc != null ? Number(qual.freeStakeUsdc) : null;
  const stakeShort = requiredStake > 0 && freeStake != null && freeStake < requiredStake;
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
          {requiredStake > 0 ? (
            <p
              className={cn(
                'mt-0.5 mono text-[10px] uppercase tracking-[0.14em] tabular-nums',
                stakeShort ? 'text-[var(--lp-critical)] font-bold' : 'text-[var(--lp-text-muted)]',
              )}
            >
              Needs {requiredStake.toFixed(2)} USDC staked
              {stakeShort && freeStake != null ? ` · you have ${freeStake.toFixed(2)}` : ''}
            </p>
          ) : null}
          <Link
            href={`/credit-passport/${offer.financier}`}
            target="_blank"
            className="inline-block mt-2 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
          >
            Financier passport ↗
          </Link>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => onAccept(offer)}
            disabled={anyAccepting || stakeShort}
            title={stakeShort ? 'Stake more to qualify at your tier' : undefined}
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
          {stakeShort ? (
            <Link
              href="/stake"
              className="mono text-[9px] uppercase tracking-[0.14em] font-bold text-[var(--lp-dark)] underline underline-offset-2"
            >
              Stake to qualify →
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/// The pre-offer states of the early-payout band: the seller has not asked yet,
/// or has asked and nobody has bid. Top-level component per Vercel
/// `rerender-no-inline-components`.
function FactoringRequestBand({
  tone,
  tag,
  line,
  cta,
  onClick,
  busy,
  error,
}: {
  tone: 'idle' | 'waiting';
  tag: string;
  line: string;
  cta: string;
  onClick: () => void;
  busy: boolean;
  error: string | null;
}) {
  const waiting = tone === 'waiting';
  return (
    <section
      className="mt-7 px-5 py-4 md:px-6 md:py-5 flex items-center justify-between gap-4 flex-wrap"
      style={{
        background: waiting ? 'rgba(175, 201, 91, 0.12)' : 'transparent',
        border: waiting
          ? '1px solid rgba(175, 201, 91, 0.45)'
          : '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 3,
      }}
    >
      <div className="min-w-0">
        <p className="mono text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--lp-dark)]">
          {tag}
        </p>
        <p className="mt-1.5 text-[14px] text-[var(--lp-dark)] leading-snug">{line}</p>
        {error ? (
          <p className="mt-1 mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-critical)]">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={cn(
          'mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-2 disabled:opacity-50',
          waiting
            ? 'bg-transparent text-[var(--lp-dark)] border border-black/20'
            : 'bg-[var(--lp-dark)] text-[var(--lp-bg)]',
        )}
        style={{
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          borderBottomLeftRadius: 6,
          borderBottomRightRadius: 2,
        }}
      >
        {cta}
      </button>
    </section>
  );
}
