'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, ApiError, type MatchProposal } from '@/core/api';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { shortAddress, formatUsdc, relativeTime } from '@/shared/utils/format';
import { ProfilePeekModal } from './ProfilePeekModal';

interface Props {
  proposal: MatchProposal;
  onChange: () => void;
}

export function MatchBanner({ proposal, onChange }: Props) {
  const router = useRouter();
  const { address } = useAuth();
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeclineReason, setShowDeclineReason] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [peekOpen, setPeekOpen] = useState(false);

  // Seller is the approval gate. Buyer pre-committed via brief budget+tolerance;
  // their agent funds escrow automatically once the seller accepts.
  const viewerIsSeller =
    !!address && address.toLowerCase() === proposal.sellerUser.toLowerCase();
  const viewerIsBuyer =
    !!address && address.toLowerCase() === proposal.buyerUser.toLowerCase();
  const approved = !!proposal.approvedAt;
  const declined = !!proposal.declinedAt;

  async function onApprove() {
    if (!address) return;
    setBusy('approve');
    setError(null);
    try {
      await api.approveMatch(proposal.jobId, address);
      onChange();
      // After approval, deal lives under /deals/[id] (direct-deal flow).
      router.push(`/deals/${proposal.jobId}`);
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setError(detail);
    } finally {
      setBusy(null);
    }
  }

  async function onDecline() {
    if (!address) return;
    setBusy('decline');
    setError(null);
    try {
      await api.declineMatch(proposal.jobId, address, declineReason.trim() || undefined);
      setShowDeclineReason(false);
      setDeclineReason('');
      onChange();
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setError(detail);
    } finally {
      setBusy(null);
    }
  }

  // Terminal states render a compact summary, no actions.
  if (approved) {
    return (
      <BannerFrame tone="positive" eyebrow="Seller accepted">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[13px] text-[var(--color-ink)] font-medium">
            The seller accepted your deal. Escrow is funded. Opening the live deal.
          </p>
          <a
            href={`/deals/${proposal.jobId}`}
            className="text-[12px] mono text-[var(--color-ink)] underline-offset-2 hover:underline shrink-0"
          >
            Open deal →
          </a>
        </div>
      </BannerFrame>
    );
  }
  if (declined) {
    return (
      <BannerFrame tone="default" eyebrow="Match declined">
        <p className="text-[13px] text-[var(--color-ink-dim)]">
          {viewerIsSeller
            ? "You declined this match. The job stays closed; the buyer can post a fresh brief."
            : 'The seller declined this match. Post a fresh brief to re-run the auction.'}
        </p>
      </BannerFrame>
    );
  }

  const riskLabel: Record<NonNullable<MatchProposal['riskFlag']>, string> = {
    'honey-trap': 'Risk flag · low rep, generous bid',
    lowball: 'Risk flag · lowball from unproven actor',
    spammy: 'Risk flag · counterparty unusually active',
    'new-buyer': 'Heads up · buyer is new to the network',
  };

  // Pending. full proposal surface.
  return (
    <BannerFrame tone="accent" eyebrow="Match found · awaiting approval">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <div className="flex items-baseline gap-3">
          <div className="flex items-baseline gap-1.5">
            <span
              className="serif text-[38px] tabular-nums leading-none tracking-[-0.02em]"
              style={{ color: 'var(--color-ink)' }}
            >
              {formatUsdc(proposal.agreedPriceUsdc, { withSuffix: false })}
            </span>
            <span className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
              USDC
            </span>
          </div>
          <span className="text-[12px] text-[var(--color-ink-faint)]">
            proposed {relativeTime(proposal.proposedAt)}
          </span>
        </div>
        {(() => {
          // Always show the counterparty so the viewer sees who they're
          // dealing with: seller looks at buyer, buyer looks at seller.
          const counterpartyAddress = viewerIsSeller
            ? proposal.buyerUser
            : proposal.sellerUser;
          const counterpartyRole: 'buyer' | 'seller' = viewerIsSeller ? 'buyer' : 'seller';
          const counterpartyLabel = viewerIsSeller ? 'Buyer' : 'Seller';
          const canPeek = viewerIsSeller || viewerIsBuyer;
          return (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
                {counterpartyLabel}
              </span>
              <span className="mono text-[12px] text-[var(--color-ink-dim)]">
                {shortAddress(counterpartyAddress)}
              </span>
              <ReputationBadge address={counterpartyAddress} size="sm" />
              {canPeek && (
                <button
                  type="button"
                  onClick={() => setPeekOpen(true)}
                  className="mono text-[10px] uppercase tracking-[0.14em] px-2 py-1 border transition-colors hover:bg-[var(--color-surface-2)]"
                  style={{
                    color: 'var(--color-ink-dim)',
                    borderColor: 'var(--color-line-strong)',
                    borderRadius: 2,
                  }}
                >
                  View profile
                </button>
              )}
              <ProfilePeekModal
                open={peekOpen}
                onClose={() => setPeekOpen(false)}
                address={counterpartyAddress}
                role={counterpartyRole}
              />
            </div>
          );
        })()}
      </div>

      {/* Risk flags are all seller-facing warnings (honey-trap, lowball,
          spammy, new-buyer) — they describe the BUYER, for the SELLER to
          judge before accepting. Render only when the viewer is the seller
          so the buyer doesn't see warnings written about themselves. */}
      {proposal.riskFlag && proposal.riskNote && viewerIsSeller && (
        <div
          className="mt-4 px-4 py-3"
          style={{
            background: 'rgba(178, 84, 37, 0.10)',
            border: '1px solid rgba(178, 84, 37, 0.30)',
            color: '#b25425',
            borderTopLeftRadius: 10,
            borderTopRightRadius: 10,
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 3,
          }}
        >
          <p className="mono text-[9px] font-bold uppercase tracking-[0.18em] mb-1.5">
            {riskLabel[proposal.riskFlag]}
          </p>
          <p className="text-[12.5px] leading-snug" style={{ color: 'var(--color-ink)' }}>
            {proposal.riskNote}
          </p>
        </div>
      )}

      {/* Balance-aware accept (task #184): the agent negotiated freely up to the
          buyer's authorized cap, but its wallet is short for this price. Surface
          the top-up upfront so the buyer acts before the seller's accept tries
          to fund. Never blocks the match. fundable===false only; undefined =
          legacy/unknown, no banner. */}
      {proposal.fundable === false && (
        <div
          className="mt-4 px-4 py-3"
          style={{
            background: 'rgba(224, 162, 60, 0.10)',
            border: '1px solid rgba(224, 162, 60, 0.32)',
            borderTopLeftRadius: 10,
            borderTopRightRadius: 10,
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 3,
          }}
        >
          <p
            className="mono text-[9px] font-bold uppercase tracking-[0.18em] mb-1.5"
            style={{ color: '#b07d1f' }}
          >
            Top up needed
          </p>
          <p className="text-[12.5px] leading-snug" style={{ color: 'var(--color-ink)' }}>
            {viewerIsBuyer
              ? `Your agent agreed within your cap, but its wallet is short by ${formatUsdc(proposal.topUpNeededUsdc ?? '0', { withSuffix: true })}. Top up your buyer agent so the seller can accept and escrow can fund.`
              : 'The buyer agent needs a top-up before this can fund. The buyer has been prompted to add funds.'}
          </p>
        </div>
      )}

      {viewerIsSeller && !showDeclineReason && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={busy !== null}
            style={{ backgroundColor: 'var(--color-ink)', color: 'var(--color-surface)' }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-wait transition-opacity"
          >
            {busy === 'approve' && <Spinner />}
            {busy === 'approve' ? 'Funding escrow…' : 'Accept match'}
          </button>
          <button
            type="button"
            onClick={() => setShowDeclineReason(true)}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-[13px] font-medium border transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-50"
            style={{
              borderColor: 'var(--color-line-strong)',
              color: 'var(--color-ink-dim)',
            }}
          >
            Decline
          </button>
        </div>
      )}

      {viewerIsSeller && showDeclineReason && (
        <div className="mt-4 space-y-2">
          <label className="block space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
              Reason (optional)
            </span>
            <input
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              maxLength={400}
              placeholder="Why are you declining this match?"
              className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--color-ink)]"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDecline}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold border"
              style={{
                borderColor: 'var(--color-critical)',
                color: 'var(--color-critical)',
              }}
            >
              {busy === 'decline' && <Spinner />}
              {busy === 'decline' ? 'Declining…' : 'Confirm decline'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowDeclineReason(false);
                setDeclineReason('');
              }}
              disabled={busy !== null}
              className="px-3 py-2 text-[12px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {viewerIsBuyer && proposal.fundable !== false && (
        <p className="mt-3 text-[13px] text-[var(--color-ink-dim)]">
          Waiting for the seller to accept. Your agent will fund escrow automatically when they
          do. No action needed from you.
        </p>
      )}
      {!viewerIsBuyer && !viewerIsSeller && (
        <p className="mt-3 text-[13px] text-[var(--color-ink-dim)]">
          Waiting for the seller to accept this match.
        </p>
      )}

      {error && (
        <p className="mt-3 text-[11px] mono text-[var(--color-critical)]">{error}</p>
      )}
    </BannerFrame>
  );
}

function BannerFrame({
  tone,
  eyebrow,
  children,
}: {
  tone: 'accent' | 'positive' | 'default';
  eyebrow: string;
  children: React.ReactNode;
}) {
  const toneInk =
    tone === 'positive'
      ? 'var(--color-positive)'
      : tone === 'accent'
        ? 'var(--color-accent)'
        : 'var(--color-ink)';
  const toneBorder =
    tone === 'positive'
      ? 'color-mix(in srgb, var(--color-positive) 30%, var(--color-line))'
      : tone === 'accent'
        ? 'color-mix(in srgb, var(--color-accent) 28%, var(--color-line))'
        : 'var(--color-line-strong)';

  return (
    <div
      className="relative flex items-stretch border bg-[var(--color-surface)] fade-up"
      style={{ borderColor: toneBorder, borderRadius: 3 }}
    >
      <span aria-hidden className="w-[3px]" style={{ background: toneInk }} />
      <div className="flex-1 px-5 py-4">
        <p
          className="mono uppercase font-semibold text-[9px] tracking-[0.22em] mb-2"
          style={{ color: toneInk }}
        >
          {eyebrow}
        </p>
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
