'use client';
import { useState } from 'react';
import { api, ApiError, type BuyerBid } from '@/core/api';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { Icon } from '@/shared/components/Icon';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import type { OfferRosterCopy } from '@/shared/i18n/messages/offerRoster';
import { formatUsdc, shortAddress } from '@/shared/utils/format';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { useReputation } from '@/features/reputation/hooks/useReputation';
import { ConfirmSheet } from '@/features/deals/workspace/ConfirmSheet';
import { Sheet } from '@/features/deals/workspace/Sheet';
import { fill } from '@/features/deals/workspace/presentation';
import { fitLevel, offersPage, OFFERS_PER_PAGE, priceRange, rankOffers, type FitLevel } from '../offerRoster';

const nameOf = (bid: BuyerBid) => bid.sellerDisplayName?.trim() || shortAddress(bid.seller);
const price = (usdc: string | number) => formatUsdc(String(usdc), { withSuffix: false });

/// The offers on a request: folded to one row of faces until asked, then a
/// ranked list four at a time. Any offer opens a sheet where the buyer can
/// choose it at its own price, even over the agent's pick.
export function OffersRoster({ jobId, bids, pickSeller, caller, choosable, open: openInitially = false, onChosen }: {
  jobId: string;
  bids: BuyerBid[];
  /// The seller agent of the agent's current pick, when there is one.
  pickSeller: string | null;
  caller: string | null;
  /// False once the request has closed or a match was agreed.
  choosable: boolean;
  open?: boolean;
  onChosen: () => void;
}) {
  const copy = useTranslations().offerRoster;
  const [open, setOpen] = useState(openInitially);
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<BuyerBid | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ranked = rankOffers(bids);
  const isPick = (bid: BuyerBid) => !!pickSeller && bid.seller.toLowerCase() === pickSeller.toLowerCase();
  const others = pickSeller ? ranked.filter((bid) => !isPick(bid)) : ranked;
  if (ranked.length === 0) return null;

  const shown = offersPage(ranked, page);
  const range = priceRange(ranked);
  const folded = pickSeller
    ? (others.length === 1 ? copy.othersOne : fill(copy.othersMany, { n: others.length }))
    : (ranked.length === 1 ? copy.soFarOne : fill(copy.soFarMany, { n: ranked.length }));
  const faces = (pickSeller ? others : ranked).slice(0, 3);
  const extra = (pickSeller ? others : ranked).length - faces.length;

  async function choose() {
    if (!viewing || !caller) return;
    setBusy(true);
    setError(null);
    try {
      await api.chooseOffer(jobId, caller, viewing.seller);
      setConfirming(false);
      setViewing(null);
      onChosen();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError(code === 'INSUFFICIENT_AGENT_BALANCE' ? copy.noFunds : copy.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-guide="job-bids" className="mt-6">
      {!open ? (
        pickSeller && others.length === 0 ? null : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={false}
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-[18px] bg-[var(--lp-card)] px-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span aria-hidden className="flex shrink-0">
                {faces.map((bid, index) => (
                  <span key={bid.seller} className={`rounded-full ring-2 ring-[var(--lp-card)] ${index > 0 ? '-ms-2.5' : ''}`}>
                    <PersonAvatar address={bid.sellerUserAddress ?? undefined} name={nameOf(bid)} size={30} />
                  </span>
                ))}
                {extra > 0 ? (
                  <span className="-ms-2.5 grid size-[30px] place-items-center rounded-full bg-[var(--lp-light)] text-[11px] font-semibold text-[var(--lp-text-sub)] ring-2 ring-[var(--lp-card)]">+{extra}</span>
                ) : null}
              </span>
              <span className="min-w-0 truncate text-[14px]">
                <span className="font-semibold text-[var(--lp-dark)]">{folded}</span>
                {!pickSeller && range ? (
                  <span className="text-[var(--lp-text-sub)]"> · {fill(copy.range, { min: price(range.min), max: price(range.max) })}</span>
                ) : null}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-[var(--lp-dark)]">
              {copy.show}
              <Icon name="chevron-right" size={16} className="rotate-90" />
            </span>
          </button>
        )
      ) : (
        <div className="rounded-[18px] bg-[var(--lp-card)] px-4">
          <div className="flex min-h-14 items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[var(--lp-dark)]">
              {ranked.length === 1 ? copy.countOne : fill(copy.countMany, { n: ranked.length })}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-expanded
              className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
            >
              {copy.hide}
              <Icon name="chevron-right" size={16} className="-rotate-90" />
            </button>
          </div>
          <ul className="divide-y divide-[var(--lp-border-light)] border-t border-[var(--lp-border-light)]">
            {shown.map((bid) => (
              <li key={bid.seller}>
                <OfferRow bid={bid} pick={isPick(bid)} copy={copy} onOpen={() => { setError(null); setViewing(bid); }} />
              </li>
            ))}
          </ul>
          {shown.length < ranked.length ? (
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              className="flex min-h-12 w-full items-center justify-center border-t border-[var(--lp-border-light)] text-[13px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)]"
            >
              {fill(copy.showMore, { n: Math.min(OFFERS_PER_PAGE, ranked.length - shown.length) })}
            </button>
          ) : null}
        </div>
      )}
      {open ? <p className="mt-3 px-1 text-[12.5px] leading-relaxed text-[var(--lp-text-sub)]">{copy.rankNote}</p> : null}

      <Sheet open={!!viewing && !confirming} title={viewing ? nameOf(viewing) : ''} onClose={() => setViewing(null)}>
        {viewing ? (
          <OfferDetail
            bid={viewing}
            pick={isPick(viewing)}
            copy={copy}
            canChoose={!!caller && choosable && !isPick(viewing)}
            onChoose={() => setConfirming(true)}
          />
        ) : null}
      </Sheet>
      <ConfirmSheet
        open={!!viewing && confirming}
        title={viewing ? fill(copy.confirmTitle, { name: nameOf(viewing) }) : ''}
        consequence={viewing ? fill(copy.confirmBody, { name: nameOf(viewing), amount: price(viewing.priceUsdc) }) : ''}
        irreversible={false}
        busy={busy}
        error={error}
        onConfirm={() => { if (!busy) void choose(); }}
        onClose={() => { if (!busy) setConfirming(false); }}
      />
    </section>
  );
}

function FitMark({ level, copy }: { level: FitLevel; copy: OfferRosterCopy }) {
  const filled = level === 'strong' ? 3 : level === 'good' ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="inline-flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1 w-2 rounded-full ${i < filled ? 'bg-[var(--color-positive)]' : 'bg-[var(--lp-border-light)]'}`} />
        ))}
      </span>
      {copy.fit[level]}
    </span>
  );
}

function OfferRow({ bid, pick, copy, onOpen }: { bid: BuyerBid; pick: boolean; copy: OfferRosterCopy; onOpen: () => void }) {
  const { locale } = useLocale();
  const level = fitLevel(bid.topicalMatch);
  const by = bid.deadlineUnix ? new Date(bid.deadlineUnix * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-16 w-full items-center gap-3 py-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)]"
    >
      <PersonAvatar address={bid.sellerUserAddress ?? undefined} name={nameOf(bid)} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span dir="auto" className="truncate text-[14px] font-semibold text-[var(--lp-dark)]">{nameOf(bid)}</span>
          <ReputationBadge address={bid.seller} size="sm" appearance="quiet" />
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-[var(--lp-text-sub)]">
          {pick ? <span className="font-semibold text-[var(--color-positive)]">{copy.pick}</span> : null}
          {level ? <FitMark level={level} copy={copy} /> : null}
          {by ? <span>{fill(copy.delivers, { date: by })}</span> : null}
        </span>
      </span>
      <span className="shrink-0 text-end text-[16px] font-semibold tabular-nums text-[var(--lp-dark)]">
        {price(bid.priceUsdc)}
        <span className="block text-[11px] font-medium text-[var(--lp-text-sub)]">USDC</span>
      </span>
    </button>
  );
}

function OfferDetail({ bid, pick, copy, canChoose, onChoose }: {
  bid: BuyerBid;
  pick: boolean;
  copy: OfferRosterCopy;
  canChoose: boolean;
  onChoose: () => void;
}) {
  const { locale } = useLocale();
  const { data } = useReputation(bid.seller);
  const level = fitLevel(bid.topicalMatch);
  const settled = data ? data.successCount + data.disputedCount + data.failedCount : null;
  const by = bid.deadlineUnix ? new Date(bid.deadlineUnix * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '-';
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <PersonAvatar address={bid.sellerUserAddress ?? undefined} name={nameOf(bid)} size={44} />
        <div className="min-w-0 flex-1">
          <ReputationBadge address={bid.seller} size="md" appearance="quiet" />
          {pick ? <p className="mt-0.5 text-[12.5px] font-semibold text-[var(--color-positive)]">{copy.pick}</p> : null}
        </div>
        <p className="shrink-0 text-end text-[22px] font-semibold tabular-nums text-[var(--lp-dark)]">
          {price(bid.priceUsdc)}
          <span className="block text-[12px] font-medium text-[var(--lp-text-sub)]">USDC</span>
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <div className="rounded-[14px] bg-[var(--lp-light)] p-3">
          <dt className="text-[11.5px] text-[var(--lp-text-sub)]">{copy.settled}</dt>
          <dd className="mt-0.5 text-[17px] font-semibold tabular-nums text-[var(--lp-dark)]">{settled ?? '-'}</dd>
        </div>
        <div className="rounded-[14px] bg-[var(--lp-light)] p-3">
          <dt className="text-[11.5px] text-[var(--lp-text-sub)]">{copy.disputes}</dt>
          <dd className="mt-0.5 text-[17px] font-semibold tabular-nums text-[var(--lp-dark)]">{data ? data.disputedCount : '-'}</dd>
        </div>
        <div className="rounded-[14px] bg-[var(--lp-light)] p-3">
          <dt className="text-[11.5px] text-[var(--lp-text-sub)]">{copy.deliverBy}</dt>
          <dd className="mt-0.5 text-[17px] font-semibold text-[var(--lp-dark)]">{by}</dd>
        </div>
      </dl>
      {level || settled === 0 ? (
        <p className="flex flex-wrap gap-2 text-[12.5px]">
          {level ? <span className="rounded-full bg-[var(--lp-light)] px-3 py-1.5 text-[var(--lp-dark)]"><FitMark level={level} copy={copy} /></span> : null}
          {settled === 0 ? <span className="rounded-full bg-[var(--lp-light)] px-3 py-1.5 text-[var(--lp-text-sub)]">{copy.newHere}</span> : null}
        </p>
      ) : null}
      {canChoose ? (
        <button
          type="button"
          onClick={onChoose}
          className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-[var(--action)] px-6 text-[16px] font-semibold text-[var(--on-action)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2"
        >
          {fill(copy.choose, { name: nameOf(bid), amount: price(bid.priceUsdc) })}
        </button>
      ) : null}
      {bid.sellerUserAddress ? (
        <a href={`/credit-passport/${bid.sellerUserAddress}`} className="block text-center text-[13px] font-semibold text-[var(--lp-dark)] underline underline-offset-4">
          {copy.record}
        </a>
      ) : null}
    </div>
  );
}
