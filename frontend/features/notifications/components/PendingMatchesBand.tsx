'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type MatchProposal } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
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
  const address = auth.address;
  const isAuthed = auth.isAuthenticated;
  const [matches, setMatches] = useState<MatchProposal[]>([]);

  useEffect(() => {
    if (!isAuthed || !address) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    function refresh() {
      api
        .matchesFor(address!)
        .then((d) => {
          if (!cancelled) setMatches(d.proposals);
        })
        .catch(() => {});
    }
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address, isAuthed]);

  if (matches.length === 0) return null;

  const dark = tone === 'dark';
  const computedHeadline = headline ?? 'Pending matches';

  return (
    <Band tone={tone} compact>
      <SectionTag tone={tone} dot="live">
        PENDING MATCHES
      </SectionTag>
      <HeroHeadline size="md">
        {computedHeadline}
        <Punc>.</Punc>
      </HeroHeadline>
      <p
        className="mt-5 text-pretty text-[15px] leading-relaxed max-w-[52ch]"
        style={{ color: dark ? 'var(--lp-text-muted)' : 'var(--lp-text-sub)' }}
      >
        Open one to act. The seller accepts; the buyer&apos;s agent funds escrow automatically.
      </p>
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
  const me = viewerAddress.toLowerCase();
  const isSeller = proposal.sellerUser.toLowerCase() === me;
  const counterparty = isSeller ? proposal.buyerUser : proposal.sellerUser;
  const role = isSeller ? 'SELLER' : 'BUYER';
  const counterRole = isSeller ? 'BUYER' : 'SELLER';
  // Normalize the price display so a backend that stores 50.000000 reads as
  // 50, and a true 50.49 stays at 50.49. Drops trailing zeros and keeps a
  // 2-decimal floor when fractional.
  const priceDisplay = formatUsdcDisplay(proposal.agreedPriceUsdc);
  // Sellers get the action chip; buyers get the read-only awaiting chip.
  const chipLabel = isSeller ? 'ACCEPT TO FUND' : 'AWAITING SELLER';
  const chipFg = isSeller ? '#0a7553' : '#b25425';
  const chipBg = isSeller ? 'rgba(10,117,83,0.10)' : 'rgba(178,84,37,0.10)';
  const chipBorder = isSeller ? 'rgba(10,117,83,0.35)' : 'rgba(178,84,37,0.40)';
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
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: 'var(--lp-accent)' }}
      />
      <Link
        href={`/jobs/${proposal.jobId}`}
        className="block px-5 py-4 pl-6 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <span
              className="mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'var(--lp-text-muted)' }}
            >
              [:{role} · JOB:]{' '}
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
                USDC
              </span>
            </div>
            <p
              className="mt-2 mono text-[10px] uppercase tracking-[0.12em]"
              style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'var(--lp-text-muted)' }}
            >
              {counterRole} {counterparty.slice(0, 8)}…{counterparty.slice(-6)}
            </p>
          </div>
          <div className="text-right shrink-0">
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
              OPEN →
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
  const address = auth.address;
  const isAuthed = auth.isAuthenticated;
  const [matches, setMatches] = useState<MatchProposal[]>([]);

  useEffect(() => {
    if (!isAuthed || !address) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    function refresh() {
      api
        .matchesFor(address!)
        .then((d) => {
          if (!cancelled) setMatches(d.proposals);
        })
        .catch(() => {});
    }
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address, isAuthed]);

  if (matches.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:PENDING MATCHES:] <Accent>{matches.length}</Accent>
        </span>
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
          OPEN ANY TO ACT
        </p>
      </div>
      <ul className="space-y-2.5">
        {matches.map((p) => (
          <MatchRow key={p.jobId} proposal={p} viewerAddress={address!} tone="light" />
        ))}
      </ul>
    </div>
  );
}
