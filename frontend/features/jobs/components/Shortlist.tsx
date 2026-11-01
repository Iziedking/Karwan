'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, type AgentWorldCheckView, type ShortlistEntry, type WorldCheckReason } from '@/core/api';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ratingText } from '@/features/ratings/ratingText';
import { formatUsdc } from '@/shared/utils/format';
import { FactsConfirmSheet } from '@/shared/components/FactsConfirmSheet';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { rankedOffers, type RankedOffer } from '../rankedOffers';
import { fill } from '@/features/deals/workspace/presentation';
import { chooseErrorKey } from '../chooseError';
import { rankLine, shortlistCostLine, shortlistNotice, shortlistRowView, shortlistState, type ShortlistState } from '../shortlistPresentation';
import { AgentWorldCheck } from './AgentWorldCheck';
import { worldStepFrom } from '../agentWorldStep';

const POLL_MS = 6_000;
const price = (usdc: number) => formatUsdc(String(usdc), { withSuffix: false });

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
  const copy = t.shortlist;
  const roster = t.offerRoster;
  const rf = t.requestFlow;
  const ranked = rankedOffers(entries);
  const [viewing, setViewing] = useState<RankedOffer | null>(null);
  const [choosing, setChoosing] = useState<ShortlistEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [worldStep, setWorldStep] = useState<{ reason: WorldCheckReason | null; skipAllowed: boolean } | null>(null);
  const world = t.agentNudges.world;
  const notice = shortlistNotice(entries, copy);
  const cost = shortlistCostLine(recordChecks, copy);
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
    <section data-guide="job-shortlist" className="mt-6 rounded-[18px] bg-[var(--lp-card)] px-4">
      <div className="py-4">
        <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{copy.title}</h2>
        {entries.length ? <p className="mt-1 text-[14px] font-medium text-[var(--ink-secondary)]">{copy.note}</p> : null}
        {notice ? <p className="mt-2 text-[14px] font-semibold text-[var(--lp-dark)]">{notice}</p> : null}
        {waitingOn ? <p role="status" className="mt-2 text-[14px] font-semibold text-[var(--lp-dark)]">{fill(world.waiting, { name: waitingOn })}</p> : null}
      </div>
      {ranked.length ? (
        <ul id={`shortlist-${jobId}`} className="divide-y divide-[var(--lp-border-light)] border-t border-[var(--lp-border-light)]">
          {ranked.map((e, i) => (
            <li key={e.seller}>
              <button
                type="button"
                onClick={() => setViewing(e)}
                className="flex min-h-16 w-full items-center gap-3 py-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
              >
                <PersonAvatar address={e.sellerUser} name={e.name} size={40} />
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="block truncate text-[15px] font-semibold text-[var(--lp-dark)]">{e.name}</span>
                  <span
                    {...(e.bestFit ? { 'data-best-fit': '' } : {})}
                    className={`block text-[14px] font-medium ${e.bestFit ? 'text-[var(--lp-accent-on-light)]' : 'text-[var(--ink-secondary)]'}`}
                  >
                    {e.state === 'unavailable' ? `${fill(copy.rank, { n: i + 1 })} · ${copy.unavailable}` : rankLine(i, e.bestFit, copy)}
                  </span>
                </span>
                <span className="shrink-0 text-[17px] font-semibold tabular-nums text-[var(--lp-dark)]">{price(e.priceUsdc)} USDC</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {cost ? <p className="border-t border-[var(--lp-border-light)] py-3 text-[13px] font-medium tabular-nums text-[var(--ink-secondary)]">{cost}</p> : null}
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
          [rf.confirmPrice, `${price(choosing.priceUsdc)} USDC`],
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
              <h2 id="offer-details-title" dir="auto" className="truncate text-[20px] font-semibold text-[var(--lp-dark)]">{entry.name}</h2>
              {entry.tag ? <p className="text-[14px] font-medium text-[var(--ink-secondary)]">@{entry.tag}</p> : null}
            </div>
          </div>
          <p className="mt-4 text-[24px] font-semibold tabular-nums text-[var(--lp-dark)]">{price(entry.priceUsdc)} USDC</p>
          {v.askedLine ? <p className={line}>{v.askedLine}</p> : null}
          <p className={`mt-1 text-[15px] font-semibold ${entry.bestFit ? 'text-[var(--lp-accent-on-light)]' : 'text-[var(--lp-dark)]'}`}>{rankLine(place, entry.bestFit, copy)}</p>
          <div className="mt-4 space-y-1 border-t border-[var(--lp-border-light)] pt-4">
            <p className={`text-[15px] font-semibold ${entry.verified ? 'text-[var(--color-positive)]' : 'text-[var(--lp-dark)]'}`}>{v.levelLine}</p>
            {entry.rating ? <p className={`${line} tabular-nums`}>{ratingText(entry.rating, all.ratings, locale)}</p> : null}
            <p dir="auto" className={line}>{v.offerLine}</p>
            {v.numbersLine ? <p className={line}>{v.numbersLine}</p> : null}
            {reasons ? <p className={line}>{reasons}</p> : null}
            {entry.state === 'negotiating' ? <p className={line}>{copy.negotiating}</p> : null}
            {entry.state === 'unavailable' ? <p className="text-[15px] font-semibold text-[var(--lp-dark)]">{copy.unavailable}</p> : null}
            {v.markLine ? <p className="text-[15px] font-semibold text-[var(--lp-dark)]">{v.markLine}</p> : null}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {canChoose && v.choosable ? (
              <button
                type="button"
                onClick={() => onChoose(entry)}
                aria-label={`${rf.accept} ${entry.name}`}
                className="inline-flex min-h-12 items-center rounded-full bg-[var(--action)] px-6 text-[15px] font-semibold text-[var(--on-action)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2"
              >
                {rf.accept}
              </button>
            ) : null}
            {v.profileHref ? (
              <Link
                href={v.profileHref}
                className="inline-flex min-h-12 items-center rounded-full border border-[var(--lp-border-light)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
              >
                {copy.viewProfile}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-12 items-center rounded-full px-5 text-[15px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
            >
              {copy.close}
            </button>
          </div>
        </div>
      ) : null}
    </ConfirmSheetShell>
  );
}
