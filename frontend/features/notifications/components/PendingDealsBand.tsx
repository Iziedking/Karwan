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

const FALLBACK_HEADLINE = 'Open deals';

/// Surface label for a deal at a given stage from the viewer's side.
/// Active rows are "ACTION" (this viewer must move) or "WAIT" (the
/// counterparty must move). Both kinds render in the band so a seller waiting
/// on a release still sees the deal here, just chipped differently.
/// Returns null only on terminal states (settled / cancelled / disputed) so
/// finished deals don't clutter the surface.
function labelFor(
  stage: DealStage,
  isBuyer: boolean,
): { kind: 'action' | 'wait'; text: string } | null {
  switch (stage) {
    case 'awaiting-acceptance':
      return isBuyer
        ? { kind: 'wait', text: 'WAITING ON SELLER' }
        : { kind: 'action', text: 'ACCEPT TO FUND' };
    case 'awaiting-delivery':
      return isBuyer
        ? { kind: 'wait', text: 'WAITING ON SELLER' }
        : { kind: 'action', text: 'MARK DELIVERED' };
    case 'awaiting-first-release':
      return isBuyer
        ? { kind: 'action', text: 'RELEASE FIRST' }
        : { kind: 'wait', text: 'WAITING ON BUYER' };
    case 'awaiting-final-release':
      return isBuyer
        ? { kind: 'action', text: 'RELEASE FINAL' }
        : { kind: 'wait', text: 'WAITING ON BUYER' };
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

/// Surfaces every live direct deal on the user's book on /app, /profile, and
/// /seller. Action chips (green) call out deals where the viewer must move;
/// wait chips (grey) show deals where the counterparty owes the next move so a
/// seller waiting on a buyer release still sees the deal here. Terminal stages
/// (settled, cancelled, disputed) drop off. Agent-match proposals live in a
/// separate band (PendingMatchesBand). Polls every 10s.
export function PendingDealsBand({ tone = 'light', headline = FALLBACK_HEADLINE }: Props) {
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
  const rows = deals
    .map((deal) => {
      const isBuyer = deal.buyer.toLowerCase() === me;
      const label = labelFor(stageOf(deal), isBuyer);
      return label ? { deal, isBuyer, label } : null;
    })
    .filter(
      (x): x is {
        deal: DirectDeal;
        isBuyer: boolean;
        label: { kind: 'action' | 'wait'; text: string };
      } => x !== null,
    );

  if (rows.length === 0) return null;

  const dark = tone === 'dark';

  return (
    <Band tone={tone} compact>
      <SectionTag tone={tone} dot="live">
        OPEN DEALS
      </SectionTag>
      <HeroHeadline size="md">
        {headline}
        <Punc>.</Punc>
      </HeroHeadline>
      <p
        className="mt-5 text-pretty text-[15px] leading-relaxed max-w-[52ch]"
        style={{ color: dark ? 'var(--lp-text-muted)' : 'var(--lp-text-sub)' }}
      >
        Live deals on your book. Green chips need a move from you. Grey chips are waiting on the other side.
      </p>
      <ul className="mt-8 space-y-3">
        {rows.map(({ deal, isBuyer, label }) => {
          const counterparty = isBuyer ? deal.seller : deal.buyer;
          const role = isBuyer ? 'BUYER' : 'SELLER';
          const counterRole = isBuyer ? 'SELLER' : 'BUYER';
          const isAction = label.kind === 'action';
          // Green for "this is on you" chips so they read as a call to action.
          // Neutral for "waiting on them" chips so the page surfaces the deal
          // without making the seller think they need to do something.
          const chipBg = isAction
            ? (dark ? 'var(--lp-card)' : 'rgba(10,117,83,0.10)')
            : (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)');
          const chipFg = isAction
            ? '#0a7553'
            : (dark ? 'rgba(255,255,255,0.7)' : 'var(--lp-text-sub)');
          const chipBorder = isAction
            ? 'rgba(10,117,83,0.35)'
            : (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)');
          const chipBlinkBg = isAction
            ? '#0a7553'
            : (dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)');
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
                        background: chipBg,
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
                        style={{ background: chipBlinkBg }}
                      >
                        <span
                          aria-hidden
                          data-instrument-blink
                          className="inline-block w-[5px] h-[5px] bg-white"
                          style={{ animation: 'instrumentBlink 1.6s ease-in-out infinite' }}
                        />
                      </span>
                      <span className="px-2 py-[6px]">{label.text}</span>
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
