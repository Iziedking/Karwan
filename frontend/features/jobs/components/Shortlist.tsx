'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, type AgentWorldCheckView, type ShortlistEntry, type WorldCheckReason } from '@/core/api';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { formatUsdc } from '@/shared/utils/format';
import { ConfirmSheet } from '@/features/deals/workspace/ConfirmSheet';
import { fill } from '@/features/deals/workspace/presentation';
import { chooseErrorKey } from '../chooseError';
import { shortlistCostLine, shortlistNotice, shortlistRowView, shortlistState, type ShortlistState } from '../shortlistPresentation';
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

/// Who the agents found for this request, verified or not, with each person's
/// score and numbers and the one the agent recommends. The buyer chooses.
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

  const consequence = choosing
    ? [
        choosing.verified ? null : fill(copy.unverifiedWarning, { name: choosing.name }),
        fill(roster.confirmBody, { name: choosing.name, amount: price(choosing.priceUsdc) }),
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  return (
    <section data-guide="job-shortlist" className="mt-6 rounded-[18px] bg-[var(--lp-card)] px-4">
      <div className="py-4">
        <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{copy.title}</h2>
        <p className="mt-1 text-[14px] font-medium text-[var(--ink-secondary)]">{copy.note}</p>
        {cost ? <p className="mt-1 text-[14px] font-medium tabular-nums text-[var(--ink-secondary)]">{cost}</p> : null}
        {notice ? <p className="mt-2 text-[14px] font-semibold text-[var(--lp-dark)]">{notice}</p> : null}
        {waitingOn ? <p role="status" className="mt-2 text-[14px] font-semibold text-[var(--lp-dark)]">{fill(world.waiting, { name: waitingOn })}</p> : null}
      </div>
      {entries.length ? (
        <ul className="divide-y divide-[var(--lp-border-light)] border-t border-[var(--lp-border-light)]">
          {entries.map((e) => (
            <li key={e.seller}>
              <ShortlistRow
                entry={e}
                canChoose={!closed}
                onChoose={() => {
                  setError(null);
                  setChoosing(e);
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <ConfirmSheet
        open={!!choosing}
        title={choosing ? fill(roster.confirmTitle, { name: choosing.name }) : ''}
        consequence={consequence}
        irreversible={false}
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
      </ConfirmSheet>
    </section>
  );
}

function ShortlistRow({ entry, canChoose, onChoose }: { entry: ShortlistEntry; canChoose: boolean; onChoose: () => void }) {
  const copy = useTranslations().shortlist;
  const v = shortlistRowView(entry, copy);
  const chooseLabel = `${copy.choose} ${entry.name}`;
  return (
    <div className="py-4">
      <div className="flex items-start gap-3">
        <PersonAvatar address={entry.sellerUser} name={entry.name} size={40} />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span dir="auto" className="truncate text-[15px] font-semibold text-[var(--lp-dark)]">{entry.name}</span>
            {entry.tag ? <span className="text-[14px] font-medium text-[var(--ink-secondary)]">@{entry.tag}</span> : null}
            {entry.isNew ? <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{copy.isNew}</span> : null}
          </p>
          <p className={`mt-0.5 text-[14px] font-semibold ${entry.verified ? 'text-[var(--color-positive)]' : 'text-[var(--lp-dark)]'}`}>
            {v.levelLine}
          </p>
          {entry.recommended ? <p className="mt-1 text-[14px] font-semibold text-[var(--lp-dark)]">{copy.recommended}</p> : null}
          {v.reasonLine ? <p className="mt-0.5 text-[14px] font-medium text-[var(--ink-secondary)]">{v.reasonLine}</p> : null}
        </div>
        <p className="shrink-0 text-end tabular-nums">
          <span className="block text-[18px] font-semibold text-[var(--lp-dark)]">{price(entry.priceUsdc)} USDC</span>
          {v.askedLine ? <span className="block text-[14px] font-medium text-[var(--ink-secondary)]">{v.askedLine}</span> : null}
        </p>
      </div>
      <div className="mt-2 ps-[52px] text-[14px] font-medium text-[var(--ink-secondary)]">
        <p dir="auto">{v.offerLine}</p>
        {v.numbersLine ? <p className="mt-0.5">{v.numbersLine}</p> : null}
        {entry.state === 'negotiating' ? <p className="mt-0.5">{copy.negotiating}</p> : null}
        {entry.state === 'unavailable' ? <p className="mt-0.5 font-semibold text-[var(--lp-dark)]">{copy.unavailable}</p> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 ps-[52px]">
        {v.profileHref ? (
          <Link
            href={v.profileHref}
            className="inline-flex min-h-11 items-center rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            {copy.viewProfile}
          </Link>
        ) : null}
        {canChoose && v.choosable ? (
          <button
            type="button"
            onClick={onChoose}
            aria-label={chooseLabel}
            className={
              entry.recommended
                ? 'inline-flex min-h-11 items-center rounded-full bg-[var(--action)] px-5 text-[14px] font-semibold text-[var(--on-action)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2'
                : 'inline-flex min-h-11 items-center rounded-full border border-[var(--lp-border-light)] px-5 text-[14px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]'
            }
          >
            {copy.choose}
          </button>
        ) : null}
      </div>
    </div>
  );
}
