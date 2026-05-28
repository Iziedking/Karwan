'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/shared/hooks/useAuth';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { api, ApiError, type DirectDeal } from '@/core/api';
import { ChatPanel } from '@/features/chat/components/ChatPanel';
import { PageTour } from '@/shared/guide/PageTour';
import { DEAL_TOUR_ID, DEAL_STEPS } from '@/shared/guide/tours';
import { useActivation } from '@/shared/hooks/useActivation';
import { sfx } from '@/shared/utils/sfx';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { useDirectDeal } from '../hooks/useDirectDeals';
import { stageOf, StageBadge, type DealStage } from './DirectDealList';
import {
  feeBreakdown,
  REVIEW_WINDOW_MS,
  REVIEW_EXTENSION_MS,
  MAX_REVIEW_EXTENSIONS,
} from '../config';
import { shortAddress, shortHash, formatUsdc, relativeTime } from '@/shared/utils/format';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  CTAPill,
  PageCard,
} from '@/shared/components/Bands';

const ARC_EXPLORER_TX = (h: string) => `https://testnet.arcscan.app/tx/${h}`;

// Curated stage hues. mirror DirectDealList.STAGE_META so the rail accent
// stays consistent between the list row and the detail view.
const STAGE_RAIL: Record<DealStage, string> = {
  'awaiting-acceptance': '#4a5aa3',
  'awaiting-delivery': '#4a5aa3',
  'awaiting-first-release': '#c96030',
  'awaiting-final-release': '#c96030',
  settled: '#0e8c5f',
  cancelled: '#b03d3a',
  disputed: '#92294a',
};

/// One reassuring line on the funding card, by stage + viewer side. Keeps the
/// web3 vocabulary (escrow, on Arc, on chain) on purpose — Karwan is a web3
/// product and the chain is the reason the money is safe — but says it plainly.
/// Returns null for terminal/dispute states, which have their own copy.
function fundingSafetyLine(stage: string, viewerIsBuyer: boolean): string | null {
  if (stage === 'settled') return 'Settled on chain. The escrow paid out in full.';
  if (stage === 'awaiting-acceptance') {
    return viewerIsBuyer
      ? 'When the seller accepts, your payment locks in escrow on Arc. Released only as milestones clear, only when you say so.'
      : "Accept and the buyer's payment locks in escrow on Arc. It becomes yours as you deliver.";
  }
  if (
    stage === 'awaiting-delivery' ||
    stage === 'awaiting-first-release' ||
    stage === 'awaiting-final-release'
  ) {
    return viewerIsBuyer
      ? 'Your payment is locked in escrow on Arc. The seller is paid only as milestones clear, and only when you release.'
      : "The buyer's payment is locked in escrow on Arc. It becomes yours as milestones clear. No one can pull it back on a whim.";
  }
  return null;
}

export function DirectDealDetail({ jobId }: { jobId: string }) {
  const auth = useAuth();
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
  const { deal, fetchState, refresh, errorCode } = useDirectDeal(jobId);
  const { activated } = useActivation();
  const [busy, setBusy] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ code?: string; message: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [deliveryProof, setDeliveryProof] = useState('');
  const [showAcceptConsent, setShowAcceptConsent] = useState(false);
  // Hoisted above the conditional early returns below to satisfy the React
  // rules of hooks. must be called on every render in the same order.
  const [proposeOpen, setProposeOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (fetchState === 'loading') {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="space-y-4 max-w-[44ch]">
            <div className="h-3 w-32 rounded bg-white/[0.08] animate-pulse motion-reduce:animate-none" />
            <div className="h-12 w-72 rounded bg-white/[0.08] animate-pulse motion-reduce:animate-none" />
            <div className="h-3 w-48 rounded bg-white/[0.08] animate-pulse motion-reduce:animate-none" />
          </div>
        </Band>
      </FullBleed>
    );
  }

  if (fetchState === 'error' || !deal) {
    const isPrivate = errorCode === 'private';
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="max-w-[44ch]">
            <SectionTag tone="dark">{isPrivate ? 'PRIVATE DEAL' : 'DEAL NOT FOUND'}</SectionTag>
            <HeroHeadline size="md">
              {isPrivate ? 'This deal is private' : 'We could not load this deal'}
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              {isPrivate
                ? 'Only its buyer and seller can see this deal. No one else sees what happens between two parties.'
                : 'The link may be wrong, or your wallet may not be a party.'}
            </p>
            <div className="mt-7">
              <CTAPill href={isPrivate ? '/market' : '/buyer'}>
                {isPrivate ? 'Browse the market' : 'Back to buyer desk'}
              </CTAPill>
            </div>
          </div>
        </Band>
      </FullBleed>
    );
  }

  const stage = stageOf(deal);
  const viewerIsBuyer = !!address && address.toLowerCase() === deal.buyer;
  const viewerIsSeller = !!address && address.toLowerCase() === deal.seller;
  const fee = feeBreakdown(Number(deal.dealAmountUsdc));

  if (!isConnected) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="max-w-[44ch]">
            <SectionTag tone="dark">PRIVATE DEAL</SectionTag>
            <HeroHeadline size="md">
              Connect to <span style={{ color: 'var(--lp-accent)' }}>view</span>
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              Deals are visible only to the buyer and seller. Connect the wallet that opened or
              accepted this deal.
            </p>
            <div className="mt-7">
              <ConnectButton />
            </div>
          </div>
        </Band>
      </FullBleed>
    );
  }

  if (!viewerIsBuyer && !viewerIsSeller) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="max-w-[44ch]">
            <SectionTag tone="dark">NOT A PARTY</SectionTag>
            <HeroHeadline size="md">
              No open deals <span style={{ color: 'var(--lp-accent)' }}>here</span>
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              Switch wallets if you&apos;re meant to see this, or start a new deal.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <CTAPill href="/buyer">Open a deal</CTAPill>
              <CTAPill href="/app" variant="secondary" tone="dark">
                Back home
              </CTAPill>
            </div>
          </div>
        </Band>
      </FullBleed>
    );
  }

  async function doAccept() {
    if (!address) return;
    setShowAcceptConsent(false);
    setBusy(true);
    setErrorInfo(null);
    try {
      await api.acceptDirectDeal(jobId, address);
      sfx.send();
      refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      const message =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setErrorInfo({ code, message });
    } finally {
      setBusy(false);
    }
  }

  function requestAccept() {
    if (activated) doAccept();
    else setShowAcceptConsent(true);
  }

  async function onMarkDelivered() {
    if (!address) return;
    setBusy(true);
    setErrorInfo(null);
    try {
      await api.markDelivered(jobId, address, deliveryProof.trim() || undefined);
      refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      const message =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setErrorInfo({ code, message });
    } finally {
      setBusy(false);
    }
  }

  async function onRelease() {
    if (!address) return;
    setBusy(true);
    setErrorInfo(null);
    try {
      const r = await api.releaseDirectDeal(jobId, address);
      if (r.settled) sfx.success();
      else sfx.send();
      refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      const message =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setErrorInfo({ code, message });
    } finally {
      setBusy(false);
    }
  }

  async function onStillReviewing() {
    if (!address) return;
    setBusy(true);
    setErrorInfo(null);
    try {
      await api.stillReviewing(jobId, address);
      refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      const message =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setErrorInfo({ code, message });
    } finally {
      setBusy(false);
    }
  }

  async function onAppeal() {
    if (!address) return;
    setBusy(true);
    setErrorInfo(null);
    try {
      await api.appealDeal(jobId, address);
      refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      const message =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setErrorInfo({ code, message });
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!address) return;
    setBusy(true);
    setErrorInfo(null);
    try {
      await api.cancelDirectDeal(jobId, address);
      refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      const message =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setErrorInfo({ code, message });
    } finally {
      setBusy(false);
    }
  }

  async function onProposeCancel(reason: string, kind: 'mutual' | 'platform-attributed') {
    if (!address) return;
    setBusy(true);
    setErrorInfo(null);
    try {
      await api.proposeCancelDirectDeal(jobId, address, reason, kind);
      setProposeOpen(false);
      refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      const message =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setErrorInfo({ code, message });
    } finally {
      setBusy(false);
    }
  }

  async function onAcceptCancel() {
    if (!address) return;
    setBusy(true);
    setErrorInfo(null);
    try {
      await api.acceptCancelDirectDeal(jobId, address);
      refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      const message =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setErrorInfo({ code, message });
    } finally {
      setBusy(false);
    }
  }

  async function onDeclineCancel() {
    if (!address) return;
    setBusy(true);
    setErrorInfo(null);
    try {
      await api.declineCancelDirectDeal(jobId, address);
      refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      const message =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setErrorInfo({ code, message });
    } finally {
      setBusy(false);
    }
  }

  const rail = STAGE_RAIL[stage];
  const viewerRole: 'buyer' | 'seller' | null = viewerIsBuyer
    ? 'buyer'
    : viewerIsSeller
      ? 'seller'
      : null;
  const proposal = deal.cancellationProposal;
  // The counterparty is the party who DIDN'T propose. They see Accept/Decline.
  const viewerIsCounterparty = !!proposal && viewerRole !== null && viewerRole !== proposal.proposedBy;
  // The proposer sees a "waiting on X" state with a way to retract is out of
  // scope for this slice; a re-propose from the same side overwrites.
  const viewerIsProposer = !!proposal && viewerRole !== null && viewerRole === proposal.proposedBy;
  // Stages where either party may propose a mutual / platform-attributed cancel.
  // Pre-accept and settled / already-cancelled are excluded. pre-accept has its
  // own buyer-only path and settled / cancelled are terminal.
  //
  // Disputed is included: a seller appeal freezes funds on chain but neither
  // party loses the ability to reach consensus. If the counterparty accepts a
  // mutual cancel proposed while disputed, the escrow refunds the buyer in
  // full and the deal closes with no reputation hit, exactly as if the dispute
  // never happened.
  const proposableStages: DealStage[] = [
    'awaiting-delivery',
    'awaiting-first-release',
    'awaiting-final-release',
    'disputed',
  ];
  const canPropose =
    !proposal && proposableStages.includes(stage) && viewerRole !== null && !deal.cancelledAt;

  return (
    <FullBleed>
      <PageTour id={DEAL_TOUR_ID} steps={DEAL_STEPS} />
      {/* HERO */}
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="fade-up">
          <div className="flex flex-wrap items-center gap-3">
            <SectionTag tone="dark">DIRECT DEAL</SectionTag>
            <StageBadge stage={stage} />
          </div>
        </div>
        <div className="fade-up fade-up-1 mt-7 flex items-baseline gap-3 flex-wrap">
          <h1 className="font-sans font-extrabold tabular-nums uppercase tracking-[-0.025em] leading-[0.95] text-[clamp(3rem,7vw,5.5rem)]">
            {formatUsdc(deal.dealAmountUsdc, { withSuffix: false })}
            <Punc>.</Punc>
          </h1>
          <span className="mono text-[14px] font-semibold uppercase tracking-[0.12em] text-white/55">
            USDC
          </span>
        </div>
        <p className="fade-up fade-up-2 mt-5 mono text-[11px] uppercase tracking-[0.16em] text-white/45">
          {shortHash(deal.jobId, 10, 6)} · opened {relativeTime(deal.createdAt)}
        </p>
      </Band>

      {deal.legacyEscrow && (
        <Band tone="light" compact>
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            style={{
              background: 'color-mix(in oklab, var(--lp-accent) 14%, transparent)',
              border: '1px solid color-mix(in oklab, var(--lp-accent) 35%, transparent)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            <div className="min-w-0">
              <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                [:PREVIOUS CONTRACT:]
              </p>
              <p className="mt-1 font-sans text-[14px] font-extrabold text-[var(--lp-dark)] leading-snug">
                This deal lives on an older escrow.
              </p>
              <p className="mt-1 text-[12.5px] leading-snug text-[var(--lp-text-sub)]">
                Finalize, refund, or cancel it from the recovery page.
              </p>
            </div>
            <Link
              href="/legacy"
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2 mono text-[11px] font-bold uppercase tracking-[0.08em] bg-[var(--lp-band-dark)] text-[var(--lp-accent)] hover:bg-black/85 transition-colors"
              style={{
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 2,
              }}
            >
              Open recovery
              <span aria-hidden>→</span>
            </Link>
          </div>
        </Band>
      )}

      {/* PARTIES + FUNDING */}
      <Band tone="light" compact>
        <div className="grid md:grid-cols-2 gap-5">
          <PageCard>
            <CardHead label="Parties" />
            <div className="p-5 md:p-6 space-y-4">
              <PartyRow role="Buyer" address={deal.buyer} you={viewerIsBuyer} />
              <div className="border-t border-[var(--lp-border-light)]" />
              <PartyRow
                role="Seller"
                address={deal.seller}
                you={viewerIsSeller}
                showReputation
              />
            </div>
          </PageCard>

          <PageCard>
            <CardHead label="Funding · 1.5% fee, split evenly" />
            <div className="p-5 md:p-6 space-y-2.5">
              <MoneyRow label="Buyer funds" value={fee.fundedAmount} />
              <MoneyRow label="Seller receives" value={fee.sellerNet} strong />
              <MoneyRow label="Platform fee" value={fee.feeTotal} faint />
              <div className="mt-3 pt-3 border-t border-[var(--lp-border-light)] space-y-2.5">
                <MoneyRow
                  label={`On delivery · ${deal.firstReleasePct}%`}
                  value={(fee.sellerNet * deal.firstReleasePct) / 100}
                />
                <MoneyRow
                  label={`On verification · ${100 - deal.firstReleasePct}%`}
                  value={(fee.sellerNet * (100 - deal.firstReleasePct)) / 100}
                />
              </div>
              {fundingSafetyLine(stage, viewerIsBuyer) && (
                <div className="mt-3 pt-3 border-t border-[var(--lp-border-light)]">
                  <p
                    className="mono text-[10px] font-bold uppercase tracking-[0.16em]"
                    style={{ color: 'var(--lp-accent)' }}
                  >
                    [:PROTECTED:]
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--lp-text-sub)]">
                    {fundingSafetyLine(stage, viewerIsBuyer)}
                  </p>
                </div>
              )}
            </div>
          </PageCard>
        </div>
      </Band>

      {/* TERMS + (optional) DELIVERY PROOF */}
      <Band tone="light" compact>
        <SectionTag>TERMS</SectionTag>
        <HeroHeadline size="md">
          The agreement<Punc>.</Punc>
        </HeroHeadline>
        <div className="mt-8 grid md:grid-cols-2 gap-5">
          <PageCard>
            <div className="p-5 md:p-6">
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] whitespace-pre-wrap">
                {deal.terms}
              </p>
              <p className="mt-4 pt-4 border-t border-[var(--lp-border-light)] mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                Deadline {relativeTime(deal.deadlineUnix * 1000)}
              </p>
            </div>
          </PageCard>

          {deal.delivered && deal.deliveryProof && (
            <PageCard>
              <CardHead label="Delivery proof" />
              <div className="p-5 md:p-6">
                <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] whitespace-pre-wrap break-words">
                  {deal.deliveryProof}
                </p>
              </div>
            </PageCard>
          )}
        </div>
      </Band>

      {/* PROGRESS */}
      <Band tone="light" compact>
        <SectionTag dot={stage !== 'settled' && stage !== 'cancelled' ? 'live' : undefined}>
          PROGRESS
        </SectionTag>
        <HeroHeadline size="md">
          Where this deal <span style={{ color: 'var(--lp-accent)' }}>stands</span>
          <Punc>.</Punc>
        </HeroHeadline>
        <div className="mt-8" data-guide="deal-flow">
          <PageCard>
            <ProgressTrack deal={deal} stage={stage} rail={rail} />
          </PageCard>
        </div>
      </Band>

      {/* ACTIONS */}
      <Band tone="dark" compact>
        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-8 items-start">
          <div className="max-w-[42ch]">
            <SectionTag tone="dark" dot={stage !== 'settled' && stage !== 'cancelled' ? 'live' : undefined}>
              NEXT MOVE
            </SectionTag>
            <HeroHeadline size="md">
              What you can do <span style={{ color: 'var(--lp-accent)' }}>now</span>
              <Punc>.</Punc>
            </HeroHeadline>
          </div>
          <div
            data-guide="deal-actions"
            className="overflow-hidden p-6 md:p-7"
            style={{
              background: 'var(--surface-1)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderBottomLeftRadius: 22,
              borderBottomRightRadius: 5,
            }}
          >
            {proposal && (
              <div className="mb-4">
                <CancelProposalBanner
                  proposal={proposal}
                  viewerIsCounterparty={viewerIsCounterparty}
                  viewerIsProposer={viewerIsProposer}
                  busy={busy}
                  firstReleased={!!deal.reviewWindowStartedAt}
                  firstReleasePct={deal.firstReleasePct}
                  onAccept={onAcceptCancel}
                  onDecline={onDeclineCancel}
                />
              </div>
            )}
            <ActionPanel
              stage={stage}
              viewerIsBuyer={viewerIsBuyer}
              viewerIsSeller={viewerIsSeller}
              firstPct={deal.firstReleasePct}
              busy={busy}
              deal={deal}
              now={now}
              deliveryProof={deliveryProof}
              onDeliveryProofChange={setDeliveryProof}
              onAccept={requestAccept}
              onMarkDelivered={onMarkDelivered}
              onRelease={onRelease}
              onStillReviewing={onStillReviewing}
              onAppeal={onAppeal}
              onCancel={onCancel}
            />
            {canPropose && (
              <div className="mt-5 pt-5 border-t border-white/[0.08]">
                <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/55">
                  [:OR:]
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-white/65">
                  Need to call it off? Propose a cancellation. Your counterparty has to agree;
                  no reputation hit if they do.
                </p>
                <div className="mt-3">
                  <CTAPill
                    variant="secondary"
                    tone="dark"
                    onClick={() => setProposeOpen(true)}
                    disabled={busy}
                  >
                    Propose cancellation
                  </CTAPill>
                </div>
              </div>
            )}
            {errorInfo && (
              <div className="mt-4">
                <DealErrorNote info={errorInfo} viewerIsBuyer={viewerIsBuyer} />
              </div>
            )}
          </div>
        </div>
        {deal.fundTxHash && (
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-1.5 text-[11px]">
            <a
              href={ARC_EXPLORER_TX(deal.fundTxHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 mono uppercase tracking-[0.14em] text-white/55 hover:text-[var(--lp-accent)] transition-colors"
            >
              <span>FUNDING TX</span>
              <span className="tabular-nums">{shortHash(deal.fundTxHash)}</span>
              <ExternalIcon />
            </a>
          </div>
        )}
      </Band>

      {/* CHAT */}
      {address && (
        <Band tone="light" compact>
          <SectionTag>CHAT</SectionTag>
          <HeroHeadline size="md">
            Talk to your <span style={{ color: 'var(--lp-accent)' }}>counterparty</span>
            <Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
            Per-deal thread. Mirrors to Telegram if connected.
          </p>
          <div className="mt-8">
            <PageCard>
              <ChatPanel
                jobId={jobId}
                caller={address}
                counterpartyLabel={
                  viewerIsBuyer
                    ? `seller ${shortAddress(deal.seller)}`
                    : `buyer ${shortAddress(deal.buyer)}`
                }
              />
            </PageCard>
          </div>
        </Band>
      )}

      {showAcceptConsent && (
        <AcceptConsentModal
          busy={busy}
          onConfirm={doAccept}
          onClose={() => setShowAcceptConsent(false)}
        />
      )}

      {proposeOpen && (
        <ProposeCancelModal
          busy={busy}
          firstReleased={!!deal.reviewWindowStartedAt}
          firstReleasePct={deal.firstReleasePct}
          onConfirm={onProposeCancel}
          onClose={() => setProposeOpen(false)}
        />
      )}
    </FullBleed>
  );
}

function CardHead({ label }: { label: string }) {
  return (
    <div className="px-5 md:px-6 pt-5 pb-3 border-b border-[var(--lp-border-light)]">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        [:{label}:]
      </span>
    </div>
  );
}

function PartyRow({
  role,
  address,
  you,
  showReputation,
}: {
  role: string;
  address: string;
  you: boolean;
  showReputation?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          {role}
          {you && <span style={{ color: 'var(--lp-accent)' }}> · you</span>}
        </p>
        <p className="mt-1 mono text-[13px] text-[var(--lp-dark)] tabular-nums">
          {shortAddress(address)}
        </p>
      </div>
      {showReputation && <ReputationBadge address={address} size="sm" withDetail />}
    </div>
  );
}

function MoneyRow({
  label,
  value,
  strong,
  faint,
}: {
  label: string;
  value: number;
  strong?: boolean;
  faint?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={`text-[13px] ${faint ? 'text-[var(--lp-text-muted)]' : 'text-[var(--lp-text-sub)]'}`}
      >
        {label}
      </span>
      <span
        className={`mono tabular-nums ${
          strong
            ? 'text-[16px] font-extrabold text-[var(--lp-dark)]'
            : 'text-[13px] text-[var(--lp-dark)]'
        }`}
      >
        {formatUsdc(value)}
      </span>
    </div>
  );
}

function ProgressTrack({
  deal,
  stage,
  rail,
}: {
  deal: { firstReleasePct: number };
  stage: DealStage;
  rail: string;
}) {
  const cancelled = stage === 'cancelled';
  const past = (...stages: DealStage[]) => !cancelled && !stages.includes(stage);
  const steps = [
    { key: 'opened', label: 'Deal opened', done: true },
    {
      key: 'accepted',
      label: 'Seller accepted · escrow funded',
      done: past('awaiting-acceptance'),
    },
    {
      key: 'delivered',
      label: 'Seller marked delivered',
      done: past('awaiting-acceptance', 'awaiting-delivery'),
    },
    {
      key: 'first',
      label: `First ${deal.firstReleasePct}% released`,
      done: stage === 'awaiting-final-release' || stage === 'settled',
    },
    {
      key: 'final',
      label: `Final ${100 - deal.firstReleasePct}% released`,
      done: stage === 'settled',
    },
  ];
  const firstPending = steps.findIndex((s) => !s.done);
  const terminal = stage === 'settled' || stage === 'disputed' || stage === 'cancelled';

  return (
    <div className="p-6 md:p-7">
      <ol className="space-y-3.5">
        {steps.map((s, i) => {
          const done = s.done;
          const active = i === firstPending && !terminal;
          return (
            <li key={s.key} className="flex items-center gap-3.5">
              <span
                aria-hidden
                data-instrument-blink={active || undefined}
                className="shrink-0 inline-block w-[11px] h-[11px]"
                style={{
                  background: done ? rail : active ? rail : 'rgba(0,0,0,0.08)',
                  opacity: done ? 1 : active ? 0.65 : 1,
                  animation: active ? 'instrumentBlink 1.6s ease-in-out infinite' : undefined,
                }}
              />
              <span
                className={`text-[13.5px] ${
                  done
                    ? 'text-[var(--lp-dark)] font-medium'
                    : active
                      ? 'text-[var(--lp-dark)]'
                      : 'text-[var(--lp-text-muted)]'
                }`}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function ActionPanel({
  stage,
  viewerIsBuyer,
  viewerIsSeller,
  firstPct,
  busy,
  deal,
  now,
  deliveryProof,
  onDeliveryProofChange,
  onAccept,
  onMarkDelivered,
  onRelease,
  onStillReviewing,
  onAppeal,
  onCancel,
}: {
  stage: DealStage;
  viewerIsBuyer: boolean;
  viewerIsSeller: boolean;
  firstPct: number;
  busy: boolean;
  deal: DirectDeal;
  now: number;
  deliveryProof: string;
  onDeliveryProofChange: (v: string) => void;
  onAccept: () => void;
  onMarkDelivered: () => void;
  onRelease: () => void;
  onStillReviewing: () => void;
  onAppeal: () => void;
  onCancel: () => void;
}) {
  if (stage === 'settled') {
    return (
      <Body>
        {deal.autoReleasedAt
          ? 'Settled. The review window passed, so the final milestone released automatically. Reputation is recorded on chain.'
          : 'Settled. The seller has been paid in full and reputation is recorded on chain.'}
      </Body>
    );
  }
  if (stage === 'cancelled') {
    // Detect whether any portion was already paid to the seller before the
    // cancel. `reviewWindowStartedAt` is set when the first milestone
    // releases (manual or auto), so its presence means the seller has
    // already received `firstReleasePct`% of the deal. The on-chain refund()
    // only returns the UNRELEASED remainder, so the copy needs to be
    // state-aware — "refunded in full" is a lie post-first-release.
    const firstReleased = !!deal.reviewWindowStartedAt;
    const firstPct = deal.firstReleasePct;
    const remainPct = 100 - firstPct;

    const body = (() => {
      // pre-accept / no funding ever happened
      if (deal.cancelKind === 'pre-accept' || (!deal.fundTxHash && !deal.cancelKind)) {
        return 'Cancelled. The buyer withdrew before the seller accepted, so no escrow was funded.';
      }

      // unilateral buyer cancel after deadline (no milestone was ever released
      // since the seller never delivered).
      if (deal.cancelKind === 'unilateral') {
        return 'Cancelled. The deadline passed without delivery, so the escrow was refunded to the buyer in full.';
      }

      // Mutual / platform-attributed branches. Two cases based on prior release.
      const wording =
        deal.cancelKind === 'platform-attributed'
          ? 'Closed as a platform misroute by mutual agreement.'
          : 'Closed by mutual agreement after an appeal.';

      if (firstReleased) {
        return `${wording} The first ${firstPct}% had already been released to the seller, so the remaining ${remainPct}% was refunded to the buyer. Reputation unaffected on either side.`;
      }
      return `${wording} No milestones had been released yet, so the full escrow was refunded to the buyer. Reputation unaffected on either side.`;
    })();
    return (
      <div className="space-y-2">
        <Body>{body}</Body>
        {deal.cancelReason && (deal.cancelKind === 'mutual' || deal.cancelKind === 'platform-attributed') && (
          <div className="mt-1">
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/45">
              [:REASON:]
            </p>
            <p className="mt-1 text-[13px] text-white/70 leading-relaxed whitespace-pre-wrap">
              {deal.cancelReason}
            </p>
          </div>
        )}
      </div>
    );
  }
  if (stage === 'disputed') {
    return (
      <Body tone="critical">
        This deal is in dispute. The escrow is frozen on chain so neither party can
        move funds unilaterally. Either side can still propose a mutual cancel
        below. If the counterparty accepts, the escrow refunds the buyer in full
        and the deal closes with no reputation hit.
      </Body>
    );
  }

  if (stage === 'awaiting-acceptance') {
    if (viewerIsSeller) {
      // v2.D insurance reservation: 50% of deal value locks against the
      // seller's free vault stake on accept. Surface the exact number so
      // the seller knows what'll be locked before they click. The number
      // is computed off `deal.dealAmountUsdc` × the protocol's
      // reservationBps; the value 50% is hardcoded here as a hint —
      // the contract is the source of truth and will revert with
      // InsufficientStake if the seller's free stake doesn't cover it.
      const RESERVATION_PCT = 50;
      const reservedAmount = (
        (Number(deal.dealAmountUsdc) * RESERVATION_PCT) /
        100
      ).toFixed(2);
      return (
        <div className="space-y-4">
          <Body>
            Review terms and the funding split. Accepting agrees to deliver on these terms and
            funds the escrow.
          </Body>
          <div
            className="px-3 py-2 mono text-[11px] leading-snug"
            style={{
              background: 'color-mix(in oklab, var(--lp-accent) 10%, transparent)',
              borderLeft: '2px solid var(--lp-accent)',
              color: 'var(--lp-band-dark)',
            }}
          >
            On accept,{' '}
            <span className="font-bold tabular-nums">{reservedAmount} USDC</span>{' '}
            ({RESERVATION_PCT}% of {deal.dealAmountUsdc}) reserves from your
            stake as buyer-side deal insurance. It releases back when the
            deal settles, or slashes to the buyer if you lose a dispute.
          </div>
          <CTAPill disabled={busy} onClick={onAccept}>
            {busy ? 'Confirming on Arc…' : 'Accept deal'}
          </CTAPill>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <Body>
          Waiting for the seller to accept. Nothing is funded yet. You can cancel anytime until
          they accept.
        </Body>
        <CTAPill variant="secondary" tone="dark" onClick={onCancel} disabled={busy}>
          {busy ? 'Working…' : 'Cancel deal'}
        </CTAPill>
      </div>
    );
  }

  if (stage === 'awaiting-delivery') {
    if (viewerIsSeller) {
      return (
        <div className="space-y-4">
          <Body>
            Mark the work delivered when it&apos;s done. The buyer then releases the first{' '}
            {firstPct}%, and the rest once verified.
          </Body>
          <label className="block space-y-1.5">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-white/55">
              [:DELIVERY PROOF. OPTIONAL:]
            </span>
            <textarea
              value={deliveryProof}
              onChange={(e) => onDeliveryProofChange(e.target.value)}
              rows={3}
              placeholder="Link to the deliverable, a repo, a file, or a short note."
              className="w-full bg-white/[0.04] text-white placeholder:text-white/30 px-3.5 py-2.5 text-[13px] leading-relaxed border border-white/10 focus:outline-none focus:border-[var(--lp-accent)] focus:shadow-[0_0_0_3px_rgba(175, 201, 91,0.25)] resize-none transition-shadow"
              style={{
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            />
          </label>
          <CTAPill disabled={busy} onClick={onMarkDelivered}>
            {busy ? 'Confirming on Arc…' : 'Mark delivered'}
          </CTAPill>
        </div>
      );
    }
    const deadlinePassed = now > deal.deadlineUnix * 1000;
    return (
      <div className="space-y-4">
        <Body>
          Seller accepted. Waiting for delivery.
          {!deadlinePassed && ' If they miss the deadline, you can cancel and reclaim funds.'}
        </Body>
        {deadlinePassed && (
          <>
            <WindowNote tone="warning">
              Deadline passed without delivery. Cancel to reclaim the full escrow.
            </WindowNote>
            <CTAPill variant="secondary" tone="dark" onClick={onCancel} disabled={busy}>
              {busy ? 'Working…' : 'Cancel & reclaim funds'}
            </CTAPill>
          </>
        )}
      </div>
    );
  }

  const windowMs = deal.reviewWindowMs ?? REVIEW_WINDOW_MS;

  if (stage === 'awaiting-first-release') {
    const endsAt = deal.deliveredAt ? deal.deliveredAt + windowMs : null;
    const msLeft = endsAt ? endsAt - now : 0;
    const open = endsAt != null && msLeft > 0;
    const expired = endsAt != null && msLeft <= 0;

    if (viewerIsBuyer) {
      return (
        <div className="space-y-4">
          <Body>
            Seller marked delivered. Release the first {firstPct}% now. The remaining{' '}
            {100 - firstPct}% releases once you verify.
          </Body>
          {open && (
            <WindowNote tone="warning">
              Auto-releases the first {firstPct}% in{' '}
              <span className="mono font-semibold">{fmtCountdown(msLeft)}</span> if you don&apos;t
              act.
            </WindowNote>
          )}
          {expired && (
            <WindowNote tone="muted">
              Release window passed. The agent will release the first {firstPct}% shortly unless
              you act now.
            </WindowNote>
          )}
          <div className="flex flex-wrap gap-2">
            <CTAPill disabled={busy} onClick={onRelease}>
              {busy ? 'Confirming on Arc…' : `Release first ${firstPct}%`}
            </CTAPill>
            <CTAPill variant="secondary" tone="dark" onClick={onAppeal} disabled={busy}>
              Appeal this deal
            </CTAPill>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <Body>Delivered. Waiting for the buyer to release the first {firstPct}%.</Body>
        {open && (
          <WindowNote tone="muted">
            Buyer window:{' '}
            <span className="mono font-semibold">{fmtCountdown(msLeft)}</span> left. If it
            passes, the first {firstPct}% releases automatically.
          </WindowNote>
        )}
        {expired && (
          <WindowNote tone="muted">
            Window passed. The agent will release the first {firstPct}% to you shortly.
          </WindowNote>
        )}
      </div>
    );
  }

  const rest = 100 - firstPct;
  const extensionMs = deal.reviewExtensionMs ?? 0;
  const extensionCount = deal.reviewExtensionCount ?? 0;
  const canExtend = extensionCount < MAX_REVIEW_EXTENSIONS;
  const extensionMins = Math.round(REVIEW_EXTENSION_MS / 60000);
  const windowEndsAt = deal.reviewWindowStartedAt
    ? deal.reviewWindowStartedAt + windowMs + extensionMs
    : null;
  const msLeft = windowEndsAt ? windowEndsAt - now : 0;
  const windowOpen = windowEndsAt != null && msLeft > 0;
  const windowExpired = windowEndsAt != null && msLeft <= 0;
  const baseWindowPassed = deal.reviewWindowStartedAt
    ? now > deal.reviewWindowStartedAt + windowMs
    : false;

  if (viewerIsBuyer) {
    return (
      <div className="space-y-4">
        <Body>
          First {firstPct}% released. Verify and release the remaining {rest}% to settle.
        </Body>
        {windowOpen && (
          <WindowNote tone="warning">
            Auto-releases the final {rest}% in{' '}
            <span className="mono font-semibold">{fmtCountdown(msLeft)}</span> if you don&apos;t
            act.
            {canExtend
              ? ` "Still reviewing" adds ${extensionMins} min.`
              : ' All extensions used.'}
            {extensionCount > 0 &&
              ` (${extensionCount} extension${extensionCount > 1 ? 's' : ''} used)`}
          </WindowNote>
        )}
        {windowExpired && (
          <WindowNote tone="muted">
            Review window passed. The agent will auto-release the final {rest}% shortly unless
            you release now.
          </WindowNote>
        )}
        <div className="flex flex-wrap gap-2">
          <CTAPill disabled={busy} onClick={onRelease}>
            {busy ? 'Confirming on Arc…' : `Verify & release final ${rest}%`}
          </CTAPill>
          {windowOpen && canExtend && (
            <CTAPill variant="secondary" tone="dark" onClick={onStillReviewing} disabled={busy}>
              Still reviewing (+{extensionMins} min)
            </CTAPill>
          )}
          <CTAPill variant="secondary" tone="dark" onClick={onAppeal} disabled={busy}>
            Appeal this deal
          </CTAPill>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Body>
        First {firstPct}% released. Waiting for the buyer to verify and release the final{' '}
        {rest}%.
      </Body>
      {windowOpen && !baseWindowPassed && (
        <WindowNote tone="muted">
          Buyer window:{' '}
          <span className="mono font-semibold">{fmtCountdown(msLeft)}</span> left.
        </WindowNote>
      )}
      {baseWindowPassed && (
        <div className="space-y-3">
          <WindowNote tone="warning">
            {windowExpired
              ? `Review window passed. The agent will auto-release the final ${rest}% to you shortly.`
              : `Buyer extended the window (${fmtCountdown(msLeft)} left). Wait or appeal to move to dispute.`}
          </WindowNote>
          <CTAPill variant="secondary" tone="dark" onClick={onAppeal} disabled={busy}>
            Appeal this deal
          </CTAPill>
        </div>
      )}
    </div>
  );
}

function Body({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: 'critical';
}) {
  const color = tone === 'critical' ? '#ff8a7a' : 'rgba(255,255,255,0.7)';
  return (
    <p className="text-[14px] leading-relaxed" style={{ color }}>
      {children}
    </p>
  );
}

function WindowNote({
  tone,
  children,
}: {
  tone: 'warning' | 'muted';
  children: ReactNode;
}) {
  const style =
    tone === 'warning'
      ? {
          background: 'rgba(175, 201, 91,0.10)',
          color: 'var(--lp-accent)',
          border: '1px solid rgba(175, 201, 91,0.30)',
        }
      : {
          background: 'var(--surface-1)',
          color: 'rgba(255,255,255,0.65)',
          border: '1px solid rgba(255,255,255,0.08)',
        };
  return (
    <p
      className="text-[12.5px] leading-snug px-3 py-2.5"
      style={{
        ...style,
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 3,
      }}
    >
      {children}
    </p>
  );
}

function AcceptConsentModal({
  busy,
  onConfirm,
  onClose,
}: {
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
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
        className="w-full max-w-md overflow-hidden"
        style={{
          background: 'var(--lp-card)',
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
            [:CIRCLE WALLETS:]
          </span>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-tight text-[var(--lp-dark)]">
            An agent wallet will be created
            <span style={{ color: 'var(--lp-accent)' }}>.</span>
          </h2>
        </div>
        <div className="px-6 pb-6 space-y-5">
          <p className="text-[14px] text-[var(--lp-text-sub)] leading-relaxed">
            Accepting provisions a Circle agent wallet pair tied to your wallet. Buyer escrow
            funds against it. Your seller agent receives payouts. One-time setup.
          </p>
          <div className="flex items-center gap-3">
            <CTAPill onClick={onConfirm} disabled={busy}>
              {busy ? 'Working…' : 'Proceed & accept'}
            </CTAPill>
            <CTAPill variant="secondary" tone="light" onClick={onClose} disabled={busy}>
              Not now
            </CTAPill>
          </div>
        </div>
      </div>
    </div>
  );
}

function CancelProposalBanner({
  proposal,
  viewerIsCounterparty,
  viewerIsProposer,
  busy,
  firstReleased,
  firstReleasePct,
  onAccept,
  onDecline,
}: {
  proposal: NonNullable<DirectDeal['cancellationProposal']>;
  viewerIsCounterparty: boolean;
  viewerIsProposer: boolean;
  busy: boolean;
  firstReleased: boolean;
  firstReleasePct: number;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const remainPct = 100 - firstReleasePct;
  const kindLabel =
    proposal.kind === 'platform-attributed' ? 'PLATFORM MISROUTE' : 'MUTUAL CANCEL';
  return (
    <div
      className="overflow-hidden"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-accent)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
        boxShadow: '0 1px 0 rgba(175, 201, 91,0.20)',
      }}
    >
      <div
        className="flex items-center gap-1.5 px-3 py-1.5"
        style={{ background: 'var(--lp-accent)' }}
      >
        <span aria-hidden className="inline-block w-[5px] h-[5px] bg-[var(--lp-band-dark)]" />
        <span className="mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--lp-dark)]">
          {kindLabel} PROPOSED
        </span>
        <span className="ml-auto mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-dark)]/70">
          BY {proposal.proposedBy.toUpperCase()}
        </span>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:REASON:]
        </p>
        <p className="text-[13px] leading-relaxed text-[var(--lp-dark)] whitespace-pre-wrap">
          {proposal.reason}
        </p>
        <p className="text-[12px] leading-relaxed text-[var(--lp-text-sub)]">
          {(() => {
            const prefix =
              proposal.kind === 'platform-attributed'
                ? 'Both sides agree the agent misrouted.'
                : 'No reputation hit on either side if accepted.';
            const outcome = firstReleased
              ? `The first ${firstReleasePct}% has already been released to the seller; accepting refunds the remaining ${remainPct}% to the buyer.`
              : 'Accepting refunds the full escrow to the buyer.';
            return `${prefix} ${outcome}`;
          })()}
        </p>
        {viewerIsCounterparty && (
          <div className="pt-2 flex flex-wrap items-center gap-2">
            <CTAPill onClick={onAccept} disabled={busy}>
              {/* Both buttons trigger the SAME on-chain action — refund() —
                  because v1's escrow has no Disputed-to-Settled transition.
                  v2.D (B.2) adds releaseFromDispute() and then we can
                  distinguish the two outcomes. Until then, label honestly. */}
              {busy ? 'Confirming…' : 'Accept & refund'}
            </CTAPill>
            <CTAPill variant="secondary" tone="light" onClick={onDecline} disabled={busy}>
              Decline · keep the deal
            </CTAPill>
          </div>
        )}
        {viewerIsProposer && (
          <p className="pt-2 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            Waiting on counterparty to accept or decline.
          </p>
        )}
      </div>
    </div>
  );
}

function ProposeCancelModal({
  busy,
  firstReleased,
  firstReleasePct,
  onConfirm,
  onClose,
}: {
  busy: boolean;
  firstReleased: boolean;
  firstReleasePct: number;
  onConfirm: (reason: string, kind: 'mutual' | 'platform-attributed') => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [kind, setKind] = useState<'mutual' | 'platform-attributed'>('mutual');
  const valid = reason.trim().length >= 3;
  const remainPct = 100 - firstReleasePct;
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
        className="w-full max-w-md overflow-hidden"
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
            [:PROPOSE CANCELLATION:]
          </span>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-tight">
            Call it off
            <span style={{ color: 'var(--lp-accent)' }}>.</span>
          </h2>
        </div>
        <div className="px-6 pb-6 space-y-5">
          <p className="text-[13.5px] text-[var(--lp-text-sub)] leading-relaxed">
            Your counterparty has to agree. If they accept,{' '}
            {firstReleased
              ? `the first ${firstReleasePct}% already paid stays with the seller and the remaining ${remainPct}% refunds to the buyer`
              : 'the full escrow refunds to the buyer'}
            , with no reputation hit on either side. If they decline, the deal continues normally.
          </p>

          <div className="space-y-2">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:KIND:]
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: 'mutual', label: 'Mutual', body: "We've both decided to walk." },
                  {
                    key: 'platform-attributed',
                    label: 'Platform misroute',
                    body: 'The agent matched us wrong.',
                  },
                ] as const
              ).map((opt) => {
                const active = kind === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setKind(opt.key)}
                    className="relative overflow-hidden text-left p-3 transition-colors"
                    style={{
                      background: active ? 'rgba(175, 201, 91,0.10)' : 'var(--lp-card)',
                      color: 'var(--lp-dark)',
                      border: active
                        ? '1px solid var(--lp-accent)'
                        : '1px solid var(--lp-border-light)',
                      borderTopLeftRadius: 10,
                      borderTopRightRadius: 10,
                      borderBottomLeftRadius: 10,
                      borderBottomRightRadius: 3,
                    }}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-0 bottom-0 w-[3px]"
                        style={{ background: 'var(--lp-accent)' }}
                      />
                    )}
                    <p className="mono text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--lp-dark)]">
                      {opt.label}
                    </p>
                    <p className="mt-1 text-[12px] text-[var(--lp-text-sub)] leading-snug">
                      {opt.body}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block space-y-2">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:REASON:]
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Plain language. The other side reads this in their banner."
              className="form-input form-textarea"
            />
          </label>

          <div className="flex items-center gap-3">
            <CTAPill onClick={() => onConfirm(reason.trim(), kind)} disabled={busy || !valid}>
              {busy ? 'Proposing…' : 'Send proposal'}
            </CTAPill>
            <CTAPill variant="secondary" tone="light" onClick={onClose} disabled={busy}>
              Not now
            </CTAPill>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M5.5 4.5h6v6M11 5l-6.5 6.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DealErrorNote({
  info,
  viewerIsBuyer,
}: {
  info: { code?: string; message: string };
  viewerIsBuyer: boolean;
}) {
  const wrap = (children: ReactNode) => (
    <div
      className="px-3.5 py-3 text-[12.5px] leading-snug"
      style={{
        background: 'rgba(176, 61, 58, 0.12)',
        color: '#ff8a7a',
        border: '1px solid rgba(176, 61, 58, 0.35)',
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 3,
      }}
    >
      {children}
    </div>
  );

  if (info.code === 'INSUFFICIENT_AGENT_BALANCE') {
    return wrap(
      <div className="space-y-1.5">
        <p className="font-medium">Buyer agent doesn&apos;t have enough USDC on Arc.</p>
        {viewerIsBuyer ? (
          <p className="text-[11px] opacity-90">
            Top up the buyer agent from your profile, then the seller can accept.{' '}
            <Link href="/profile" className="underline font-medium">
              Fund agent
            </Link>
          </p>
        ) : (
          <p className="text-[11px] opacity-90">
            The buyer has been notified. Try accepting again once funded.
          </p>
        )}
      </div>,
    );
  }
  if (info.code === 'INSUFFICIENT_AGENT_GAS') {
    return wrap(
      <p className="font-medium">
        The buyer agent doesn&apos;t have enough native gas on Arc to send this transaction.
      </p>,
    );
  }
  if (info.code === 'INSUFFICIENT_STAKE') {
    // v2.D: seller agent's free stake is below the insurance reservation.
    // Surface a clear "stake more" CTA. Only seller sees this — the buyer
    // never triggers the accept call.
    return wrap(
      <div className="space-y-1.5">
        <p className="font-medium">
          Your seller agent doesn&apos;t have enough free stake to backstop
          this deal.
        </p>
        <p className="text-[11px] opacity-90">{info.message}</p>
        <p className="text-[11px] opacity-90">
          <Link href="/stake" className="underline font-medium">
            Stake more
          </Link>
          {' '}then return here to accept.
        </p>
      </div>,
    );
  }
  if (info.code === 'ACCEPT_ESCROW_FAILED') {
    return wrap(
      <div className="space-y-1.5">
        <p className="font-medium">Could not accept the escrow on chain.</p>
        <p className="text-[11px] opacity-90">{info.message}</p>
      </div>,
    );
  }
  return wrap(info.message);
}
