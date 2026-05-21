'use client';
import Link from 'next/link';
import type { ChainEvent } from '@/core/api';
import { Tag, StatusDot } from '@/shared/components/Tag';
import { shortHash, relativeTime, formatUsdc } from '@/shared/utils/format';

/// Direct-deal events live on /deals/[id]; everything else with a jobId lives
/// on /jobs/[id]. Returns null for events that don't have a navigable target.
function hrefForEvent(e: ChainEvent): string | null {
  if (!e.jobId) return null;
  if (e.type.startsWith('deal.direct.') || e.type === 'deal.delivered' ||
      e.type === 'deal.accepted' || e.type === 'deal.review.started' ||
      e.type === 'deal.review.heartbeat' || e.type === 'deal.auto_released' ||
      e.type === 'deal.disputed' || e.type === 'deal.cancelled') {
    return `/deals/${e.jobId}`;
  }
  return `/jobs/${e.jobId}`;
}

const labels: Record<string, { text: string; tone: 'buyer' | 'seller' | 'system' | 'error' }> = {
  'job.tracked': { text: 'Job posted on chain', tone: 'system' },
  'job.expired': { text: 'Brief expired with no match', tone: 'error' },
  'bid.scored': { text: 'Buyer agent scored the bid', tone: 'buyer' },
  'bid.submitted': { text: 'Seller submitted a bid', tone: 'seller' },
  'counter.issued': { text: 'Buyer agent issued a counter', tone: 'buyer' },
  'counter.response.submitted': { text: 'Seller responded to the counter', tone: 'seller' },
  'bid.accepted': { text: 'Buyer accepted final terms', tone: 'buyer' },
  'escrow.approved': { text: 'USDC approved for escrow', tone: 'buyer' },
  'escrow.funded': { text: 'Escrow funded', tone: 'buyer' },
  'escrow.milestone.released': { text: 'Milestone released', tone: 'buyer' },
  'escrow.settled': { text: 'Deal settled', tone: 'system' },
  'agent.skipped': { text: 'Seller skipped this brief', tone: 'seller' },
  'agent.declined': { text: 'Agent ended negotiation', tone: 'error' },
  'agent.error': { text: 'Agent hit an error', tone: 'error' },
  'agent.fallback': { text: 'Agent used a backup decision', tone: 'system' },
  'market.scanned': { text: 'Market scanned', tone: 'buyer' },
  'deal.matched': { text: 'Match found · awaiting approval', tone: 'buyer' },
  'deal.match.approved': { text: 'Match approved · escrow funded', tone: 'buyer' },
  'deal.match.declined': { text: 'Match declined', tone: 'error' },
  'listing.posted': { text: 'Listing posted', tone: 'seller' },
  'listing.matched': { text: 'Listing matched a brief', tone: 'seller' },
  'bridge.burned': { text: 'USDC burned on source chain', tone: 'system' },
  'bridge.attested': { text: 'Circle attestation received', tone: 'system' },
  'bridge.minted': { text: 'USDC minted on Arc', tone: 'system' },
  'bridge.error': { text: 'Bridge hit an error', tone: 'error' },
  'reputation.recorded': { text: 'Reputation recorded on chain', tone: 'system' },
  'deal.direct.created': { text: 'Direct deal opened and funded', tone: 'buyer' },
  'deal.accepted': { text: 'Seller accepted the deal terms', tone: 'seller' },
  'deal.delivered': { text: 'Seller marked the work delivered', tone: 'seller' },
  'deal.review.started': { text: 'Buyer review window opened', tone: 'buyer' },
  'deal.review.heartbeat': { text: 'Buyer is still reviewing', tone: 'buyer' },
  'deal.auto_released': { text: 'Final milestone auto-released', tone: 'system' },
  'deal.disputed': { text: 'Deal moved to dispute', tone: 'error' },
  'deal.cancelled': { text: 'Deal cancelled and refunded', tone: 'system' },
  'deal.cancel.proposed': { text: 'Cancellation proposed', tone: 'system' },
  'deal.cancel.declined': { text: 'Cancellation declined', tone: 'error' },
};

interface Chip {
  key: string;
  label: string;
  value: string;
}

/// Translates internal agent reason codes into UI copy. Falls back to the raw
/// code if unmapped so we still see something rather than blank.
const REASON_LABELS: Record<string, string> = {
  'llm-counter-over-budget': 'Price above ceiling',
  'no-keyword-match': 'Outside skills',
  'low-confidence-or-skip': 'Not a topical match',
  'buyer-reputation-too-low': 'Buyer reputation too low',
  'llm-price-out-of-range': 'Price out of range',
  'no-bids': 'No bids received',
  'no-counter-suggestion': 'No counter prepared',
  'price-gap-uncrossable': 'Price gap too wide',
};
function reasonLabel(code: string): string {
  return REASON_LABELS[code] ?? code;
}

/// Maps internal agent.error scope codes to a short, user-readable label.
/// Falls back to the raw code so a new scope still shows something.
const SCOPE_LABELS: Record<string, string> = {
  counterEvaluation: 'LLM counter-eval failed',
  bidEvaluation: 'LLM bid-eval failed',
  submitBid: 'On-chain submitBid failed',
  respondToCounter: 'On-chain counter-response failed',
  acceptBid: 'On-chain acceptBid failed',
  fundEscrow: 'On-chain fundEscrow failed',
  recordCompletion: 'Reputation record failed',
  JobPosted: 'JobPosted handler crashed',
  CounterOfferIssued: 'CounterOfferIssued handler crashed',
  BidSubmitted: 'BidSubmitted handler crashed',
};
function scopeLabel(code: string): string {
  return SCOPE_LABELS[code] ?? code;
}

function chipsFor(payload: Record<string, unknown>): Chip[] {
  const out: Chip[] = [];
  const price = payload.priceUsdc ?? payload.agreedPriceUsdc;
  if (price != null) {
    out.push({ key: 'price', label: 'Price', value: `${formatUsdc(String(price), { withSuffix: false })} USDC` });
  }
  const counter = payload.counterPriceUsdc ?? payload.counterPrice;
  if (counter != null) {
    out.push({ key: 'counter', label: 'Counter', value: `${formatUsdc(String(counter), { withSuffix: false })} USDC` });
  }
  if (payload.confidence != null) {
    const pct = Math.round(Number(payload.confidence) * 100);
    out.push({ key: 'confidence', label: 'Confidence', value: `${pct}%` });
  }
  if (payload.score != null) {
    out.push({ key: 'score', label: 'Match', value: `${payload.score}/100` });
  }
  if (payload.scanned != null) {
    out.push({ key: 'scanned', label: 'Listings', value: String(payload.scanned) });
  }
  if (payload.matched != null) {
    out.push({ key: 'matched', label: 'Matched', value: String(payload.matched) });
  }
  if (payload.tier != null) {
    out.push({ key: 'tier', label: 'Reputation', value: String(payload.tier).toUpperCase() });
  }
  if (payload.topTier != null) {
    out.push({ key: 'topTier', label: 'Best rep', value: String(payload.topTier).toUpperCase() });
  }
  if (payload.milestoneIndex != null) {
    out.push({
      key: 'milestone',
      label: 'Milestone',
      value: `#${Number(payload.milestoneIndex) + 1}`,
    });
  }
  if (payload.reason != null) {
    const code = String(payload.reason);
    out.push({ key: 'reason', label: 'Reason', value: reasonLabel(code) });
  }
  // Surface scope on agent.error events so the user can tell which step
  // failed (LLM eval, on-chain tx, etc.) without digging through backend
  // logs. The full message renders as a subtitle below the headline.
  if (payload.scope != null) {
    out.push({
      key: 'scope',
      label: 'Where',
      value: scopeLabel(String(payload.scope)),
    });
  }
  if (payload.amountUsdc != null) {
    out.push({ key: 'amount', label: 'Amount', value: `${payload.amountUsdc} USDC` });
  }
  if (payload.sourceDomain != null) {
    const sourceName =
      payload.sourceDomain === 0
        ? 'Ethereum Sepolia'
        : payload.sourceDomain === 6
        ? 'Base Sepolia'
        : `domain ${payload.sourceDomain}`;
    out.push({ key: 'source', label: 'From', value: sourceName });
  }
  return out;
}

type Tone = 'buyer' | 'seller' | 'system' | 'error';

const RAIL_COLOR: Record<Tone, string> = {
  buyer: '#3a4a85',
  seller: '#0a7553',
  system: '#9a9a9a',
  error: '#b03d3a',
};

export function EventList({
  events,
  explorer,
  showJobId,
  variant = 'timeline',
}: {
  events: ChainEvent[];
  explorer: string;
  showJobId?: boolean;
  variant?: 'timeline' | 'card';
}) {
  if (events.length === 0) {
    if (variant === 'card') {
      return (
        <div className="py-12 text-center space-y-2">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            TIMELINE EMPTY
          </p>
          <p className="text-[13px] text-[var(--lp-text-sub)] leading-relaxed max-w-[40ch] mx-auto">
            Awaiting the first on-chain event. Bids and matches will land here.
          </p>
        </div>
      );
    }
    return (
      <div className="py-8 text-center space-y-1.5">
        <p className="eyebrow">Timeline empty</p>
        <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed max-w-[40ch] mx-auto">
          Awaiting the first on-chain event. Seller scoring and bids will land here as the auction
          opens.
        </p>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <ol className="space-y-2.5">
        {events.map((e, i) => {
          const meta = labels[e.type];
          const text = meta?.text ?? e.type;
          const tone: Tone = meta?.tone ?? 'system';
          const rail = RAIL_COLOR[tone];
          const txHash = (e.payload?.txHash as string | undefined) ?? undefined;
          const chips = chipsFor(e.payload);
          const href = hrefForEvent(e);
          // Full message stays in backend logs. The [:WHERE:] scope chip
          // (added by chipsFor) gives users enough context to ask for
          // support without leaking stack traces or internal paths.
          const body = (
            <>
              <span
                aria-hidden
                className="absolute left-0 top-0 bottom-0 w-[3px]"
                style={{ background: rail }}
              />
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-sans text-[14px] font-semibold tracking-[-0.01em] text-[var(--lp-dark)]">
                  {text}
                </span>
                <span className="mono text-[10px] uppercase tracking-[0.12em] tabular-nums text-[var(--lp-text-muted)] shrink-0">
                  {relativeTime(e.ts)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                <ActorChip tone={tone} actor={e.actor} />
                {showJobId && e.jobId && (
                  <span className="inline-flex items-center gap-1 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                    JOB
                    <span className="tabular-nums text-[var(--lp-text-sub)] normal-case tracking-normal">
                      {shortHash(e.jobId, 6, 4)}
                    </span>
                  </span>
                )}
                {chips.map((c) => (
                  <DetailChip key={c.key} label={c.label} value={c.value} variant="card" />
                ))}
                {txHash && (
                  <a
                    href={`${explorer}/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(ev) => ev.stopPropagation()}
                    className="group inline-flex items-center gap-1 mono text-[10px] uppercase tracking-[0.12em] font-bold transition-colors relative z-10"
                    style={{ color: 'var(--lp-dark)' }}
                    title="Open on Arc Testnet explorer"
                  >
                    <span className="tabular-nums normal-case tracking-normal">
                      {shortHash(txHash, 6, 4)}
                    </span>
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden
                      className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    >
                      <path
                        d="M5.5 4.5h6v6M11 5l-6.5 6.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </a>
                )}
                {href && (
                  <span
                    aria-hidden
                    className="ml-auto mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] transition-colors group-hover:text-[var(--lp-dark)]"
                  >
                    OPEN →
                  </span>
                )}
              </div>
            </>
          );

          const cardStyle = {
            background: 'var(--lp-card)',
            border: '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
            boxShadow: '0 1px 0 rgba(0,0,0,0.03), 0 6px 18px -14px rgba(0,0,0,0.14)',
          } as const;

          return (
            <li key={`${e.ts}-${i}`} className="slide-in">
              {href ? (
                <Link
                  href={href}
                  className="group relative overflow-hidden block p-4 pl-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_1px_0_rgba(0,0,0,0.04),0_10px_24px_-14px_rgba(0,0,0,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
                  style={cardStyle}
                >
                  {body}
                </Link>
              ) : (
                <div className="group relative overflow-hidden p-4 pl-5" style={cardStyle}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol className="relative -my-3">
      <span
        aria-hidden
        className="absolute left-[5px] top-3 bottom-3 w-px bg-[var(--color-line)]"
      />
      {events.map((e, i) => {
        const meta = labels[e.type];
        const text = meta?.text ?? e.type;
        const tone = meta?.tone ?? 'system';
        const dotTone =
          tone === 'buyer'
            ? 'accent'
            : tone === 'seller'
            ? 'positive'
            : tone === 'error'
            ? 'critical'
            : 'muted';
        const tagTone =
          tone === 'buyer'
            ? 'accent'
            : tone === 'seller'
            ? 'positive'
            : tone === 'error'
            ? 'critical'
            : 'muted';
        const txHash = (e.payload?.txHash as string | undefined) ?? undefined;
        const chips = chipsFor(e.payload);
        return (
          <li key={`${e.ts}-${i}`} className="slide-in py-3 pl-6 relative">
            <span className="absolute left-0 top-[14px]">
              <StatusDot tone={dotTone} />
            </span>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-[var(--color-ink)] font-medium">{text}</span>
              <span className="text-[11px] text-[var(--color-ink-faint)] mono shrink-0">
                {relativeTime(e.ts)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Tag tone={tagTone}>{e.actor}</Tag>
              {showJobId && e.jobId && (
                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-ink-faint)]">
                  job
                  <span className="mono">{shortHash(e.jobId, 6, 4)}</span>
                </span>
              )}
              {chips.map((c) => (
                <DetailChip key={c.key} label={c.label} value={c.value} />
              ))}
              {txHash && (
                <a
                  href={`${explorer}/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-1 text-[11px] mono text-[var(--color-accent)] hover:underline decoration-dotted underline-offset-2"
                  title="Open on Arc Testnet explorer"
                >
                  <span>{shortHash(txHash, 6, 4)}</span>
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden
                    className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  >
                    <path d="M5.5 4.5h6v6M11 5l-6.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ActorChip({ tone, actor }: { tone: Tone; actor: string }) {
  const fg = RAIL_COLOR[tone];
  const bg =
    tone === 'buyer'
      ? 'rgba(60,74,138,0.10)'
      : tone === 'seller'
        ? 'rgba(10,117,83,0.10)'
        : tone === 'error'
          ? 'rgba(176,61,58,0.10)'
          : 'var(--lp-light)';
  return (
    <span
      className="inline-flex items-stretch overflow-hidden mono text-[10px] font-bold uppercase tracking-[0.16em] leading-none"
      style={{
        background: bg,
        color: fg,
        border: `1px solid ${fg}33`,
        borderTopLeftRadius: 5,
        borderTopRightRadius: 5,
        borderBottomLeftRadius: 5,
        borderBottomRightRadius: 2,
      }}
    >
      <span
        aria-hidden
        className="flex items-center justify-center px-1.5"
        style={{ background: fg }}
      >
        <span aria-hidden className="inline-block w-[4px] h-[4px] bg-white" />
      </span>
      <span className="px-1.5 py-[5px]">{actor}</span>
    </span>
  );
}

function DetailChip({
  label,
  value,
  variant = 'timeline',
}: {
  label: string;
  value: string;
  variant?: 'timeline' | 'card';
}) {
  if (variant === 'card') {
    return (
      <span
        className="inline-flex items-baseline gap-1 px-2 py-1 text-[11px]"
        style={{
          background: 'var(--lp-light)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 5,
          borderTopRightRadius: 5,
          borderBottomLeftRadius: 5,
          borderBottomRightRadius: 2,
        }}
      >
        <span className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
          {label}
        </span>
        <span className="text-[var(--lp-dark)] mono tabular-nums font-medium">{value}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] text-[11px]">
      <span className="text-[var(--color-ink-faint)] tracking-tight">{label}</span>
      <span className="text-[var(--color-ink)] mono">{value}</span>
    </span>
  );
}
