'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, ApiError, type BuyerJob } from '@/core/api';
import { useJobSnapshot } from '../hooks/useJobSnapshot';
import { useJobLiveState } from '../hooks/useJobLiveState';
import { NegotiationCard } from './NegotiationCard';
import { OffersRoster } from './OffersRoster';
import { PageTour } from '@/shared/guide/PageTour';
import { JOBS_TOUR_ID, JOBS_STEPS } from '@/shared/guide/tours';
import { MatchBanner } from './MatchBanner';
import { CopyId } from '@/shared/components/CopyId';
import { MarketAdvisoryBanner } from '@/shared/components/MarketAdvisoryBanner';
import { NearMissCard } from './NearMissCard';
import { OutOfReachCard } from './OutOfReachCard';
import { useMatchProposal } from '../hooks/useMatchProposal';
import { useNearMiss } from '../hooks/useNearMiss';
import { presentMatchingState } from '../matchingPresentation';
import { shortHash, formatUsdc, relativeTime } from '@/shared/utils/format';
import { SectionTag, PageCard, CTAPill } from '@/shared/components/Bands';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';
import { PAGE_REFRESH_EVENT } from '@/shared/utils/pageRefresh';
import { ResearchButton } from './ResearchButton';
import { requestRef, requestStep } from '../requestRef';
import { splitRequestText } from '@/features/discovery/model';
import { useLocale } from '@/shared/i18n/LocaleProvider';

type StatusTone = 'positive' | 'warning' | 'accent' | 'default' | 'critical';

const PAYMENT_TERM_LABELS: Record<'immediate' | 'net30' | 'net60' | 'net90', string> = {
  immediate: 'Immediate',
  net30: 'Net 30',
  net60: 'Net 60',
  net90: 'Net 90',
};

export function LiveJobPage({ initial, explorer }: { initial: BuyerJob; explorer: string }) {
  const t = useTranslations();
  const lj = t.liveJob;
  const { locale } = useLocale();
  const { job, refresh: refreshJob } = useJobSnapshot(initial);
  const { address } = useAuth();
  const { events, active, completed, declined, ended, recoverable, outOfReach } = useJobLiveState(
    job,
    address ?? undefined,
  );
  const { proposal, refresh: refreshProposal } = useMatchProposal(initial.jobId);
  const { nearMiss, refresh: refreshNearMiss } = useNearMiss(initial.jobId);
  const router = useRouter();

  // A match, a counter or a near miss lands while the page is open: read them
  // again. Same when a notification for this page is tapped.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reread = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void refreshJob();
        void refreshProposal();
        void refreshNearMiss();
      }, 400);
    };
    const offLive = subscribeLiveEvents((e) => {
      if (e.jobId && e.jobId.toLowerCase() === initial.jobId.toLowerCase()) reread();
    });
    window.addEventListener(PAGE_REFRESH_EVENT, reread);
    return () => {
      offLive();
      if (timer) clearTimeout(timer);
      window.removeEventListener(PAGE_REFRESH_EVENT, reread);
    };
  }, [initial.jobId]);

  // Once escrow funds, the deal has crossed into the direct-deal lifecycle:
  // a DirectDeal row exists, the deal watcher takes over, delivery/verification
  // windows + Release Milestones live on /deals/[id]. Redirect there so the
  // buyer doesn't see a stale brief deadline + the seller doesn't see Release
  // Milestones (which is buyer-only post-delivery).
  useEffect(() => {
    if (job.escrowFunded) {
      router.replace(`/deals/${job.jobId}`);
    }
  }, [job.escrowFunded, job.jobId, router]);

  const acceptedAt = events.find((e) => e.type === 'bid.accepted')?.ts;
  const matchPending = proposal && !proposal.approvedAt && !proposal.declinedAt;

  const viewerIsSeller =
    !!address &&
    !!proposal &&
    address.toLowerCase() === proposal.sellerUser.toLowerCase();

  // The bidder roster and the negotiation walk belong to the buyer who ran the
  // auction. The backend already strips `bids` and the competitor events for a
  // matched seller; this flag hides the surfaces that would otherwise render
  // empty or mislead them. Defaults to buyer when the flag is absent (older
  // cached snapshot) since only an explicit false marks a seller.
  const viewerIsBuyer = job.viewerIsBuyer !== false;

  // Keep the page-level status chip on the same pure presentation contract as
  // the notification band and negotiation card. This is read-only: it does
  // not infer authority or trigger any command, wallet, or provider action.
  const matchingPresentation = presentMatchingState({
    events,
    proposal,
    job,
    viewerAddress: address,
    viewerRole: viewerIsBuyer ? 'buyer' : 'seller',
  });
  const recoverableState =
    matchingPresentation.state === 'reengagement_scheduled' || recoverable === 'reengagement_scheduled'
      ? 'reengagement_scheduled'
      : matchingPresentation.state === 'paused_needs_approval' || recoverable === 'needs_approval'
        ? 'paused_needs_approval'
        : matchingPresentation.state === 'status_updating' || recoverable === 'status_updating'
          ? 'status_updating'
          : 'temporarily_unavailable';
  const recoverableStateCopy = t.negotiationCard.states[recoverableState];

  // B2B trade: a verified business trading goods/mixed lands on the finance
  // lane. It gets the business treatment — a trade eyebrow and a trade-context
  // band (goods, Incoterms, payment terms, sourcing sector/region) — instead of
  // the generic managed-deal surface. P2P/service jobs are unchanged.
  const isB2B =
    (job.tradeLane ?? 'service') === 'finance' ||
    job.tradeType === 'goods' ||
    job.tradeType === 'mixed';
  const tradeChips = isB2B
    ? [
        job.tradeType && job.tradeType !== 'service'
          ? { label: 'Type', value: job.tradeType }
          : null,
        job.sourcingSector ? { label: 'Sector', value: job.sourcingSector } : null,
        job.sourcingRegion ? { label: 'Region', value: job.sourcingRegion } : null,
        job.incoterms ? { label: 'Incoterms', value: job.incoterms } : null,
        job.paymentTerms
          ? { label: 'Terms', value: PAYMENT_TERM_LABELS[job.paymentTerms] }
          : null,
      ].filter((c): c is { label: string; value: string } => c !== null)
    : [];

  const expired = !!job.expiredAt;
  const status: { label: string; tone: StatusTone; live: boolean } = job.escrowFunded
    ? {
        label: lj.statusLabels.escrowFundedTemplate.replace(
          '{amount}',
          formatUsdc(job.budgetUsdc),
        ),
        tone: 'positive',
        live: false,
      }
    : expired
      ? { label: lj.statusLabels.requestExpired, tone: 'default', live: false }
      : ended === 'out-of-reach'
        ? { label: lj.outOfReach.title, tone: 'default', live: false }
        : declined
        ? { label: lj.statusLabels.negotiationEnded, tone: 'critical', live: false }
        : (recoverable || matchingPresentation.recoverable) && !matchPending && !proposal
          ? {
              label: recoverableStateCopy.headline,
              tone: 'default',
              live: true,
            }
        : matchPending
          ? {
              label: lj.statusLabels.matchAwaitingTemplate.replace(
                '{price}',
                proposal!.agreedPriceUsdc,
              ),
              tone: 'warning',
              live: true,
            }
          : job.finalized
            ? { label: lj.statusLabels.acceptedFunding, tone: 'warning', live: true }
            : viewerIsBuyer && job.bids.length > 0
              ? {
                  label:
                    job.bids.length === 1
                      ? lj.statusLabels.bidsNegotiatingOne
                      : lj.statusLabels.bidsNegotiatingMany.replace(
                          '{n}',
                          String(job.bids.length),
                        ),
                  tone: 'accent',
                  live: true,
                }
              : { label: lj.statusLabels.waitingOnSellers, tone: 'default', live: true };

  const rs = t.requestPage;
  const brief = splitRequestText(job.briefText ?? '');
  const step = requestStep({
    offers: job.bids.length,
    matched: !!proposal,
    agreed: !!proposal?.approvedAt || !!job.finalized,
    funded: !!job.escrowFunded,
  });
  const looking = status.live && !proposal && !nearMiss && !expired && !declined && !ended && !job.escrowFunded;
  const pill =
    status.tone === 'critical'
      ? 'bg-[color-mix(in_srgb,var(--neg)_14%,transparent)] text-[var(--lp-dark)]'
      : matchPending || status.tone === 'positive'
        ? 'bg-[#E7F0CF] text-[#33410f]'
        : 'border border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-text-sub)]';

  return (
    <main className="product-surface mx-auto w-full max-w-[760px] px-4 pb-16 pt-6 sm:px-6">
      <PageTour id={JOBS_TOUR_ID} steps={JOBS_STEPS} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-[var(--lp-text-sub)] font-medium">
          {rs.request}
          <span className="ms-2 font-mono text-[14px] text-[var(--lp-dark)]">{requestRef(job.jobId)}</span>
        </p>
        <div className="flex items-center gap-2">
          <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold ${pill}`}>
            {status.live ? <span aria-hidden className="size-1.5 rounded-full bg-[var(--lp-accent)] motion-safe:animate-pulse" /> : null}
            {status.label}
          </span>
          <ResearchButton jobId={job.jobId} proposal={proposal} role={viewerIsBuyer ? 'buyer' : 'seller'} />
        </div>
      </div>

      <div className="mt-5" data-guide="job-brief">
        <h1 dir="auto" className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[var(--lp-dark)] sm:text-[32px]">
          {brief.title || requestRef(job.jobId)}
        </h1>
        {brief.body ? <p dir="auto" className="mt-2 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">{brief.body}</p> : null}
      </div>

      <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3" data-guide="job-stats">
        <div>
          <dt className="text-[14px] text-[var(--lp-text-sub)] font-medium">{rs.budget}</dt>
          <dd className="mt-0.5 text-[20px] font-semibold tabular-nums text-[var(--lp-dark)]">{formatUsdc(job.budgetUsdc, { withSuffix: true })}</dd>
        </div>
        <div>
          <dt className="text-[14px] text-[var(--lp-text-sub)] font-medium">{rs.due}</dt>
          <dd className="mt-0.5 text-[20px] font-semibold text-[var(--lp-dark)]">
            {new Date(job.deadlineUnix * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
          </dd>
        </div>
        {viewerIsBuyer ? (
          <div>
            <dt className="text-[14px] text-[var(--lp-text-sub)] font-medium">{rs.offers}</dt>
            <dd className="mt-0.5 text-[20px] font-semibold tabular-nums text-[var(--lp-dark)]">{job.bids.length}</dd>
          </div>
        ) : null}
      </dl>

      <ol className="mt-6 grid grid-cols-4 gap-1.5" data-guide="job-flow" aria-label={lj.sections.flow}>
        {rs.steps.map((label, index) => (
          <li key={label} aria-current={index === step ? 'step' : undefined} className="min-w-0">
            <span
              aria-hidden
              className={`block h-[5px] rounded-full ${index < step ? 'bg-[#6a8a1e]' : index === step ? 'bg-[var(--lp-dark)]' : 'bg-[var(--lp-border-light)]'}`}
            />
            <span className={`mt-1.5 block truncate text-[14px] ${index === step ? 'font-semibold text-[var(--lp-dark)]' : 'text-[var(--lp-text-sub)]'}`}>{label}</span>
          </li>
        ))}
      </ol>

      {isB2B && tradeChips.length > 0 ? (
        <p className="mt-5 text-[14px] text-[var(--lp-text-sub)] font-medium">
          {tradeChips.map((c) => `${c.label} ${c.value}`).join(' · ')}
        </p>
      ) : null}

      {expired ? (
        <section className="mt-6 rounded-[18px] bg-[var(--lp-card)] p-5">
          <p className="text-[16px] font-semibold text-[var(--lp-dark)]">{lj.statusLabels.requestExpired}</p>
          <p className="mt-1 text-[14px] text-[var(--lp-text-sub)] font-medium">{lj.expired.bodyTemplate.replace('{time}', relativeTime(job.deadlineUnix))}</p>
        </section>
      ) : null}

      {proposal && !expired ? (
        <div className="mt-6">
          <MatchBanner proposal={proposal} onChange={refreshProposal} trustedMatch={job.trustedMatch === true} quiet />
        </div>
      ) : null}

      {looking ? (
        <section className="mt-6 rounded-[18px] bg-[var(--lp-card)] p-5">
          <p className="text-[16px] font-semibold text-[var(--lp-dark)]">{rs.lookingTitle}</p>
          <p className="mt-1 text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">{rs.lookingBody}</p>
          <p className="mt-3 inline-flex items-center gap-2 text-[14px] text-[var(--lp-text-sub)] font-medium">
            <span aria-hidden className="size-2 rounded-full bg-[var(--lp-accent)] shadow-[0_0_0_4px_rgba(175,201,91,0.25)]" />
            {rs.live}
          </p>
        </section>
      ) : null}

      <div className="mt-6 empty:hidden">
        <MarketAdvisoryBanner jobId={job.jobId} />
      </div>

      {ended === 'out-of-reach' && outOfReach && !proposal && !nearMiss && !expired && !job.escrowFunded ? (
        <div className="mt-6">
          <OutOfReachCard
            jobId={job.jobId}
            closestFloorUsdc={outOfReach.closestFloorUsdc}
            budgetUsdc={Number(job.budgetUsdc)}
            passedPriceUsdc={outOfReach.passedPriceUsdc}
            caller={address ?? undefined}
            onReconsidered={refreshNearMiss}
          />
        </div>
      ) : null}

      {nearMiss && !proposal && !expired && !job.escrowFunded ? (
        <div className="mt-6">
          <NearMissCard nearMiss={nearMiss} onChange={refreshNearMiss} />
        </div>
      ) : null}

      <div className="mt-6 space-y-5">
        {viewerIsBuyer && !declined && !ended && !expired && !job.escrowFunded && !matchPending && job.bids.length > 0 ? (
          <div data-guide="job-negotiation">
            <NegotiationCard events={events} explorer={explorer} job={job} proposal={proposal} viewerAddress={address} />
          </div>
        ) : null}
        <SettleSection job={job} acceptedAt={acceptedAt} declined={declined} />
        <EditBriefSection
          job={job}
          declined={declined}
          matchPending={!!matchPending}
          viewerIsSeller={viewerIsSeller}
          callerAddress={address ?? undefined}
          onEdited={refreshJob}
          isBuyer={viewerIsBuyer}
        />
        <CancelBriefSection
          job={job}
          declined={declined}
          matchPending={!!matchPending}
          viewerIsSeller={viewerIsSeller}
          callerAddress={address ?? undefined}
          isBuyer={viewerIsBuyer}
        />
      </div>

      {viewerIsBuyer && job.bids.length > 0 && !job.escrowFunded ? (
        <OffersRoster
          jobId={job.jobId}
          bids={job.bids}
          pickSeller={proposal && !proposal.declinedAt ? proposal.sellerAgent : null}
          caller={address ?? null}
          choosable={!expired && !ended && !declined && !proposal?.approvedAt}
          onChosen={() => {
            void refreshJob();
            void refreshProposal();
          }}
        />
      ) : null}

      <details className="group mt-8 border-t border-[var(--lp-border-light)]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-[14px] text-[var(--lp-text-sub)] [&::-webkit-details-marker]:hidden font-medium">
          {rs.details}
          <span aria-hidden className="transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <dl className="divide-y divide-[var(--lp-border-light)] border-t border-[var(--lp-border-light)] text-[14px]">
          {job.keywords && job.keywords.length > 0 ? (
            <div className="flex items-start justify-between gap-4 py-3">
              <dt className="shrink-0 text-[var(--lp-text-sub)]">{rs.looksFor}</dt>
              <dd className="min-w-0 text-end text-[var(--lp-dark)]">{job.keywords.slice(0, 6).join(', ')}</dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-[var(--lp-text-sub)]">{rs.proof}</dt>
            <dd className="font-mono text-[14px] text-[var(--lp-dark)]">{shortHash(job.termsHash, 6, 4)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-[var(--lp-text-sub)]">{rs.requestId}</dt>
            <dd className="min-w-0 truncate"><CopyId value={job.jobId} className="text-[14px] text-[var(--lp-dark)]" /></dd>
          </div>
        </dl>
      </details>
    </main>
  );
}



function SettleSection({
  job,
  acceptedAt,
  declined,
}: {
  job: BuyerJob;
  acceptedAt?: number;
  declined: boolean;
}) {
  const s = useTranslations().liveJob.settle;
  const [now, setNow] = useState(() => Date.now());
  const fundingPhase = job.finalized && !job.escrowFunded && !declined;
  useEffect(() => {
    if (!fundingPhase) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fundingPhase]);

  // After escrow funds, the deal lifecycle lives at /deals/[id]; this page
  // auto-redirects there via the effect at the top of LiveJobPage. The card
  // below is the fallback if the redirect hasn't fired yet (slow nav, motion-
  // reduced, etc.). it points to the canonical surface instead of duplicating
  // ReleaseMilestonesButton, so there's exactly one place to act on the deal.
  if (job.escrowFunded) {
    const bodyBefore = s.escrowLive.bodyTemplate.split('{amount}')[0];
    const bodyAfter = s.escrowLive.bodyTemplate.split('{amount}')[1] ?? '';
    return (
      <SettleCard label={s.escrowLive.tag} title={s.escrowLive.title}>
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] mb-4 font-medium">
          {bodyBefore}
          <span className="font-sans font-extrabold tabular-nums text-[var(--lp-dark)]">
            {formatUsdc(job.budgetUsdc)}
          </span>
          {bodyAfter}
        </p>
        <Link
          href={`/deals/${job.jobId}`}
          className="inline-flex items-center gap-2 px-[18px] py-[10px] mono text-[14px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors"
          style={{
            borderRadius: 10,
          }}
        >
          {s.escrowLive.cta}
          <span aria-hidden>→</span>
        </Link>
      </SettleCard>
    );
  }

  if (declined) {
    return (
      <SettleCard label={s.negotiationEnded.tag} title={s.negotiationEnded.title}>
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">
          {s.negotiationEnded.body}
        </p>
      </SettleCard>
    );
  }

  if (fundingPhase) {
    const elapsed = acceptedAt ? Math.max(0, Math.floor((now - acceptedAt) / 1000)) : null;
    const stalled = elapsed != null && elapsed > 120;
    const stalledTime = stalled ? formatElapsed(elapsed!) : '';
    return (
      <SettleCard
        label={stalled ? s.funding.stalledTag : s.funding.tag}
        title={
          stalled
            ? s.funding.stalledTitleTemplate.replace('{time}', stalledTime)
            : s.funding.title
        }
      >
        {stalled ? (
          <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">
            {s.funding.stalledBodyTemplate.replace('{time}', stalledTime)}
          </p>
        ) : (
          <FundingProgress elapsed={elapsed ?? 0} amount={formatUsdc(job.budgetUsdc)} />
        )}
      </SettleCard>
    );
  }

  return (
    <SettleCard label={s.locked.tag} title={s.locked.title}>
      <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">{s.locked.body}</p>
    </SettleCard>
  );
}

/// Buyer-only escape hatch for a brief that hasn't matched yet. Hidden after
/// the agent finalizes (a match is pending, escrow is funding, or escrow has
/// funded). Routes through POST /api/jobs/:jobId/cancel which marks the brief
/// expired in-memory so no further bids land.
/// Buyer-only inline edit on the request text. Mirrors the listing edit
/// shape: a button that opens a modal with one textarea. Saving routes
/// through POST /api/jobs/:jobId/edit, which patches the off-chain brief
/// (the on-chain termsHash stays at its post-time value) and re-extracts
/// keywords fire-and-forget so the agent's next match round uses the new
/// copy. Disabled when a match proposal is in flight or the request is
/// already finalized, expired, or cancelled. Backend enforces the same.
export function EditBriefSection({
  job,
  declined,
  matchPending,
  viewerIsSeller,
  callerAddress,
  isBuyer,
  onEdited,
}: {
  job: BuyerJob;
  declined: boolean;
  matchPending: boolean;
  viewerIsSeller: boolean;
  callerAddress: string | undefined;
  /// The viewer is the buyer who posted this request. `job.buyer` is the
  /// buyer AGENT address, so an address comparison never matches the user.
  isBuyer?: boolean;
  onEdited: () => Promise<void> | void;
}) {
  const es = useTranslations().liveJob.editSection;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewerIsBuyer =
    isBuyer ?? (!!callerAddress && callerAddress.toLowerCase() === job.buyer.toLowerCase());
  const editable =
    viewerIsBuyer &&
    !viewerIsSeller &&
    !job.finalized &&
    !job.escrowFunded &&
    !job.expiredAt &&
    !job.cancelledAt &&
    !matchPending &&
    !declined &&
    !!job.briefText;

  if (!editable || !callerAddress) return null;

  async function handleSave(patch: {
    briefText?: string;
    negotiationMaxIncreasePct?: number;
    trustedMatch?: boolean;
  }) {
    if (!callerAddress) return;
    setBusy(true);
    setError(null);
    try {
      await api.editBrief(job.jobId, { caller: callerAddress, ...patch });
      await onEdited();
      setOpen(false);
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setError(detail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageCard>
        <div className="px-6 pt-6 pb-3">
          <SectionTag>{es.tag}</SectionTag>
          <h3 className="mt-2 font-sans text-[20px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
            {es.title}
          </h3>
        </div>
        <div className="px-6 pb-6 space-y-3">
          <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">
            {es.body}
          </p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
            className="mono text-[14px] uppercase tracking-[0.12em] font-semibold text-[var(--lp-accent-on-light)] underline underline-offset-2 hover:underline-offset-4"
          >
            {es.cta}
          </button>
        </div>
      </PageCard>
      {open && (
        <EditBriefModal
          initialBriefText={job.briefText ?? ''}
          initialTolerancePct={job.negotiationMaxIncreasePct ?? 0}
          initialTrustedMatch={!!job.trustedMatch}
          busy={busy}
          error={error}
          onSave={handleSave}
          onClose={() => {
            setOpen(false);
            setError(null);
          }}
        />
      )}
    </>
  );
}

function EditBriefModal({
  initialBriefText,
  initialTolerancePct,
  initialTrustedMatch,
  busy,
  error,
  onSave,
  onClose,
}: {
  initialBriefText: string;
  initialTolerancePct: number;
  initialTrustedMatch: boolean;
  busy: boolean;
  error: string | null;
  onSave: (patch: {
    briefText?: string;
    negotiationMaxIncreasePct?: number;
    trustedMatch?: boolean;
  }) => void;
  onClose: () => void;
}) {
  const m = useTranslations().liveJob.editModal;
  const [text, setText] = useState(initialBriefText);
  const [tolerancePct, setTolerancePct] = useState(initialTolerancePct);
  const [trustedMatch, setTrustedMatch] = useState(initialTrustedMatch);

  const trimmed = text.trim();
  const textChanged = trimmed !== initialBriefText.trim();
  const toleranceChanged = tolerancePct !== initialTolerancePct;
  const trustedChanged = trustedMatch !== initialTrustedMatch;
  const dirty = textChanged || toleranceChanged || trustedChanged;
  const textValid = trimmed.length >= 5 && trimmed.length <= 2000;
  const toleranceValid = tolerancePct >= 0 && tolerancePct <= 50;
  // Only invalid input blocks the button. Saving with nothing changed just
  // closes the sheet, so it never looks stuck.
  const valid = textValid && toleranceValid;

  function submit() {
    if (!valid || busy) return;
    if (!dirty) {
      onClose();
      return;
    }
    const patch: {
      briefText?: string;
      negotiationMaxIncreasePct?: number;
      trustedMatch?: boolean;
    } = {};
    if (textChanged) patch.briefText = trimmed;
    if (toleranceChanged) patch.negotiationMaxIncreasePct = tolerancePct;
    if (trustedChanged) patch.trustedMatch = trustedMatch;
    onSave(patch);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-stretch sm:justify-end"
      style={{ background: 'rgba(14,14,14,0.55)' }}
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="karwan-sheet-enter max-h-[92dvh] w-full overflow-y-auto rounded-t-[22px] sm:h-full sm:max-h-none sm:w-[512px] sm:rounded-none sm:rounded-s-[16px]"
        style={{
          background: 'var(--lp-card)',
          color: 'var(--lp-dark)',
          border: '1px solid var(--lp-border-light)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.35)',
        }}
      >
        <div className="px-6 pt-6 pb-3">
          <span className="mono text-[13px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            {m.tag}
          </span>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-tight">
            {m.title}
            <span style={{ color: 'var(--lp-accent)' }}>.</span>
          </h2>
        </div>
        <div className="px-6 pb-6 space-y-4">
          <p className="text-[14px] text-[var(--lp-text-sub)] leading-relaxed font-medium">
            {m.body}
          </p>

          <label className="block space-y-1.5">
            <span className="mono text-[13px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              {m.requestTextEyebrow}
            </span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              rows={6}
              className="form-input form-textarea"
              maxLength={2000}
            />
            <span className="mono text-[13px] text-[var(--lp-text-muted)]">
              {text.length}/2000
            </span>
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="mono text-[13px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                {m.toleranceEyebrow}
              </span>
              <span className="font-sans text-[16px] font-extrabold tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]">
                +{tolerancePct}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={tolerancePct}
              onChange={(e) => setTolerancePct(Number(e.target.value))}
              disabled={busy}
              className="w-full accent-[var(--lp-accent)]"
              aria-label={m.toleranceAria}
            />
            <p className="mono text-[13px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)] leading-snug">
              {m.toleranceFootTemplate.replace('{n}', String(tolerancePct))}
            </p>
          </div>

          <label
            className="flex items-start gap-3 px-4 py-3 cursor-pointer"
            style={{
              background: trustedMatch
                ? 'color-mix(in oklab, var(--lp-accent) 10%, transparent)'
                : 'var(--lp-light)',
              border: trustedMatch
                ? '1px solid color-mix(in oklab, var(--lp-accent) 35%, transparent)'
                : '1px solid var(--lp-border-light)',
              borderRadius: 12,
            }}
          >
            <input
              type="checkbox"
              checked={trustedMatch}
              onChange={(e) => setTrustedMatch(e.target.checked)}
              disabled={busy}
              className="mt-0.5 w-4 h-4 accent-[var(--lp-accent)] shrink-0 cursor-pointer"
            />
            <div className="min-w-0">
              <span
                className="mono text-[13px] font-bold uppercase tracking-[0.16em]"
                style={{ color: trustedMatch ? 'var(--lp-band-dark)' : 'var(--lp-dark)' }}
              >
                {m.trustedMatchEyebrow}
              </span>
              <p className="mt-1.5 text-[14px] leading-snug text-[var(--lp-text-sub)] font-medium">
                {m.trustedMatchBody}
              </p>
            </div>
          </label>

          {error && (
            <p className="mono text-[14px] text-[#b03d3a]">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <CTAPill onClick={submit} disabled={!valid || busy}>
              {busy ? m.saving : m.save}
            </CTAPill>
            <CTAPill variant="secondary" tone="light" onClick={onClose} disabled={busy}>
              {m.cancel}
            </CTAPill>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CancelBriefSection({
  job,
  declined,
  matchPending,
  viewerIsSeller,
  callerAddress,
  isBuyer,
}: {
  job: BuyerJob;
  declined: boolean;
  matchPending: boolean;
  viewerIsSeller: boolean;
  callerAddress: string | undefined;
  /// The viewer is the buyer who posted this request. `job.buyer` is the
  /// buyer AGENT address, so an address comparison never matches the user.
  isBuyer?: boolean;
}) {
  const cs = useTranslations().liveJob.cancelSection;
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewerIsBuyer =
    isBuyer ?? (!!callerAddress && callerAddress.toLowerCase() === job.buyer.toLowerCase());
  const cancellable =
    viewerIsBuyer &&
    !viewerIsSeller &&
    !job.finalized &&
    !job.escrowFunded &&
    !job.expiredAt &&
    !job.cancelledAt &&
    !matchPending &&
    !declined;

  if (!cancellable || !callerAddress) return null;

  async function handleCancel() {
    if (!callerAddress) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelBrief(job.jobId, callerAddress);
      router.push('/buyer');
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setError(detail);
      setBusy(false);
    }
  }

  return (
    <PageCard>
      <div className="px-6 pt-6 pb-3">
        <SectionTag>{cs.tag}</SectionTag>
        <h3 className="mt-2 font-sans text-[20px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
          {cs.title}
        </h3>
      </div>
      <div className="px-6 pb-6 space-y-3">
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">
          {cs.body}
        </p>
        {!confirm ? (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="mono text-[14px] uppercase tracking-[0.12em] font-semibold text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] underline underline-offset-2"
          >
            {cs.cta}
          </button>
        ) : (
          <div
            className="px-4 py-3 space-y-3"
            style={{
              background: 'rgba(176, 61, 58, 0.08)',
              border: '1px solid rgba(176, 61, 58, 0.30)',
              borderRadius: 10,
            }}
          >
            <p className="text-[14px] text-[var(--lp-dark)] leading-snug">
              {cs.confirmBody}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={busy}
                className="mono text-[14px] font-bold uppercase tracking-[0.10em] px-3.5 py-2 text-white transition-colors disabled:opacity-60"
                style={{
                  background: '#b03d3a',
                  borderRadius: 8,
                }}
              >
                {busy ? cs.confirmYesBusy : cs.confirmYes}
              </button>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                disabled={busy}
                className="mono text-[14px] uppercase tracking-[0.10em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] font-medium"
              >
                {cs.confirmNo}
              </button>
            </div>
            {error && (
              <p className="mono text-[14px] text-[#b03d3a]">{error}</p>
            )}
          </div>
        )}
      </div>
    </PageCard>
  );
}

function SettleCard({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <PageCard>
      <div className="px-6 pt-6 pb-3">
        <SectionTag>{label}</SectionTag>
        <h3 className="mt-2 font-sans text-[20px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
          {title}
        </h3>
      </div>
      <div className="px-6 pb-6">{children}</div>
    </PageCard>
  );
}

function FundingProgress({ elapsed }: { elapsed: number; amount: string }) {
  const steps = useTranslations().liveJob.settle.fundingSteps;
  const approveDone = elapsed > 30;
  const fundDone = elapsed > 60;
  return (
    <div className="space-y-2.5">
      <FundingStep label={steps.approveUsdc} done={approveDone} active={!approveDone} />
      <FundingStep label={steps.fundEscrow} done={fundDone} active={approveDone && !fundDone} />
    </div>
  );
}

function FundingStep({
  label,
  done,
  active,
}: {
  label: string;
  done: boolean;
  active: boolean;
}) {
  const fill = done ? 'var(--lp-accent)' : active ? 'var(--lp-accent)' : 'rgba(0,0,0,0.10)';
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        data-instrument-blink={active || undefined}
        className="shrink-0 inline-block w-[11px] h-[11px]"
        style={{
          background: fill,
          animation: active ? 'instrumentBlink 1.6s ease-in-out infinite' : undefined,
        }}
      />
      <span
        className={`mono text-[14px] uppercase tracking-[0.14em] ${
          done || active ? 'text-[var(--lp-dark)] font-bold' : 'text-[var(--lp-text-muted)]'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
