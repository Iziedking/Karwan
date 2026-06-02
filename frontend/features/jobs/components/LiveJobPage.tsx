'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, ApiError, type BuyerJob } from '@/core/api';
import { useJobSnapshot } from '../hooks/useJobSnapshot';
import { useJobLiveState } from '../hooks/useJobLiveState';
import { FlowStepper } from './FlowStepper';
import { NegotiationCard } from './NegotiationCard';
import { LiveBidsPanel } from './LiveBidsPanel';
import { PageTour } from '@/shared/guide/PageTour';
import { JOBS_TOUR_ID, JOBS_STEPS } from '@/shared/guide/tours';
import { MatchBanner } from './MatchBanner';
import { NearMissCard } from './NearMissCard';
import { useMatchProposal } from '../hooks/useMatchProposal';
import { useNearMiss } from '../hooks/useNearMiss';
import { shortHash, formatUsdc, relativeTime } from '@/shared/utils/format';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  PageCard,
  CTAPill,
} from '@/shared/components/Bands';

type StatusTone = 'positive' | 'warning' | 'accent' | 'default' | 'critical';

export function LiveJobPage({ initial, explorer }: { initial: BuyerJob; explorer: string }) {
  const { job, refresh: refreshJob } = useJobSnapshot(initial);
  const { events, active, completed, declined, ended } = useJobLiveState(job);
  const { proposal, refresh: refreshProposal } = useMatchProposal(initial.jobId);
  const { nearMiss, refresh: refreshNearMiss } = useNearMiss(initial.jobId);
  const { address } = useAuth();
  const router = useRouter();

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

  // Role-aware back-link: a seller landing here from a match notification gets
  // sent back to /seller; everyone else (including the buyer who posted) goes
  // to /buyer. Falls back to /buyer when we can't determine.
  const viewerIsSeller =
    !!address &&
    !!proposal &&
    address.toLowerCase() === proposal.sellerUser.toLowerCase();
  const backHref = viewerIsSeller ? '/seller' : '/buyer';
  const backLabel = viewerIsSeller ? 'BACK TO SELLER' : 'BACK TO BUYER';

  const expired = !!job.expiredAt;
  const status: { label: string; tone: StatusTone; live: boolean } = job.escrowFunded
    ? { label: `Escrow funded · ${formatUsdc(job.budgetUsdc)}`, tone: 'positive', live: false }
    : expired
      ? { label: 'Request expired', tone: 'default', live: false }
      : declined
        ? { label: 'Negotiation ended', tone: 'critical', live: false }
        : matchPending
          ? {
              label: `Match · ${proposal!.agreedPriceUsdc} USDC · awaiting approval`,
              tone: 'warning',
              live: true,
            }
          : job.finalized
            ? { label: 'Accepted · funding escrow', tone: 'warning', live: true }
            : job.bids.length > 0
              ? {
                  label: `${job.bids.length} bid${job.bids.length === 1 ? '' : 's'} · negotiating`,
                  tone: 'accent',
                  live: true,
                }
              : { label: 'Waiting on seller agents', tone: 'default', live: true };

  return (
    <FullBleed>
      <PageTour id={JOBS_TOUR_ID} steps={JOBS_STEPS} />
      {/* HERO */}
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="fade-up">
          <Link
            href={backHref}
            className="group inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white transition-colors mb-6"
          >
            <span
              aria-hidden
              className="inline-block transition-transform duration-200 group-hover:-translate-x-0.5"
            >
              ←
            </span>
            {backLabel}
          </Link>
        </div>
        <div className="grid lg:grid-cols-[1.4fr_auto] gap-6 items-start">
          <div className="min-w-0">
            <div className="fade-up fade-up-1">
              <SectionTag tone="dark" dot={status.live ? 'live' : undefined}>
                MANAGED DEAL
              </SectionTag>
            </div>
            <div className="fade-up fade-up-2">
              <HeroHeadline>
                {shortHash(job.jobId, 10, 6)}
                <Punc>.</Punc>
              </HeroHeadline>
            </div>
            <p className="fade-up fade-up-3 mt-4 mono text-[11px] uppercase tracking-[0.12em] text-white/45 tabular-nums break-all">
              {job.jobId}
            </p>
          </div>
          <div className="fade-up fade-up-4">
            <StatusChip label={status.label} tone={status.tone} live={status.live} />
          </div>
        </div>
      </Band>

      {/* STAT TILES */}
      <Band tone="light" compact>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 fade-up">
          <StatTile
            label="Budget"
            value={formatUsdc(job.budgetUsdc, { withSuffix: false })}
            unit="USDC"
          />
          <StatTile label="Bids" value={String(job.bids.length)} />
          {/* Once a match is approved or escrow has funded, the brief deadline
              is irrelevant. show the auction state instead. The page redirects
              to /deals/[id] on escrowFunded anyway, but during the brief flash
              we don't want to mislead. */}
          {job.escrowFunded ? (
            <StatTile label="Status" value="Escrow funded" small />
          ) : proposal?.approvedAt ? (
            <StatTile label="Status" value="Accepted" small />
          ) : expired ? (
            <StatTile label="Status" value="Expired" small />
          ) : declined ? (
            <StatTile label="Status" value="Ended" small />
          ) : (
            <StatTile label="Deadline" value={relativeTime(job.deadlineUnix)} small />
          )}
          <StatTile label="Terms hash" value={shortHash(job.termsHash, 6, 4)} mono />
        </div>

        {/* BRIEF BAND. Renders the human-readable brief text the buyer
            posted. The on-chain layer only stores the keccak hash, so this
            comes from the backend's brief store. Hidden when the store
            doesn't have it (eg flat-file wiped). */}
        {job.briefText && (
          <div className="mt-8 fade-up fade-up-1">
            <div
              className="relative flex items-stretch border bg-[var(--lp-card)]"
              style={{
                borderColor: 'var(--lp-border-light)',
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              <span aria-hidden className="w-[3px]" style={{ background: 'var(--lp-accent)' }} />
              <div className="flex-1 px-5 py-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <p className="mono uppercase font-semibold text-[9px] tracking-[0.22em] text-[var(--lp-text-muted)]">
                    [:REQUEST:]
                  </p>
                  {job.trustedMatch && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 mono text-[9px] font-bold uppercase tracking-[0.16em]"
                      style={{
                        background: 'var(--lp-accent)',
                        color: 'var(--lp-band-dark)',
                        borderRadius: 3,
                      }}
                      title="Buyer opted into Trusted Match. The agent loop weights seller reputation and stake above price; sellers must hold free stake to bid."
                    >
                      ★ TRUSTED MATCH
                    </span>
                  )}
                </div>
                <p className="text-[14.5px] leading-relaxed text-[var(--lp-dark)] whitespace-pre-wrap break-words">
                  {job.briefText}
                </p>
                {job.keywords && job.keywords.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {job.keywords.map((k) => (
                      <span
                        key={k}
                        className="inline-flex items-center px-2 py-0.5 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-sub)]"
                        style={{
                          background: 'var(--lp-light)',
                          border: '1px solid var(--lp-border-light)',
                          borderRadius: 2,
                        }}
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* EXPIRED BANNER. replaces the match banner slot when the brief is in
            its read-only afterlife. No actions; the auction is over. */}
        {expired && (
          <div className="mt-8 fade-up fade-up-1">
            <div
              className="relative flex items-stretch border bg-[var(--lp-card)]"
              style={{
                borderColor: 'var(--lp-border-light)',
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              <span aria-hidden className="w-[3px]" style={{ background: '#6b6b6b' }} />
              <div className="flex-1 px-5 py-4">
                <p className="mono uppercase font-semibold text-[9px] tracking-[0.22em] text-[var(--lp-text-muted)] mb-2">
                  Request expired · read only
                </p>
                <p className="text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
                  Deadline {relativeTime(job.deadlineUnix)}. The agent stopped tracking this
                  request, no funds were ever moved. Open a new request to run another auction.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* MATCH BANNER */}
        {proposal && !expired && (
          <div className="mt-8 fade-up fade-up-1">
            <MatchBanner proposal={proposal} onChange={refreshProposal} trustedMatch={job.trustedMatch === true} />
          </div>
        )}

        {/* NEAR-MISS. The agent found a match just outside one side's range and
            is asking that party whether to proceed. Sits in the banner slot
            before any match proposal exists; once proceeded it becomes a funded
            deal and the page redirects to /deals/[id]. */}
        {nearMiss && !proposal && !expired && !job.escrowFunded && (
          <div className="mt-8 fade-up fade-up-1">
            <NearMissCard nearMiss={nearMiss} onChange={refreshNearMiss} />
          </div>
        )}

        {/* FLOW + TIMELINE + BIDS */}
        <div className="mt-8 grid lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2 space-y-5">
            <PageCard>
              <div className="p-6" data-guide="job-flow">
                <SectionTag>FLOW</SectionTag>
                <div className="mt-6">
                  <FlowStepper active={active} completed={completed} ended={ended} />
                </div>
              </div>
            </PageCard>

            <div data-guide="job-negotiation">
              <NegotiationCard
                events={events}
                explorer={explorer}
                terminal={expired || declined}
              />
            </div>

            <SettleSection job={job} acceptedAt={acceptedAt} declined={declined} />
            <EditBriefSection
              job={job}
              declined={declined}
              matchPending={!!matchPending}
              viewerIsSeller={viewerIsSeller}
              callerAddress={address ?? undefined}
              onEdited={refreshJob}
            />
            <CancelBriefSection
              job={job}
              declined={declined}
              matchPending={!!matchPending}
              viewerIsSeller={viewerIsSeller}
              callerAddress={address ?? undefined}
            />
          </div>

          <div className="space-y-5" data-guide="job-bids">
            <PageCard>
              <div className="px-6 pt-6">
                <SectionTag>BIDS</SectionTag>
              </div>
              <LiveBidsPanel initial={job} />
            </PageCard>
          </div>
        </div>
      </Band>
    </FullBleed>
  );
}

function StatTile({
  label,
  value,
  unit,
  mono,
  small,
}: {
  label: string;
  value: string;
  unit?: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className="relative overflow-hidden p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        borderBottomLeftRadius: 18,
        borderBottomRightRadius: 4,
        boxShadow: '0 1px 0 rgba(0,0,0,0.03), 0 6px 18px -14px rgba(0,0,0,0.14)',
      }}
    >
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        [:{label.toUpperCase()}:]
      </p>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span
          className={
            mono
              ? 'mono tabular-nums text-[18px] font-medium text-[var(--lp-dark)] leading-none'
              : small
                ? 'font-sans text-[18px] font-extrabold tracking-[-0.02em] text-[var(--lp-dark)] leading-none'
                : 'font-sans text-[clamp(2rem,3.4vw,2.75rem)] font-extrabold tabular-nums tracking-[-0.025em] text-[var(--lp-dark)] leading-none'
          }
        >
          {value}
        </span>
        {unit && (
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function StatusChip({
  label,
  tone,
  live,
}: {
  label: string;
  tone: StatusTone;
  live: boolean;
}) {
  // Instrument-readout chip. same family as navbar LiveDot/wallet button.
  // Body is white-on-dark; status color lives only in the LED cell.
  const cell: Record<StatusTone, string> = {
    positive: '#0a7553',
    warning: '#b25425',
    accent: 'var(--lp-accent)',
    default: '#6b6b6b',
    critical: '#b03d3a',
  };
  const eyebrowText: Record<StatusTone, string> = {
    positive: 'SETTLED',
    warning: 'IN PROGRESS',
    accent: 'LIVE',
    default: 'OPEN',
    critical: 'DECLINED',
  };
  return (
    <span
      className="inline-flex items-stretch overflow-hidden mono leading-none text-white"
      style={{
        background: 'var(--lp-band-dark)',
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 2,
        boxShadow: '0 2px 0 rgba(0,0,0,0.22)',
      }}
    >
      <span
        aria-hidden
        className="flex items-center justify-center px-2"
        style={{ background: cell[tone] }}
      >
        <span
          aria-hidden
          data-instrument-blink={live || undefined}
          className="inline-block w-[6px] h-[6px] bg-white"
          style={{
            animation: live ? 'instrumentBlink 1.6s ease-in-out infinite' : undefined,
          }}
        />
      </span>
      <span className="flex flex-col gap-[2px] px-3 py-2">
        <span
          className="text-[8.5px] font-bold uppercase tracking-[0.22em]"
          style={{ color: tone === 'accent' ? 'var(--lp-accent)' : 'rgba(255,255,255,0.55)' }}
        >
          {eyebrowText[tone]}
        </span>
        <span className="text-[12px] font-semibold tracking-[-0.005em]">{label}</span>
      </span>
    </span>
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
    return (
      <SettleCard label="SETTLE" title="Escrow live">
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] mb-4">
          Escrow holds{' '}
          <span className="font-sans font-extrabold tabular-nums text-[var(--lp-dark)]">
            {formatUsdc(job.budgetUsdc)}
          </span>
          . Deal management has moved to its dedicated page.
        </p>
        <Link
          href={`/deals/${job.jobId}`}
          className="inline-flex items-center gap-2 px-[18px] py-[10px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors"
          style={{
            borderTopLeftRadius: 10,
            borderTopRightRadius: 10,
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 3,
          }}
        >
          Open deal
          <span aria-hidden>→</span>
        </Link>
      </SettleCard>
    );
  }

  if (declined) {
    return (
      <SettleCard label="NEGOTIATION ENDED" title="No agreement">
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
          Your agent ended the negotiation. No terms agreed, no escrow funded. Post a fresh request
          with a higher budget or tolerance.
        </p>
      </SettleCard>
    );
  }

  if (fundingPhase) {
    const elapsed = acceptedAt ? Math.max(0, Math.floor((now - acceptedAt) / 1000)) : null;
    const stalled = elapsed != null && elapsed > 120;
    return (
      <SettleCard
        label={stalled ? 'FUNDING STALLED' : 'FUNDING ESCROW'}
        title={stalled ? `Stalled · ${formatElapsed(elapsed!)}` : 'Approve · fund'}
      >
        {stalled ? (
          <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
            Escrow has not funded in {formatElapsed(elapsed!)}.
          </p>
        ) : (
          <FundingProgress elapsed={elapsed ?? 0} amount={formatUsdc(job.budgetUsdc)} />
        )}
      </SettleCard>
    );
  }

  return (
    <SettleCard label="SETTLE" title="Locked after accept">
      <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
        Funds lock in escrow once the buyer agent accepts a final bid. Releases unlock after
        escrow funds.
      </p>
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
/// already finalized, expired, or cancelled — backend enforces the same.
function EditBriefSection({
  job,
  declined,
  matchPending,
  viewerIsSeller,
  callerAddress,
  onEdited,
}: {
  job: BuyerJob;
  declined: boolean;
  matchPending: boolean;
  viewerIsSeller: boolean;
  callerAddress: string | undefined;
  onEdited: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewerIsBuyer =
    !!callerAddress && callerAddress.toLowerCase() === job.buyer.toLowerCase();
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

  async function handleSave(briefText: string) {
    if (!callerAddress) return;
    setBusy(true);
    setError(null);
    try {
      await api.editBrief(job.jobId, callerAddress, briefText);
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
          <SectionTag>EDIT</SectionTag>
          <h3 className="mt-2 font-sans text-[20px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
            Fix the request text
          </h3>
        </div>
        <div className="px-6 pb-6 space-y-3">
          <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
            Spotted a typo or want to clarify what you need? Update the text now,
            before a seller agent locks in a match. The agent re-reads the new
            copy on its next scan.
          </p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
            className="mono text-[11px] uppercase tracking-[0.12em] font-semibold text-[var(--lp-accent)] hover:text-[var(--lp-accent-hover)] underline underline-offset-2"
          >
            Edit request
          </button>
        </div>
      </PageCard>
      {open && (
        <EditBriefModal
          initialBriefText={job.briefText ?? ''}
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
  busy,
  error,
  onSave,
  onClose,
}: {
  initialBriefText: string;
  busy: boolean;
  error: string | null;
  onSave: (briefText: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialBriefText);
  const trimmed = text.trim();
  const dirty = trimmed !== initialBriefText.trim();
  const valid = trimmed.length >= 5 && trimmed.length <= 2000 && dirty;

  function submit() {
    if (!valid || busy) return;
    onSave(trimmed);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(14,14,14,0.55)' }}
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden"
        style={{
          background: 'var(--lp-card)',
          color: 'var(--lp-dark)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 5,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.35)',
        }}
      >
        <div className="px-6 pt-6 pb-3">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:EDIT REQUEST:]
          </span>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-tight">
            Update the text
            <span style={{ color: 'var(--lp-accent)' }}>.</span>
          </h2>
        </div>
        <div className="px-6 pb-6 space-y-4">
          <p className="text-[13px] text-[var(--lp-text-sub)] leading-relaxed">
            The off-chain text updates right away. Keywords re-extract for the
            agent&apos;s next scan. Other fields (budget, deadline, tolerance)
            stay locked because the auction relies on them.
          </p>

          <label className="block space-y-1.5">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:REQUEST TEXT:]
            </span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              rows={8}
              className="form-input form-textarea"
              maxLength={2000}
            />
            <span className="mono text-[10px] text-[var(--lp-text-muted)]">
              {text.length}/2000
            </span>
          </label>

          {error && (
            <p className="mono text-[11px] text-[#b03d3a]">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <CTAPill onClick={submit} disabled={!valid || busy}>
              {busy ? 'Saving...' : 'Save changes'}
            </CTAPill>
            <CTAPill variant="secondary" tone="light" onClick={onClose} disabled={busy}>
              Cancel
            </CTAPill>
          </div>
        </div>
      </div>
    </div>
  );
}

function CancelBriefSection({
  job,
  declined,
  matchPending,
  viewerIsSeller,
  callerAddress,
}: {
  job: BuyerJob;
  declined: boolean;
  matchPending: boolean;
  viewerIsSeller: boolean;
  callerAddress: string | undefined;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewerIsBuyer =
    !!callerAddress && callerAddress.toLowerCase() === job.buyer.toLowerCase();
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
        <SectionTag>OR</SectionTag>
        <h3 className="mt-2 font-sans text-[20px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
          Pull this request
        </h3>
      </div>
      <div className="px-6 pb-6 space-y-3">
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
          Posted by mistake or changed your mind? Pull the request now, before any seller agent
          locks in a match. Nothing funded yet, so the cancel is free.
        </p>
        {!confirm ? (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="mono text-[11px] uppercase tracking-[0.12em] font-semibold text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] underline underline-offset-2"
          >
            Cancel request
          </button>
        ) : (
          <div
            className="px-4 py-3 space-y-3"
            style={{
              background: 'rgba(176, 61, 58, 0.08)',
              border: '1px solid rgba(176, 61, 58, 0.30)',
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 3,
            }}
          >
            <p className="text-[13px] text-[var(--lp-dark)] leading-snug">
              Pull this request? The agent stops scanning bids on it immediately. You can post a
              fresh one any time.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={busy}
                className="mono text-[11px] font-bold uppercase tracking-[0.10em] px-3.5 py-2 text-white transition-colors disabled:opacity-60"
                style={{
                  background: '#b03d3a',
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                  borderBottomLeftRadius: 8,
                  borderBottomRightRadius: 2,
                }}
              >
                {busy ? 'Cancelling…' : 'Yes, cancel'}
              </button>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                disabled={busy}
                className="mono text-[11px] uppercase tracking-[0.10em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]"
              >
                Keep request
              </button>
            </div>
            {error && (
              <p className="mono text-[11px] text-[#b03d3a]">{error}</p>
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
  const approveDone = elapsed > 30;
  const fundDone = elapsed > 60;
  return (
    <div className="space-y-2.5">
      <FundingStep label="APPROVE USDC" done={approveDone} active={!approveDone} />
      <FundingStep label="FUND ESCROW" done={fundDone} active={approveDone && !fundDone} />
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
  const fill = done ? '#0a7553' : active ? 'var(--lp-accent)' : 'rgba(0,0,0,0.10)';
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
        className={`mono text-[11px] uppercase tracking-[0.14em] ${
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
