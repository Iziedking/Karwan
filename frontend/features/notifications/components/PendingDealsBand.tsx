'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type DirectDeal } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { Band, SectionTag, HeroHeadline, Punc } from '@/shared/components/Bands';
import { stageOf, type DealStage } from '@/features/deals/components/DirectDealList';

interface Props {
  /// Tone of the surrounding band. light for cream pages (/app, /profile,
  /// /seller), dark when dropped between dark sections.
  tone?: 'light' | 'dark';
  headline?: string;
}

/// Action label when a deal needs THIS viewer to move now. Returns null when the
/// viewer is just waiting on the counterparty, so we only surface real to-dos.
function actionFor(stage: DealStage, isBuyer: boolean): string | null {
  switch (stage) {
    case 'awaiting-acceptance':
      return isBuyer ? null : 'ACCEPT TO FUND';
    case 'awaiting-delivery':
      return isBuyer ? null : 'MARK DELIVERED';
    case 'awaiting-first-release':
      return isBuyer ? 'RELEASE FIRST' : null;
    case 'awaiting-final-release':
      return isBuyer ? 'RELEASE FINAL' : null;
    default:
      return null;
  }
}

function fmtUsdc(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2).replace(/\.?0+$/, '');
}

/// Surfaces direct deals that need THIS user's action (a buyer opened a deal on
/// your listing, so accept it; a delivery is in, so release it) on /app,
/// /profile, and /seller, so a pending deal is never missed. Agent-match
/// proposals are surfaced separately by PendingMatchesBand. Polls every 10s.
export function PendingDealsBand({ tone = 'light', headline = 'Deals awaiting you' }: Props) {
  const auth = useAuth();
  const address = auth.address;
  const isAuthed = auth.isAuthenticated;
  const [deals, setDeals] = useState<DirectDeal[]>([]);

  useEffect(() => {
    if (!isAuthed || !address) {
      setDeals([]);
      return;
    }
    let cancelled = false;
    function refresh() {
      api
        .directDeals(address!)
        .then((d) => {
          if (!cancelled) setDeals(d.deals);
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

  const me = address?.toLowerCase() ?? '';
  const actionable = deals
    .map((deal) => {
      const isBuyer = deal.buyer.toLowerCase() === me;
      const action = actionFor(stageOf(deal), isBuyer);
      return action ? { deal, isBuyer, action } : null;
    })
    .filter((x): x is { deal: DirectDeal; isBuyer: boolean; action: string } => x !== null);

  if (actionable.length === 0) return null;

  const dark = tone === 'dark';

  return (
    <Band tone={tone} compact>
      <SectionTag tone={tone} dot="live">
        DEALS AWAITING YOU
      </SectionTag>
      <HeroHeadline size="md">
        {headline}
        <Punc>.</Punc>
      </HeroHeadline>
      <p
        className="mt-5 text-pretty text-[15px] leading-relaxed max-w-[52ch]"
        style={{ color: dark ? 'var(--lp-text-muted)' : 'var(--lp-text-sub)' }}
      >
        These deals need a move from you. Open one to act.
      </p>
      <ul className="mt-8 space-y-3">
        {actionable.map(({ deal, isBuyer, action }) => {
          const counterparty = isBuyer ? deal.seller : deal.buyer;
          const role = isBuyer ? 'BUYER' : 'SELLER';
          const counterRole = isBuyer ? 'SELLER' : 'BUYER';
          return (
            <li
              key={deal.jobId}
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
                href={`/deals/${deal.jobId}`}
                className="block px-5 py-4 pl-6 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <span
                      className="mono text-[10px] uppercase tracking-[0.18em]"
                      style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'var(--lp-text-muted)' }}
                    >
                      [:{role} · DEAL:]{' '}
                      <span
                        className="tracking-normal normal-case"
                        style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'var(--lp-text-sub)' }}
                      >
                        {deal.jobId.slice(0, 10)}…{deal.jobId.slice(-6)}
                      </span>
                    </span>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span
                        className="font-sans text-[26px] font-extrabold tabular-nums tracking-[-0.02em] leading-none"
                        style={{ color: dark ? 'white' : 'var(--lp-dark)' }}
                      >
                        {fmtUsdc(deal.dealAmountUsdc)}
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
                        background: dark ? 'var(--lp-card)' : 'rgba(10,117,83,0.10)',
                        color: '#0a7553',
                        border: '1px solid rgba(10,117,83,0.35)',
                        borderTopLeftRadius: 5,
                        borderTopRightRadius: 5,
                        borderBottomLeftRadius: 5,
                        borderBottomRightRadius: 2,
                      }}
                    >
                      <span
                        aria-hidden
                        className="flex items-center justify-center px-1.5"
                        style={{ background: '#0a7553' }}
                      >
                        <span
                          aria-hidden
                          data-instrument-blink
                          className="inline-block w-[5px] h-[5px] bg-white"
                          style={{ animation: 'instrumentBlink 1.6s ease-in-out infinite' }}
                        />
                      </span>
                      <span className="px-2 py-[6px]">{action}</span>
                    </span>
                    <p
                      className="mt-2 mono text-[10px] uppercase tracking-[0.12em]"
                      style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'var(--lp-text-muted)' }}
                    >
                      OPEN →
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Band>
  );
}
