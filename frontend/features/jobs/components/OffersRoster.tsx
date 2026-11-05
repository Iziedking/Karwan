'use client';
import { useState } from 'react';
import { api, ApiError, type BuyerBid, type WorldCheckReason } from '@/core/api';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { Icon } from '@/shared/components/Icon';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import type { OfferRosterCopy } from '@/shared/i18n/messages/offerRoster';
import { shortAddress } from '@/shared/utils/format';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { Price } from '@/features/money/components/Price';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { useReputation } from '@/features/reputation/hooks/useReputation';
import { cn } from '@/shared/utils/cn';
import { reasonLabels } from '@/features/reputation/sealed';
import { ConfirmSheet } from '@/features/deals/workspace/ConfirmSheet';
import { Sheet } from '@/features/deals/workspace/Sheet';
import { fill } from '@/features/deals/workspace/presentation';
import { chooseErrorKey } from '../chooseError';
import { fitLevel, offersPage, OFFERS_PER_PAGE, priceRange, rankOffers, type FitLevel } from '../offerRoster';
import { Shortlist, useShortlist } from './Shortlist';
import { AgentWorldCheck } from './AgentWorldCheck';
import { worldStepFrom } from '../agentWorldStep';

const nameOf = (bid: BuyerBid) => bid.sellerDisplayName?.trim() || shortAddress(bid.seller);

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
  const t = useTranslations();
  const money = useMoneyText({ compact: true });
  const copy = t.offerRoster;
  const [open, setOpen] = useState(openInitially);
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<BuyerBid | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [worldStep, setWorldStep] = useState<{ reason: WorldCheckReason | null; skipAllowed: boolean } | null>(null);
  /// The server said this seller is not verified: the sheet says so, and the
  /// next Confirm goes ahead knowingly.
  const [unverified, setUnverified] = useState(false);
  const shortlist = useShortlist(jobId, caller);

  // An empty shortlist next to offers means it has not been rebuilt yet (a
  // restart, a late offer): the offers are shown so the buyer can still choose.
  if (shortlist && caller && (shortlist.entries.length > 0 || bids.length === 0)) {
    return <Shortlist jobId={jobId} caller={caller} entries={shortlist.entries} closed={shortlist.closed || !choosable} worldCheck={shortlist.worldCheck ?? null} recordChecks={shortlist.recordChecks} onChosen={onChosen} />;
  }

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
      await api.chooseOffer(jobId, caller, viewing.seller, { expectedPriceUsdc: viewing.priceUsdc, acknowledgeUnverified: unverified });
      setWorldStep(null);
      setConfirming(false);
      setViewing(null);
      setUnverified(false);
      onChosen();
    } catch (err) {
      const step = worldStepFrom(err);
      if (step) {
        setWorldStep(step);
        return;
      }
      if (err instanceof ApiError && err.code === 'unverified-needs-ack') {
        setUnverified(true);
        return;
      }
      setError(copy[chooseErrorKey(err instanceof ApiError ? err.status : 0, err instanceof ApiError ? err.code : undefined)]);
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
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-[18px] bg-[var(--surface)] px-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span aria-hidden className="flex shrink-0">
                {faces.map((bid, index) => (
                  <span key={bid.seller} className={`rounded-full ring-2 ring-[var(--surface)] ${index > 0 ? '-ms-2.5' : ''}`}>
                    <PersonAvatar address={bid.sellerUserAddress ?? undefined} name={nameOf(bid)} size={30} />
                  </span>
                ))}
                {extra > 0 ? (
                  <span className="-ms-2.5 grid size-[30px] place-items-center rounded-full bg-[var(--raised)] text-[14px] font-semibold text-[var(--ink-secondary)] ring-2 ring-[var(--surface)]">+{extra}</span>
                ) : null}
              </span>
              <span className="min-w-0 truncate text-[14px]">
                <span className="font-semibold text-[var(--ink)]">{folded}</span>
                {!pickSeller && range ? (
                  <span className="text-[var(--ink-secondary)]"> · {money.fill(copy.range, { min: range.min, max: range.max })}</span>
                ) : null}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[14px] font-semibold text-[var(--ink)]">
              {copy.show}
              <Icon name="chevron-right" size={16} className="rotate-90" />
            </span>
          </button>
        )
      ) : (
        <div className="rounded-[18px] bg-[var(--surface)] px-4">
          <div className="flex min-h-14 items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">
              {ranked.length === 1 ? copy.countOne : fill(copy.countMany, { n: ranked.length })}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-expanded
              className="inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
            >
              {copy.hide}
              <Icon name="chevron-right" size={16} className="-rotate-90" />
            </button>
          </div>
          <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
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
              className="flex min-h-12 w-full items-center justify-center border-t border-[var(--line)] text-[14px] font-semibold text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]"
            >
              {fill(copy.showMore, { n: Math.min(OFFERS_PER_PAGE, ranked.length - shown.length) })}
            </button>
          ) : null}
        </div>
      )}
      {open ? <p className="mt-3 px-1 text-[14px] leading-relaxed text-[var(--ink-secondary)] font-medium">{copy.rankNote}</p> : null}

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
        consequence={viewing ? money.fill(copy.confirmBody, { amount: viewing.priceUsdc }, { name: nameOf(viewing) }) : ''}
        confirmLabel={t.requestFlow.accept}
        irreversible={false}
        busy={busy}
        error={error}
        onConfirm={() => { if (!busy) void choose(); }}
        onClose={() => {
          if (busy) return;
          setConfirming(false);
          setWorldStep(null);
          setUnverified(false);
        }}
      >
        {viewing && unverified && !worldStep ? (
          <p role="note" className="border-s-2 border-[var(--line-strong)] ps-3 text-[14px] leading-relaxed text-[var(--ink-secondary)]">
            {fill(t.shortlist.unverifiedWarning, { name: nameOf(viewing) })}
          </p>
        ) : null}
        {viewing && caller && worldStep ? (
          <AgentWorldCheck
            jobId={jobId}
            caller={caller}
            role="buyer"
            reason={worldStep.reason}
            skipAllowed={worldStep.skipAllowed}
            onDone={() => void choose()}
          />
        ) : null}
      </ConfirmSheet>
    </section>
  );
}

function FitMark({ level, copy }: { level: FitLevel; copy: OfferRosterCopy }) {
  const filled = level === 'strong' ? 3 : level === 'good' ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="inline-flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1 w-2 rounded-full ${i < filled ? 'bg-[var(--ink)]' : 'bg-[var(--line)]'}`} />
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
      className="flex min-h-16 w-full items-center gap-3 py-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]"
    >
      <PersonAvatar address={bid.sellerUserAddress ?? undefined} name={nameOf(bid)} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span dir="auto" className="truncate text-[14px] font-semibold text-[var(--ink)]">{nameOf(bid)}</span>
          <ReputationBadge address={bid.seller} size="sm" appearance="quiet" />
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[14px] text-[var(--ink-secondary)] font-medium">
          {pick ? <span className="font-semibold text-[var(--ink)]">{copy.pick}</span> : null}
          {level ? <FitMark level={level} copy={copy} /> : null}
          {by ? <span>{fill(copy.delivers, { date: by })}</span> : null}
        </span>
      </span>
      <Price usdc={Number(bid.priceUsdc)} className="shrink-0 text-end text-[16px] font-semibold text-[var(--ink)]" />
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
  // Someone else's record is sealed (D30): their tier and reasons, never counts.
  const { data, sealed } = useReputation(bid.seller);
  const sr = useTranslations().sealedRecord;
  const money = useMoneyText({ compact: true });
  const reasons = sealed ? reasonLabels(sealed.reasons, sr) : [];
  const level = fitLevel(bid.topicalMatch);
  const settled = data ? data.successCount + data.disputedCount + data.failedCount : null;
  const by = bid.deadlineUnix ? new Date(bid.deadlineUnix * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '-';
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <PersonAvatar address={bid.sellerUserAddress ?? undefined} name={nameOf(bid)} size={44} />
        <div className="min-w-0 flex-1">
          <ReputationBadge address={bid.seller} size="md" appearance="quiet" />
          {pick ? <p className="mt-0.5 text-[14px] font-semibold text-[var(--ink)]">{copy.pick}</p> : null}
        </div>
        <Price usdc={Number(bid.priceUsdc)} className="shrink-0 text-end text-[22px] font-semibold text-[var(--ink)]" />
      </div>
      <dl className={cn('grid gap-2', data ? 'grid-cols-3' : 'grid-cols-1')}>
        {data ? (
          <>
            <div className="rounded-[14px] bg-[var(--raised)] p-3">
              <dt className="text-[14px] text-[var(--ink-secondary)] font-medium">{copy.settled}</dt>
              <dd className="mt-0.5 text-[17px] font-semibold tabular-nums text-[var(--ink)]">{settled}</dd>
            </div>
            <div className="rounded-[14px] bg-[var(--raised)] p-3">
              <dt className="text-[14px] text-[var(--ink-secondary)] font-medium">{copy.disputes}</dt>
              <dd className="mt-0.5 text-[17px] font-semibold tabular-nums text-[var(--ink)]">{data.disputedCount}</dd>
            </div>
          </>
        ) : null}
        <div className="rounded-[14px] bg-[var(--raised)] p-3">
          <dt className="text-[14px] text-[var(--ink-secondary)] font-medium">{copy.deliverBy}</dt>
          <dd className="mt-0.5 text-[17px] font-semibold text-[var(--ink)]">{by}</dd>
        </div>
      </dl>
      {reasons.length ? (
        <ul aria-label={sr.record} className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {reasons.map((label) => (
            <li key={label} className="py-2.5 text-[15px] text-[var(--ink)]">{label}</li>
          ))}
        </ul>
      ) : null}
      {level || settled === 0 ? (
        <p className="flex flex-wrap gap-2 text-[14px]">
          {level ? <span className="rounded-full bg-[var(--raised)] px-3 py-1.5 text-[var(--ink)]"><FitMark level={level} copy={copy} /></span> : null}
          {settled === 0 ? <span className="rounded-full bg-[var(--raised)] px-3 py-1.5 text-[var(--ink-secondary)]">{copy.newHere}</span> : null}
        </p>
      ) : null}
      {canChoose ? (
        <button
          type="button"
          onClick={onChoose}
          className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-[var(--action)] px-6 text-[16px] font-semibold text-[var(--on-action)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2"
        >
          {money.fill(copy.choose, { amount: bid.priceUsdc }, { name: nameOf(bid) })}
        </button>
      ) : null}
      {bid.sellerUserAddress ? (
        <a href={`/credit-passport/${bid.sellerUserAddress}`} target="_blank" rel="noopener noreferrer" className="block text-center text-[14px] font-semibold text-[var(--ink)] underline underline-offset-4">
          {copy.record}
        </a>
      ) : null}
    </div>
  );
}
