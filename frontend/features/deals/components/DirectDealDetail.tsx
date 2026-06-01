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
import { ExtensionRequestModal } from './ExtensionRequestModal';
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

  // Notifications append #action when they want the user to land on the action
  // card (e.g. "Match accepted, deliver when ready"). Scroll once the deal data
  // is on the page so the section is sized and the anchor lands cleanly.
  useEffect(() => {
    if (typeof window === 'undefined' || !deal) return;
    if (window.location.hash !== '#action') return;
    const el = document.getElementById('action');
    if (!el) return;
    // Defer one frame so layout settles after data hydration.
    const id = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [deal]);
  const [deliveryProof, setDeliveryProof] = useState('');
  const [showAcceptConsent, setShowAcceptConsent] = useState(false);
  // Optional pre-filled chat draft, used by a couple of softer surfaces. The
  // formal extension flow no longer touches it; this stays for future hooks.
  const [chatDraftSeed] = useState<string | undefined>(undefined);
  const [chatDraftSeedKey] = useState(0);
  // Real extension flow: modal opens from the seller's awaiting-delivery panel.
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  function onRequestExtension() {
    setShowExtensionModal(true);
  }
  async function onRespondExtension(decision: 'approved' | 'declined') {
    if (!deal || !address) return;
    setBusy(true);
    setErrorInfo(null);
    try {
      await api.respondExtension({ jobId, caller: address, decision });
      await refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      const message =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setErrorInfo({ code, message });
    } finally {
      setBusy(false);
    }
  }
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

  async function onRaiseDelayAppeal() {
    if (!address) return;
    setBusy(true);
    setErrorInfo(null);
    try {
      await api.raiseDelayAppeal(jobId, address);
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

  async function onRespondToDelayAppeal(reason: string) {
    if (!address) return;
    setBusy(true);
    setErrorInfo(null);
    try {
      await api.respondToDelayAppeal(jobId, address, reason);
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
    !proposal &&
    proposableStages.includes(stage) &&
    viewerRole !== null &&
    !deal.cancelledAt &&
    // Legacy-escrow deals can only be cancelled / refunded from the /legacy
    // recovery surface; the v2.D cancel/accept route calls dispute() + refund()
    // on the current escrow contract, which doesn't hold this deal's funds and
    // reverts InvalidState. The banner above already points users to /legacy.
    !deal.legacyEscrow;

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
                {deal.deadlineUnix
                  ? `Deadline ${relativeTime(deal.deadlineUnix * 1000)}`
                  : 'No delivery deadline'}
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
            id="action"
            data-guide="deal-actions"
            className="overflow-hidden p-6 md:p-7"
            style={{
              background: 'var(--surface-1)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderBottomLeftRadius: 22,
              borderBottomRightRadius: 5,
              scrollMarginTop: 96,
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
                  legacyEscrow={!!deal.legacyEscrow}
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
              onRaiseDelayAppeal={onRaiseDelayAppeal}
              onRespondToDelayAppeal={onRespondToDelayAppeal}
              onRequestExtension={onRequestExtension}
              onRespondExtension={onRespondExtension}
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
                draftSeed={chatDraftSeed}
                draftSeedKey={chatDraftSeedKey}
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

      {showExtensionModal && address && (
        <ExtensionRequestModal
          jobId={jobId}
          callerAddress={address}
          onClose={() => setShowExtensionModal(false)}
          onSubmitted={() => {
            void refresh();
          }}
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
  onRaiseDelayAppeal,
  onRespondToDelayAppeal,
  onRequestExtension,
  onRespondExtension,
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
  onRaiseDelayAppeal: () => void;
  onRespondToDelayAppeal: (reason: string) => void;
  onRequestExtension: () => void;
  onRespondExtension: (decision: 'approved' | 'declined') => void;
}) {
  if (stage === 'settled') {
    return (
      <div className="space-y-4">
        <Body>
          {deal.autoReleasedAt
            ? 'Settled. The review window passed, so the final milestone released automatically. Reputation is recorded on chain.'
            : 'Settled. The seller has been paid in full and reputation is recorded on chain.'}
        </Body>
        {viewerIsSeller && (
          <Link href={`/cashout/${deal.jobId}`}>
            <CTAPill>Cash out {formatUsdc(deal.dealAmountUsdc)} USDC →</CTAPill>
          </Link>
        )}
      </div>
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
      // Stake messaging is shown only on trusted-match deals. The per-deal
      // requireStakePct is what the buyer picked on the slider (50..100, in 5%
      // steps); fall back to 50 for older deals stored before the slider
      // shipped. The v2.E escrow honours this exact percentage at acceptEscrow
      // via the per-deal reservationBps stored at fund time.
      const RESERVATION_PCT = deal.requireStakePct ?? 50;
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
          <AcceptanceCountdown deal={deal} now={now} viewerIsSeller />
          {deal.requireStake && (
            <div
              className="px-3 py-2 mono text-[11px] leading-snug"
              style={{
                background: 'color-mix(in oklab, var(--lp-accent) 10%, transparent)',
                borderLeft: '2px solid var(--lp-accent)',
                color: 'var(--lp-band-dark)',
              }}
            >
              Trusted match. You need{' '}
              <span className="font-bold tabular-nums">{reservedAmount} USDC</span>{' '}
              free in your stake to accept ({RESERVATION_PCT}% of {deal.dealAmountUsdc}).
              It releases back when the deal settles, or slashes to the buyer if
              you lose a dispute.
            </div>
          )}
          <CTAPill disabled={busy} onClick={onAccept}>
            {busy ? 'Confirming on Arc…' : 'Accept deal'}
          </CTAPill>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <Body>
          {deal.pendingCounterparty
            ? `Waiting for ${deal.pendingCounterparty.email} to claim the invite link. Nothing is funded yet.`
            : 'Waiting for the seller to accept. Nothing is funded yet. You can cancel anytime until they accept.'}
        </Body>
        {deal.pendingCounterparty && (
          <PendingInviteCopy
            token={deal.pendingCounterparty.inviteToken}
            email={deal.pendingCounterparty.email}
          />
        )}
        <AcceptanceCountdown deal={deal} now={now} viewerIsSeller={false} />
        <CTAPill variant="secondary" tone="dark" onClick={onCancel} disabled={busy}>
          {busy ? 'Working…' : 'Cancel deal'}
        </CTAPill>
      </div>
    );
  }

  if (stage === 'awaiting-delivery') {
    const ext = deal.extensionRequest;
    const extPendingForSeller = !!ext;
    if (viewerIsSeller) {
      return (
        <div className="space-y-4">
          {extPendingForSeller && ext && (
            <ExtensionPendingNote
              additionalSeconds={ext.additionalSeconds}
              reason={ext.reason}
              tone="dark"
              role="seller"
            />
          )}
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
          <div className="flex flex-wrap gap-2">
            <CTAPill disabled={busy} onClick={onMarkDelivered}>
              {busy ? 'Confirming on Arc…' : 'Mark delivered'}
            </CTAPill>
            <span
              title={
                extPendingForSeller
                  ? 'Already requested. Waiting on the buyer.'
                  : 'Ask the buyer for more time.'
              }
            >
              <CTAPill
                variant="secondary"
                tone="dark"
                onClick={onRequestExtension}
                disabled={busy || extPendingForSeller}
              >
                {extPendingForSeller ? 'Extension pending' : 'Request extension'}
              </CTAPill>
            </span>
          </div>
        </div>
      );
    }
    const hasDeadline = !!deal.deadlineUnix;
    const deadlinePassed = hasDeadline && now > (deal.deadlineUnix as number) * 1000;
    return (
      <div className="space-y-4">
        {ext && (
          <ExtensionBuyerBanner
            additionalSeconds={ext.additionalSeconds}
            reason={ext.reason}
            currentDeadlineUnix={deal.deadlineUnix}
            busy={busy}
            onApprove={() => onRespondExtension('approved')}
            onDecline={() => onRespondExtension('declined')}
          />
        )}
        <Body>
          Seller accepted. Waiting for delivery.
          {!hasDeadline &&
            ' No delivery deadline was set on this deal, so the seller can deliver whenever. Propose a mutual cancellation or open an appeal if you need to call it off.'}
          {hasDeadline && !deadlinePassed && ' If they miss the deadline, you can cancel and reclaim funds.'}
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
  const delayGraceMs = deal.delayAppealGraceMs ?? 3_600_000;
  const delayResponseMs = deal.delayAppealResponseWindowMs ?? 300_000;
  const delayGraceEndsAt = deal.reviewWindowStartedAt
    ? deal.reviewWindowStartedAt + delayGraceMs
    : null;
  const graceOpen = delayGraceEndsAt != null && now < delayGraceEndsAt;
  const sellerCanAppeal = delayGraceEndsAt != null && now >= delayGraceEndsAt;
  const appealOpen =
    !!deal.delayAppealRaisedAt &&
    (deal.delayAppealRaisedAt ?? 0) > (deal.delayAppealRespondedAt ?? 0);
  const responseDeadline = appealOpen ? (deal.delayAppealRaisedAt ?? 0) + delayResponseMs : null;
  const responseMsLeft = responseDeadline ? responseDeadline - now : 0;
  const responseExpired = responseDeadline != null && responseMsLeft <= 0;

  if (viewerIsBuyer) {
    return (
      <div className="space-y-4">
        <Body>
          First {firstPct}% released. Verify and release the remaining {rest}% to settle.
        </Body>
        {appealOpen && !responseExpired && (
          <DelayAppealResponder
            msLeft={responseMsLeft}
            rest={rest}
            busy={busy}
            onRespond={onRespondToDelayAppeal}
          />
        )}
        {appealOpen && responseExpired && (
          <WindowNote tone="warning">
            Response window passed. The agent will auto-release the final {rest}% to the seller shortly.
          </WindowNote>
        )}
        {!appealOpen && (
          <WindowNote tone="muted">
            Take your time. The final {rest}% never releases automatically. Click below to verify and release once you&apos;ve checked the work. If you stall too long the seller can raise a delay appeal.
          </WindowNote>
        )}
        <div className="flex flex-wrap gap-2">
          <CTAPill disabled={busy} onClick={onRelease}>
            {busy ? 'Confirming on Arc…' : `Verify & release final ${rest}%`}
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
      <Body>
        First {firstPct}% released. Waiting for the buyer to verify and release the final{' '}
        {rest}%.
      </Body>
      {appealOpen && !responseExpired && (
        <WindowNote tone="warning">
          Delay appeal raised. Buyer has{' '}
          <span className="mono font-semibold">{fmtCountdown(responseMsLeft)}</span> to respond. If they
          don&apos;t, the final {rest}% auto-releases to you.
        </WindowNote>
      )}
      {appealOpen && responseExpired && (
        <WindowNote tone="warning">
          Response window passed. The agent will release the final {rest}% to you shortly.
        </WindowNote>
      )}
      {!appealOpen && deal.delayAppealRespondedAt && deal.delayAppealResponse && (
        <div className="space-y-2">
          <WindowNote tone="muted">
            Buyer responded to your last delay appeal:
          </WindowNote>
          <p className="text-[13px] leading-relaxed text-white/75 px-3 py-2.5 border border-white/[0.08] rounded-[4px]">
            “{deal.delayAppealResponse}”
          </p>
        </div>
      )}
      {!appealOpen && graceOpen && delayGraceEndsAt != null && (
        <WindowNote tone="muted">
          Buyer is reviewing. You can raise a delay appeal in{' '}
          <span className="mono font-semibold">{fmtCountdown(delayGraceEndsAt - now)}</span> if they
          don&apos;t release.
        </WindowNote>
      )}
      {!appealOpen && sellerCanAppeal && (
        <div className="flex flex-wrap gap-2">
          <CTAPill onClick={onRaiseDelayAppeal} disabled={busy}>
            {busy ? 'Submitting…' : 'Raise delay appeal'}
          </CTAPill>
          <CTAPill variant="secondary" tone="dark" onClick={onAppeal} disabled={busy}>
            Open dispute instead
          </CTAPill>
        </div>
      )}
    </div>
  );
}

function DelayAppealResponder({
  msLeft,
  rest,
  busy,
  onRespond,
}: {
  msLeft: number;
  rest: number;
  busy: boolean;
  onRespond: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const canSubmit = reason.trim().length > 0 && !busy;
  return (
    <div className="space-y-3 p-4 border border-[rgba(239,127,99,0.35)]" style={{ background: 'rgba(239,127,99,0.08)', borderRadius: 4 }}>
      <div className="space-y-1">
        <p className="mono text-[10px] uppercase tracking-[0.14em]" style={{ color: '#ef7f63' }}>
          [:SELLER RAISED A DELAY APPEAL:]
        </p>
        <p className="text-[13px] leading-relaxed text-white/85">
          Reply with a reason in{' '}
          <span className="mono font-semibold">{fmtCountdown(msLeft)}</span> or the final {rest}% releases automatically.
        </p>
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why are you still reviewing? Be specific."
        rows={3}
        className="w-full bg-black/30 border border-white/[0.12] rounded-[3px] px-3 py-2 text-[13px] text-white placeholder:text-white/35 focus:outline-none focus:border-[rgba(239,127,99,0.6)]"
      />
      <CTAPill onClick={() => onRespond(reason.trim())} disabled={!canSubmit}>
        {busy ? 'Submitting…' : 'Respond to appeal'}
      </CTAPill>
    </div>
  );
}

function PendingInviteCopy({ token, email }: { token: string; email: string }) {
  const [copied, setCopied] = useState(false);
  const inviteUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/invite/${token}` : `/invite/${token}`;
  return (
    <div
      className="space-y-2 p-3"
      style={{
        background: 'rgba(175, 201, 91, 0.10)',
        border: '1px solid rgba(175, 201, 91, 0.30)',
        borderRadius: 4,
      }}
    >
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/55">
        [:SHARE THE INVITE:]
      </p>
      <p className="text-[12.5px] leading-snug text-white/75">
        Send {email} this link. They open it, verify the email, and the deal binds to their wallet.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={inviteUrl}
          readOnly
          className="flex-1 min-w-0 bg-black/30 border border-white/[0.12] rounded-[3px] px-2.5 py-1.5 text-[12px] mono text-white"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(inviteUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              // user can still select+copy manually
            }
          }}
          className="px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.1em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors"
          style={{
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 2,
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function AcceptanceCountdown({
  deal,
  now,
  viewerIsSeller,
}: {
  deal: DirectDeal;
  now: number;
  viewerIsSeller: boolean;
}) {
  if (!deal.acceptanceDeadlineUnix) return null;
  const deadlineMs = deal.acceptanceDeadlineUnix * 1000;
  const msLeft = deadlineMs - now;
  const open = msLeft > 0;
  if (open) {
    return (
      <WindowNote tone="warning">
        {viewerIsSeller
          ? 'You have'
          : "Seller's window:"}{' '}
        <span className="mono font-semibold">{fmtCountdown(msLeft)}</span>{' '}
        {viewerIsSeller
          ? 'to accept before the deal auto-expires.'
          : 'before the deal auto-expires (pre-accept, no rep hit).'}
      </WindowNote>
    );
  }
  return (
    <WindowNote tone="muted">
      Acceptance window passed. The agent will mark this deal cancelled (pre-accept) on the next tick.
    </WindowNote>
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

function formatExtensionDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  if (days >= 1) {
    const rem = seconds - days * 86400;
    if (rem === 0) return `${days} day${days === 1 ? '' : 's'}`;
  }
  const hours = Math.round(seconds / 3600);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/// Seller-side note shown above the deliver form when the buyer has an
/// open extension request to act on. Quiet so it doesn't compete with the
/// primary action.
function ExtensionPendingNote({
  additionalSeconds,
  reason,
  tone,
}: {
  additionalSeconds: number;
  reason?: string;
  tone: 'dark' | 'light';
  role: 'seller';
}) {
  const isDark = tone === 'dark';
  return (
    <div
      className="px-3.5 py-2.5"
      style={{
        background: isDark ? 'rgba(255,255,255,0.05)' : 'var(--lp-light)',
        color: isDark ? 'rgba(255,255,255,0.78)' : 'var(--lp-text-sub)',
        border: isDark ? '1px solid rgba(255,255,255,0.10)' : '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 3,
      }}
    >
      <p className="mono text-[10px] uppercase tracking-[0.18em] opacity-70">
        [:EXTENSION REQUEST PENDING:]
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed">
        You asked the buyer for{' '}
        <span className="font-semibold">+{formatExtensionDuration(additionalSeconds)}</span>.
        {reason ? ` Reason: ${reason}` : ''}
      </p>
    </div>
  );
}

/// Buyer-side banner with Approve / Decline. Lives at the top of the
/// awaiting-delivery action panel; clearing the request (either decision)
/// returns the deal to its normal awaiting-delivery state.
function ExtensionBuyerBanner({
  additionalSeconds,
  reason,
  currentDeadlineUnix,
  busy,
  onApprove,
  onDecline,
}: {
  additionalSeconds: number;
  reason?: string;
  currentDeadlineUnix?: number;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const newDeadline =
    currentDeadlineUnix != null ? currentDeadlineUnix + additionalSeconds : null;
  const newDeadlineLabel = newDeadline ? new Date(newDeadline * 1000).toLocaleString() : null;
  return (
    <div
      className="px-4 py-3.5"
      style={{
        background: 'rgba(175, 201, 91,0.10)',
        border: '1px solid rgba(175, 201, 91,0.32)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-accent)]">
        [:SELLER ASKED FOR MORE TIME:]
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-white">
        Seller is requesting{' '}
        <span className="font-semibold">+{formatExtensionDuration(additionalSeconds)}</span>{' '}
        to deliver.
        {reason ? <> Reason: <span className="opacity-80">{reason}</span></> : null}
      </p>
      {newDeadlineLabel && (
        <p className="mt-1.5 text-[12.5px] text-white/70">
          New deadline if approved: <span className="tabular-nums">{newDeadlineLabel}</span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <CTAPill onClick={onApprove} disabled={busy}>
          {busy ? 'Working…' : 'Approve'}
        </CTAPill>
        <CTAPill variant="secondary" tone="dark" onClick={onDecline} disabled={busy}>
          Decline
        </CTAPill>
      </div>
    </div>
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
  legacyEscrow,
}: {
  proposal: NonNullable<DirectDeal['cancellationProposal']>;
  viewerIsCounterparty: boolean;
  viewerIsProposer: boolean;
  busy: boolean;
  firstReleased: boolean;
  firstReleasePct: number;
  onAccept: () => void;
  onDecline: () => void;
  /// Deal lives on a pre-v2.D escrow. The accept/decline buttons here would
  /// route to v2.D endpoints that don't hold the funds, so swap them for a
  /// link to /legacy where the legacy-aware routes handle the refund.
  legacyEscrow: boolean;
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
        {viewerIsCounterparty && legacyEscrow && (
          <div className="pt-2 flex flex-wrap items-center gap-2">
            <Link
              href="/legacy"
              className="inline-flex items-center gap-2 px-4 py-2 mono text-[11px] font-bold uppercase tracking-[0.08em] bg-[var(--lp-band-dark)] text-[var(--lp-accent)] hover:bg-black/85 transition-colors"
              style={{
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 2,
              }}
            >
              Accept on recovery
              <span aria-hidden>→</span>
            </Link>
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              this deal is on an older contract
            </p>
          </div>
        )}
        {viewerIsCounterparty && !legacyEscrow && (
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
