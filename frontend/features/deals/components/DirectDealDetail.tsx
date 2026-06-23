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
import { SellerOfferBanner } from '@/features/factoring/components/SellerOfferBanner';
import { BuyerPodPanel } from '@/features/trade/components/BuyerPodPanel';
import { ExtensionRequestModal } from './ExtensionRequestModal';
import { EditDealModal } from './EditDealModal';
import { useDirectDeal } from '../hooks/useDirectDeals';
import { stageOf, StageBadge, type DealStage } from './DirectDealList';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';
import {
  feeBreakdown,
  REVIEW_WINDOW_MS,
  REVIEW_EXTENSION_MS,
  MAX_REVIEW_EXTENSIONS,
} from '../config';
import { shortAddress, shortHash, formatUsdc, relativeTime } from '@/shared/utils/format';
import { CopyId } from '@/shared/components/CopyId';
import { MarketReadCard } from '@/shared/components/MarketReadCard';
import { ProfilePeekModal } from '@/features/jobs/components/ProfilePeekModal';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
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

// SME trade-finance vocab. Hoisted to module scope so the maps and arrays
// allocate once per load, not per render. The goods milestone vocabulary
// renders only when deal.tradeType === 'goods'; mixed + service flows keep
// the existing service labels (the i18n bundle wins). Per Vercel
// `rendering-hoist-jsx`.
const INCOTERMS_GLOSS: Record<NonNullable<DirectDeal['incoterms']>, string> = {
  EXW: 'Ex Works — buyer collects from factory.',
  FCA: 'Free Carrier — seller delivers to a named carrier.',
  FOB: 'Free on Board — seller loads on the named vessel.',
  CIF: 'Cost Insurance Freight — seller pays freight + insurance to port.',
  DAP: 'Delivered at Place — buyer clears customs.',
  DDP: 'Delivered Duty Paid — seller delivers + clears customs.',
};

const PAYMENT_TERMS_LABEL: Record<NonNullable<DirectDeal['paymentTerms']>, string> = {
  immediate: 'IMMEDIATE',
  net30: 'NET 30',
  net60: 'NET 60',
  net90: 'NET 90',
};

const DOC_KIND_LABEL: Record<NonNullable<DirectDeal['documentRefs']>[number]['kind'], string> = {
  invoice: 'INVOICE',
  po: 'PO',
  bol: 'BoL',
  coo: 'CoO',
  pod: 'PoD',
  other: 'OTHER',
};

const GOODS_PROGRESS_LABELS = {
  opened: 'Order opened',
  accepted: 'Order accepted',
  delivered: 'Goods delivered',
  firstReleasedTemplate: 'Dispatched · {pct}% released',
  finalReleasedTemplate: 'Accepted · {pct}% released',
} as const;

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
/// web3 vocabulary (escrow, on Arc, on chain) on purpose. Karwan is a web3
/// product and the chain is the reason the money is safe. Returns null for
/// terminal/dispute states, which have their own copy.
function fundingSafetyLine(
  stage: string,
  viewerIsBuyer: boolean,
  copy: Messages['directDealDetail']['fundingSafety'],
): string | null {
  if (stage === 'settled') return copy.settled;
  if (stage === 'awaiting-acceptance') {
    return viewerIsBuyer ? copy.awaitingAcceptanceBuyer : copy.awaitingAcceptanceSeller;
  }
  if (
    stage === 'awaiting-delivery' ||
    stage === 'awaiting-first-release' ||
    stage === 'awaiting-final-release'
  ) {
    return viewerIsBuyer ? copy.activeBuyer : copy.activeSeller;
  }
  return null;
}

export function DirectDealDetail({ jobId }: { jobId: string }) {
  const dd = useTranslations().directDealDetail;
  const auth = useAuth();
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
  const { deal, fetchState, refresh, errorKind, isRefetching } = useDirectDeal(jobId);
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
  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (fetchState === 'loading') {
    /// Reserve roughly the height of the resolved deal hero band so the
    /// swap into the real deal page doesn't shift the bands below, the
    /// dominant CLS source on /deals/[id] before this pass.
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="space-y-4 max-w-[44ch] min-h-[44vh]">
            <div className="h-3 w-32 rounded bg-white/[0.08] animate-pulse motion-reduce:animate-none" />
            <div className="h-12 w-72 rounded bg-white/[0.08] animate-pulse motion-reduce:animate-none" />
            <div className="h-3 w-48 rounded bg-white/[0.08] animate-pulse motion-reduce:animate-none" />
          </div>
        </Band>
      </FullBleed>
    );
  }

  if (fetchState === 'error' || !deal) {
    const es = dd.errorStates;
    // A missing `deal` without an explicit error kind is safer read as a
    // transient blip than as a permanent "gone": the deal is durably stored,
    // so a hiccup must never tell the user their in-flight deal vanished.
    const kind = errorKind ?? 'transient';
    const copy =
      kind === 'private'
        ? { eyebrow: es.privateEyebrow, title: es.privateTitle, body: es.privateBody }
        : kind === 'gone'
          ? { eyebrow: es.notFoundEyebrow, title: es.notFoundTitle, body: es.notFoundBody }
          : { eyebrow: es.transientEyebrow, title: es.transientTitle, body: es.transientBody };
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="max-w-[44ch]">
            <SectionTag tone="dark">{copy.eyebrow}</SectionTag>
            <HeroHeadline size="md">
              {copy.title}
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              {copy.body}
            </p>
            <div className="mt-7">
              {kind === 'transient' ? (
                <button
                  type="button"
                  onClick={() => refresh()}
                  disabled={isRefetching}
                  className="inline-flex items-center gap-2 px-5 py-3 mono text-[12px] font-bold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{
                    borderTopLeftRadius: 12,
                    borderTopRightRadius: 12,
                    borderBottomLeftRadius: 12,
                    borderBottomRightRadius: 3,
                  }}
                >
                  {isRefetching ? es.transientRetrying : es.transientCta}
                </button>
              ) : (
                <CTAPill href={kind === 'private' ? '/market' : '/buyer'}>
                  {kind === 'private' ? es.privateCta : es.notFoundCta}
                </CTAPill>
              )}
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
            <SectionTag tone="dark">{dd.connectGate.eyebrow}</SectionTag>
            <HeroHeadline size="md">
              {dd.connectGate.titleLead} <span style={{ color: 'var(--lp-accent)' }}>{dd.connectGate.titleAccent}</span>
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              {dd.connectGate.body}
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
            <SectionTag tone="dark">{dd.notPartyGate.eyebrow}</SectionTag>
            <HeroHeadline size="md">
              {dd.notPartyGate.titleLead} <span style={{ color: 'var(--lp-accent)' }}>{dd.notPartyGate.titleAccent}</span>
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              {dd.notPartyGate.body}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <CTAPill href="/buyer">{dd.notPartyGate.ctaOpen}</CTAPill>
              <CTAPill href="/app" variant="secondary" tone="dark">
                {dd.notPartyGate.ctaHome}
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

  async function onProposeCancel(
    reason: string,
    kind: 'mutual' | 'platform-attributed' | 'refund-from-dispute' | 'release-from-dispute',
  ) {
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
            <SectionTag tone="dark">{dd.hero.eyebrow}</SectionTag>
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
        <p className="fade-up fade-up-2 mt-5 mono text-[11px] uppercase tracking-[0.16em] text-white/45 flex items-center gap-2 flex-wrap">
          <CopyId value={deal.jobId} label={shortHash(deal.jobId, 10, 6)} />
          <span>· {dd.hero.openedTemplate.replace('{when}', relativeTime(deal.createdAt))}</span>
        </p>
      </Band>

      {deal.marketRead && (
        <Band tone="light" compact>
          <div className="fade-up">
            <SectionTag>{dd.agentResearch.tag}</SectionTag>
            <p className="mt-3 text-[14px] leading-relaxed text-[var(--lp-text-sub)] max-w-[60ch]">
              {viewerIsSeller
                ? dd.agentResearch.sellerIntro
                : dd.agentResearch.buyerIntro}
            </p>
            <div className="mt-5 max-w-[640px]">
              <MarketReadCard mr={deal.marketRead} />
            </div>
          </div>
        </Band>
      )}

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
                [:{dd.legacyBanner.eyebrow}:]
              </p>
              <p className="mt-1 font-sans text-[14px] font-extrabold text-[var(--lp-dark)] leading-snug">
                {dd.legacyBanner.title}
              </p>
              <p className="mt-1 text-[12.5px] leading-snug text-[var(--lp-text-sub)]">
                {dd.legacyBanner.body}
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
              {dd.legacyBanner.cta}
              <span aria-hidden>→</span>
            </Link>
          </div>
        </Band>
      )}

      {/* PARTIES + FUNDING */}
      <Band tone="light" compact>
        <div className="grid md:grid-cols-2 gap-5">
          <PageCard>
            <CardHead label={dd.parties.cardLabel} />
            <div className="p-5 md:p-6 space-y-4">
              <PartyRow role={dd.parties.buyer} address={deal.buyer} you={viewerIsBuyer} youLabel={dd.parties.youSuffix} />
              <div className="border-t border-[var(--lp-border-light)]" />
              <PartyRow
                role={dd.parties.seller}
                address={deal.seller}
                you={viewerIsSeller}
                youLabel={dd.parties.youSuffix}
                showReputation
              />
              {(viewerIsBuyer || viewerIsSeller) && (
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="w-full mt-1 flex items-center justify-between gap-2 px-3 py-2.5 border border-[var(--lp-border-light)] rounded-xl hover:bg-black/[0.02] transition-colors text-start"
                >
                  <span className="mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                    your agent&apos;s read on the counterparty
                  </span>
                  <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-accent)] shrink-0">
                    view report ↗
                  </span>
                </button>
              )}
            </div>
          </PageCard>

          <PageCard>
            <CardHead label={dd.funding.cardLabel} />
            <div className="p-5 md:p-6 space-y-2.5">
              <MoneyRow label={dd.funding.buyerFunds} value={fee.fundedAmount} />
              <MoneyRow label={dd.funding.sellerReceives} value={fee.sellerNet} strong />
              <MoneyRow label={dd.funding.platformFee} value={fee.feeTotal} faint />
              <div className="mt-3 pt-3 border-t border-[var(--lp-border-light)] space-y-2.5">
                <MoneyRow
                  label={dd.funding.onDeliveryTemplate.replace('{pct}', String(deal.firstReleasePct))}
                  value={(fee.sellerNet * deal.firstReleasePct) / 100}
                />
                <MoneyRow
                  label={dd.funding.onVerificationTemplate.replace('{pct}', String(100 - deal.firstReleasePct))}
                  value={(fee.sellerNet * (100 - deal.firstReleasePct)) / 100}
                />
              </div>
              {fundingSafetyLine(stage, viewerIsBuyer, dd.fundingSafety) && (
                <div className="mt-3 pt-3 border-t border-[var(--lp-border-light)]">
                  <p
                    className="mono text-[10px] font-bold uppercase tracking-[0.16em]"
                    style={{ color: 'var(--lp-accent)' }}
                  >
                    [:{dd.funding.protectedEyebrow}:]
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--lp-text-sub)]">
                    {fundingSafetyLine(stage, viewerIsBuyer, dd.fundingSafety)}
                  </p>
                </div>
              )}
            </div>
          </PageCard>
        </div>
      </Band>

      {/* TERMS + (optional) DELIVERY PROOF */}
      <Band tone="light" compact>
        <SectionTag>{dd.terms.eyebrow}</SectionTag>
        <HeroHeadline size="md">
          {dd.terms.title}<Punc>.</Punc>
        </HeroHeadline>
        <div className="mt-8 grid md:grid-cols-2 gap-5">
          <PageCard>
            <div className="p-5 md:p-6">
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] whitespace-pre-wrap">
                {deal.terms}
              </p>
              <p className="mt-4 pt-4 border-t border-[var(--lp-border-light)] mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                {deal.deadlineUnix
                  ? dd.terms.deadlineTemplate.replace('{when}', relativeTime(deal.deadlineUnix * 1000))
                  : dd.terms.noDeadline}
              </p>
            </div>
          </PageCard>

          {deal.delivered && deal.deliveryProof && (
            <PageCard>
              <CardHead label={dd.terms.deliveryProofLabel} />
              <div className="p-5 md:p-6 space-y-4">
                <ProofText
                  text={deal.deliveryProof}
                  // Only a cleared link is clickable. A flagged link is never
                  // shown to the buyer (stripped server-side) and stays plain
                  // text for the seller, so a phishy URL is never one-tap live.
                  linkify={
                    deal.verificationStatus !== 'suspicious' &&
                    deal.verificationStatus !== 'malicious'
                  }
                />
                {/* Seller-side mirror of the buyer's hold notice. The seller
                    still sees their own proof, so without this they'd have no
                    sign Karwan held the link back from the buyer. */}
                {viewerIsSeller &&
                  (deal.verificationStatus === 'suspicious' ||
                    deal.verificationStatus === 'malicious') && (
                    <div
                      className="px-4 py-3"
                      style={{
                        background: 'rgba(178, 84, 37, 0.10)',
                        border: '1px solid rgba(178, 84, 37, 0.35)',
                        borderTopLeftRadius: 10,
                        borderTopRightRadius: 10,
                        borderBottomLeftRadius: 10,
                        borderBottomRightRadius: 3,
                      }}
                    >
                      <p className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#b25425]">
                        [:{dd.terms.deliveryVerifyingLabel}:]
                      </p>
                      <p className="mt-1.5 text-[13px] leading-snug text-[var(--lp-text-sub)]">
                        {dd.terms.deliveryVerifyingBody}
                      </p>
                    </div>
                  )}
                {/* Requirement review: the SecurityAgent judged the delivery off
                    or partly off-topic for the request. The proof is shown (the
                    buyer is the judge); this warns them to confirm before
                    releasing, and auto-release is paused on a clear mismatch. */}
                {(deal.deliveryMatch?.verdict === 'mismatch' ||
                  deal.deliveryMatch?.verdict === 'partial') && (
                  <div
                    className="px-4 py-3"
                    style={{
                      background: 'rgba(178, 84, 37, 0.10)',
                      border: '1px solid rgba(178, 84, 37, 0.35)',
                      borderTopLeftRadius: 10,
                      borderTopRightRadius: 10,
                      borderBottomLeftRadius: 10,
                      borderBottomRightRadius: 3,
                    }}
                  >
                    <p className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#b25425]">
                      [:{dd.terms.deliveryReviewLabel}:]
                    </p>
                    <p className="mt-1.5 text-[13px] leading-snug text-[var(--lp-text-sub)]">
                      {dd.terms.deliveryReviewBody}
                      {deal.deliveryMatch?.reason ? ` ${deal.deliveryMatch.reason}` : ''}
                    </p>
                  </div>
                )}
              </div>
            </PageCard>
          )}

          {/* Security Agent held the delivery link back from the buyer. The
              proof field is absent (stripped server-side), so this notice
              stands in its place and warns the buyer not to release yet. */}
          {deal.delivered &&
            !deal.deliveryProof &&
            (deal.verificationStatus === 'suspicious' ||
              deal.verificationStatus === 'malicious') && (
              <PageCard>
                <CardHead label={dd.terms.deliveryHeldLabel} />
                <div className="p-5 md:p-6 space-y-3">
                  <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                    {dd.terms.deliveryHeldBody}
                  </p>
                  {deal.verificationReasons && deal.verificationReasons.length > 0 && (
                    <ul className="list-disc ps-5 space-y-1 text-[13px] text-[var(--lp-text-muted)]">
                      {deal.verificationReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </PageCard>
            )}
        </div>
      </Band>

      {/* A live factoring offer is a real obligation, not a teaser: the seller
          gets a notification to accept or pass, so the banner must surface even
          while the broader SME rail is gated. It self-gates, rendering nothing
          unless the seller actually has an open offer on an eligible deal, so a
          plain service deal never shows it. */}
      <SellerOfferBanner deal={deal} viewerIsSeller={viewerIsSeller} />

      {/* The rest of the SME trade-finance rail stays hidden until launch:
          trade context and the buyer proof-of-delivery panel each render their
          own state and stay off the P2P deal view. */}
      {SME_TRADES_ENABLED && (
        <>
          {deal.tradeType && deal.tradeType !== 'service' ? (
            <TradeContextBand deal={deal} />
          ) : null}
          <BuyerPodPanel deal={deal} viewerIsBuyer={viewerIsBuyer} onPodAccepted={refresh} />
        </>
      )}

      {/* PROGRESS */}
      <Band tone="light" compact>
        <SectionTag dot={stage !== 'settled' && stage !== 'cancelled' ? 'live' : undefined}>
          {dd.progress.eyebrow}
        </SectionTag>
        <HeroHeadline size="md">
          {dd.progress.titleLead} <span style={{ color: 'var(--lp-accent)' }}>{dd.progress.titleAccent}</span>
          <Punc>.</Punc>
        </HeroHeadline>
        <div className="mt-8" data-guide="deal-flow">
          <PageCard>
            <ProgressTrack
              deal={deal}
              stage={stage}
              rail={rail}
              copy={
                SME_TRADES_ENABLED && deal.tradeType === 'goods'
                  ? { ...dd.progressTrack, ...GOODS_PROGRESS_LABELS }
                  : dd.progressTrack
              }
            />
          </PageCard>
        </div>
      </Band>

      {/* ACTIONS */}
      <Band tone="dark" compact>
        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-8 items-start">
          <div className="max-w-[42ch]">
            <SectionTag tone="dark" dot={stage !== 'settled' && stage !== 'cancelled' ? 'live' : undefined}>
              {dd.actions.eyebrow}
            </SectionTag>
            <HeroHeadline size="md">
              {dd.actions.titleLead} <span style={{ color: 'var(--lp-accent)' }}>{dd.actions.titleAccent}</span>
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
                  copy={dd.cancelProposalBanner}
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
              onEdit={() => setEditOpen(true)}
              onRaiseDelayAppeal={onRaiseDelayAppeal}
              onRespondToDelayAppeal={onRespondToDelayAppeal}
              onRequestExtension={onRequestExtension}
              onRespondExtension={onRespondExtension}
              copy={dd.actionPanel}
            />
            {canPropose && (
              <div className="mt-5 pt-5 border-t border-white/[0.08]">
                <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/55">
                  [:{dd.proposeBlock.orEyebrow}:]
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-white/65">
                  {stage === 'disputed'
                    ? dd.proposeBlock.disputeBody
                    : dd.proposeBlock.cancelBody}
                </p>
                <div className="mt-3">
                  <CTAPill
                    variant="secondary"
                    tone="dark"
                    onClick={() => setProposeOpen(true)}
                    disabled={busy}
                  >
                    {stage === 'disputed' ? dd.proposeBlock.disputeCta : dd.proposeBlock.cancelCta}
                  </CTAPill>
                </div>
              </div>
            )}
            {errorInfo && (
              <div className="mt-4">
                <DealErrorNote info={errorInfo} viewerIsBuyer={viewerIsBuyer} copy={dd.errors} />
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
              <span>{dd.fundingTxLabel}</span>
              <span className="tabular-nums">{shortHash(deal.fundTxHash)}</span>
              <ExternalIcon />
            </a>
          </div>
        )}
      </Band>

      {/* CHAT */}
      {address && (
        <Band tone="light" compact>
          <SectionTag>{dd.chat.eyebrow}</SectionTag>
          <HeroHeadline size="md">
            {dd.chat.titleLead} <span style={{ color: 'var(--lp-accent)' }}>{dd.chat.titleAccent}</span>
            <Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
            {dd.chat.body}
          </p>
          <div className="mt-8">
            <PageCard>
              <ChatPanel
                jobId={jobId}
                caller={address}
                counterpartyLabel={
                  viewerIsBuyer
                    ? dd.chat.counterpartySellerTemplate.replace('{address}', shortAddress(deal.seller))
                    : dd.chat.counterpartyBuyerTemplate.replace('{address}', shortAddress(deal.buyer))
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
          copy={dd.acceptConsentModal}
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
          disputed={stage === 'disputed'}
          hasReservation={!!deal.requireStake}
          onConfirm={onProposeCancel}
          onClose={() => setProposeOpen(false)}
          copy={dd.proposeCancelModal}
        />
      )}
      {editOpen && address && (
        <EditDealModal
          deal={deal}
          caller={address}
          onClose={() => setEditOpen(false)}
          onSaved={refresh}
        />
      )}

      <ProfilePeekModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        address={viewerIsBuyer ? deal.seller : deal.buyer}
        role={viewerIsBuyer ? 'seller' : 'buyer'}
        workRecordJobId={deal.jobId}
        caller={address ?? undefined}
      />
    </FullBleed>
  );
}

/// Renders delivery-proof text. When `linkify` is true (a cleared proof), any
/// http(s) URL becomes a clickable link the buyer can open to verify the work;
/// when false (a flagged proof) the text stays inert so a phishy URL is never
/// one tap from being opened.
function ProofText({ text, linkify }: { text: string; linkify: boolean }) {
  const base =
    'text-[14px] leading-relaxed text-[var(--lp-text-sub)] whitespace-pre-wrap break-words';
  if (!linkify) {
    return <p className={base}>{text}</p>;
  }
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <p className={base}>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            // Primary ink, so it flips with the theme (near-black on a light
            // card, soft-white on a dark card) and stays legible in both. The
            // old --lp-band-dark fallback was near-black and vanished on dark.
            className="underline underline-offset-2 break-all hover:text-[var(--lp-accent-hover)]"
            style={{ color: 'var(--lp-dark)' }}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
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

/// Trade context band. Incoterms badge, payment-term ribbon, document
/// hashes, counterparty company snapshot. Renders only when the deal
/// carries the SME fields (tradeType !== 'service'). Top-level component
/// per the Vercel `rerender-no-inline-components` rule.
function TradeContextBand({ deal }: { deal: DirectDeal }) {
  const docs = deal.documentRefs ?? [];
  const company = deal.counterpartyCompany;
  const hasCompany = company && (company.name || company.sector || company.region);
  return (
    <Band tone="light" compact>
      <SectionTag>[:TRADE CONTEXT:]</SectionTag>
      <HeroHeadline size="md">
        Trade rails<Punc>.</Punc>
      </HeroHeadline>
      <div className="mt-8 grid md:grid-cols-2 gap-5">
        <PageCard>
          <CardHead label="TERMS" />
          <div className="p-5 md:p-6 space-y-4">
            <div className="flex items-center flex-wrap gap-3">
              {deal.incoterms ? (
                <span
                  className="mono text-[10px] uppercase tracking-[0.18em] font-bold px-2.5 py-1 bg-[var(--lp-dark)] text-[var(--lp-bg)]"
                  title={INCOTERMS_GLOSS[deal.incoterms]}
                >
                  {deal.incoterms}
                </span>
              ) : null}
              {deal.paymentTerms ? (
                <span className="mono text-[10px] uppercase tracking-[0.18em] font-bold px-2.5 py-1 border border-black/20 text-[var(--lp-dark)]">
                  {PAYMENT_TERMS_LABEL[deal.paymentTerms]}
                </span>
              ) : null}
              {deal.tradeType === 'mixed' ? (
                <span className="mono text-[10px] uppercase tracking-[0.18em] font-bold px-2.5 py-1 border border-black/20 text-[var(--lp-dark)]">
                  GOODS + SERVICE
                </span>
              ) : null}
            </div>
            {deal.incoterms ? (
              <p className="text-[12.5px] text-[var(--lp-text-sub)] leading-snug">
                {INCOTERMS_GLOSS[deal.incoterms]}
              </p>
            ) : null}
          </div>
        </PageCard>
        {hasCompany ? (
          <PageCard>
            <CardHead label="COUNTERPARTY" />
            <div className="p-5 md:p-6 space-y-2">
              {company?.name ? (
                <p className="text-[14px] font-medium text-[var(--lp-dark)]">{company.name}</p>
              ) : null}
              <p className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                {[company?.sector, company?.region].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
          </PageCard>
        ) : null}
        {docs.length > 0 ? (
          <PageCard className="md:col-span-2">
            <CardHead label="ANCHORED DOCUMENTS" />
            <ul className="p-5 md:p-6 space-y-2">
              {docs.map((d) => (
                <li
                  key={d.hash}
                  className="flex items-center gap-3 px-3 py-2 border border-black/10 bg-[var(--lp-bg)]"
                  style={{
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                    borderBottomLeftRadius: 6,
                    borderBottomRightRadius: 2,
                  }}
                >
                  <span className="mono text-[9px] uppercase tracking-[0.16em] font-bold px-1.5 py-0.5 bg-[var(--lp-dark)] text-[var(--lp-bg)]">
                    {DOC_KIND_LABEL[d.kind]}
                  </span>
                  <span className="flex-1 truncate text-[12.5px] text-[var(--lp-dark)]">
                    {d.label ?? 'document'}
                  </span>
                  {d.txHash ? (
                    <a
                      href={ARC_EXPLORER_TX(d.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="mono text-[10px] tabular-nums text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
                    >
                      {d.hash.slice(0, 10)}…{d.hash.slice(-6)} ↗
                    </a>
                  ) : (
                    <code className="mono text-[10px] tabular-nums text-[var(--lp-text-muted)]">
                      {d.hash.slice(0, 10)}…{d.hash.slice(-6)}
                    </code>
                  )}
                </li>
              ))}
            </ul>
          </PageCard>
        ) : null}
      </div>
    </Band>
  );
}

function PartyRow({
  role,
  address,
  you,
  youLabel,
  showReputation,
}: {
  role: string;
  address: string;
  you: boolean;
  youLabel: string;
  showReputation?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          {role}
          {you && <span style={{ color: 'var(--lp-accent)' }}> · {youLabel}</span>}
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
  copy,
}: {
  deal: { firstReleasePct: number };
  stage: DealStage;
  rail: string;
  copy: Messages['directDealDetail']['progressTrack'];
}) {
  const cancelled = stage === 'cancelled';
  const past = (...stages: DealStage[]) => !cancelled && !stages.includes(stage);
  const steps = [
    { key: 'opened', label: copy.opened, done: true },
    {
      key: 'accepted',
      label: copy.accepted,
      done: past('awaiting-acceptance'),
    },
    {
      key: 'delivered',
      label: copy.delivered,
      done: past('awaiting-acceptance', 'awaiting-delivery'),
    },
    {
      key: 'first',
      label: copy.firstReleasedTemplate.replace('{pct}', String(deal.firstReleasePct)),
      done: stage === 'awaiting-final-release' || stage === 'settled',
    },
    {
      key: 'final',
      label: copy.finalReleasedTemplate.replace('{pct}', String(100 - deal.firstReleasePct)),
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
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${String(hours).padStart(2, '0')}h`);
  parts.push(`${String(minutes).padStart(2, '0')}m`);
  parts.push(`${String(seconds).padStart(2, '0')}s`);
  return parts.join(' ');
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
  onEdit,
  onRaiseDelayAppeal,
  onRespondToDelayAppeal,
  onRequestExtension,
  onRespondExtension,
  copy,
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
  onEdit: () => void;
  onRaiseDelayAppeal: () => void;
  onRespondToDelayAppeal: (reason: string) => void;
  onRequestExtension: () => void;
  onRespondExtension: (decision: 'approved' | 'declined') => void;
  copy: Messages['directDealDetail']['actionPanel'];
}) {
  if (stage === 'settled') {
    const releasedFromDispute = deal.cancelKind === 'release-from-dispute';
    return (
      <div className="space-y-4">
        <Body>
          {releasedFromDispute
            ? copy.settled.releasedFromDispute
            : deal.autoReleasedAt
              ? copy.settled.autoReleased
              : copy.settled.normal}
        </Body>
        {viewerIsSeller && (
          <Link href={`/cashout/${deal.jobId}`}>
            <CTAPill>{copy.settled.cashoutTemplate.replace('{amount}', formatUsdc(deal.dealAmountUsdc))}</CTAPill>
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
    // state-aware, "refunded in full" is a lie post-first-release.
    const firstReleased = !!deal.reviewWindowStartedAt;
    const firstPct = deal.firstReleasePct;
    const remainPct = 100 - firstPct;

    const body = (() => {
      const c = copy.cancelled;
      // pre-accept / no funding ever happened
      if (deal.cancelKind === 'pre-accept' || (!deal.fundTxHash && !deal.cancelKind)) {
        return c.preAccept;
      }

      // unilateral buyer cancel after deadline (no milestone was ever released
      // since the seller never delivered).
      if (deal.cancelKind === 'unilateral') {
        return c.unilateral;
      }

      // Dispute-state refund accepted by either side. Seller takes the rep
      // hit off-chain via signals.ts; the UI stays neutral about it.
      if (deal.cancelKind === 'refund-from-dispute') {
        const tail = firstReleased
          ? c.refundFromDisputePartialTailTemplate
              .replace('{firstPct}', String(firstPct))
              .replace('{remainPct}', String(remainPct))
          : c.refundFromDisputeFullTail;
        return c.refundFromDisputePrefix.replace('{tail}', tail);
      }

      // Mutual / platform-attributed branches. Two cases based on prior release.
      const wording =
        deal.cancelKind === 'platform-attributed'
          ? c.platformAttributedPrefix
          : c.mutualPrefix;

      if (firstReleased) {
        return c.mutualPartialTemplate
          .replace('{prefix}', wording)
          .replace('{firstPct}', String(firstPct))
          .replace('{remainPct}', String(remainPct));
      }
      return c.mutualFullTemplate.replace('{prefix}', wording);
    })();
    return (
      <div className="space-y-2">
        <Body>{body}</Body>
        {deal.cancelReason && (deal.cancelKind === 'mutual' || deal.cancelKind === 'platform-attributed') && (
          <div className="mt-1">
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/45">
              [:{copy.cancelled.reasonEyebrow}:]
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
    const hasReservation = !!deal.requireStake;
    return (
      <div className="space-y-3">
        <Body tone="critical">{copy.disputed.intro}</Body>
        <Body>
          <span className="font-semibold text-white/85">{copy.disputed.refundLabel}</span>{' '}
          {hasReservation ? copy.disputed.refundBodyWithReservation : copy.disputed.refundBody}
        </Body>
        <Body>
          <span className="font-semibold text-white/85">{copy.disputed.releaseLabel}</span>{' '}
          {copy.disputed.releaseBody}
        </Body>
      </div>
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
          <Body>{copy.awaitingAcceptance.sellerIntro}</Body>
          <AcceptanceCountdown deal={deal} now={now} viewerIsSeller copy={copy.acceptanceCountdown} />
          {deal.requireStake && (
            <div
              className="px-3 py-2 mono text-[11px] leading-snug"
              style={{
                background: 'color-mix(in oklab, var(--lp-accent) 10%, transparent)',
                borderInlineStart: '2px solid var(--lp-accent)',
                color: 'var(--lp-accent)',
              }}
            >
              {copy.awaitingAcceptance.trustedMatchPrefix}{' '}
              <span className="font-bold tabular-nums">{reservedAmount} USDC</span>{' '}
              {copy.awaitingAcceptance.trustedMatchMiddleTemplate
                .replace('{pct}', String(RESERVATION_PCT))
                .replace('{amount}', String(deal.dealAmountUsdc))}{' '}
              {copy.awaitingAcceptance.trustedMatchSuffix}
            </div>
          )}
          <CTAPill disabled={busy} onClick={onAccept}>
            {busy ? copy.awaitingAcceptance.acceptBusy : copy.awaitingAcceptance.acceptCta}
          </CTAPill>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <Body>
          {deal.pendingCounterparty
            ? copy.awaitingAcceptance.buyerWaitingInviteTemplate.replace('{email}', deal.pendingCounterparty.email)
            : copy.awaitingAcceptance.buyerWaiting}
        </Body>
        {deal.pendingCounterparty && (
          <PendingInviteCopy
            token={deal.pendingCounterparty.inviteToken}
            email={deal.pendingCounterparty.email}
            copy={copy.pendingInvite}
          />
        )}
        <AcceptanceCountdown deal={deal} now={now} viewerIsSeller={false} copy={copy.acceptanceCountdown} />
        <div className="flex flex-wrap gap-2">
          <CTAPill variant="secondary" tone="dark" onClick={onEdit} disabled={busy}>
            {copy.awaitingAcceptance.editTermsCta}
          </CTAPill>
          <CTAPill variant="secondary" tone="dark" onClick={onCancel} disabled={busy}>
            {busy ? copy.awaitingAcceptance.cancelBusy : copy.awaitingAcceptance.cancelCta}
          </CTAPill>
        </div>
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
              copy={copy.extensionPending}
            />
          )}
          <Body>
            {copy.awaitingDelivery.sellerIntroTemplate
              .replace('{firstPct}', String(firstPct))}
          </Body>
          <label className="block space-y-1.5">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-white/55">
              [:{copy.awaitingDelivery.proofEyebrow}:]
            </span>
            <textarea
              value={deliveryProof}
              onChange={(e) => onDeliveryProofChange(e.target.value)}
              rows={3}
              placeholder={copy.awaitingDelivery.proofPlaceholder}
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
              {busy ? copy.awaitingDelivery.markDeliveredBusy : copy.awaitingDelivery.markDeliveredCta}
            </CTAPill>
            <span
              title={
                extPendingForSeller
                  ? copy.awaitingDelivery.extensionTitlePending
                  : copy.awaitingDelivery.extensionTitleAsk
              }
            >
              <CTAPill
                variant="secondary"
                tone="dark"
                onClick={onRequestExtension}
                disabled={busy || extPendingForSeller}
              >
                {extPendingForSeller ? copy.awaitingDelivery.extensionPendingCta : copy.awaitingDelivery.extensionRequestCta}
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
            copy={copy.extensionBuyerBanner}
          />
        )}
        <Body>
          {copy.awaitingDelivery.buyerIntro}
          {!hasDeadline && ' ' + copy.awaitingDelivery.buyerNoDeadlineTail}
          {hasDeadline && !deadlinePassed && ' ' + copy.awaitingDelivery.buyerHasDeadlineTail}
        </Body>
        {deadlinePassed && (
          <>
            <WindowNote tone="warning">
              {copy.awaitingDelivery.buyerDeadlinePassedNote}
            </WindowNote>
            <CTAPill variant="secondary" tone="dark" onClick={onCancel} disabled={busy}>
              {busy ? copy.awaitingDelivery.reclaimBusy : copy.awaitingDelivery.reclaimCta}
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
    // A flagged delivery link freezes the release: the backend pauses the
    // auto-release and rejects a manual release. Reflect that here instead of
    // the misleading "auto-releases / will release shortly" countdown.
    const held =
      deal.verificationStatus === 'suspicious' || deal.verificationStatus === 'malicious';
    const open = !held && endsAt != null && msLeft > 0;
    const expired = !held && endsAt != null && msLeft <= 0;

    if (viewerIsBuyer) {
      return (
        <div className="space-y-4">
          <Body>
            {copy.awaitingFirstRelease.buyerIntroTemplate
              .replace('{firstPct}', String(firstPct))
              .replace('{remainPct}', String(100 - firstPct))}
          </Body>
          {held && (
            <WindowNote tone="warning">
              {copy.awaitingFirstRelease.releaseHeldNote}
            </WindowNote>
          )}
          {open && (
            <WindowNote tone="warning">
              {copy.awaitingFirstRelease.buyerAutoReleasePrefixTemplate.replace('{firstPct}', String(firstPct))}{' '}
              <span className="mono font-semibold">{fmtCountdown(msLeft)}</span> {copy.awaitingFirstRelease.buyerAutoReleaseSuffix}
            </WindowNote>
          )}
          {expired && (
            <WindowNote tone="muted">
              {copy.awaitingFirstRelease.buyerExpiredTemplate.replace('{firstPct}', String(firstPct))}
            </WindowNote>
          )}
          <div className="flex flex-wrap gap-2">
            <CTAPill disabled={busy || held} onClick={onRelease}>
              {busy ? copy.awaitingFirstRelease.releaseBusy : copy.awaitingFirstRelease.releaseCtaTemplate.replace('{firstPct}', String(firstPct))}
            </CTAPill>
            <CTAPill variant="secondary" tone="dark" onClick={onAppeal} disabled={busy}>
              {copy.awaitingFirstRelease.appealCta}
            </CTAPill>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <Body>{copy.awaitingFirstRelease.sellerWaitingTemplate.replace('{firstPct}', String(firstPct))}</Body>
        {held && (
          <>
            <WindowNote tone="warning">
              {copy.awaitingFirstRelease.releaseHeldNote}
            </WindowNote>
            {/* Re-delivery is the primary resolution: the seller submits a
                corrected link, the backend re-scans it, and a clean result
                clears the hold and resumes the release. */}
            <label className="block space-y-1.5">
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-white/55">
                [:{copy.awaitingFirstRelease.resubmitLabel}:]
              </span>
              <textarea
                value={deliveryProof}
                onChange={(e) => onDeliveryProofChange(e.target.value)}
                rows={2}
                placeholder={copy.awaitingDelivery.proofPlaceholder}
                className="w-full bg-white/[0.04] text-white placeholder:text-white/30 px-3.5 py-2.5 text-[13px] leading-relaxed border border-white/10 focus:outline-none focus:border-[var(--lp-accent)] resize-none transition-shadow"
                style={{
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  borderBottomLeftRadius: 12,
                  borderBottomRightRadius: 3,
                }}
              />
            </label>
            <CTAPill onClick={onMarkDelivered} disabled={busy || !deliveryProof.trim()}>
              {busy ? copy.awaitingFirstRelease.resubmitBusy : copy.awaitingFirstRelease.resubmitCta}
            </CTAPill>
          </>
        )}
        {open && (
          <WindowNote tone="muted">
            {copy.awaitingFirstRelease.sellerOpenPrefix}{' '}
            <span className="mono font-semibold">{fmtCountdown(msLeft)}</span> {copy.awaitingFirstRelease.sellerOpenSuffixTemplate.replace('{firstPct}', String(firstPct))}
          </WindowNote>
        )}
        {expired && (
          <WindowNote tone="muted">
            {copy.awaitingFirstRelease.sellerExpiredTemplate.replace('{firstPct}', String(firstPct))}
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
          {copy.awaitingFinalRelease.buyerIntroTemplate
            .replace('{firstPct}', String(firstPct))
            .replace('{rest}', String(rest))}
        </Body>
        {appealOpen && !responseExpired && (
          <DelayAppealResponder
            msLeft={responseMsLeft}
            rest={rest}
            busy={busy}
            onRespond={onRespondToDelayAppeal}
            copy={copy.delayAppealResponder}
          />
        )}
        {appealOpen && responseExpired && (
          <WindowNote tone="warning">
            {copy.awaitingFinalRelease.buyerResponseExpiredTemplate.replace('{rest}', String(rest))}
          </WindowNote>
        )}
        {!appealOpen && (
          <WindowNote tone="muted">
            {copy.awaitingFinalRelease.buyerNoAppealTemplate.replace('{rest}', String(rest))}
          </WindowNote>
        )}
        <div className="flex flex-wrap gap-2">
          <CTAPill disabled={busy} onClick={onRelease}>
            {busy ? copy.awaitingFinalRelease.releaseBusy : copy.awaitingFinalRelease.releaseCtaTemplate.replace('{rest}', String(rest))}
          </CTAPill>
          <CTAPill variant="secondary" tone="dark" onClick={onAppeal} disabled={busy}>
            {copy.awaitingFinalRelease.appealCta}
          </CTAPill>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Body>
        {copy.awaitingFinalRelease.sellerWaitingTemplate
          .replace('{firstPct}', String(firstPct))
          .replace('{rest}', String(rest))}
      </Body>
      {appealOpen && !responseExpired && (
        <WindowNote tone="warning">
          {copy.awaitingFinalRelease.sellerAppealOpenPrefix}{' '}
          <span className="mono font-semibold">{fmtCountdown(responseMsLeft)}</span> {copy.awaitingFinalRelease.sellerAppealOpenSuffixTemplate.replace('{rest}', String(rest))}
        </WindowNote>
      )}
      {appealOpen && responseExpired && (
        <WindowNote tone="warning">
          {copy.awaitingFinalRelease.sellerResponseExpiredTemplate.replace('{rest}', String(rest))}
        </WindowNote>
      )}
      {!appealOpen && deal.delayAppealRespondedAt && deal.delayAppealResponse && (
        <div className="space-y-2">
          <WindowNote tone="muted">
            {copy.awaitingFinalRelease.sellerBuyerResponded}
          </WindowNote>
          <p className="text-[13px] leading-relaxed text-white/75 px-3 py-2.5 border border-white/[0.08] rounded-[4px]">
            “{deal.delayAppealResponse}”
          </p>
        </div>
      )}
      {!appealOpen && graceOpen && delayGraceEndsAt != null && (
        <WindowNote tone="muted">
          {copy.awaitingFinalRelease.sellerGracePrefix}{' '}
          <span className="mono font-semibold">{fmtCountdown(delayGraceEndsAt - now)}</span> {copy.awaitingFinalRelease.sellerGraceSuffix}
        </WindowNote>
      )}
      {!appealOpen && sellerCanAppeal && (
        <div className="flex flex-wrap gap-2">
          <CTAPill onClick={onRaiseDelayAppeal} disabled={busy}>
            {busy ? copy.awaitingFinalRelease.raiseAppealBusy : copy.awaitingFinalRelease.raiseAppealCta}
          </CTAPill>
          <CTAPill variant="secondary" tone="dark" onClick={onAppeal} disabled={busy}>
            {copy.awaitingFinalRelease.openDisputeCta}
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
  copy,
}: {
  msLeft: number;
  rest: number;
  busy: boolean;
  onRespond: (reason: string) => void;
  copy: Messages['directDealDetail']['actionPanel']['delayAppealResponder'];
}) {
  const [reason, setReason] = useState('');
  const canSubmit = reason.trim().length > 0 && !busy;
  return (
    <div className="space-y-3 p-4 border border-[rgba(239,127,99,0.35)]" style={{ background: 'rgba(239,127,99,0.08)', borderRadius: 4 }}>
      <div className="space-y-1">
        <p className="mono text-[10px] uppercase tracking-[0.14em]" style={{ color: '#ef7f63' }}>
          [:{copy.eyebrow}:]
        </p>
        <p className="text-[13px] leading-relaxed text-white/85">
          {copy.prefix}{' '}
          <span className="mono font-semibold">{fmtCountdown(msLeft)}</span> {copy.suffixTemplate.replace('{rest}', String(rest))}
        </p>
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={copy.placeholder}
        rows={3}
        className="w-full bg-black/30 border border-white/[0.12] rounded-[3px] px-3 py-2 text-[13px] text-white placeholder:text-white/35 focus:outline-none focus:border-[rgba(239,127,99,0.6)]"
      />
      <CTAPill onClick={() => onRespond(reason.trim())} disabled={!canSubmit}>
        {busy ? copy.submitBusy : copy.submitCta}
      </CTAPill>
    </div>
  );
}

function PendingInviteCopy({
  token,
  email,
  copy,
}: {
  token: string;
  email: string;
  copy: Messages['directDealDetail']['actionPanel']['pendingInvite'];
}) {
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
        [:{copy.eyebrow}:]
      </p>
      <p className="text-[12.5px] leading-snug text-white/75">
        {copy.bodyTemplate.replace('{email}', email)}
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
          {copied ? copy.copied : copy.copyCta}
        </button>
      </div>
    </div>
  );
}

function AcceptanceCountdown({
  deal,
  now,
  viewerIsSeller,
  copy,
}: {
  deal: DirectDeal;
  now: number;
  viewerIsSeller: boolean;
  copy: Messages['directDealDetail']['actionPanel']['acceptanceCountdown'];
}) {
  if (!deal.acceptanceDeadlineUnix) return null;
  const deadlineMs = deal.acceptanceDeadlineUnix * 1000;
  const msLeft = deadlineMs - now;
  const open = msLeft > 0;
  if (open) {
    return (
      <WindowNote tone="warning">
        {viewerIsSeller ? copy.openSellerPrefix : copy.openBuyerPrefix}{' '}
        <span className="mono font-semibold">{fmtCountdown(msLeft)}</span>{' '}
        {viewerIsSeller ? copy.openSellerSuffix : copy.openBuyerSuffix}
      </WindowNote>
    );
  }
  return (
    <WindowNote tone="muted">
      {copy.expired}
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

function formatExtensionDuration(
  seconds: number,
  copy: Messages['directDealDetail']['actionPanel']['extensionDuration'],
): string {
  const days = Math.floor(seconds / 86400);
  if (days >= 1) {
    const rem = seconds - days * 86400;
    if (rem === 0) {
      return (days === 1 ? copy.dayTemplate : copy.daysTemplate).replace('{n}', String(days));
    }
  }
  const hours = Math.round(seconds / 3600);
  return (hours === 1 ? copy.hourTemplate : copy.hoursTemplate).replace('{n}', String(hours));
}

/// Seller-side note shown above the deliver form when the buyer has an
/// open extension request to act on. Quiet so it doesn't compete with the
/// primary action.
function ExtensionPendingNote({
  additionalSeconds,
  reason,
  tone,
  copy,
}: {
  additionalSeconds: number;
  reason?: string;
  tone: 'dark' | 'light';
  role: 'seller';
  copy: Messages['directDealDetail']['actionPanel']['extensionPending'];
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
        [:{copy.eyebrow}:]
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed">
        {copy.prefix}{' '}
        <span className="font-semibold">+{formatExtensionDuration(additionalSeconds, copy.duration)}</span>.
        {reason ? ` ${copy.reasonPrefix} ${reason}` : ''}
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
  copy,
}: {
  additionalSeconds: number;
  reason?: string;
  currentDeadlineUnix?: number;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
  copy: Messages['directDealDetail']['actionPanel']['extensionBuyerBanner'];
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
        [:{copy.eyebrow}:]
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-white">
        {copy.requestPrefix}{' '}
        <span className="font-semibold">+{formatExtensionDuration(additionalSeconds, copy.duration)}</span>{' '}
        {copy.requestSuffix}
        {reason ? <> {copy.reasonPrefix} <span className="opacity-80">{reason}</span></> : null}
      </p>
      {newDeadlineLabel && (
        <p className="mt-1.5 text-[12.5px] text-white/70">
          {copy.newDeadlinePrefix} <span className="tabular-nums">{newDeadlineLabel}</span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <CTAPill onClick={onApprove} disabled={busy}>
          {busy ? copy.approveBusy : copy.approveCta}
        </CTAPill>
        <CTAPill variant="secondary" tone="dark" onClick={onDecline} disabled={busy}>
          {copy.declineCta}
        </CTAPill>
      </div>
    </div>
  );
}

function AcceptConsentModal({
  busy,
  onConfirm,
  onClose,
  copy,
}: {
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
  copy: Messages['directDealDetail']['acceptConsentModal'];
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
            [:{copy.eyebrow}:]
          </span>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-tight text-[var(--lp-dark)]">
            {copy.title}
            <span style={{ color: 'var(--lp-accent)' }}>.</span>
          </h2>
        </div>
        <div className="px-6 pb-6 space-y-5">
          <p className="text-[14px] text-[var(--lp-text-sub)] leading-relaxed">
            {copy.body}
          </p>
          <div className="flex items-center gap-3">
            <CTAPill onClick={onConfirm} disabled={busy}>
              {busy ? copy.confirmBusy : copy.confirmCta}
            </CTAPill>
            <CTAPill variant="secondary" tone="light" onClick={onClose} disabled={busy}>
              {copy.cancelCta}
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
  copy,
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
  copy: Messages['directDealDetail']['cancelProposalBanner'];
}) {
  const remainPct = 100 - firstReleasePct;
  const isReleaseFromDispute = proposal.kind === 'release-from-dispute';
  const isRefundFromDispute = proposal.kind === 'refund-from-dispute';
  const isDisputeResolution = isReleaseFromDispute || isRefundFromDispute;
  const kindLabel = isReleaseFromDispute
    ? copy.kindReleaseToSeller
    : isRefundFromDispute
      ? copy.kindRefundBuyer
      : proposal.kind === 'platform-attributed'
        ? copy.kindPlatformMisroute
        : copy.kindMutualCancel;
  const acceptLabel = isReleaseFromDispute ? copy.acceptReleaseCta : copy.acceptRefundCta;
  const byLabel = proposal.proposedBy === 'buyer' ? copy.proposerBuyer : copy.proposerSeller;
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
          {copy.proposedTemplate.replace('{kind}', kindLabel)}
        </span>
        <span className="ms-auto mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-dark)]/70">
          {copy.byTemplate.replace('{by}', byLabel)}
        </span>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:{copy.reasonEyebrow}:]
        </p>
        <p className="text-[13px] leading-relaxed text-[var(--lp-dark)] whitespace-pre-wrap">
          {proposal.reason}
        </p>
        <p className="text-[12px] leading-relaxed text-[var(--lp-text-sub)]">
          {(() => {
            if (isReleaseFromDispute) {
              return copy.outcomeReleaseFromDispute;
            }
            if (isRefundFromDispute) {
              return firstReleased
                ? copy.outcomeRefundFromDisputePartialTemplate.replace('{remainPct}', String(remainPct))
                : copy.outcomeRefundFromDisputeFull;
            }
            const prefix =
              proposal.kind === 'platform-attributed'
                ? copy.outcomePlatformPrefix
                : copy.outcomeMutualPrefix;
            const outcome = firstReleased
              ? copy.outcomePartialTemplate
                  .replace('{firstPct}', String(firstReleasePct))
                  .replace('{remainPct}', String(remainPct))
              : copy.outcomeFull;
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
              {copy.legacyCta}
              <span aria-hidden>→</span>
            </Link>
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              {copy.legacyNote}
            </p>
          </div>
        )}
        {viewerIsCounterparty && !legacyEscrow && (
          <div className="pt-2 flex flex-wrap items-center gap-2">
            <CTAPill onClick={onAccept} disabled={busy}>
              {busy ? copy.confirmingBusy : acceptLabel}
            </CTAPill>
            <CTAPill variant="secondary" tone="light" onClick={onDecline} disabled={busy}>
              {isDisputeResolution ? copy.declineDisputeCta : copy.declineCancelCta}
            </CTAPill>
          </div>
        )}
        {viewerIsProposer && (
          <p className="pt-2 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {copy.waitingNote}
          </p>
        )}
      </div>
    </div>
  );
}

type ProposeKind =
  | 'mutual'
  | 'platform-attributed'
  | 'refund-from-dispute'
  | 'release-from-dispute';

function ProposeCancelModal({
  busy,
  firstReleased,
  firstReleasePct,
  disputed,
  hasReservation,
  onConfirm,
  onClose,
  copy,
}: {
  busy: boolean;
  firstReleased: boolean;
  firstReleasePct: number;
  disputed: boolean;
  hasReservation: boolean;
  onConfirm: (reason: string, kind: ProposeKind) => void;
  onClose: () => void;
  copy: Messages['directDealDetail']['proposeCancelModal'];
}) {
  const [reason, setReason] = useState('');
  const defaultKind: ProposeKind = disputed ? 'refund-from-dispute' : 'mutual';
  const [kind, setKind] = useState<ProposeKind>(defaultKind);
  const valid = reason.trim().length >= 3;
  const remainPct = 100 - firstReleasePct;

  const KIND_OPTIONS: ReadonlyArray<{ key: ProposeKind; label: string; body: string }> = disputed
    ? [
        {
          key: 'refund-from-dispute',
          label: copy.kindRefundBuyerLabel,
          body: hasReservation ? copy.kindRefundBuyerBodyWithReservation : copy.kindRefundBuyerBody,
        },
        {
          key: 'release-from-dispute',
          label: copy.kindReleaseSellerLabel,
          body: copy.kindReleaseSellerBody,
        },
      ]
    : [
        { key: 'mutual', label: copy.kindMutualLabel, body: copy.kindMutualBody },
        {
          key: 'platform-attributed',
          label: copy.kindPlatformLabel,
          body: copy.kindPlatformBody,
        },
      ];
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
            [:{disputed ? copy.eyebrowResolution : copy.eyebrowCancellation}:]
          </span>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-tight">
            {disputed ? copy.titleDispute : copy.titleCancel}
            <span style={{ color: 'var(--lp-accent)' }}>.</span>
          </h2>
        </div>
        <div className="px-6 pb-6 space-y-5">
          <p className="text-[13.5px] text-[var(--lp-text-sub)] leading-relaxed">
            {disputed
              ? copy.disputeBody
              : copy.cancelBodyTemplate.replace(
                  '{outcome}',
                  firstReleased
                    ? copy.cancelOutcomePartialTemplate
                        .replace('{firstPct}', String(firstReleasePct))
                        .replace('{remainPct}', String(remainPct))
                    : copy.cancelOutcomeFull,
                )}
          </p>

          <div className="space-y-2">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:{disputed ? copy.kindEyebrowResolution : copy.kindEyebrowKind}:]
            </span>
            <div className="grid grid-cols-2 gap-2">
              {KIND_OPTIONS.map((opt) => {
                const active = kind === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setKind(opt.key)}
                    className="relative overflow-hidden text-start p-3 transition-colors"
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
                        className="absolute start-0 top-0 bottom-0 w-[3px]"
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
              [:{copy.reasonEyebrow}:]
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={copy.reasonPlaceholder}
              className="form-input form-textarea"
            />
          </label>

          <div className="flex items-center gap-3">
            <CTAPill onClick={() => onConfirm(reason.trim(), kind)} disabled={busy || !valid}>
              {busy ? copy.submitBusy : copy.submitCta}
            </CTAPill>
            <CTAPill variant="secondary" tone="light" onClick={onClose} disabled={busy}>
              {copy.cancelCta}
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
  copy,
}: {
  info: { code?: string; message: string };
  viewerIsBuyer: boolean;
  copy: Messages['directDealDetail']['errors'];
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
        <p className="font-medium">{copy.insufficientBalanceTitle}</p>
        {viewerIsBuyer ? (
          <p className="text-[11px] opacity-90">
            {copy.insufficientBalanceBuyerPrefix}{' '}
            <Link href="/profile" className="underline font-medium">
              {copy.insufficientBalanceBuyerLink}
            </Link>
          </p>
        ) : (
          <p className="text-[11px] opacity-90">
            {copy.insufficientBalanceSeller}
          </p>
        )}
      </div>,
    );
  }
  if (info.code === 'INSUFFICIENT_AGENT_GAS') {
    return wrap(
      <p className="font-medium">{copy.insufficientGas}</p>,
    );
  }
  if (info.code === 'INSUFFICIENT_STAKE') {
    // v2.D: seller agent's free stake is below the insurance reservation.
    // Surface a clear "stake more" CTA. Only seller sees this; the buyer
    // never triggers the accept call.
    return wrap(
      <div className="space-y-1.5">
        <p className="font-medium">{copy.insufficientStakeTitle}</p>
        <p className="text-[11px] opacity-90">{info.message}</p>
        <p className="text-[11px] opacity-90">
          <Link href="/stake" className="underline font-medium">
            {copy.insufficientStakeLink}
          </Link>
          {' '}{copy.insufficientStakeSuffix}
        </p>
      </div>,
    );
  }
  if (info.code === 'ACCEPT_ESCROW_FAILED') {
    return wrap(
      <div className="space-y-1.5">
        <p className="font-medium">{copy.acceptEscrowFailedTitle}</p>
        <p className="text-[11px] opacity-90">{info.message}</p>
      </div>,
    );
  }
  return wrap(info.message);
}
