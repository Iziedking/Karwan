'use client';
import { useEffect, useState } from 'react';
import { OffersRoster } from '@/features/jobs/components/OffersRoster';
import { AgentNudges } from '@/features/jobs/components/AgentNudges';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BuyerJob } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill, formatDealDate } from '@/features/deals/workspace/presentation';
import { requestRef } from '@/features/jobs/requestRef';
import { useJobSnapshot } from '@/features/jobs/hooks/useJobSnapshot';
import { useJobLiveState } from '@/features/jobs/hooks/useJobLiveState';
import { useMatchProposal } from '@/features/jobs/hooks/useMatchProposal';
import { useNearMiss } from '@/features/jobs/hooks/useNearMiss';
import { EventList } from '@/features/jobs/components/EventList';
import { RequestReachLine } from '@/features/jobs/components/RequestReachLine';
import { quantityLine } from '@/features/jobs/quantityLine';
import { CancelBriefSection, EditBriefSection } from '@/features/jobs/components/BriefSections';
import { MarketAdvisoryBanner } from '@/shared/components/MarketAdvisoryBanner';
import { requestTitle } from '../requestTitle';
import { refreshKey, requestView, type RequestView } from '../requestView';
import { MatchPanel } from './MatchPanel';
import { AttachmentList } from '@/features/attachments/AttachmentList';
import { attachmentHref } from '@/features/attachments/attachments';
import { attachCopy } from '@/shared/i18n/messages/attachCopy';
import { CARD_CLASS } from '@/shared/components/Card';
import { Icon } from '@/shared/components/Icon';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';

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
  'flex min-h-14 w-full items-center justify-between gap-3 px-5 text-start text-[16px] font-semibold text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)] lg:px-6';
const CARD = `${CARD_CLASS} p-5 lg:p-6`;

/// One request, one status: what is happening, whose move it is, and the one
/// action that moves it on. Offers and the agent's timeline stay folded, and
/// a matched seller never gets them at all.
export function RequestPage({ initial, explorer }: { initial: BuyerJob; explorer: string }) {
  const money = useMoneyText({ compact: true });
  const t = useTranslations().search.request;
  const rp = useTranslations().requestPage;
  const rf = useTranslations().requestFlow;
  const lj = useTranslations().liveJob;
  const { locale } = useLocale();
  const router = useRouter();
  const { address } = useAuth();
  const { job, refresh: refreshJob } = useJobSnapshot(initial);
  const live = useJobLiveState(job, address ?? undefined);
  const { proposal, refresh: refreshProposal } = useMatchProposal(initial.jobId);
  const { nearMiss, refresh: refreshNearMiss } = useNearMiss(initial.jobId);
  const [now, setNow] = useState(() => Date.now());
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
  const values = { count: job.bids.length, name: matchedName };
  // Amounts in the chosen currency (view 55), never a bare USDC figure beside it.
  const amounts = { price: view.priceUsdc, was: view.wasUsdc, amount: view.topUpUsdc };
  const say = (template: string) => money.fill(template, amounts, values);
  const refreshAll = () => {
    void refreshJob();
    void refreshProposal();
    void refreshNearMiss();
  };
  const title = requestTitle(job.briefText) ?? t.aRequest;
  const firstPhoto = job.attachments?.[0]?.contentType.startsWith('image/') ? attachmentHref('request', job.jobId, 0) : null;
  // A headline that carries the count says it large: "17 offers so far" (owner, 7 Nov 2026).
  const countParts = copy.headline.includes('{count}') ? copy.headline.split('{count}') : null;
  const pendingMatch = !!proposal && !proposal.approvedAt && !proposal.declinedAt;
  const canEdit = view.secondary.includes('editRequest') || view.primary === 'editRequest';
  const canCancel = view.secondary.includes('cancelRequest');

  return (
    <div className="product-surface mx-auto max-w-[720px] px-4 pb-24 pt-6 sm:px-6">
      <AgentNudges events={live.events} />
      <Link
        data-own-back
        href={view.viewer === 'seller' ? '/seller' : '/buyer'}
        className="-ms-1 inline-flex min-h-11 items-center gap-1 text-[14px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)]"
      >
        <Icon name="chevron-left" size={16} directional />
        {view.viewer === 'seller' ? t.backSeller : t.back}
      </Link>
      <div className="mt-2 space-y-4 sm:space-y-5">
        <header className="flex items-center gap-4 pb-1 sm:gap-5">
          {firstPhoto ? (
            <a href={firstPhoto} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={firstPhoto} alt={attachCopy[locale].photoAltTemplate.replace('{n}', '1')} className="size-16 rounded-[14px] border border-[var(--line)] object-cover sm:size-[88px]" />
            </a>
          ) : null}
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-[13px] font-medium text-[var(--ink-muted)]">{fill(rf.reference, { reference: requestRef(job.jobId) })}</p>
            <h1 className="break-words text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)] sm:text-[28px]">{title}</h1>
            <p className="text-[15px] font-medium tabular-nums text-[var(--ink-secondary)]">
              {money.fill(rf.upTo, { amount: job.budgetUsdc })}
              {job.deadlineUnix ? ` · ${fill(rf.neededBy, { date: formatDealDate(job.deadlineUnix * 1000, locale) })}` : ''}
            </p>
            {quantityLine(rp, job.quantity, job.budgetUsdc) ? (
              <p className="text-[15px] tabular-nums text-[var(--ink-secondary)]">{quantityLine(rp, job.quantity, job.budgetUsdc)}</p>
            ) : null}
          </div>
        </header>
        <AttachmentList on="request" jobId={job.jobId} items={job.attachments} from={firstPhoto ? 1 : 0} />

        <section aria-labelledby="request-status" className={`${CARD} space-y-4`}>
          <div aria-live="polite">
            {countParts ? (
              <>
                <p className="flex items-center gap-2 text-[14px] font-medium text-[var(--ink-secondary)]">
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-[var(--karwan-green)]" />
                  {say(copy.detail)}
                </p>
                <h2 id="request-status" className="mt-3 flex flex-wrap items-baseline gap-x-2.5 font-semibold text-[var(--ink)]">
                  {countParts[0].trim() ? <span className="text-[18px] sm:text-[22px]">{countParts[0].trim()}</span> : null}
                  <span className="text-[44px] leading-none tracking-[-0.03em] tabular-nums sm:text-[56px]">{job.bids.length}</span>
                  <span className="text-[18px] sm:text-[22px]">{countParts[1].trim().replace(/[.।]$/, '')}</span>
                </h2>
              </>
            ) : (
              <div className="space-y-2">
                <h2 id="request-status" className="text-[20px] font-semibold text-[var(--ink)]">{say(copy.headline)}</h2>
                <p className="text-[15px] leading-relaxed text-[var(--ink-secondary)]">{say(copy.detail)}</p>
              </div>
            )}
            <RequestReachLine
              jobId={job.jobId}
              active={view.viewer === 'buyer' && !proposal && !nearMiss && !job.escrowFunded && !job.expiredAt && !job.cancelledAt}
              refreshKey={live.events.length}
            />
          </div>
          {view.priceUsdc && view.state.startsWith('match') ? (
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {view.viewer === 'buyer' ? (
                <span className="text-[15px] font-semibold text-[var(--ink)]">{matchedName}</span>
              ) : null}
              <span className="text-[22px] font-semibold tabular-nums text-[var(--ink)]">{money.text(view.priceUsdc)}</span>
              {view.wasUsdc ? (
                <span className="text-[14px] text-[var(--ink-secondary)] font-medium">{fill(t.match.was, { was: view.wasUsdc })}</span>
              ) : null}
            </p>
          ) : null}
          {view.primary === 'openDeal' ? (
            <Link href={`/deals/${job.jobId}`} className="inline-flex min-h-12 items-center text-[15px] font-semibold text-[var(--ink)] underline underline-offset-4">
              {t.actions.openDeal}
            </Link>
          ) : (
            <MatchPanel view={view} job={job} proposal={proposal} me={address ?? ''} onChanged={refreshAll} />
          )}
        </section>

        {view.showOffers && view.viewer === 'buyer' ? (
          <OffersRoster
            jobId={job.jobId}
            bids={job.bids}
            pickSeller={pendingMatch && proposal ? proposal.sellerAgent : null}
            caller={address ?? null}
            choosable={!job.expiredAt && !job.cancelledAt && !proposal?.approvedAt}
            onChosen={refreshAll}
          />
        ) : null}

        {view.showTimeline ? (
          <section className={CARD_CLASS}>
            <button type="button" aria-expanded={timelineOpen} onClick={() => setTimelineOpen((v) => !v)} className={TOGGLE}>
              <span>{t.timeline}</span>
              <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--ink-secondary)]">
                {timelineOpen ? t.offers.hide : t.offers.show}
                <Icon name="chevron-right" size={16} className={timelineOpen ? '-rotate-90' : 'rotate-90'} />
              </span>
            </button>
            {timelineOpen ? (
              <div className="border-t border-[var(--line)] px-5 pb-2 lg:px-6">
                <EventList events={live.events} explorer={explorer} collapseRepeats pageSize={5} />
              </div>
            ) : null}
          </section>
        ) : null}

        {canEdit || canCancel ? (
          <>
            {/* The agent's market read, said plainly when the budget is far off (view 35). */}
            <MarketAdvisoryBanner jobId={job.jobId} />
            {/* Edit and Cancel are rows in one card; each note sits behind its (i) (owner, 7 Nov 2026). */}
            <section aria-labelledby="manage-request" className={`${CARD_CLASS} px-5 pb-1 pt-4 not-has-[[data-manage-row]]:hidden lg:px-6`}>
              <h2 id="manage-request" className="text-[13px] font-semibold text-[var(--ink-muted)]">{lj.manage.title}</h2>
              <div className="divide-y divide-[var(--line)]">
            {canEdit ? (
              <EditBriefSection
                job={job}
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
                matchPending={pendingMatch}
                viewerIsSeller={false}
                callerAddress={address ?? undefined}
                isBuyer
              />
            ) : null}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
