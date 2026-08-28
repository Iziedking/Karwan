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
import { Band } from '@/shared/components/Bands';

/// Account-level match inbox used on Home and Profile. Every open proposal for
/// the connected account stays folded behind one compact signal until review.
export function PendingMatchesSignal() {
  const auth = useAuth();
  const t = useTranslations().pending;
  const address = auth.address;
  const isAuthed = auth.isAuthenticated;
  const { matches, state, retry } = usePendingMatches(isAuthed, address);
  const [open, setOpen] = useState(false);

  if (matches.length === 0 && state !== 'error') return null;

  const panelId = 'account-pending-matches';
  const count = String(matches.length).padStart(2, '0');

  return (
    <Band tone="light" compact>
      <div className="mx-auto w-full max-w-[1040px]">
        <div
          className="relative overflow-hidden"
          style={{
            background: 'var(--lp-accent)',
            border: '1px solid rgba(14,14,14,0.18)',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            borderBottomLeftRadius: 16,
            borderBottomRightRadius: 4,
          }}
        >
          <span
            aria-hidden
            className="absolute inset-y-0 start-0 w-[3px] bg-[var(--lp-band-dark)]"
          />
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
            className="group grid min-h-[92px] w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-4 ps-4 text-start text-[var(--lp-band-dark)] transition-colors duration-200 hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-band-dark)] sm:flex sm:min-h-[84px] sm:gap-5 sm:px-6 sm:ps-7"
          >
            <span
              aria-hidden
              className="hidden size-9 shrink-0 items-center justify-center border border-black/20 bg-black/[0.04] sm:inline-flex"
              style={{ borderRadius: 9 }}
            >
              <span
                data-instrument-blink
                className="size-[7px] bg-[var(--lp-band-dark)]"
                style={{ animation: 'instrumentBlink 1.6s ease-in-out infinite' }}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block mono text-[10px] font-semibold uppercase tracking-[0.17em] text-[var(--lp-band-dark)]/85">
                [:{t.matches.inlineEyebrow}:]
              </span>
              <span className="mt-1 block max-w-[44ch] font-sans text-[12px] font-medium leading-5 text-[var(--lp-band-dark)]/70">
                {t.matches.inlineSubtitle}
              </span>
            </span>
            <span className="font-sans text-[26px] font-extrabold tabular-nums tracking-[-0.03em] text-[var(--lp-band-dark)] sm:text-[30px]">
              {count}
            </span>
            <span
              aria-hidden
              className={`inline-flex size-11 shrink-0 items-center justify-center border border-black/15 text-[var(--lp-band-dark)]/70 transition-[transform,border-color,color,background-color] duration-200 group-hover:border-black/30 group-hover:bg-black/[0.04] group-hover:text-[var(--lp-band-dark)] ${
                open ? 'rotate-180' : ''
              }`}
              style={{ borderRadius: 10 }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="m3.5 6 4.5 4 4.5-4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>

          {open ? (
            <div
              id={panelId}
              className="pending-match-reveal border-t border-black/[0.18]"
              style={{ background: 'var(--lp-card)' }}
            >
              {state === 'error' ? (
                <MatchLoadError
                  label={t.matches.loadError}
                  retryLabel={t.matches.retry}
                  onRetry={retry}
                />
              ) : null}
              {matches.length > 0 ? (
                <ul className="divide-y divide-[var(--lp-border-light)]">
                  {matches.map((proposal) => (
                    <MatchRow
                      key={proposal.jobId}
                      proposal={proposal}
                      viewerAddress={address!}
                      tone="light"
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <style jsx>{`
        .pending-match-reveal {
          animation: pendingMatchReveal 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
          transform-origin: top;
        }
        @keyframes pendingMatchReveal {
          from {
            opacity: 0;
            transform: translateY(-8px) scaleY(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scaleY(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .pending-match-reveal {
            animation: none;
          }
        }
      `}</style>
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
        background: dark ? 'rgba(255,255,255,0.04)' : 'transparent',
        border: dark ? '1px solid rgba(255,255,255,0.08)' : 'none',
        color: dark ? 'white' : 'var(--lp-dark)',
        borderRadius: dark ? 12 : 0,
        boxShadow: 'none',
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
        className={`group block min-h-11 px-4 py-4 ps-6 sm:px-5 sm:py-5 sm:ps-7 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 ${
          dark ? 'hover:bg-white/[0.03]' : 'hover:bg-black/[0.025]'
        }`}
      >
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-6">
          <div className="min-w-0">
            <span
              className="mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'var(--lp-text-muted)' }}
            >
              [:{role} · {stateCopy.tag}:]
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className="font-sans text-[28px] sm:text-[30px] font-extrabold tabular-nums tracking-[-0.025em] leading-none"
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
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:block sm:text-end sm:shrink-0">
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
              className="col-span-2 row-start-2 sm:mt-2 mono text-[10px] uppercase tracking-[0.12em] transition-colors"
              style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'var(--lp-text-muted)' }}
            >
              {matchingCopy.nextActors[presentation.nextActor]}
            </p>
            <p
              className="col-start-2 row-start-1 text-end sm:mt-1 mono text-[10px] uppercase tracking-[0.12em]"
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
      // Positive is a product state, not a second brand colour. Keep the
      // Karwan lime rail and use ink for the readable label in both themes.
      fg: dark ? 'var(--accent)' : 'var(--accent-deep)',
      bg: dark ? 'rgba(175,201,91,0.12)' : 'rgba(175,201,91,0.18)',
      border: dark ? 'rgba(175,201,91,0.42)' : 'rgba(157,184,75,0.48)',
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
      className="m-4 flex flex-col gap-3 border-s-[3px] border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-4 py-3 sm:m-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-[13px] leading-relaxed text-[var(--lp-dark)]">{label}</p>
      <Button type="button" variant="outline" onClick={onRetry} className="shrink-0 self-start sm:self-auto">
        {retryLabel}
      </Button>
    </div>
  );
}
