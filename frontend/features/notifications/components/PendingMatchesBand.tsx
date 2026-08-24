'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type MatchProposal } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Button } from '@/shared/components/Button';
import {
  Band,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
} from '@/shared/components/Bands';

interface Props {
  /// Tone of the surrounding band. light for cream pages (/app, /profile),
  /// dark for routes that drop this between dark sections.
  tone?: 'light' | 'dark';
  /// Override headline copy. Defaults to "Your bid matched." for the seller
  /// role and "Match found." for the buyer-side viewer.
  headline?: string;
}

/// Shared band that surfaces every open match proposal the connected wallet is
/// a party to. Used on /app, /profile, and /seller so users can pick up the
/// pending match from anywhere. Polls every 10s; replaces with the SSE-driven
/// notifications stream once task #34 lands.
export function PendingMatchesBand({ tone = 'light', headline }: Props) {
  const auth = useAuth();
  const t = useTranslations().pending;
  const address = auth.address;
  const isAuthed = auth.isAuthenticated;
  const { matches, state, retry } = usePendingMatches(isAuthed, address);

  if (matches.length === 0 && state !== 'error') return null;

  const dark = tone === 'dark';
  const computedHeadline = headline ?? t.matches.headline;

  return (
    <Band tone={tone} compact>
      {/* Same measure as every neighbour on this page: MoneyStrip above,
          the agent card below. Without it the band spread to the Band's
          full width and the card read as longer than everything near it. */}
      <div className="mx-auto w-full max-w-[1040px]">
      <SectionTag tone={tone} dot="live">
        {t.matches.sectionTag}
      </SectionTag>
      <HeroHeadline size="md">
        {computedHeadline}
        <Punc>.</Punc>
      </HeroHeadline>
      <p
        className="mt-5 text-pretty text-[15px] leading-relaxed max-w-[52ch]"
        style={{ color: dark ? 'var(--lp-text-muted)' : 'var(--lp-text-sub)' }}
      >
        {t.matches.body}
      </p>
      {state === 'error' ? (
        <MatchLoadError label={t.matches.loadError} retryLabel={t.matches.retry} onRetry={retry} />
      ) : null}
      <ul className="mt-8 space-y-3">
        {matches.map((p) => (
          <MatchRow
            key={p.jobId}
            proposal={p}
            viewerAddress={address!}
            tone={tone}
          />
        ))}
      </ul>
      </div>
    </Band>
  );
}

function MatchRow({
  proposal,
  viewerAddress,
  tone,
}: {
  proposal: MatchProposal;
  viewerAddress: string;
  tone: 'light' | 'dark';
}) {
  const t = useTranslations().pending;
  const me = viewerAddress.toLowerCase();
  const isSeller = proposal.sellerUser.toLowerCase() === me;
  const counterparty = isSeller ? proposal.buyerUser : proposal.sellerUser;
  const role = isSeller ? t.card.roleSeller : t.card.roleBuyer;
  const counterRole = isSeller ? t.card.roleBuyer : t.card.roleSeller;
  // Normalize the price display so a backend that stores 50.000000 reads as
  // 50, and a true 50.49 stays at 50.49. Drops trailing zeros and keeps a
  // 2-decimal floor when fractional.
  const pendingRaise = proposal.awaitingParty === 'buyer' && !!proposal.raisedPriceUsdc;
  const viewerMustAct = pendingRaise ? !isSeller : isSeller;
  const priceDisplay = formatUsdcDisplay(
    pendingRaise ? proposal.raisedPriceUsdc! : proposal.agreedPriceUsdc,
  );
  const chipLabel = pendingRaise
    ? isSeller
      ? t.chips.awaitingBuyer
      : t.chips.reviewPriceChange
    : isSeller
      ? t.chips.acceptToFund
      : t.chips.awaitingSeller;
  const chipFg = viewerMustAct ? '#0a7553' : '#b25425';
  const chipBg = viewerMustAct ? 'rgba(10,117,83,0.10)' : 'rgba(178,84,37,0.10)';
  const chipBorder = viewerMustAct ? 'rgba(10,117,83,0.35)' : 'rgba(178,84,37,0.40)';
  const dark = tone === 'dark';

  return (
    <li
      className="relative overflow-hidden"
      style={{
        background: dark ? 'rgba(255,255,255,0.04)' : 'var(--lp-card)',
        border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid var(--lp-border-light)',
        color: dark ? 'white' : 'var(--lp-dark)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
        boxShadow: dark ? 'none' : '0 1px 0 rgba(0,0,0,0.03), 0 6px 18px -14px rgba(0,0,0,0.14)',
      }}
    >
      <span
        aria-hidden
        className="absolute start-0 top-0 bottom-0 w-[3px]"
        style={{ background: 'var(--lp-accent)' }}
      />
      <Link
        href={`/jobs/${proposal.jobId}`}
        className="block px-5 py-4 ps-6 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <span
              className="mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'var(--lp-text-muted)' }}
            >
              [:{role} · {t.card.contextJob}:]{' '}
              <span
                className="tracking-normal normal-case"
                style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'var(--lp-text-sub)' }}
              >
                {proposal.jobId.slice(0, 10)}…{proposal.jobId.slice(-6)}
              </span>
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className="font-sans text-[26px] font-extrabold tabular-nums tracking-[-0.02em] leading-none"
                style={{ color: dark ? 'white' : 'var(--lp-dark)' }}
              >
                {priceDisplay}
              </span>
              <span
                className="mono text-[10px] uppercase tracking-[0.14em]"
                style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'var(--lp-text-muted)' }}
              >
                {t.card.unit}
              </span>
            </div>
            <p
              className="mt-2 mono text-[10px] uppercase tracking-[0.12em]"
              style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'var(--lp-text-muted)' }}
            >
              {counterRole} {counterparty.slice(0, 8)}…{counterparty.slice(-6)}
            </p>
            {proposal.deadlineUnix ? (
              <p
                className="mt-1 mono text-[9px] uppercase tracking-[0.11em]"
                style={{ color: dark ? 'rgba(255,255,255,0.48)' : 'var(--lp-text-muted)' }}
              >
                {t.card.dueTemplate.replace(
                  '{date}',
                  new Intl.DateTimeFormat(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  }).format(proposal.deadlineUnix * 1000),
                )}
              </p>
            ) : null}
          </div>
          <div className="text-end shrink-0">
            <span
              className="inline-flex items-stretch overflow-hidden mono text-[10px] font-bold uppercase tracking-[0.16em] leading-none"
              style={{
                background: dark ? 'var(--lp-card)' : chipBg,
                color: chipFg,
                border: `1px solid ${chipBorder}`,
                borderTopLeftRadius: 5,
                borderTopRightRadius: 5,
                borderBottomLeftRadius: 5,
                borderBottomRightRadius: 2,
              }}
            >
              <span
                aria-hidden
                className="flex items-center justify-center px-1.5"
                style={{ background: chipFg }}
              >
                <span
                  aria-hidden
                  data-instrument-blink
                  className="inline-block w-[5px] h-[5px] bg-white"
                  style={{ animation: 'instrumentBlink 1.6s ease-in-out infinite' }}
                />
              </span>
              <span className="px-2 py-[6px]">{chipLabel}</span>
            </span>
            <p
              className="mt-2 mono text-[10px] uppercase tracking-[0.12em] transition-colors"
              style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'var(--lp-text-muted)' }}
            >
              {t.card.open} →
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

function formatUsdcDisplay(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (Number.isInteger(n)) return n.toString();
  // Strip trailing zeros, keep up to 2 decimals.
  return n.toFixed(2).replace(/\.?0+$/, '');
}

/// Compact inline variant. no Band wrapper. For embedding in existing layouts
/// (e.g. inside another section on /profile or /app) where a full Band would
/// be too heavy.
export function PendingMatchesInline() {
  const auth = useAuth();
  const t = useTranslations().pending.matches;
  const address = auth.address;
  const isAuthed = auth.isAuthenticated;
  const { matches, state, retry } = usePendingMatches(isAuthed, address);

  if (matches.length === 0 && state !== 'error') return null;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:{t.inlineEyebrow}:] <Accent>{matches.length}</Accent>
        </span>
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
          {t.inlineSubtitle}
        </p>
      </div>
      {state === 'error' ? (
        <MatchLoadError label={t.loadError} retryLabel={t.retry} onRetry={retry} />
      ) : null}
      <ul className="space-y-2.5">
        {matches.map((p) => (
          <MatchRow key={p.jobId} proposal={p} viewerAddress={address!} tone="light" />
        ))}
      </ul>
    </div>
  );
}

type PendingFetchState = 'idle' | 'ready' | 'error';

function usePendingMatches(isAuthenticated: boolean, address?: string | null) {
  const [matches, setMatches] = useState<MatchProposal[]>([]);
  const [state, setState] = useState<PendingFetchState>('idle');
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || !address) {
      setMatches([]);
      setState('idle');
      return;
    }
    let cancelled = false;
    function refresh() {
      api
        .matchesFor(address!)
        .then((data) => {
          if (cancelled) return;
          setMatches(data.proposals);
          setState('ready');
        })
        .catch(() => {
          if (!cancelled) setState('error');
        });
    }
    refresh();
    const id = window.setInterval(refresh, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [address, isAuthenticated, retryToken]);

  return {
    matches,
    state,
    retry: () => setRetryToken((value) => value + 1),
  };
}

function MatchLoadError({
  label,
  retryLabel,
  onRetry,
}: {
  label: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="status"
      className="mt-4 flex flex-col gap-3 border-s-[3px] border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-[13px] leading-relaxed text-[var(--lp-dark)]">{label}</p>
      <Button type="button" variant="outline" onClick={onRetry} className="shrink-0 self-start sm:self-auto">
        {retryLabel}
      </Button>
    </div>
  );
}
