'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BuyerJob } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill } from '@/features/deals/workspace/presentation';
import { useJobSnapshot } from '@/features/jobs/hooks/useJobSnapshot';
import { useJobLiveState } from '@/features/jobs/hooks/useJobLiveState';
import { useMatchProposal } from '@/features/jobs/hooks/useMatchProposal';
import { useNearMiss } from '@/features/jobs/hooks/useNearMiss';
import { EventList } from '@/features/jobs/components/EventList';
import { CancelBriefSection, EditBriefSection } from '@/features/jobs/components/LiveJobPage';
import { requestTitle } from '../requestTitle';
import { refreshKey, requestView, type RequestView } from '../requestView';
import { MatchPanel } from './MatchPanel';

type StateKeys = keyof ReturnType<typeof useTranslations>['search']['request']['states'];

function stateCopyKey(v: RequestView): StateKeys {
  const seller = v.viewer === 'seller';
  switch (v.state) {
    case 'nearMiss':
      return v.askedYou ? 'nearMissYou' : 'nearMissThem';
    case 'matchWaitingSeller':
      return seller ? 'matchWaitingSellerSeller' : 'matchWaitingSellerBuyer';
    case 'matchRaised':
      return seller ? 'matchRaisedSeller' : v.overCap ? 'matchRaisedOverCap' : 'matchRaisedBuyer';
    case 'matchShort':
      return seller ? 'matchShortSeller' : 'matchShortBuyer';
    default:
      return v.state;
  }
}

const TOGGLE =
  'flex min-h-11 w-full items-center justify-between text-[15px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

/// One request, one status: what is happening, whose move it is, and the one
/// action that moves it on. Offers and the agent's timeline stay folded, and
/// a matched seller never gets them at all.
export function RequestPage({ initial, explorer }: { initial: BuyerJob; explorer: string }) {
  const t = useTranslations().search.request;
  const router = useRouter();
  const { address } = useAuth();
  const { job, refresh: refreshJob } = useJobSnapshot(initial);
  const live = useJobLiveState(job, address ?? undefined);
  const { proposal, refresh: refreshProposal } = useMatchProposal(initial.jobId);
  const { nearMiss, refresh: refreshNearMiss } = useNearMiss(initial.jobId);
  const [now, setNow] = useState(() => Date.now());
  const [offersOpen, setOffersOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (job.escrowFunded) router.replace(`/deals/${job.jobId}`);
  }, [job.escrowFunded, job.jobId, router]);

  // The match and near miss are separate reads that the live feed does not
  // refresh on its own; refetch them whenever a match event lands.
  const latest = refreshKey(live.events);
  useEffect(() => {
    if (!latest) return;
    void refreshJob();
    void refreshProposal();
    void refreshNearMiss();
    // Keyed on the event id only; the refresh functions are stable enough.
  }, [latest]);

  const view = requestView({ job, live, proposal, nearMiss, now });
  const copy = t.states[stateCopyKey(view)];
  const matchedName =
    job.bids.find((b) => proposal && b.seller.toLowerCase() === proposal.sellerAgent.toLowerCase())?.sellerDisplayName ??
    t.offers.unnamed;
  const values = {
    count: job.bids.length,
    name: matchedName,
    price: view.priceUsdc ?? '',
    was: view.wasUsdc ?? '',
    amount: view.topUpUsdc ?? '',
  };
  const refreshAll = () => {
    void refreshJob();
    void refreshProposal();
    void refreshNearMiss();
  };
  const title = requestTitle(job.briefText) ?? t.aRequest;
  const offers = [...job.bids].sort((a, b) => Number(a.priceUsdc) - Number(b.priceUsdc));
  const pendingMatch = !!proposal && !proposal.approvedAt && !proposal.declinedAt;
  const canEdit = view.secondary.includes('editRequest') || view.primary === 'editRequest';
  const canCancel = view.secondary.includes('cancelRequest');

  return (
    <div className="product-surface mx-auto max-w-[720px] px-4 pb-24 pt-6 sm:px-6">
      <Link
        href={view.viewer === 'seller' ? '/seller' : '/buyer'}
        className="inline-flex min-h-11 items-center text-[14px] text-[var(--lp-text-sub)] underline-offset-4 hover:underline"
      >
        {view.viewer === 'seller' ? t.backSeller : t.back}
      </Link>
      <div className="divide-y divide-[var(--lp-border-light)] [&>*]:py-8">
        <header className="space-y-2">
          <h1 className="break-words text-[26px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{title}</h1>
          <p className="text-[15px] tabular-nums text-[var(--lp-text-sub)]">{fill(t.upTo, { amount: job.budgetUsdc })}</p>
        </header>

        <section aria-labelledby="request-status" className="space-y-4">
          <div aria-live="polite" className="space-y-2">
            <h2 id="request-status" className="text-[20px] font-semibold text-[var(--lp-dark)]">{fill(copy.headline, values)}</h2>
            <p className="text-[15px] leading-relaxed text-[var(--lp-text-sub)]">{fill(copy.detail, values)}</p>
          </div>
          {view.priceUsdc && view.state.startsWith('match') ? (
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {view.viewer === 'buyer' ? (
                <span className="text-[15px] font-semibold text-[var(--lp-dark)]">{matchedName}</span>
              ) : null}
              <span className="text-[22px] font-semibold tabular-nums text-[var(--lp-dark)]">{view.priceUsdc} USDC</span>
              {view.wasUsdc ? (
                <span className="text-[14px] text-[var(--lp-text-sub)]">{fill(t.match.was, { was: view.wasUsdc })}</span>
              ) : null}
            </p>
          ) : null}
          {view.primary === 'openDeal' ? (
            <Link href={`/deals/${job.jobId}`} className="inline-flex min-h-12 items-center text-[15px] font-semibold text-[var(--lp-dark)] underline underline-offset-4">
              {t.actions.openDeal}
            </Link>
          ) : (
            <MatchPanel view={view} job={job} proposal={proposal} me={address ?? ''} onChanged={refreshAll} />
          )}
        </section>

        {view.showOffers ? (
          <section className="space-y-3">
            <button type="button" aria-expanded={offersOpen} onClick={() => setOffersOpen((v) => !v)} className={TOGGLE}>
              <span>{fill(t.offers.title, { count: offers.length })}</span>
              <span className="text-[13px] font-medium text-[var(--lp-text-sub)]">{offersOpen ? t.offers.hide : t.offers.show}</span>
            </button>
            {offersOpen ? (
              <ul className="divide-y divide-[var(--lp-border-light)]">
                {offers.map((b) => (
                  <li key={b.seller} className="flex min-h-12 items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] text-[var(--lp-dark)]">{b.sellerDisplayName ?? t.offers.unnamed}</span>
                      {b.topicalMatch != null ? (
                        <span className="block text-[13px] text-[var(--lp-text-sub)]">{fill(t.offers.skill, { pct: b.topicalMatch })}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--lp-dark)]">{b.priceUsdc} USDC</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {view.showTimeline ? (
          <section className="space-y-3">
            <button type="button" aria-expanded={timelineOpen} onClick={() => setTimelineOpen((v) => !v)} className={TOGGLE}>
              <span>{t.timeline}</span>
              <span className="text-[13px] font-medium text-[var(--lp-text-sub)]">{timelineOpen ? t.offers.hide : t.offers.show}</span>
            </button>
            {timelineOpen ? <EventList events={live.events} explorer={explorer} collapseRepeats /> : null}
          </section>
        ) : null}

        {canEdit || canCancel ? (
          <section className="space-y-4">
            {canEdit ? (
              <EditBriefSection
                job={job}
                declined={live.declined}
                matchPending={pendingMatch}
                viewerIsSeller={false}
                callerAddress={address ?? undefined}
                isBuyer
                onEdited={refreshJob}
              />
            ) : null}
            {canCancel ? (
              <CancelBriefSection
                job={job}
                declined={live.declined}
                matchPending={pendingMatch}
                viewerIsSeller={false}
                callerAddress={address ?? undefined}
                isBuyer
              />
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
