'use client';
import type { ChainEvent } from '@/core/api';
import { Tag, StatusDot } from '@/shared/components/Tag';
import { shortHash, relativeTime, formatUsdc } from '@/shared/utils/format';

const labels: Record<string, { text: string; tone: 'buyer' | 'seller' | 'system' | 'error' }> = {
  'job.tracked': { text: 'Job posted on chain', tone: 'system' },
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
  // Hide raw scope/message chips from end users — they're for debug logs only.
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

export function EventList({
  events,
  explorer,
  showJobId,
}: {
  events: ChainEvent[];
  explorer: string;
  showJobId?: boolean;
}) {
  if (events.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-[var(--color-ink-faint)]">No events yet.</p>
      </div>
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

function DetailChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] text-[11px]">
      <span className="text-[var(--color-ink-faint)] tracking-tight">{label}</span>
      <span className="text-[var(--color-ink)] mono">{value}</span>
    </span>
  );
}
