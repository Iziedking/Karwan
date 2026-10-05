'use client';
import Link from 'next/link';
import type { ChainEvent } from '@/core/api';
import { hrefForEvent } from '@/features/activity/eventRouting';
import { Tag, StatusDot } from '@/shared/components/Tag';
import { shortHash, relativeTime, formatUsdc } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

/// A readable label for any event type, including ones i18n has no entry for.
///
/// `eventTexts` covers the types the product deliberately surfaces; the backend
/// union is far larger and grows every time a lane is added. The old fallback
/// was the raw type, so a type nobody had labelled reached users as `job.posted`
/// sitting between two written-out rows. Derive a phrase instead: separators
/// become spaces and the first letter is capitalised. Not a translation, but
/// never a machine token.
function labelFor(type: string, texts: Record<string, string>): string {
  const known = texts[type];
  if (known) return known;
  const phrase = type.replace(/[._-]+/g, ' ').trim();
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/// Tone map for every known event type. Keeps the visual style at module scope
/// (locale-independent) while the human-readable label lives in i18n.
const EVENT_TONES: Record<string, 'buyer' | 'seller' | 'system' | 'error'> = {
  'job.posted': 'system',
  'job.tracked': 'system',
  'job.expired': 'error',
  'bid.scored': 'buyer',
  'bid.submitted': 'seller',
  'counter.issued': 'buyer',
  'counter.response.submitted': 'seller',
  'bid.accepted': 'buyer',
  'escrow.approved': 'buyer',
  'escrow.funded': 'buyer',
  'escrow.milestone.released': 'buyer',
  'escrow.settled': 'system',
  'agent.skipped': 'seller',
  'agent.declined': 'error',
  'agent.error': 'error',
  'agent.fallback': 'system',
  'agent.decision': 'system',
  'market.scanned': 'buyer',
  'deal.matched': 'buyer',
  'deal.match.approved': 'buyer',
  'deal.match.declined': 'error',
  'listing.posted': 'seller',
  'listing.matched': 'seller',
  // Tone tracks who acted; 'error' is reserved for ending without a match.
  'listing.cancelled': 'seller',
  'listing.expired': 'error',
  'brief.cancelled': 'buyer',
  'bridge.burned': 'system',
  'bridge.attested': 'system',
  'bridge.minted': 'system',
  'bridge.error': 'error',
  'reputation.recorded': 'system',
  'deal.direct.created': 'buyer',
  'deal.accepted': 'seller',
  'deal.delivered': 'seller',
  'deal.delivery.flagged': 'error',
  'deal.delivery.cleared': 'system',
  'deal.review.started': 'buyer',
  'deal.review.heartbeat': 'buyer',
  'deal.auto_released': 'system',
  'deal.disputed': 'error',
  'deal.cancelled': 'system',
  'deal.cancel.proposed': 'system',
  'deal.cancel.declined': 'error',
};

interface Chip {
  key: string;
  label: string;
  value: string;
}

/// Translates an internal agent reason code into UI copy. Falls back to the raw
/// code if unmapped so we still see something rather than blank.
function reasonLabel(code: string, copy: Messages['eventList']['reasonLabels']): string {
  return copy[code] ?? code;
}

/// Maps an internal agent.error scope code to a short, user-readable label.
/// Falls back to the raw code so a new scope still shows something.
function scopeLabel(code: string, copy: Messages['eventList']['scopeLabels']): string {
  return copy[code] ?? code;
}

function chipsFor(
  payload: Record<string, unknown>,
  copy: Messages['eventList'],
): Chip[] {
  const out: Chip[] = [];
  const price = payload.priceUsdc ?? payload.agreedPriceUsdc;
  if (price != null) {
    out.push({
      key: 'price',
      label: copy.chipLabels.price,
      value: `${formatUsdc(String(price), { withSuffix: false })} USDC`,
    });
  }
  const counter = payload.counterPriceUsdc ?? payload.counterPrice;
  if (counter != null) {
    out.push({
      key: 'counter',
      label: copy.chipLabels.counter,
      value: `${formatUsdc(String(counter), { withSuffix: false })} USDC`,
    });
  }
  if (payload.confidence != null) {
    const pct = Math.round(Number(payload.confidence) * 100);
    out.push({ key: 'confidence', label: copy.chipLabels.confidence, value: `${pct}%` });
  }
  if (payload.score != null) {
    out.push({ key: 'score', label: copy.chipLabels.score, value: `${payload.score}/100` });
  }
  // Skill match: how well the seller's skills/keywords cover the brief. This is
  // the dominant ranking key, so it's worth showing next to the bid score.
  if (payload.topicalMatch != null) {
    out.push({
      key: 'skillMatch',
      label: copy.chipLabels.skillMatch,
      value: `${payload.topicalMatch}%`,
    });
  }
  if (payload.scanned != null) {
    out.push({
      key: 'scanned',
      label: copy.chipLabels.offers,
      value: String(payload.scanned),
    });
  }
  if (payload.matched != null) {
    out.push({
      key: 'matched',
      label: copy.chipLabels.matched,
      value: String(payload.matched),
    });
  }
  if (payload.tier != null) {
    out.push({
      key: 'tier',
      label: copy.chipLabels.reputation,
      value: String(payload.tier).toUpperCase(),
    });
  }
  if (payload.topTier != null) {
    out.push({
      key: 'topTier',
      label: copy.chipLabels.bestRep,
      value: String(payload.topTier).toUpperCase(),
    });
  }
  if (payload.milestoneIndex != null) {
    out.push({
      key: 'milestone',
      label: copy.chipLabels.milestone,
      value: `#${Number(payload.milestoneIndex) + 1}`,
    });
  }
  if (payload.decision != null && typeof payload.decision === 'string') {
    out.push({
      key: 'decision',
      label: copy.chipLabels.call,
      value: String(payload.decision),
    });
  }
  if (payload.reason != null) {
    const code = String(payload.reason);
    out.push({
      key: 'reason',
      label: copy.chipLabels.reason,
      value: reasonLabel(code, copy.reasonLabels),
    });
  }
  // Surface scope on agent.error events so the user can tell which step
  // failed (LLM eval, on-chain tx, etc.) without digging through backend
  // logs. The full message renders as a subtitle below the headline.
  if (payload.scope != null) {
    out.push({
      key: 'scope',
      label: copy.chipLabels.where,
      value: scopeLabel(String(payload.scope), copy.scopeLabels),
    });
  }
  if (payload.amountUsdc != null) {
    out.push({
      key: 'amount',
      label: copy.chipLabels.amount,
      value: `${payload.amountUsdc} USDC`,
    });
  }
  // Security Agent verdict on a delivery link. Only surfaced when the scan
  // flagged it, so a clean delivery stays quiet; a held link reads as a clear
  // signal in the timeline for both parties.
  if (payload.verificationStatus === 'suspicious' || payload.verificationStatus === 'malicious') {
    out.push({
      key: 'security',
      label: copy.chipLabels.security,
      value: String(payload.verificationStatus).toUpperCase(),
    });
  }
  if (payload.sourceDomain != null) {
    const sourceName =
      payload.sourceDomain === 0
        ? copy.sourceDomains.ethereumSepolia
        : payload.sourceDomain === 6
          ? copy.sourceDomains.baseSepolia
          : copy.sourceDomains.unknownTemplate.replace('{n}', String(payload.sourceDomain));
    out.push({ key: 'source', label: copy.chipLabels.from, value: sourceName });
  }
  return out;
}

type Tone = 'buyer' | 'seller' | 'system' | 'error';

const RAIL_COLOR: Record<Tone, string> = {
  buyer: '#3a4a85',
  seller: 'var(--lp-accent)',
  system: '#9a9a9a',
  error: '#b03d3a',
};

/// Only link an on-chain explorer when the value is a real 32-byte tx hash.
/// Agent x402 payments settle through Circle Gateway batching, so their
/// `txHash` is often a settlement reference (a Circle UUID), not a chain hash;
/// linking that produced a broken explorer page. Base-rail payments (off-
/// platform research) also live on BaseScan, not the Arc explorer.
function isTxHash(h?: string): boolean {
  return !!h && /^0x[0-9a-fA-F]{64}$/.test(h);
}
function txExplorerHref(
  explorer: string,
  payload: Record<string, unknown> | undefined,
  txHash?: string,
): string | null {
  if (!isTxHash(txHash)) return null;
  const rail = typeof payload?.rail === 'string' ? payload.rail : undefined;
  const base = rail === 'base' ? 'https://basescan.org' : explorer;
  return `${base}/tx/${txHash}`;
}

export function EventList({
  events,
  explorer,
  showJobId,
  variant = 'timeline',
  collapseRepeats = false,
}: {
  events: ChainEvent[];
  explorer: string;
  showJobId?: boolean;
  variant?: 'timeline' | 'card';
  /// Off by default, and it must stay off on a deal's own timeline: two
  /// identical bids in a row there are two negotiation rounds, not one event
  /// seen twice. Only the public stream, where amounts and parties are
  /// stripped, has rows that genuinely carry no information apart.
  collapseRepeats?: boolean;
}) {
  const el = useTranslations().eventList;
  if (events.length === 0) {
    if (variant === 'card') {
      return (
        <div className="py-12 text-center space-y-2">
          <p className="mono text-[13px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            {el.empty.cardTag}
          </p>
          <p className="text-[14px] text-[var(--lp-text-sub)] leading-relaxed max-w-[40ch] mx-auto font-medium">
            {el.empty.cardBody}
          </p>
        </div>
      );
    }
    return (
      <div className="py-8 text-center space-y-1.5">
        <p className="eyebrow">{el.empty.timelineTag}</p>
        <p className="text-[14px] text-[var(--color-ink-dim)] leading-relaxed max-w-[40ch] mx-auto font-medium">
          {el.empty.timelineBody}
        </p>
      </div>
    );
  }

  if (variant === 'card') {
    // The public stream strips amounts and parties, so four consecutive
    // "USDC minted on Arc · PLATFORM" rows carry no information the first one
    // did not. Merge neighbouring rows that read identically and count them,
    // the way the money ledger above already does. Same actor required, so
    // BUYER and PLATFORM never merge into each other. Only consecutive runs
    // collapse, so the stream stays in time order, and the ×N keeps the row
    // count reconcilable with the "1-20 OF 200" range in the header.
    const runs: { e: (typeof events)[number]; repeat: number }[] = [];
    for (const e of events) {
      const last = runs[runs.length - 1];
      if (collapseRepeats && last && last.e.type === e.type && last.e.actor === e.actor) {
        last.repeat += 1;
        continue;
      }
      runs.push({ e, repeat: 1 });
    }
    return (
      <ol className="space-y-2">
        {runs.map(({ e, repeat }, i) => {
          const text = labelFor(e.type, el.eventTexts);
          const tone: Tone = EVENT_TONES[e.type] ?? 'system';
          const txHash = (e.payload?.txHash as string | undefined) ?? undefined;
          const txHref = txExplorerHref(explorer, e.payload, txHash);
          const chips = chipsFor(e.payload, el);
          const href = hrefForEvent(e);
          // Full message stays in backend logs. The scope chip
          // (added by chipsFor) gives users enough context to ask for
          // support without leaking stack traces or internal paths.
          const body = (
            <>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <span className="mobile-readable text-[15px] font-semibold text-[var(--lp-dark)]">
                  {text}
                </span>
                <span className="mobile-meta shrink-0 text-[14px] tabular-nums text-[var(--lp-text-muted)]">
                  {repeat > 1 && <span className="me-2">{`×${repeat}`}</span>}
                  {relativeTime(e.ts)}
                </span>
              </div>
              {(() => {
                // agent.decision/fallback carry a `reasoning`; skips/declines
                // carry a `detail`. Render whichever is present as the row's
                // subtitle so every "stood down" event says why in plain words.
                const sub =
                  e.type === 'agent.decision' || e.type === 'agent.fallback'
                    ? e.payload?.reasoning
                    : e.type === 'agent.skipped' || e.type === 'agent.declined'
                      ? e.payload?.detail
                      : undefined;
                return typeof sub === 'string' && sub ? (
                  <p className="mobile-readable mt-1 text-[14px] leading-snug text-[var(--lp-text-sub)] font-medium">
                    {sub}
                  </p>
                ) : null;
              })()}
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <ActorChip tone={tone} actor={e.actor} />
                {showJobId && e.jobId && (
                  <span className="inline-flex items-center gap-1 mono text-[13px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                    {el.jobLabelCard}
                    <span className="tabular-nums text-[var(--lp-text-sub)] normal-case tracking-normal">
                      {shortHash(e.jobId, 6, 4)}
                    </span>
                  </span>
                )}
                {chips.map((c) => (
                  <DetailChip key={c.key} label={c.label} value={c.value} variant="card" />
                ))}
                {txHref && (
                  <a
                    href={txHref}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(ev) => ev.stopPropagation()}
                    className="group inline-flex items-center gap-1 mono text-[13px] uppercase tracking-[0.12em] font-bold transition-colors relative z-10"
                    style={{ color: 'var(--lp-dark)' }}
                    title={el.explorerTitle}
                  >
                    <span className="tabular-nums normal-case tracking-normal">
                      {shortHash(txHash!, 6, 4)}
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
                    className="ms-auto text-[14px] text-[var(--lp-text-sub)] transition-colors group-hover:text-[var(--lp-dark)] font-medium"
                  >
                    {el.openLink}
                  </span>
                )}
              </div>
            </>
          );

          const cardClass =
            'group relative block rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-4';

          return (
            <li key={`${e.ts}-${i}`} className="slide-in">
              {href ? (
                <Link
                  href={href}
                  className={`${cardClass} transition-colors hover:border-[var(--lp-outline-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]`}
                >
                  {body}
                </Link>
              ) : (
                <div className={cardClass}>
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
        className="absolute start-[5px] top-3 bottom-3 w-px bg-[var(--color-line)]"
      />
      {events.map((e, i) => {
        const text = labelFor(e.type, el.eventTexts);
        const tone: Tone = EVENT_TONES[e.type] ?? 'system';
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
        const txHref = txExplorerHref(explorer, e.payload, txHash);
        const chips = chipsFor(e.payload, el);
        return (
          <li key={`${e.ts}-${i}`} className="slide-in py-3 ps-6 relative">
            <span className="absolute start-0 top-[14px]">
              <StatusDot tone={dotTone} />
            </span>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] text-[var(--color-ink)] font-medium">{text}</span>
              <span className="text-[14px] text-[var(--color-ink-faint)] mono shrink-0">
                {relativeTime(e.ts)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Tag tone={tagTone}>{e.actor}</Tag>
              {showJobId && e.jobId && (
                <span className="inline-flex items-center gap-1 text-[14px] text-[var(--color-ink-faint)]">
                  {el.jobLabelTimeline}
                  <span className="mono">{shortHash(e.jobId, 6, 4)}</span>
                </span>
              )}
              {chips.map((c) => (
                <DetailChip key={c.key} label={c.label} value={c.value} />
              ))}
              {txHref && (
                <a
                  href={txHref}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-1 text-[14px] mono text-[var(--color-accent)] hover:underline decoration-dotted underline-offset-2"
                  title={el.explorerTitle}
                >
                  <span>{shortHash(txHash!, 6, 4)}</span>
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
  return (
    <span className="inline-flex items-center gap-1.5 text-[14px] capitalize text-[var(--lp-text-sub)] font-medium">
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: RAIL_COLOR[tone] }} />
      {actor}
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
      <span className="inline-flex items-baseline gap-1.5 text-[14px]">
        <span className="text-[var(--lp-text-muted)]">{label}</span>
        <span className="tabular-nums text-[var(--lp-dark)]">{value}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-line)] text-[14px]">
      <span className="text-[var(--color-ink-faint)] tracking-tight">{label}</span>
      <span className="text-[var(--color-ink)] mono">{value}</span>
    </span>
  );
}
