'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { api, ApiError, type DirectDeal } from '@/core/api';
import { Card } from '@/shared/components/Card';
import { Note } from '@/shared/components/AppUI';
import { ChatPanel } from '@/features/chat/components/ChatPanel';
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

const ARC_EXPLORER_TX = (h: string) => `https://testnet.arcscan.app/tx/${h}`;

export function DirectDealDetail({ jobId }: { jobId: string }) {
  const { address, isConnected } = useAccount();
  const { deal, fetchState, refresh } = useDirectDeal(jobId);
  const { activated } = useActivation();
  const [busy, setBusy] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ code?: string; message: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [deliveryProof, setDeliveryProof] = useState('');
  const [showAcceptConsent, setShowAcceptConsent] = useState(false);

  // 1Hz tick so the review-window countdown stays live.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (fetchState === 'loading') {
    return <p className="text-[13px] text-[var(--color-ink-faint)] fade-up">Loading deal…</p>;
  }
  if (fetchState === 'error' || !deal) {
    return (
      <Card>
        <p className="text-[13px] text-[var(--color-ink-dim)]">
          This deal could not be found.{' '}
          <Link href="/buyer" className="underline text-[var(--color-ink)]">
            Back to dashboard
          </Link>
        </p>
      </Card>
    );
  }

  const stage = stageOf(deal);
  const viewerIsBuyer = !!address && address.toLowerCase() === deal.buyer;
  const viewerIsSeller = !!address && address.toLowerCase() === deal.seller;
  const fee = feeBreakdown(Number(deal.dealAmountUsdc));

  // Detail visibility is restricted to the two parties — and the screens shown
  // to outsiders deliberately leak nothing about who the deal is between or
  // its job hash. Public discovery happens on the deals feed.
  if (!isConnected) {
    return (
      <div className="space-y-4 fade-up max-w-2xl">
        <Card>
          <p className="eyebrow">Deals</p>
          <h1 className="font-sans text-[22px] font-bold tracking-[-0.02em] mt-1">
            Connect your wallet to view this deal
          </h1>
          <p className="mt-2 text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
            Deals are visible only to the buyer and seller they're opened between. Connect the
            wallet you used to open or accept this deal.
          </p>
          <div className="mt-4">
            <ConnectButton />
          </div>
        </Card>
      </div>
    );
  }
  if (!viewerIsBuyer && !viewerIsSeller) {
    return (
      <div className="space-y-4 fade-up max-w-2xl">
        <Card>
          <p className="eyebrow">Deals</p>
          <h1 className="font-sans text-[22px] font-bold tracking-[-0.02em] mt-1">
            You don&apos;t have any open deals here
          </h1>
          <p className="mt-2 text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
            Deals are visible only to the wallets that are party to them. Switch wallets if you&apos;re
            meant to see this one, or head back to start a new deal.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/buyer"
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] text-[var(--color-surface)] px-4 py-2 text-[12px] font-semibold hover:opacity-90 transition-opacity"
            >
              Open a deal
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/app"
              className="text-[12px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors"
            >
              Back to home
            </Link>
          </div>
        </Card>
      </div>
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
        err instanceof ApiError && err.detail
          ? String(err.detail)
          : (err as Error).message;
      setErrorInfo({ code, message });
    } finally {
      setBusy(false);
    }
  }

  // The seller's first accept provisions their agent wallets. If they have not
  // activated yet, confirm that before the accept call does it server-side.
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
        err instanceof ApiError && err.detail
          ? String(err.detail)
          : (err as Error).message;
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
        err instanceof ApiError && err.detail
          ? String(err.detail)
          : (err as Error).message;
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
        err instanceof ApiError && err.detail
          ? String(err.detail)
          : (err as Error).message;
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
        err instanceof ApiError && err.detail
          ? String(err.detail)
          : (err as Error).message;
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
        err instanceof ApiError && err.detail
          ? String(err.detail)
          : (err as Error).message;
      setErrorInfo({ code, message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 fade-up max-w-3xl">
      <header className="pb-3 border-b border-[var(--color-line)]">
        <div className="flex items-center gap-2.5">
          <p className="eyebrow">Direct deal</p>
          <StageBadge stage={stage} />
        </div>
        <div className="flex items-baseline gap-2 mt-1.5">
          <h1
            className="text-[44px] leading-[1.02] tabular-nums tracking-tight"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {formatUsdc(deal.dealAmountUsdc, { withSuffix: false })}
          </h1>
          <span className="text-[14px] mono text-[var(--color-ink-dim)] font-semibold">USDC</span>
        </div>
        <p className="text-[11px] mono text-[var(--color-ink-faint)] mt-2">
          {shortHash(deal.jobId, 10, 6)} · opened {relativeTime(deal.createdAt)}
        </p>
      </header>

      <section className="grid md:grid-cols-2 gap-4">
        <Card noPadding>
          <div className="px-5 pt-4 pb-3 border-b border-[var(--color-line)]">
            <p className="eyebrow">Parties</p>
          </div>
          <div className="px-5 py-3 space-y-3">
            <PartyRow
              role="Buyer"
              address={deal.buyer}
              you={viewerIsBuyer}
            />
            <PartyRow
              role="Seller"
              address={deal.seller}
              you={viewerIsSeller}
              showReputation
            />
          </div>
        </Card>

        <Card noPadding>
          <div className="px-5 pt-4 pb-3 border-b border-[var(--color-line)]">
            <p className="eyebrow">Funding · 1.5% fee, split evenly</p>
          </div>
          <div className="px-5 py-3 space-y-2">
            <MoneyRow label="Buyer funds" value={fee.fundedAmount} />
            <MoneyRow label="Seller receives" value={fee.sellerNet} strong />
            <MoneyRow label="Platform fee" value={fee.feeTotal} faint />
            <div className="pt-2 mt-1 border-t border-[var(--color-line)]">
              <MoneyRow
                label={`On delivery · ${deal.firstReleasePct}%`}
                value={(fee.sellerNet * deal.firstReleasePct) / 100}
              />
              <MoneyRow
                label={`On verification · ${100 - deal.firstReleasePct}%`}
                value={(fee.sellerNet * (100 - deal.firstReleasePct)) / 100}
              />
            </div>
          </div>
        </Card>
      </section>

      <Card title="Terms">
        <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed whitespace-pre-wrap">
          {deal.terms}
        </p>
        <p className="text-[11px] mono text-[var(--color-ink-faint)] mt-3 pt-3 border-t border-[var(--color-line)]">
          Deadline {relativeTime(deal.deadlineUnix * 1000)}
        </p>
      </Card>

      {deal.delivered && deal.deliveryProof && (
        <Card noPadding>
          <div className="px-5 pt-4 pb-3 border-b border-[var(--color-line)]">
            <p className="eyebrow">Delivery proof</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed whitespace-pre-wrap break-words">
              {deal.deliveryProof}
            </p>
          </div>
        </Card>
      )}

      <ProgressTrack deal={deal} stage={stage} />

      <Card>
        {!isConnected ? (
          <div className="space-y-3">
            <p className="text-[13px] text-[var(--color-ink-dim)]">
              Connect the wallet for this deal to act on it.
            </p>
            <ConnectButton />
          </div>
        ) : (
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
        )}
        {errorInfo && (
          <div className="mt-3">
            <DealErrorNote info={errorInfo} viewerIsBuyer={viewerIsBuyer} />
          </div>
        )}
      </Card>

      {(deal.fundTxHash || deal.onChain) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[11px]">
          {deal.fundTxHash && (
            <a
              href={ARC_EXPLORER_TX(deal.fundTxHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
            >
              <span className="eyebrow">Funding tx</span>
              <span className="mono">{shortHash(deal.fundTxHash)}</span>
              <ExternalIcon />
            </a>
          )}
        </div>
      )}

      {address && (
        <ChatPanel
          jobId={jobId}
          caller={address}
          counterpartyLabel={
            viewerIsBuyer ? `seller ${shortAddress(deal.seller)}` : `buyer ${shortAddress(deal.buyer)}`
          }
        />
      )}

      {showAcceptConsent && (
        <AcceptConsentModal
          busy={busy}
          onConfirm={doAccept}
          onClose={() => setShowAcceptConsent(false)}
        />
      )}
    </div>
  );
}

/// Shown when a seller without agent wallets accepts a deal. Accepting will
/// provision their agent wallet pair on the backend, so we confirm first.
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
      style={{ background: 'color-mix(in oklab, var(--color-ink) 32%, transparent)' }}
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] overflow-hidden"
      >
        <div className="px-6 pt-6 pb-4">
          <p className="eyebrow">Circle wallets</p>
          <h2 className="display text-[24px] leading-tight mt-1">An agent wallet will be created</h2>
        </div>
        <div className="px-6 pb-6 space-y-4">
          <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
            Accepting this deal provisions a Circle agent wallet pair tied to your wallet, then the
            buyer&apos;s escrow funds against it. Your seller agent receives the payouts. This is a
            one-time setup.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
              className="flex-1 px-4 py-2.5 rounded-md text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-wait transition-opacity"
            >
              {busy ? 'Working…' : 'Proceed & accept'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2.5 rounded-md text-[13px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] disabled:opacity-50 transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
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
        <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
          {role}
          {you && <span className="text-[var(--color-accent)]"> · you</span>}
        </p>
        <p className="text-[12px] mono mt-0.5">{shortAddress(address)}</p>
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
        className={`text-[12px] ${faint ? 'text-[var(--color-ink-faint)]' : 'text-[var(--color-ink-dim)]'}`}
      >
        {label}
      </span>
      <span
        className={`mono tabular-nums ${
          strong
            ? 'text-[14px] font-semibold text-[var(--color-ink)]'
            : 'text-[12px] text-[var(--color-ink)]'
        }`}
      >
        {formatUsdc(value)}
      </span>
    </div>
  );
}

function ProgressTrack({ deal, stage }: { deal: { firstReleasePct: number }; stage: DealStage }) {
  // A cancelled deal never progressed past funding.
  const cancelled = stage === 'cancelled';
  const past = (...stages: DealStage[]) => !cancelled && !stages.includes(stage);
  const steps = [
    {
      key: 'opened',
      label: 'Deal opened',
      done: true,
    },
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
    <Card noPadding>
      <div className="px-5 py-4">
        <ol className="space-y-3">
          {steps.map((s, i) => {
            const done = s.done;
            const active = i === firstPending && !terminal;
            return (
              <li key={s.key} className="flex items-center gap-3">
                <span
                  className={`relative shrink-0 w-4 h-4 rounded-full grid place-items-center ${
                    done
                      ? 'bg-[var(--color-positive)] text-white'
                      : 'bg-[var(--color-surface-2)] border border-[var(--color-line)]'
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: 'var(--color-positive)',
                        opacity: 0.35,
                        animation: 'flowPulse 1.8s ease-out infinite',
                      }}
                    />
                  )}
                  {done && (
                    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" className="relative">
                      <path
                        d="M3 8.5 L6.5 12 L13 5"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span
                  className={`text-[13px] ${
                    done ? 'text-[var(--color-ink)] font-medium' : 'text-[var(--color-ink-faint)]'
                  }`}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
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
      <p className="text-[13px] text-[var(--color-positive)] font-medium">
        {deal.autoReleasedAt
          ? 'Settled. The review window passed, so the final milestone released automatically. Reputation is recorded on chain.'
          : 'Settled. The seller has been paid in full and reputation is recorded on chain.'}
      </p>
    );
  }
  if (stage === 'cancelled') {
    return (
      <p className="text-[13px] text-[var(--color-ink-dim)]">
        {deal.fundTxHash
          ? 'Cancelled. The deadline passed without delivery, so the escrow was refunded to the buyer in full.'
          : 'Cancelled. The buyer withdrew before the seller accepted, so no escrow was funded.'}
      </p>
    );
  }
  if (stage === 'disputed') {
    return (
      <p className="text-[13px] text-[var(--color-critical)]">
        This deal is in dispute. The escrow is frozen on chain; resolution is handled
        off-platform for now.
      </p>
    );
  }

  if (stage === 'awaiting-acceptance') {
    if (viewerIsSeller) {
      return (
        <div className="space-y-3">
          <p className="text-[13px] text-[var(--color-ink-dim)]">
            Review the terms and the funding split above. Accepting agrees to deliver on these
            terms and funds the escrow. The buyer cannot release funds until you have accepted and
            delivered.
          </p>
          <BlackButton busy={busy} onClick={onAccept} label="Accept deal" />
        </div>
      );
    }
    // Buyer view, deal not yet accepted by the seller.
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-[var(--color-ink-dim)]">
          Waiting for the seller to accept the deal terms. Nothing is funded yet; the escrow funds
          when they accept. You can cancel anytime until then.
        </p>
        <OutlineButton busy={busy} onClick={onCancel} label="Cancel deal" critical />
      </div>
    );
  }

  if (stage === 'awaiting-delivery') {
    if (viewerIsSeller) {
      return (
        <div className="space-y-3">
          <p className="text-[13px] text-[var(--color-ink-dim)]">
            Mark the work delivered when it is done. This lets the buyer release the first{' '}
            {firstPct}%, then the remainder once they are satisfied.
          </p>
          <label className="block space-y-1.5">
            <span className="eyebrow">Delivery proof (optional)</span>
            <textarea
              value={deliveryProof}
              onChange={(e) => onDeliveryProofChange(e.target.value)}
              rows={2}
              placeholder="Link to the deliverable, a repo, a file, or a short note."
              className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px] leading-relaxed focus:outline-none focus:border-[var(--color-ink)] resize-none"
            />
          </label>
          <BlackButton busy={busy} onClick={onMarkDelivered} label="Mark delivered" />
        </div>
      );
    }
    // Buyer view, still awaiting delivery.
    const deadlinePassed = now > deal.deadlineUnix * 1000;
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-[var(--color-ink-dim)]">
          The seller accepted the deal. Waiting for them to mark the work delivered.
          {!deadlinePassed && ' If they miss the deadline, you can cancel and reclaim your funds.'}
        </p>
        {deadlinePassed && (
          <>
            <WindowNote tone="warning">
              The deadline passed and the seller has not marked the work delivered. You can cancel
              the deal and reclaim the full escrow balance.
            </WindowNote>
            <OutlineButton busy={busy} onClick={onCancel} label="Cancel & reclaim funds" critical />
          </>
        )}
      </div>
    );
  }

  const windowMs = deal.reviewWindowMs ?? REVIEW_WINDOW_MS;

  if (stage === 'awaiting-first-release') {
    // The first-release timer runs from when the seller marked delivered.
    const endsAt = deal.deliveredAt ? deal.deliveredAt + windowMs : null;
    const msLeft = endsAt ? endsAt - now : 0;
    const open = endsAt != null && msLeft > 0;
    const expired = endsAt != null && msLeft <= 0;

    if (viewerIsBuyer) {
      return (
        <div className="space-y-3">
          <p className="text-[13px] text-[var(--color-ink-dim)]">
            The seller marked the work delivered. Release the first {firstPct}% now. The
            remaining {100 - firstPct}% releases once you verify the work.
          </p>
          {open && (
            <WindowNote tone="warning">
              Auto-releases the first {firstPct}% to the seller in{' '}
              <span className="mono font-semibold">{fmtCountdown(msLeft)}</span> if you do not act.
            </WindowNote>
          )}
          {expired && (
            <WindowNote tone="muted">
              The release window passed. The agent will release the first {firstPct}% shortly
              unless you release it now.
            </WindowNote>
          )}
          <BlackButton busy={busy} onClick={onRelease} label={`Release first ${firstPct}%`} />
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-[var(--color-ink-dim)]">
          Delivered. Waiting for the buyer to release the first {firstPct}%.
        </p>
        {open && (
          <WindowNote tone="muted">
            Buyer release window:{' '}
            <span className="mono font-semibold">{fmtCountdown(msLeft)}</span> left. If it passes,
            the first {firstPct}% releases to you automatically.
          </WindowNote>
        )}
        {expired && (
          <WindowNote tone="muted">
            Release window passed. The agent will release the first {firstPct}% to you shortly.
          </WindowNote>
        )}
      </div>
    );
  }

  // awaiting-final-release: the buyer review window lives here.
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
      <div className="space-y-3">
        <p className="text-[13px] text-[var(--color-ink-dim)]">
          First {firstPct}% released. Verify the work and release the remaining {rest}% to
          settle the deal.
        </p>
        {windowOpen && (
          <WindowNote tone="warning">
            Auto-releases the final {rest}% to the seller in{' '}
            <span className="mono font-semibold">{fmtCountdown(msLeft)}</span> if you do not act.
            {canExtend
              ? ` Need longer? "Still reviewing" adds ${extensionMins} minutes.`
              : ' You have used all your extensions.'}
            {extensionCount > 0 &&
              ` (${extensionCount} extension${extensionCount > 1 ? 's' : ''} used)`}
          </WindowNote>
        )}
        {windowExpired && (
          <WindowNote tone="muted">
            Review window passed. The agent will auto-release the final {rest}% shortly unless
            you release it now.
          </WindowNote>
        )}
        <div className="flex flex-wrap gap-2">
          <BlackButton busy={busy} onClick={onRelease} label={`Verify & release final ${rest}%`} />
          {windowOpen && canExtend && (
            <OutlineButton
              busy={busy}
              onClick={onStillReviewing}
              label={`Still reviewing (+${extensionMins} min)`}
            />
          )}
        </div>
      </div>
    );
  }

  // seller view
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[var(--color-ink-dim)]">
        First {firstPct}% released. Waiting for the buyer to verify and release the final{' '}
        {rest}%.
      </p>
      {windowOpen && !baseWindowPassed && (
        <WindowNote tone="muted">
          Buyer review window:{' '}
          <span className="mono font-semibold">{fmtCountdown(msLeft)}</span> left. If it passes
          without action, the final {rest}% releases to you automatically.
        </WindowNote>
      )}
      {baseWindowPassed && (
        <div className="space-y-2.5">
          <WindowNote tone="warning">
            {windowExpired
              ? `The review window passed. The agent will auto-release the final ${rest}% to you shortly.`
              : `The buyer extended the review window (${fmtCountdown(msLeft)} left). You can wait for the automatic release or appeal to move the deal to dispute.`}
          </WindowNote>
          <OutlineButton busy={busy} onClick={onAppeal} label="Appeal this deal" critical />
        </div>
      )}
    </div>
  );
}

function WindowNote({
  tone,
  children,
}: {
  tone: 'warning' | 'muted';
  children: React.ReactNode;
}) {
  const style =
    tone === 'warning'
      ? { background: 'var(--color-warning-soft)', color: 'var(--color-warning)' }
      : { background: 'var(--color-surface-2)', color: 'var(--color-ink-dim)' };
  return (
    <p className="text-[12px] leading-snug rounded-md px-2.5 py-2" style={style}>
      {children}
    </p>
  );
}

function OutlineButton({
  busy,
  onClick,
  label,
  critical,
}: {
  busy: boolean;
  onClick: () => void;
  label: string;
  critical?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-[13px] font-semibold border transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-50 disabled:cursor-wait"
      style={
        critical
          ? { borderColor: 'var(--color-critical)', color: 'var(--color-critical)' }
          : { borderColor: 'var(--color-line-strong)', color: 'var(--color-ink)' }
      }
    >
      {busy && (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden>
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
          <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      {busy ? 'Working…' : label}
    </button>
  );
}

function BlackButton({
  busy,
  onClick,
  label,
}: {
  busy: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-wait transition-opacity"
    >
      {busy && (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden>
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
          <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      {busy ? 'Confirming on Arc…' : label}
    </button>
  );
}

function ExternalIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5.5 4.5h6v6M11 5l-6.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/// Renders a backend deal error as a clean Note. Recognises agent-balance
/// failures and explains them in plain language, with a profile link for the
/// buyer so they can top the agent up.
function DealErrorNote({
  info,
  viewerIsBuyer,
}: {
  info: { code?: string; message: string };
  viewerIsBuyer: boolean;
}) {
  if (info.code === 'INSUFFICIENT_AGENT_BALANCE') {
    return (
      <Note tone="error">
        <div className="space-y-1.5">
          <p className="font-medium">Buyer agent does not have enough USDC on Arc.</p>
          {viewerIsBuyer ? (
            <p className="text-[11px] opacity-90">
              Top up the buyer agent from your profile, then the seller can accept.{' '}
              <Link href="/profile" className="underline font-medium">
                Fund agent
              </Link>
            </p>
          ) : (
            <p className="text-[11px] opacity-90">
              The buyer has been notified to top it up. Try accepting again once it is funded.
            </p>
          )}
        </div>
      </Note>
    );
  }
  if (info.code === 'INSUFFICIENT_AGENT_GAS') {
    return (
      <Note tone="error">
        <p className="font-medium">
          The buyer agent does not have enough native gas on Arc to send this transaction.
        </p>
      </Note>
    );
  }
  return <Note tone="error">{info.message}</Note>;
}
