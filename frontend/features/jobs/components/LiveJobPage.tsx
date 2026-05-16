'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import type { BuyerJob } from '@/core/api';
import { useJobSnapshot } from '../hooks/useJobSnapshot';
import { useJobLiveState } from '../hooks/useJobLiveState';
import { FlowStepper } from './FlowStepper';
import { EventList } from './EventList';
import { LiveBidsPanel } from './LiveBidsPanel';
import { MatchBanner } from './MatchBanner';
import { ReleaseMilestonesButton } from './ReleaseMilestonesButton';
import { useMatchProposal } from '../hooks/useMatchProposal';
import { shortHash, formatUsdc, relativeTime } from '@/shared/utils/format';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  PageCard,
} from '@/shared/components/Bands';

type StatusTone = 'positive' | 'warning' | 'accent' | 'default' | 'critical';

export function LiveJobPage({ initial, explorer }: { initial: BuyerJob; explorer: string }) {
  const { job } = useJobSnapshot(initial);
  const { events, active, completed, declined } = useJobLiveState(job);
  const { proposal, refresh: refreshProposal } = useMatchProposal(initial.jobId);
  const { address } = useAccount();
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

  const status: { label: string; tone: StatusTone; live: boolean } = job.escrowFunded
    ? { label: `Escrow funded · ${formatUsdc(job.budgetUsdc)}`, tone: 'positive', live: false }
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
              is irrelevant — show the auction state instead. The page redirects
              to /deals/[id] on escrowFunded anyway, but during the brief flash
              we don't want to mislead. */}
          {job.escrowFunded ? (
            <StatTile label="Status" value="Escrow funded" small />
          ) : proposal?.approvedAt ? (
            <StatTile label="Status" value="Accepted" small />
          ) : declined ? (
            <StatTile label="Status" value="Ended" small />
          ) : (
            <StatTile label="Deadline" value={relativeTime(job.deadlineUnix)} small />
          )}
          <StatTile label="Terms hash" value={shortHash(job.termsHash, 6, 4)} mono />
        </div>

        {/* MATCH BANNER */}
        {proposal && (
          <div className="mt-8 fade-up fade-up-1">
            <MatchBanner proposal={proposal} onChange={refreshProposal} />
          </div>
        )}

        {/* FLOW + TIMELINE + BIDS */}
        <div className="mt-8 grid lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2 space-y-5">
            <PageCard>
              <div className="p-6">
                <SectionTag>FLOW</SectionTag>
                <div className="mt-6">
                  <FlowStepper active={active} completed={completed} declined={declined} />
                </div>
              </div>
            </PageCard>

            <PageCard>
              <div className="px-6 pt-6">
                <SectionTag>TIMELINE</SectionTag>
              </div>
              <div className="px-6 pb-6 pt-3">
                <EventList events={events} explorer={explorer} />
              </div>
            </PageCard>

            <SettleSection job={job} acceptedAt={acceptedAt} declined={declined} />
          </div>

          <div className="space-y-5">
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
  // Instrument-readout chip — same family as navbar LiveDot/wallet button.
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
        background: 'var(--lp-dark)',
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

  if (job.escrowFunded) {
    return (
      <SettleCard label="SETTLE" title="Escrow live">
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] mb-4">
          Escrow holds{' '}
          <span className="font-sans font-extrabold tabular-nums text-[var(--lp-dark)]">
            {formatUsdc(job.budgetUsdc)}
          </span>
          . Release milestones to stream funds to the seller.
        </p>
        <ReleaseMilestonesButton jobId={job.jobId} totalMilestones={2} />
      </SettleCard>
    );
  }

  if (declined) {
    return (
      <SettleCard label="NEGOTIATION ENDED" title="No agreement">
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
          Your agent ended the negotiation. No terms agreed, no escrow funded. Post a fresh brief
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
