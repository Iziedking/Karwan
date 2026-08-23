'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type MatchProposal } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { Button } from '@/shared/components/Button';
import {
  formatMatchingTimestamp,
  presentMatchingState,
  type MatchingPresentationTone,
} from '@/features/jobs/matchingPresentation';
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
  const { locale, t: translations } = useLocale();
  const t = translations.pending;
  const matchingCopy = translations.negotiationCard;
  const me = viewerAddress.toLowerCase();
  const isSeller = proposal.sellerUser.toLowerCase() === me;
  const role = isSeller ? t.card.roleSeller : t.card.roleBuyer;
  const counterRole = isSeller ? t.card.roleBuyer : t.card.roleSeller;
  const presentation = presentMatchingState({ proposal, viewerAddress });
  const stateCopy = matchingCopy.states[presentation.state];
  const palette = matchingTonePalette(presentation.tone, tone);
  const priceDisplay = formatUsdcDisplay(
    presentation.currentOffer?.amountUsdc ?? proposal.agreedPriceUsdc,
  );
  const offerLabel = presentation.currentOffer
    ? matchingCopy.offer[presentation.currentOffer.revision]
    : matchingCopy.offer.unknown;
  const updatedLabel = presentation.currentOffer
    ? matchingCopy.offer.updatedTemplate.replace(
        '{time}',
        formatMatchingTimestamp(presentation.currentOffer.updatedAt, locale),
      )
    : null;
  const counterpartyLabel =
    !isSeller && proposal.counterpartyBusiness?.companyName?.trim()
      ? proposal.counterpartyBusiness.companyName.trim()
      : matchingCopy.counterpartyTemplate.replace('{role}', counterRole);
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
        style={{ background: palette.fg }}
      />
      <Link
        href={`/jobs/${proposal.jobId}`}
        aria-label={`${stateCopy.headline} ${priceDisplay} ${t.card.unit}`}
        data-matching-state={presentation.state}
        data-matching-next-actor={presentation.nextActor}
        className={`group block min-h-11 px-5 py-4 ps-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 ${
          dark ? 'hover:bg-white/[0.03]' : 'hover:bg-black/[0.025]'
        }`}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <span
              className="mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'var(--lp-text-muted)' }}
            >
              [:{role} · {stateCopy.tag}:]
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
              {counterpartyLabel}
            </p>
            {updatedLabel ? (
              <p
                className="mt-1 mono text-[9px] uppercase tracking-[0.11em] tabular-nums"
                style={{ color: dark ? 'rgba(255,255,255,0.48)' : 'var(--lp-text-muted)' }}
              >
                {offerLabel} · {updatedLabel}
              </p>
            ) : null}
            {proposal.deadlineUnix ? (
              <p
                className="mt-1 mono text-[9px] uppercase tracking-[0.11em]"
                style={{ color: dark ? 'rgba(255,255,255,0.48)' : 'var(--lp-text-muted)' }}
              >
                {t.card.dueTemplate.replace(
                  '{date}',
                  formatMatchingTimestamp(proposal.deadlineUnix, locale),
                )}
              </p>
            ) : null}
          </div>
          <div className="text-end shrink-0">
            <span
              className="inline-flex items-stretch overflow-hidden mono text-[10px] font-bold uppercase tracking-[0.16em] leading-none"
              style={{
                background: palette.bg,
                color: palette.fg,
                border: `1px solid ${palette.border}`,
                borderTopLeftRadius: 5,
                borderTopRightRadius: 5,
                borderBottomLeftRadius: 5,
                borderBottomRightRadius: 2,
              }}
            >
              <span
                aria-hidden
                className="flex items-center justify-center px-1.5"
                style={{ background: palette.fg }}
              >
                <span
                  aria-hidden
                  data-instrument-blink
                  className="inline-block w-[5px] h-[5px] bg-white"
                  style={{ animation: 'instrumentBlink 1.6s ease-in-out infinite' }}
                />
              </span>
              <span className="px-2 py-[6px]">{stateCopy.tag}</span>
            </span>
            <p
              className="mt-2 mono text-[10px] uppercase tracking-[0.12em] transition-colors"
              style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'var(--lp-text-muted)' }}
            >
              {matchingCopy.nextActors[presentation.nextActor]}
            </p>
            <p
              className="mt-1 mono text-[10px] uppercase tracking-[0.12em]"
              style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'var(--lp-text-sub)' }}
            >
              {t.card.open} →
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

function matchingTonePalette(tone: MatchingPresentationTone, surface: 'light' | 'dark') {
  const dark = surface === 'dark';
  if (tone === 'positive') {
    return {
      fg: dark ? '#6be39a' : '#0a7553',
      bg: dark ? 'rgba(107,227,154,0.10)' : 'rgba(10,117,83,0.10)',
      border: dark ? 'rgba(107,227,154,0.32)' : 'rgba(10,117,83,0.35)',
    };
  }
  if (tone === 'attention') {
    return {
      fg: dark ? '#ffc857' : '#8a451d',
      bg: dark ? 'rgba(255,200,87,0.10)' : 'rgba(178,84,37,0.10)',
      border: dark ? 'rgba(255,200,87,0.32)' : 'rgba(178,84,37,0.40)',
    };
  }
  if (tone === 'critical') {
    return {
      fg: dark ? '#ff8b8b' : '#9d3030',
      bg: dark ? 'rgba(255,106,106,0.10)' : 'rgba(157,48,48,0.08)',
      border: dark ? 'rgba(255,106,106,0.32)' : 'rgba(157,48,48,0.32)',
    };
  }
  return {
    fg: dark ? 'rgba(255,255,255,0.76)' : '#4f575f',
    bg: dark ? 'rgba(255,255,255,0.06)' : 'rgba(79,87,95,0.08)',
    border: dark ? 'rgba(255,255,255,0.16)' : 'rgba(79,87,95,0.24)',
  };
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
