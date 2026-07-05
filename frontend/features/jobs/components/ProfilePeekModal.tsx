'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type UserProfile, type CounterpartyReport } from '@/core/api';
import { useClipboard } from '@/shared/hooks/useClipboard';
import { shortAddress } from '@/shared/utils/format';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { useReputation } from '@/features/reputation/hooks/useReputation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

// Per-tier hue, mirroring ProfileTierCard so the tier reads the same colour
// everywhere. Shown as a rail down the profile box.
const TIER_HUE: Record<string, string> = {
  NEW: '#9a9a9a',
  COLD: '#e0a23c',
  ESTABLISHED: 'var(--lp-accent)',
  STRONG: '#5fd08a',
  ELITE: '#39e08a',
};

interface Props {
  open: boolean;
  onClose: () => void;
  address: string;
  role: 'buyer' | 'seller';
  /// Lightweight identity card for surfaces where the full peek (X link,
  /// Credit Passport, copy-address, reputation detail) would be overkill,
  /// like a bid card during an auction. Renders just the display name and
  /// the masked address with a tiny close button.
  compact?: boolean;
  /// When set, the modal shows the counterparty's real work record (granular,
  /// DB-private, paid). Pass the deal's jobId so the read is party-gated. Only
  /// rendered on the full (non-compact) peek.
  workRecordJobId?: string;
  /// The viewer, sent as the caller for the party-gated work-record read.
  caller?: string;
}

export function ProfilePeekModal({
  open,
  onClose,
  address,
  role,
  compact = false,
  workRecordJobId,
  caller,
}: Props) {
  const pp = useTranslations().profilePeek;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { copied, copy } = useClipboard();
  const { data: rep } = useReputation(open ? address : undefined);
  const tierHue = TIER_HUE[(rep?.tier ?? 'NEW') as string] ?? TIER_HUE.NEW;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoaded(false);
    api
      .getProfile(address)
      .then((r) => {
        if (!cancelled) {
          setProfile(r.profile);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(null);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, address]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const displayName = profile?.displayName?.trim();
  const xHandle = profile?.xHandle?.replace(/^@/, '');
  const xHref = xHandle ? `https://x.com/${xHandle}` : null;

  // Compact: a stripped-down identity card for surfaces like the bid card
  // where the auction is still running. Just the display name and the masked
  // address. No tier rail, no actions, no reputation detail.
  if (compact) {
    return createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        style={{ background: 'rgba(14,14,14,0.55)', backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={role === 'buyer' ? pp.identityAriaBuyer : pp.identityAriaSeller}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-[320px] fade-up"
          style={{
            background: 'var(--lp-card)',
            border: '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 3,
            boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 12px 32px -16px rgba(0,0,0,0.3)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={pp.closeLabel}
            className="absolute top-2 end-2 inline-flex items-center justify-center w-6 h-6 rounded-full text-[var(--lp-text-muted)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M3 3l10 10M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div className="px-5 py-4">
            <span className="mono text-[9px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
              {role === 'buyer' ? pp.compactEyebrowBuyer : pp.compactEyebrowSeller}
            </span>
            {displayName ? (
              <>
                <p className="mt-1.5 font-sans text-[16px] font-bold tracking-[-0.01em] text-[var(--lp-dark)] truncate">
                  {displayName}
                </p>
                <p className="mt-0.5 mono text-[11px] tabular-nums text-[var(--lp-text-sub)]">
                  {shortAddress(address)}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1.5 font-sans text-[16px] font-bold tracking-[-0.01em] text-[var(--lp-dark)] truncate">
                  {shortAddress(address)}
                </p>
                <p className="mt-0.5 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                  {pp.noDisplayName}
                </p>
              </>
            )}
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(14,14,14,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={role === 'buyer' ? pp.profileAriaBuyer : pp.profileAriaSeller}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden fade-up"
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
        {/* Tier-coloured rail down the box: reflects the account's reputation
            tier (grey NEW, amber COLD, lime ESTABLISHED, green STRONG/ELITE). */}
        <span
          aria-hidden
          className="absolute start-0 top-0 bottom-0 w-[4px]"
          style={{ background: tierHue }}
        />
        <div className="relative px-6 pt-7 pb-5">
          <button
            type="button"
            onClick={onClose}
            aria-label={pp.closeLabel}
            className="absolute top-3 end-3 inline-flex items-center justify-center w-7 h-7 rounded-full text-[var(--lp-text-muted)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M3 3l10 10M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            {role === 'buyer' ? pp.fullEyebrowBuyer : pp.fullEyebrowSeller}
          </span>
          <h2 className="mt-2 font-sans text-[20px] font-extrabold tracking-[-0.02em] text-[var(--lp-dark)]">
            {displayName || shortAddress(address)}
          </h2>
          <p className="mt-1 mono text-[11px] tabular-nums text-[var(--lp-text-sub)] break-all">
            {address}
          </p>

          <div className="mt-4 flex items-center gap-2">
            <ReputationBadge address={address} size="md" withDetail />
          </div>
        </div>

        <div className="px-4 pb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => copy(address)}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 mono text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors"
            style={{
              background: 'var(--lp-light)',
              border: '1px solid var(--lp-border-light)',
              color: 'var(--lp-dark)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            {copied ? pp.copied : pp.copyAddress}
          </button>
          {xHref ? (
            <a
              href={xHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-3 mono text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors"
              style={{
                background: 'var(--lp-dark)',
                border: '1px solid var(--lp-dark)',
                color: 'var(--lp-card)',
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M12.5 1.5h2L9.8 6.9 15 14.5h-4.3l-3.4-4.9-3.8 4.9H1.4l5-6.4L1.5 1.5h4.4l3.1 4.5 3.5-4.5zm-.7 11.7h1.1L4.3 2.7H3.1l8.7 10.5z" />
              </svg>
              {`@${xHandle}`}
            </a>
          ) : (
            <span
              className="inline-flex items-center justify-center gap-2 px-4 py-3 mono text-[11px] uppercase tracking-[0.08em]"
              style={{
                background: 'var(--lp-light)',
                border: '1px dashed rgba(0,0,0,0.18)',
                color: 'var(--lp-text-muted)',
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              {loaded ? pp.xNotConnected : pp.loading}
            </span>
          )}
        </div>

        {workRecordJobId && (
          <WorkRecordSection jobId={workRecordJobId} caller={caller} role={role} />
        )}
      </div>
    </div>,
    document.body,
  );
}

const OUTCOME_HUE: Record<string, string> = {
  clean: '#0a7553',
  disputed: '#b25425',
  failed: '#b03d3a',
};

/// Only link a payment tx when it looks like a real 32-byte hash. The internal
/// Arc x402 settlement rides Circle Gateway batching, so the receipt sometimes
/// carries a batch reference or nothing; in that case show the amount, no link.
function isTxHash(h?: string): boolean {
  return !!h && /^0x[0-9a-fA-F]{64}$/.test(h);
}

/// The counterparty's real, DB-private work record. Granular per-deal proof a
/// buyer paid the internal pull to see, never the aggregate on the public
/// passport. Anonymized server-side: no past-counterparty, no exact terms.
function WorkRecordSection({
  jobId,
  caller,
  role,
}: {
  jobId: string;
  caller?: string;
  role: 'buyer' | 'seller';
}) {
  const wr = useTranslations().profilePeek.workRecord;
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'error' } | { kind: 'done'; data: CounterpartyReport }
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    api
      .counterpartyReport(jobId, caller)
      .then((data) => {
        if (!cancelled) setState({ kind: 'done', data });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, caller]);

  if (state.kind === 'error') return null;
  const payment = state.kind === 'done' ? state.data.payment : null;
  // Buyers don't deliver work, so there's no delivered-work record for a buyer
  // peek. But the counterparty agent still PAID to pull their passport, so the
  // paid-read receipt must surface on this side too (the seller paying for the
  // buyer), not just buyer-viewing-seller.
  const showWorkRecord = role === 'seller';
  if (!showWorkRecord && !payment && state.kind !== 'loading') return null;

  return (
    <div className="px-6 pb-6 pt-4 border-t border-[var(--lp-border-light)]">
      {showWorkRecord && (
        <>
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:{wr.eyebrow}:]
          </span>
          <p className="mt-1.5 text-[12px] leading-snug text-[var(--lp-text-sub)]">{wr.subtitle}</p>
        </>
      )}

      {payment && (
        <>
          <div
            className="mt-3 flex items-center justify-between gap-3 px-3 py-2"
            style={{
              background: 'var(--lp-light)',
              border: '1px solid var(--lp-border-light)',
              borderRadius: 8,
            }}
          >
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
              {wr.receiptTemplate.replace('{amount}', `$${payment.amountUsd.toFixed(2)}`)}
            </span>
            {isTxHash(payment.txHash) && (
              <a
                href={`https://testnet.arcscan.app/tx/${payment.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 mono text-[10px] uppercase tracking-[0.12em] underline underline-offset-2"
                style={{ color: 'var(--lp-accent)' }}
              >
                {wr.receiptView}
              </a>
            )}
          </div>
          {/* Circle Gateway nets many nanopayments into one on-chain batch, so a
              single $0.01 read has no per-call Arc tx to link. Say so plainly
              instead of showing a bare amount that reads as an unbacked claim. */}
          {!isTxHash(payment.txHash) && (
            <p className="mt-1.5 text-[10px] leading-snug text-[var(--lp-text-muted)]">
              {wr.receiptRail}
            </p>
          )}
          {/* Buyer peek: the counterparty paid to read this buyer's standing, but
              buyers deliver no work, so there is no record below. Explain it so
              "paid, nothing here" reads as intended, not broken. */}
          {role === 'buyer' && (
            <p className="mt-2 text-[12px] leading-snug text-[var(--lp-text-sub)]">
              {wr.buyerContext}
            </p>
          )}
        </>
      )}

      {showWorkRecord && state.kind === 'loading' && (
        <p className="mt-3 mono text-[11px] text-[var(--lp-text-muted)]">{wr.loading}</p>
      )}

      {showWorkRecord && state.kind === 'done' && state.data.locked && (
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--lp-text-sub)]">{wr.locked}</p>
      )}

      {showWorkRecord && state.kind === 'done' && !state.data.locked && state.data.record && (
        <>
          {(state.data.record.summary.completionRate != null ||
            state.data.record.summary.onTimeRate != null) && (
            <div className="mt-3 flex gap-2">
              {state.data.record.summary.completionRate != null && (
                <div
                  className="flex-1 px-3 py-2"
                  style={{ background: 'var(--lp-light)', border: '1px solid var(--lp-border-light)', borderRadius: 6 }}
                >
                  <p className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                    Completion
                  </p>
                  <p className="mt-0.5 font-sans text-[18px] font-extrabold tabular-nums text-[var(--lp-dark)]">
                    {state.data.record.summary.completionRate}%
                  </p>
                </div>
              )}
              {state.data.record.summary.onTimeRate != null && (
                <div
                  className="flex-1 px-3 py-2"
                  style={{ background: 'var(--lp-light)', border: '1px solid var(--lp-border-light)', borderRadius: 6 }}
                >
                  <p className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                    On time
                  </p>
                  <p className="mt-0.5 font-sans text-[18px] font-extrabold tabular-nums text-[var(--lp-dark)]">
                    {state.data.record.summary.onTimeRate}%
                  </p>
                </div>
              )}
            </div>
          )}
          {state.data.record.rows.length === 0 ? (
            <p className="mt-3 text-[12px] text-[var(--lp-text-sub)]">{wr.empty}</p>
          ) : (
            <ul className="mt-3 space-y-1.5 max-h-[40vh] overflow-y-auto">
              {state.data.record.rows.slice(0, 30).map((row, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2.5 px-3 py-2"
                  style={{
                    background: 'var(--lp-light)',
                    border: '1px solid var(--lp-border-light)',
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                    borderBottomLeftRadius: 8,
                    borderBottomRightRadius: 2,
                  }}
                >
                  <span
                    aria-hidden
                    className="shrink-0 inline-block w-[7px] h-[7px]"
                    style={{ background: OUTCOME_HUE[row.outcome] ?? '#6b6b6b' }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--lp-dark)]">
                    {row.category}
                  </span>
                  {row.deliveredVia && (
                    <span className="shrink-0 mono text-[9px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)]">
                      {row.deliveredVia}
                    </span>
                  )}
                  <span className="shrink-0 mono text-[12px] tabular-nums text-[var(--lp-text-sub)]">
                    {row.amountBand}
                  </span>
                  <span className="shrink-0 mono text-[10px] tabular-nums text-[var(--lp-text-muted)]">
                    {row.ageLabel}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
            {wr.summaryTemplate
              .replace('{total}', String(state.data.record.summary.total))
              .replace('{clean}', String(state.data.record.summary.clean))
              .replace('{disputed}', String(state.data.record.summary.disputed))
              .replace('{avg}', state.data.record.summary.avgBand)}
          </p>
        </>
      )}
    </div>
  );
}
