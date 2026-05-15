'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { api, ApiError, type MatchProposal } from '@/core/api';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { shortAddress, formatUsdc, relativeTime } from '@/shared/utils/format';

interface Props {
  proposal: MatchProposal;
  onChange: () => void;
}

export function MatchBanner({ proposal, onChange }: Props) {
  const router = useRouter();
  const { address } = useAccount();
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeclineReason, setShowDeclineReason] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

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
      <BannerFrame tone="positive" eyebrow="Match approved">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[13px] text-[var(--color-ink-dim)]">
            Escrow is funded. The seller has been notified and is preparing delivery.
          </p>
          <a
            href={`/deals/${proposal.jobId}`}
            className="text-[12px] mono text-[var(--color-ink)] underline-offset-2 hover:underline"
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
          You declined this proposal. The job stays closed; re-run the auction by posting again.
        </p>
      </BannerFrame>
    );
  }

  // Pending — full proposal surface.
  return (
    <BannerFrame tone="accent" eyebrow="Match found · awaiting approval">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <div className="flex items-baseline gap-3">
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-[34px] mono tabular-nums leading-none font-semibold tracking-tight"
              style={{ color: 'var(--color-ink)' }}
            >
              {formatUsdc(proposal.agreedPriceUsdc, { withSuffix: false })}
            </span>
            <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
              USDC
            </span>
          </div>
          <span className="text-[12px] text-[var(--color-ink-faint)]">
            proposed {relativeTime(proposal.proposedAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
            Seller
          </span>
          <span className="mono text-[12px] text-[var(--color-ink-dim)]">
            {shortAddress(proposal.sellerUser)}
          </span>
          <ReputationBadge address={proposal.sellerUser} size="sm" />
        </div>
      </div>

      {viewerIsBuyer && !showDeclineReason && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={busy !== null}
            style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-wait transition-opacity"
          >
            {busy === 'approve' && <Spinner />}
            {busy === 'approve' ? 'Funding escrow…' : 'Approve & fund escrow'}
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

      {viewerIsBuyer && showDeclineReason && (
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

      {!viewerIsBuyer && (
        <p className="mt-3 text-[12px] text-[var(--color-ink-faint)]">
          Waiting for the buyer to approve and fund escrow.
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
