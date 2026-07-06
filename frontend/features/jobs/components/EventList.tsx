'use client';
import Link from 'next/link';
import type { ChainEvent } from '@/core/api';
import { Tag, StatusDot } from '@/shared/components/Tag';
import { shortHash, relativeTime, formatUsdc } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

/// Direct-deal events live on /deals/[id]; everything else with a jobId lives
/// on /jobs/[id]. Returns null for events that don't have a navigable target.
function hrefForEvent(e: ChainEvent): string | null {
  if (!e.jobId) return null;
  if (e.type.startsWith('deal.direct.') || e.type === 'deal.delivered' ||
      e.type === 'deal.delivery.flagged' || e.type === 'deal.delivery.cleared' ||
      e.type === 'deal.accepted' || e.type === 'deal.review.started' ||
      e.type === 'deal.review.heartbeat' || e.type === 'deal.auto_released' ||
      e.type === 'deal.disputed' || e.type === 'deal.cancelled') {
    return `/deals/${e.jobId}`;
  }
  return `/jobs/${e.jobId}`;
}

/// Tone map for every known event type. Keeps the visual style at module scope
/// (locale-independent) while the human-readable label lives in i18n.
const EVENT_TONES: Record<string, 'buyer' | 'seller' | 'system' | 'error'> = {
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
  seller: '#0a7553',
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
}: {
  events: ChainEvent[];
  explorer: string;
  showJobId?: boolean;
  variant?: 'timeline' | 'card';
}) {
  const el = useTranslations().eventList;
  if (events.length === 0) {
    if (variant === 'card') {
      return (
        <div className="py-12 text-center space-y-2">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            {el.empty.cardTag}
          </p>
          <p className="text-[13px] text-[var(--lp-text-sub)] leading-relaxed max-w-[40ch] mx-auto">
            {el.empty.cardBody}
          </p>
        </div>
      );
    }
    return (
      <div className="py-8 text-center space-y-1.5">
        <p className="eyebrow">{el.empty.timelineTag}</p>
        <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed max-w-[40ch] mx-auto">
          {el.empty.timelineBody}
        </p>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <ol className="space-y-2.5">
        {events.map((e, i) => {
          const text = el.eventTexts[e.type] ?? e.type;
          const tone: Tone = EVENT_TONES[e.type] ?? 'system';
          const rail = RAIL_COLOR[tone];
          const txHash = (e.payload?.txHash as string | undefined) ?? undefined;
          const txHref = txExplorerHref(explorer, e.payload, txHash);
          const chips = chipsFor(e.payload, el);
          const href = hrefForEvent(e);
          // Full message stays in backend logs. The [:WHERE:] scope chip
          // (added by chipsFor) gives users enough context to ask for
          // support without leaking stack traces or internal paths.
          const body = (
            <>
              <span
                aria-hidden
                className="absolute start-0 top-0 bottom-0 w-[3px]"
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
                  <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--lp-text-sub)]">
                    {sub}
                  </p>
                ) : null;
              })()}
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                <ActorChip tone={tone} actor={e.actor} />
                {showJobId && e.jobId && (
                  <span className="inline-flex items-center gap-1 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
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
                    className="group inline-flex items-center gap-1 mono text-[10px] uppercase tracking-[0.12em] font-bold transition-colors relative z-10"
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
                    className="ms-auto mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] transition-colors group-hover:text-[var(--lp-dark)]"
                  >
                    {el.openLink}
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
                  className="group relative overflow-hidden block p-4 ps-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_1px_0_rgba(0,0,0,0.04),0_10px_24px_-14px_rgba(0,0,0,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
                  style={cardStyle}
                >
                  {body}
                </Link>
              ) : (
                <div className="group relative overflow-hidden p-4 ps-5" style={cardStyle}>
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
        const text = el.eventTexts[e.type] ?? e.type;
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
              <span className="text-[13px] text-[var(--color-ink)] font-medium">{text}</span>
              <span className="text-[11px] text-[var(--color-ink-faint)] mono shrink-0">
                {relativeTime(e.ts)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Tag tone={tagTone}>{e.actor}</Tag>
              {showJobId && e.jobId && (
                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-ink-faint)]">
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
                  className="group inline-flex items-center gap-1 text-[11px] mono text-[var(--color-accent)] hover:underline decoration-dotted underline-offset-2"
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
