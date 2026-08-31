'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type UserProfile, type CounterpartyReport } from '@/core/api';
import { useClipboard } from '@/shared/hooks/useClipboard';
import { shortAddress } from '@/shared/utils/format';
import { ReputationBadge } from '@/features/reputation/components/ReputationBadge';
import { TIER_HUE } from '@/features/reputation/tierColors';
import { useReputation } from '@/features/reputation/hooks/useReputation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { shortenEvidenceId } from '../paidEvidencePresentation';

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
  const [showTechnical, setShowTechnical] = useState(false);
  const { copied, copy } = useClipboard();
  const { data: rep } = useReputation(open ? address : undefined);
  const tierHue = TIER_HUE[rep?.tier ?? 'NEW'];

  useEffect(() => {
    if (!open) return;
    setShowTechnical(false);
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
        className="fixed inset-0 z-[100] flex items-end justify-center p-3 sm:items-center"
        style={{ background: 'rgba(14,14,14,0.55)' }}
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={role === 'buyer' ? pp.identityAriaBuyer : pp.identityAriaSeller}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-[320px] fade-up sm:rounded-[14px]"
          style={{
            background: 'var(--lp-card)',
            border: '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            borderBottomLeftRadius: 4,
            borderBottomRightRadius: 4,
            boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 12px 32px -16px rgba(0,0,0,0.3)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={pp.closeLabel}
            className="absolute top-2 end-2 inline-flex items-center justify-center w-11 h-11 rounded-full text-[var(--lp-text-muted)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] transition-colors"
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
      className="fixed inset-0 z-[100] flex items-stretch justify-end overflow-hidden"
      style={{ background: 'rgba(14,14,14,0.65)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={role === 'buyer' ? pp.profileAriaBuyer : pp.profileAriaSeller}
        onClick={(e) => e.stopPropagation()}
        className="relative ms-auto flex h-full w-full max-w-[480px] flex-col overflow-hidden rounded-s-[22px] fade-up max-[640px]:mt-auto max-[640px]:h-auto max-[640px]:max-h-[90vh] max-[640px]:max-w-none max-[640px]:rounded-t-[22px] max-[640px]:rounded-b-none"
        style={{
          background: 'var(--lp-card)',
          border: '1px solid var(--lp-border-light)',
          borderRight: 0,
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
            className="absolute top-3 end-3 inline-flex items-center justify-center w-11 h-11 rounded-full text-[var(--lp-text-muted)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] transition-colors"
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
          <div className="mt-2 flex items-center gap-2">
            <p className="mono text-[11px] tabular-nums text-[var(--lp-text-sub)]">{shortAddress(address)}</p>
            <button
              type="button"
              onClick={() => setShowTechnical((value) => !value)}
              className="min-h-11 px-2 mono text-[10px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)] underline underline-offset-4"
              aria-expanded={showTechnical}
            >
              {showTechnical ? 'hide details' : 'verification details'}
            </button>
          </div>
          {showTechnical && (
            <div className="mt-2 rounded-[8px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] p-3">
              <p className="mono break-all text-[10px] leading-relaxed text-[var(--lp-text-muted)]">{address}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--lp-text-sub)]">
                technical identifiers are shown only when you request verification details.
              </p>
            </div>
          )}

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
  clean: 'var(--lp-accent)',
  disputed: '#b25425',
  failed: '#b03d3a',
};

const ARCSCAN = 'https://testnet.arcscan.app';

/// Only link a payment tx when it looks like a real 32-byte hash. The internal
/// Arc x402 settlement rides Circle Gateway batching, so the receipt sometimes
/// carries a batch reference or nothing; in that case we link the on-chain
/// deposit that funded the pull, or the paying wallet, instead.
function isTxHash(h?: string): boolean {
  return !!h && /^0x[0-9a-fA-F]{64}$/.test(h);
}

function isAddress(a?: string): boolean {
  return !!a && /^0x[0-9a-fA-F]{40}$/.test(a);
}

/// The best on-chain proof we can link for a paid pull. The per-read settlement
/// is gasless and batched, so a settlement hash rarely exists; fall through to
/// the Arc deposit tx that funded the pull, then to the paying wallet's Arc
/// history. Any of these is a real artifact a viewer can open on Arcscan.
function passportProof(
  payment: NonNullable<CounterpartyReport['payment']>,
  labels: { view: string; deposit: string; wallet: string },
): { href: string; label: string } | null {
  if (isTxHash(payment.depositTxHash))
    return { href: `${ARCSCAN}/tx/${payment.depositTxHash}`, label: labels.deposit };
  if (isTxHash(payment.txHash)) return { href: `${ARCSCAN}/tx/${payment.txHash}`, label: labels.view };
  if (isAddress(payment.payer))
    // Token-transfers tab: an SCA acts via userOps, so the default tab reads
    // "Transactions 0" and looks empty even on a funded, active wallet.
    return { href: `${ARCSCAN}/address/${payment.payer}?tab=token_transfers`, label: labels.wallet };
  return null;
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
  const proof = payment
    ? passportProof(payment, { view: wr.receiptView, deposit: wr.receiptDeposit, wallet: wr.receiptWallet })
    : null;
  // Both sides get a record: the buyer vets the seller's delivered work, the
  // seller vets the buyer's funded deals (does this buyer transact and settle
  // clean). The backend already returns the role-appropriate rows.
  return (
    <div className="min-h-0 overflow-y-auto border-t border-[var(--lp-border-light)] px-6 pb-8 pt-5">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        [:{role === 'seller' ? wr.eyebrow : wr.buyerEyebrow}:]
      </span>
      <p className="mt-1.5 text-[12px] leading-snug text-[var(--lp-text-sub)]">
        {role === 'seller' ? wr.subtitle : wr.buyerSubtitle}
      </p>

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
              verification report funded · ${payment.amountUsd.toFixed(2)}
            </span>
            {proof && (
              <a
                href={proof.href}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 mono text-[10px] uppercase tracking-[0.12em] underline underline-offset-2"
                style={{ color: 'var(--lp-accent)' }}
              >
                {proof.label}
              </a>
            )}
          </div>
          {/* Circle Gateway nets many nanopayments into one on-chain batch, so a
              single $0.01 read has no per-call Arc tx. The linked deposit / payer
              wallet is the real on-chain proof; the caption explains the rail so
              the amount never reads as an unbacked claim. */}
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--lp-text-muted)]">
            this report combines completed trade outcomes and counterparty confirmations. it does not grant an agent authority to move funds.
          </p>
          <details className="mt-2 text-[11px] text-[var(--lp-text-muted)]">
            <summary className="min-h-11 cursor-pointer py-2 mono text-[10px] uppercase tracking-[0.12em]">{wr.receiptView} technical proof</summary>
            <div className="space-y-1 border-s border-[var(--lp-border-light)] ps-3">
              {!isTxHash(payment.txHash) && <p>{wr.receiptRail}</p>}
              {payment.evidenceId && <p className="mono break-all">evidence: {shortenEvidenceId(payment.evidenceId)}</p>}
              <p className="mono break-all">provider: {payment.providerId ?? 'karwan verification'}</p>
              <p className="mono break-all">claim: {payment.claim ?? 'completed transactions'}</p>
              {payment.decisionImpact && <p>{payment.decisionImpact.replaceAll('_', ' ')}</p>}
            </div>
          </details>
        </>
      )}

      {state.kind === 'loading' && (
        <p className="mt-3 mono text-[11px] text-[var(--lp-text-muted)]">{wr.loading}</p>
      )}

      {state.kind === 'done' && state.data.locked && (
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--lp-text-sub)]">{wr.locked}</p>
      )}

      {state.kind === 'done' && !state.data.locked && state.data.record && (
        <>
          <TimingSummary timing={state.data.record.summary.timing} role={role} labels={wr} />
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
            <p className="mt-3 text-[12px] text-[var(--lp-text-sub)]">
              {role === 'seller' ? wr.empty : wr.buyerEmpty}
            </p>
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
                  <span
                    className="shrink-0 mono text-[9px] uppercase tracking-[0.1em]"
                    style={{ color: OUTCOME_HUE[row.outcome] ?? 'var(--lp-text-muted)' }}
                  >
                    {row.outcome === 'clean' ? 'completed' : row.outcome === 'disputed' ? 'needs review' : 'not completed'}
                  </span>
                  {row.deliveredVia && (
                    <span className="shrink-0 mono text-[9px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)]">
                      {row.deliveredVia} evidence
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

function TimingSummary({
  timing,
  role,
  labels,
}: {
  timing: NonNullable<CounterpartyReport['record']>['summary']['timing'];
  role: 'buyer' | 'seller';
  labels: ReturnType<typeof useTranslations>['profilePeek']['workRecord'];
}) {
  const items = role === 'seller'
    ? [[labels.sellerResponse, timing.sellerResponseMs, timing.samples.sellerResponse], [labels.sellerCompletion, timing.sellerCompletionMs, timing.samples.sellerCompletion]] as const
    : [[labels.buyerVerification, timing.buyerVerificationMs, timing.samples.buyerVerification], [labels.buyerRelease, timing.buyerReleaseMs, timing.samples.buyerRelease]] as const;
  const available = items.filter(([, value]) => value != null);
  if (!available.length) return null;
  return <div className="mt-3 rounded-lg border border-[var(--lp-border-light)] bg-[var(--lp-light)] px-3 py-2.5"><p className="mono text-[9px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">{labels.timingTitle}</p><div className="mt-2 grid grid-cols-2 gap-2">{available.map(([label, value, sample]) => <div key={label}><p className="text-[11px] text-[var(--lp-text-sub)]">{label}</p><p className="mt-0.5 text-sm font-semibold text-[var(--lp-dark)]">{formatDuration(value as number)}</p><p className="mono text-[9px] text-[var(--lp-text-muted)]">{labels.timingSampleTemplate.replace('{count}', String(sample)).replace('{unit}', sample === 1 ? 'deal' : 'deals')}</p></div>)}</div></div>;
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
