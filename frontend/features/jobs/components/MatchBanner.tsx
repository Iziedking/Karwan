'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, ApiError, type MatchProposal, type UserProfile, type Reputation } from '@/core/api';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { useReputation } from '@/features/reputation/hooks/useReputation';
import { shortAddress, formatUsdc, relativeTime } from '@/shared/utils/format';
import { ARC_EXPLORER_TX } from '@/features/profile/config';
import { ProfilePeekModal } from './ProfilePeekModal';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

interface Props {
  proposal: MatchProposal;
  onChange: () => void;
  /// True when the brief was posted with the Trusted Match flag on. Drives a
  /// richer counterparty profile card so the human gate has reputation, stake
  /// proxy (deal count), and identity (X handle + passport) up front.
  trustedMatch?: boolean;
}

export function MatchBanner({ proposal, onChange, trustedMatch = false }: Props) {
  const mb = useTranslations().matchBanner;
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

  // The risk flags new-buyer / honey-trap / lowball all hinge on the buyer being
  // unproven (NEW/COLD) at match time. They're a point-in-time snapshot; if the
  // buyer's live tier is now ESTABLISHED+, the warning is stale and contradicts
  // the badge shown right beside it. Read the live tier and suppress those flags
  // when it no longer holds. (spammy is velocity-based, not tier-based — kept.)
  const { data: buyerRep } = useReputation(proposal.buyerUser);
  const buyerProvenNow =
    buyerRep?.tier === 'ESTABLISHED' ||
    buyerRep?.tier === 'STRONG' ||
    buyerRep?.tier === 'ELITE';
  const flagIsRepBased =
    proposal.riskFlag === 'new-buyer' ||
    proposal.riskFlag === 'honey-trap' ||
    proposal.riskFlag === 'lowball';
  const showRisk =
    !!proposal.riskFlag &&
    !!proposal.riskNote &&
    viewerIsSeller &&
    !(flagIsRepBased && buyerProvenNow);

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
      <BannerFrame tone="positive" eyebrow={mb.approvedEyebrow}>
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[13px] text-[var(--color-ink)] font-medium">
            {mb.approvedBody}
          </p>
          <a
            href={`/deals/${proposal.jobId}`}
            className="text-[12px] mono text-[var(--color-ink)] underline-offset-2 hover:underline shrink-0"
          >
            {mb.approvedCta}
          </a>
        </div>
      </BannerFrame>
    );
  }
  if (declined) {
    return (
      <BannerFrame tone="default" eyebrow={mb.declinedEyebrow}>
        <p className="text-[13px] text-[var(--color-ink-dim)]">
          {viewerIsSeller ? mb.declinedSellerView : mb.declinedOtherView}
        </p>
      </BannerFrame>
    );
  }

  const riskLabel: Record<NonNullable<MatchProposal['riskFlag']>, string> = {
    'honey-trap': mb.risk.honeyTrap,
    lowball: mb.risk.lowball,
    spammy: mb.risk.spammy,
    'new-buyer': mb.risk.newBuyer,
    // i18n debt: these two are hardcoded English until the next i18n
    // extraction pass picks them up across all locales.
    'concentration-soft': 'CONCENTRATION HIGH',
    'concentration-high': 'CONCENTRATION HARD',
  };

  // Pending. full proposal surface.
  return (
    <BannerFrame tone="accent" eyebrow={mb.pendingEyebrow}>
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
            {mb.proposedTemplate.replace('{time}', relativeTime(proposal.proposedAt))}
          </span>
        </div>
        {(() => {
          // Always show the counterparty so the viewer sees who they're
          // dealing with: seller looks at buyer, buyer looks at seller.
          const counterpartyAddress = viewerIsSeller
            ? proposal.buyerUser
            : proposal.sellerUser;
          const counterpartyRole: 'buyer' | 'seller' = viewerIsSeller ? 'buyer' : 'seller';
          const counterpartyLabel = viewerIsSeller
            ? mb.counterparty.buyerLabel
            : mb.counterparty.sellerLabel;
          const canPeek = viewerIsSeller || viewerIsBuyer;
          return (
            <CounterpartySignal
              address={counterpartyAddress}
              role={counterpartyRole}
              label={counterpartyLabel}
              canPeek={canPeek}
              trusted={trustedMatch}
              onOpenPeek={() => setPeekOpen(true)}
              peekOpen={peekOpen}
              onClosePeek={() => setPeekOpen(false)}
              copy={mb.counterparty}
            />
          );
        })()}
      </div>

      {/* Paid x402 verification: the buyer agent paid real USDC for the
          seller's credit passport at bid time. Shown to both parties as a
          quiet provenance line; the settlement reference links out when it
          is a chain hash. */}
      {proposal.paidSignal && (
        <p className="mt-3 mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
          [:{mb.paidData.label}:]{' '}
          <span className="normal-case tracking-normal text-[11px]">
            {mb.paidData.template.replace(
              '{amount}',
              `$${proposal.paidSignal.amountUsd}`,
            )}
          </span>
          {/^0x[0-9a-fA-F]{64}$/.test(proposal.paidSignal.transaction) && (
            <>
              {' · '}
              <a
                href={ARC_EXPLORER_TX(proposal.paidSignal.transaction)}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 normal-case tracking-normal text-[11px]"
              >
                {mb.paidData.txCta}
              </a>
            </>
          )}
        </p>
      )}

      {/* Risk flags are all seller-facing warnings (honey-trap, lowball,
          spammy, new-buyer) — they describe the BUYER, for the SELLER to
          judge before accepting. Render only when the viewer is the seller
          so the buyer doesn't see warnings written about themselves. */}
      {showRisk && (
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
            {riskLabel[proposal.riskFlag!]}
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
            {mb.topUp.eyebrow}
          </p>
          <p className="text-[12.5px] leading-snug" style={{ color: 'var(--color-ink)' }}>
            {viewerIsBuyer
              ? mb.topUp.buyerTemplate.replace(
                  '{amount}',
                  formatUsdc(proposal.topUpNeededUsdc ?? '0', { withSuffix: true }),
                )
              : mb.topUp.sellerBody}
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
            {busy === 'approve' ? mb.approveBusy : mb.approveCta}
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
            {mb.declineCta}
          </button>
        </div>
      )}

      {viewerIsSeller && showDeclineReason && (
        <div className="mt-4 space-y-2">
          <label className="block space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
              {mb.declineReasonLabel}
            </span>
            <input
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              maxLength={400}
              placeholder={mb.declineReasonPlaceholder}
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
              {busy === 'decline' ? mb.declineConfirmBusy : mb.declineConfirmCta}
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
              {mb.declineCancelCta}
            </button>
          </div>
        </div>
      )}

      {viewerIsBuyer && proposal.fundable !== false && (
        <p className="mt-3 text-[13px] text-[var(--color-ink-dim)]">{mb.buyerWaiting}</p>
      )}
      {!viewerIsBuyer && !viewerIsSeller && (
        <p className="mt-3 text-[13px] text-[var(--color-ink-dim)]">{mb.outsideWaiting}</p>
      )}

      {error && (
        <p className="mt-3 text-[11px] mono text-[var(--color-critical)]">{error}</p>
      )}
    </BannerFrame>
  );
}

/// Counterparty profile signal block. Renders inline next to the agreed price
/// on a match. Fetches the user's profile to surface X avatar + handle + the
/// Credit Passport link. The reputation hook supplies tier and deal counts.
/// In Trusted Match mode the block expands into a dedicated card with all the
/// signals up front so the human gate has the full picture before approving.
function CounterpartySignal({
  address,
  role,
  label,
  canPeek,
  trusted,
  peekOpen,
  onOpenPeek,
  onClosePeek,
  copy,
}: {
  address: string;
  role: 'buyer' | 'seller';
  label: string;
  canPeek: boolean;
  trusted: boolean;
  peekOpen: boolean;
  onOpenPeek: () => void;
  onClosePeek: () => void;
  copy: Messages['matchBanner']['counterparty'];
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const { data: rep } = useReputation(address);

  useEffect(() => {
    let cancelled = false;
    api
      .getProfile(address)
      .then((r) => {
        if (!cancelled) setProfile(r.profile);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const avatarUrl = profile?.xProfileImageUrl?.trim() || null;
  const xHandle = profile?.xHandle?.replace(/^@/, '') || null;
  const passportHref = `/credit-passport/${address}`;
  const xHref = xHandle ? `https://x.com/${xHandle}` : null;
  const recordLine = rep ? formatRecord(rep, copy.record) : null;

  // Compact row for Normal mode — preserves the existing footprint. Address
  // always renders as a masked line directly under the avatar so the viewer
  // can verify the wallet at a glance even when the X handle is bound.
  if (!trusted) {
    return (
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
          {label}
        </span>
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              width={28}
              height={28}
              className="w-7 h-7 rounded-full object-cover"
              style={{ border: '1px solid var(--color-line)' }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="w-7 h-7 flex items-center justify-center mono text-[9px] font-bold uppercase"
              style={{
                background: 'var(--lp-light)',
                border: '1px solid var(--color-line)',
                color: 'var(--color-ink-dim)',
                borderRadius: 999,
              }}
              aria-hidden
            >
              {address.slice(2, 4).toUpperCase()}
            </div>
          )}
          <span className="mono text-[9px] tabular-nums text-[var(--color-ink-faint)] tracking-tight">
            {shortAddress(address)}
          </span>
        </div>
        {xHandle && (
          <span className="mono text-[12px] text-[var(--color-ink-dim)]">@{xHandle}</span>
        )}
        <ReputationBadge address={address} size="sm" />
        {canPeek && (
          <button
            type="button"
            onClick={onOpenPeek}
            className="mono text-[10px] uppercase tracking-[0.14em] px-2 py-1 border transition-colors hover:bg-[var(--color-surface-2)]"
            style={{
              color: 'var(--color-ink-dim)',
              borderColor: 'var(--color-line-strong)',
              borderRadius: 2,
            }}
          >
            {copy.viewProfile}
          </button>
        )}
        <ProfilePeekModal open={peekOpen} onClose={onClosePeek} address={address} role={role} />
      </div>
    );
  }

  // Trusted Match: a dedicated card with avatar, identity, record, and direct
  // links. The block runs full-width below the price so the human gate has
  // all the trust signals up front rather than buried in a modal.
  return (
    <div
      className="basis-full flex items-stretch gap-4 mt-3 px-4 py-3"
      style={{
        background: 'color-mix(in oklab, var(--lp-accent) 8%, transparent)',
        border: '1px solid color-mix(in oklab, var(--lp-accent) 32%, var(--color-line))',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      <div className="shrink-0 flex flex-col items-center gap-1">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            width={48}
            height={48}
            className="w-12 h-12 rounded-full object-cover"
            style={{ border: '1px solid var(--color-line)' }}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="w-12 h-12 flex items-center justify-center mono text-[14px] font-extrabold uppercase"
            style={{
              background: 'var(--lp-light)',
              border: '1px solid var(--color-line)',
              color: 'var(--color-ink-dim)',
              borderRadius: 999,
            }}
            aria-hidden
          >
            {address.slice(2, 4).toUpperCase()}
          </div>
        )}
        <span
          className="mono text-[9px] tabular-nums text-[var(--color-ink-faint)] tracking-tight"
          title={address}
        >
          {shortAddress(address)}
        </span>
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
            {label}
          </span>
          <span className="font-sans text-[15px] font-bold text-[var(--color-ink)]">
            {profile?.displayName?.trim() || (xHandle ? `@${xHandle}` : shortAddress(address))}
          </span>
          {xHandle && profile?.displayName && (
            <span className="mono text-[11px] text-[var(--color-ink-faint)]">@{xHandle}</span>
          )}
          <ReputationBadge address={address} size="sm" />
        </div>
        {recordLine && (
          <div className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-dim)]">
            {recordLine}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Link
            href={passportHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 mono text-[10px] uppercase tracking-[0.12em] font-semibold transition-colors"
            style={{
              background: 'var(--lp-accent)',
              color: 'var(--lp-band-dark)',
              borderRadius: 3,
            }}
          >
            {copy.creditPassport}
            <span aria-hidden>↗</span>
          </Link>
          {xHref && (
            <a
              href={xHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 mono text-[10px] uppercase tracking-[0.12em] font-semibold transition-colors"
              style={{
                background: 'var(--lp-dark)',
                color: 'var(--lp-card)',
                borderRadius: 3,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M12.5 1.5h2L9.8 6.9 15 14.5h-4.3l-3.4-4.9-3.8 4.9H1.4l5-6.4L1.5 1.5h4.4l3.1 4.5 3.5-4.5z" />
              </svg>
              {copy.onX}
            </a>
          )}
          {canPeek && (
            <button
              type="button"
              onClick={onOpenPeek}
              className="inline-flex items-center gap-1 px-2.5 py-1 mono text-[10px] uppercase tracking-[0.12em] font-semibold border transition-colors hover:bg-[var(--color-surface-2)]"
              style={{
                color: 'var(--color-ink-dim)',
                borderColor: 'var(--color-line-strong)',
                borderRadius: 3,
              }}
            >
              {copy.more}
            </button>
          )}
        </div>
      </div>
      <ProfilePeekModal open={peekOpen} onClose={onClosePeek} address={address} role={role} />
    </div>
  );
}

function formatRecord(
  rep: Reputation,
  copy: Messages['matchBanner']['counterparty']['record'],
): string {
  const total = rep.totalDeals ?? 0;
  const success = rep.successCount ?? 0;
  const disputed = rep.disputedCount ?? 0;
  if (total === 0) return copy.noDeals;
  const totalLabel =
    total === 1 ? copy.dealOne : copy.dealsTemplate.replace('{n}', String(total));
  const parts = [totalLabel, copy.settledTemplate.replace('{n}', String(success))];
  if (disputed > 0) parts.push(copy.disputedTemplate.replace('{n}', String(disputed)));
  return parts.join(' · ');
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
