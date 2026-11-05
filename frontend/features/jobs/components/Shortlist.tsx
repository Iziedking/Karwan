'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, type AgentWorldCheckView, type ShortlistEntry, type WorldCheckReason } from '@/core/api';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { FactRows } from '@/shared/components/FactRows';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ratingText } from '@/features/ratings/ratingText';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { Price } from '@/features/money/components/Price';
import { FactsConfirmSheet } from '@/shared/components/FactsConfirmSheet';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { rankedOffers, type RankedOffer } from '../rankedOffers';
import { fill } from '@/features/deals/workspace/presentation';
import { chooseErrorKey } from '../chooseError';
import { rankLine, shortlistCostLine, shortlistNotice, shortlistRowView, shortlistState, type ShortlistState } from '../shortlistPresentation';
import { AgentWorldCheck } from './AgentWorldCheck';
import { worldStepFrom } from '../agentWorldStep';

const POLL_MS = 6_000;

/// The shortlist for a request, or null when the backend does not run it, so
/// the caller falls back to the plain offers list.
export function useShortlist(jobId: string, caller: string | null) {
  const [state, setState] = useState<ShortlistState | null>(null);
  useEffect(() => {
    if (!caller) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const next = shortlistState(await api.shortlist(jobId, caller));
        if (stopped) return;
        setState(next);
        if (next && !next.closed) timer = setTimeout(load, POLL_MS);
      } catch (err) {
        if (stopped) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
          setState(null);
          return;
        }
        timer = setTimeout(load, POLL_MS);
      }
    };
    void load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId, caller]);
  return state;
}

/// The offers on a request in the agent's order, one line each: photo, name,
/// price and place, with the agent's pick marked. A tap shows the rest (view 46).
export function Shortlist({ jobId, caller, entries, closed, worldCheck, recordChecks, onChosen }: {
  jobId: string;
  caller: string;
  entries: ShortlistEntry[];
  closed: boolean;
  worldCheck?: AgentWorldCheckView | null;
  recordChecks?: { count: number; usdc: number };
  onChosen: () => void;
}) {
  const t = useTranslations();
  const money = useMoneyText({ compact: true });
  const copy = t.shortlist;
  const roster = t.offerRoster;
  const rf = t.requestFlow;
  const ranked = rankedOffers(entries);
  // The ranking starts folded: the count first, the order one tap away (owner, 3 Nov 2026).
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<RankedOffer | null>(null);
  const [choosing, setChoosing] = useState<ShortlistEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [worldStep, setWorldStep] = useState<{ reason: WorldCheckReason | null; skipAllowed: boolean } | null>(null);
  const world = t.agentNudges.world;
  const notice = shortlistNotice(entries, copy);
  const cost = shortlistCostLine(recordChecks, copy);
  const { locale } = useLocale();
  // Their record in one line: the rating when they have one, else how far they are verified.
  const recordLine = (e: RankedOffer) => (e.rating ? ratingText(e.rating, t.ratings, locale) : shortlistRowView(e, copy).levelLine);
  const waitingOn = worldCheck?.waitingOn === 'seller' && worldCheck.buyerConfirmed
    ? entries.find((e) => e.seller.toLowerCase() === worldCheck.sellerAgent.toLowerCase())?.name ?? null
    : null;

  async function choose(entry: ShortlistEntry | null = choosing) {
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      await api.chooseOffer(jobId, caller, entry.seller, {
        acknowledgeUnverified: !entry.verified,
        expectedPriceUsdc: entry.priceUsdc,
      });
      setWorldStep(null);
      setChoosing(null);
      onChosen();
    } catch (err) {
      const step = worldStepFrom(err);
      if (step) {
        setWorldStep(step);
        return;
      }
      setError(roster[chooseErrorKey(err instanceof ApiError ? err.status : 0, err instanceof ApiError ? err.code : undefined)]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-guide="job-shortlist" className={`${CARD_CLASS} mt-6 px-4`}>
      <div className="py-4">
        <h2 className="text-[17px] font-semibold text-[var(--ink)]">{copy.title}</h2>
        {ranked.length ? (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-[14px] font-medium text-[var(--ink-secondary)]">
              {open ? copy.note : ranked.length === 1 ? copy.countOne : fill(copy.countMany, { n: ranked.length })}
            </p>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`shortlist-${jobId}`}
              onClick={() => setOpen((now) => !now)}
              className={buttonClasses({ variant: 'outline', size: 'sm' })}
            >
              {open ? copy.hide : copy.show}
            </button>
          </div>
        ) : null}
        {notice ? <p className="mt-2 text-[14px] font-semibold text-[var(--ink)]">{notice}</p> : null}
        {waitingOn ? <p role="status" className="mt-2 text-[14px] font-semibold text-[var(--ink)]">{fill(world.waiting, { name: waitingOn })}</p> : null}
      </div>
      {ranked.length && open ? (
        <ul id={`shortlist-${jobId}`} className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
          {ranked.map((e, i) => (
            <li key={e.seller}>
              <button
                type="button"
                onClick={() => setViewing(e)}
                className="flex min-h-16 w-full items-center gap-3 py-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]"
              >
                <PersonAvatar address={e.sellerUser} name={e.name} size={40} />
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="block truncate text-[15px] font-semibold text-[var(--ink)]">{e.name}</span>
                  <span className="block truncate text-[13px] text-[var(--ink-secondary)]">{recordLine(e)}</span>
                </span>
                <span className="shrink-0 text-end">
                  <Price usdc={e.priceUsdc} className="text-[15px] font-semibold text-[var(--ink)]" />
                  <span
                    {...(e.bestFit ? { 'data-best-fit': '' } : {})}
                    className={`block text-[13px] ${e.bestFit ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-secondary)]'}`}
                  >
                    {e.state === 'unavailable' ? `${fill(copy.rank, { n: i + 1 })} · ${copy.unavailable}` : rankLine(i, e.bestFit, copy)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {cost ? <p className="border-t border-[var(--line)] py-3 text-[13px] font-medium tabular-nums text-[var(--ink-secondary)]">{cost}</p> : null}
      <OfferDetails
        entry={viewing}
        place={viewing ? ranked.indexOf(viewing) : 0}
        canChoose={!closed}
        onClose={() => setViewing(null)}
        onChoose={(e) => {
          setViewing(null);
          setError(null);
          setChoosing(e);
        }}
      />
      <FactsConfirmSheet
        open={!!choosing}
        title={choosing ? fill(rf.acceptTitle, { name: choosing.name }) : ''}
        rows={choosing ? [
          [rf.confirmFor, choosing.offer],
          [rf.confirmTo, choosing.name],
          [rf.confirmPrice, money.text(choosing.priceUsdc)],
          [rf.confirmDelivers, choosing.deliveryDays === 1 ? rf.deliversInOne : fill(rf.deliversIn, { n: choosing.deliveryDays })],
          [rf.heldBy, rf.heldValue],
        ] : []}
        note={choosing && !choosing.verified ? fill(copy.unverifiedWarning, { name: choosing.name }) : undefined}
        primaryLabel={rf.accept}
        quietLabel={rf.notNow}
        busy={busy}
        error={error}
        onConfirm={() => {
          if (!busy) void choose();
        }}
        onClose={() => {
          if (busy) return;
          setChoosing(null);
          setWorldStep(null);
        }}
      >
        {choosing && worldStep ? (
          <AgentWorldCheck
            jobId={jobId}
            caller={caller}
            role="buyer"
            reason={worldStep.reason}
            skipAllowed={worldStep.skipAllowed}
            onDone={() => void choose(choosing)}
          />
        ) : null}
      </FactsConfirmSheet>
    </section>
  );
}

/// Everything about one offer that its line leaves out, and the move.
function OfferDetails({ entry, place, canChoose, onClose, onChoose }: {
  entry: RankedOffer | null;
  place: number;
  canChoose: boolean;
  onClose: () => void;
  onChoose: (entry: RankedOffer) => void;
}) {
  const copy = useTranslations().shortlist;
  const rf = useTranslations().requestFlow;
  const { locale, t: all } = useLocale();
  const v = entry ? shortlistRowView(entry, copy) : null;
  const reasons = entry ? entry.reasonLine.map((r) => copy.reasons[r]).join(' · ') : '';
  const line = 'text-[15px] font-medium text-[var(--ink-secondary)]';
  return (
    <ConfirmSheetShell open={!!entry} labelledBy="offer-details-title" busy={false} onClose={onClose}>
      {entry && v ? (
        <div>
          <div className="flex items-center gap-3">
            <PersonAvatar address={entry.sellerUser} name={entry.name} size={48} />
            <div className="min-w-0 flex-1">
              <h2 id="offer-details-title" dir="auto" className="truncate text-[20px] font-semibold text-[var(--ink)]">{entry.name}</h2>
              <p className="truncate text-[13px] text-[var(--ink-secondary)]">
                {[entry.tag ? `@${entry.tag}` : null, entry.rating ? ratingText(entry.rating, all.ratings, locale) : null].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <Price usdc={entry.priceUsdc} size="hero" className="mt-5" figureClassName="text-[34px] font-semibold leading-none tracking-[-0.02em] text-[var(--ink)]" />
          {v.askedLine ? <p className={`mt-1 ${line}`}>{v.askedLine}</p> : null}
          <p className={`mt-1 text-[14px] ${entry.bestFit ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-secondary)]'}`}>{rankLine(place, entry.bestFit, copy)}</p>
          <div className={`${CARD_CLASS} mt-4 px-5 py-1`}>
            <FactRows facts={[
              { label: copy.recordLabel, value: v.levelLine, id: 'record' },
              { label: rf.confirmFor, value: <span dir="auto">{v.offerLine}</span>, id: 'offer' },
              ...(v.numbersLine ? [{ label: copy.numbersLabel, value: v.numbersLine, id: 'numbers' }] : []),
            ]} />
          </div>
          {reasons ? (
            <div data-offer-why className={`${CARD_CLASS} mt-3 p-4`}>
              <p className="text-[14px] font-semibold text-[var(--ink)]">{fill(copy.whyPlace, { name: entry.name.split(/\s+/)[0] ?? entry.name })}</p>
              <p className="mt-1 text-[14px] text-[var(--ink-secondary)]">{reasons}</p>
            </div>
          ) : null}
          {entry.state === 'negotiating' ? <p className={`mt-3 ${line}`}>{copy.negotiating}</p> : null}
          {entry.state === 'unavailable' ? <p className="mt-3 text-[15px] font-semibold text-[var(--ink)]">{copy.unavailable}</p> : null}
          {v.markLine ? <p className="mt-3 text-[15px] font-semibold text-[var(--ink)]">{v.markLine}</p> : null}
          <div className="mt-6 grid gap-2">
            {canChoose && v.choosable ? (
              <button
                type="button"
                onClick={() => onChoose(entry)}
                aria-label={`${rf.reviewOffer} ${entry.name}`}
                className={buttonClasses({ variant: 'primary', size: 'lg' })}
              >
                {rf.reviewOffer}
              </button>
            ) : null}
            {v.profileHref ? (
              <Link href={v.profileHref} target="_blank" rel="noopener" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
                {copy.viewProfile}
              </Link>
            ) : null}
            <button type="button" onClick={onClose} className={buttonClasses({ variant: 'ghost', size: 'lg' })}>
              {copy.close}
            </button>
          </div>
        </div>
      ) : null}
    </ConfirmSheetShell>
  );
}
