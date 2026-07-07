'use client';
import Link from 'next/link';
import { type DirectDeal } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages';
import { Band, SectionTag, HeroHeadline, Punc } from '@/shared/components/Bands';
import { Hint } from '@/shared/components/Hint';
import { stageOf, type DealStage } from '@/features/deals/components/DirectDealList';

interface Props {
  tone?: 'light' | 'dark';
  headline?: string;
}

type PendingChips = Messages['pending']['chips'];

/// Chip label for a deal stage from the viewer's side: either an action this
/// viewer owns or a wait on the counterparty. Null on terminal stages so
/// finished deals do not render here.
function labelFor(
  stage: DealStage,
  isBuyer: boolean,
  chips: PendingChips,
): { kind: 'action' | 'wait'; text: string } | null {
  switch (stage) {
    case 'awaiting-acceptance':
      return isBuyer
        ? { kind: 'wait', text: chips.waitingOnSeller }
        : { kind: 'action', text: chips.acceptToFund };
    case 'awaiting-delivery':
      return isBuyer
        ? { kind: 'wait', text: chips.waitingOnSeller }
        : { kind: 'action', text: chips.markDelivered };
    case 'awaiting-first-release':
      return isBuyer
        ? { kind: 'action', text: chips.releaseFirst }
        : { kind: 'wait', text: chips.waitingOnBuyer };
    case 'awaiting-final-release':
      return isBuyer
        ? { kind: 'action', text: chips.releaseFinal }
        : { kind: 'wait', text: chips.waitingOnBuyer };
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

/// Live direct deals on the viewer's book. Used on /app, /profile, /seller.
/// Green chips mark deals where the viewer must move; grey chips mark deals
/// waiting on the counterparty. Terminal stages drop off. Match proposals
/// surface in PendingMatchesBand. Polls every 10s.
export function PendingDealsBand({ tone = 'light', headline }: Props) {
  const auth = useAuth();
  const t = useTranslations().pending;
  const resolvedHeadline = headline ?? t.deals.headline;
  const address = auth.address;
  /// Single source of truth for deal lists. Inheriting the shared cache
  /// kills the duplicate fetch this component used to fire on every
  /// mount, and the persister excludes the deals namespace, so the band
  /// never renders a stale snapshot, it shows nothing until the fresh
  /// fetch lands. That removes the "old deals flash on home / profile"
  /// regression cleanly.
  const { deals, fetchState } = useDirectDeals();

  const me = address?.toLowerCase() ?? '';
  const rows = deals
    .map((deal) => {
      const isBuyer = deal.buyer.toLowerCase() === me;
      const label = labelFor(stageOf(deal), isBuyer, t.chips);
      return label ? { deal, isBuyer, label } : null;
    })
    .filter(
      (x): x is {
        deal: DirectDeal;
        isBuyer: boolean;
        label: { kind: 'action' | 'wait'; text: string };
      } => x !== null,
    );

  /// While the first fetch is in flight, render nothing instead of an
  /// empty list, keeps the layout from briefly hopping into the page
  /// before the truth arrives. Once we have a response (even one with
  /// zero rows), the band hides as before.
  if (fetchState !== 'success') return null;
  if (rows.length === 0) return null;

  const dark = tone === 'dark';

  return (
    <Band tone={tone} compact>
      {/* The green/grey chip legend folds into a gently glowing tap-to-reveal
          hint beside the eyebrow, so the header stays clean on mobile. */}
      <div className="flex items-center gap-2">
        <SectionTag tone={tone} dot="live">
          {t.deals.sectionTag}
        </SectionTag>
        <Hint glow side="bottom" align="start">
          {t.deals.body}
        </Hint>
      </div>
      <HeroHeadline size="md">
        {resolvedHeadline}
        <Punc>.</Punc>
      </HeroHeadline>
      <ul className="mt-8 space-y-3">
        {rows.map(({ deal, isBuyer, label }) => {
          const counterparty = isBuyer ? deal.seller : deal.buyer;
          const role = isBuyer ? t.card.roleBuyer : t.card.roleSeller;
          const counterRole = isBuyer ? t.card.roleSeller : t.card.roleBuyer;
          const isAction = label.kind === 'action';
          // Green action chips read as a call to action; grey wait chips
          // surface the deal without implying the viewer owes a move.
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
                className="absolute start-0 top-0 bottom-0 w-[3px]"
                style={{ background: 'var(--lp-accent)' }}
              />
              <Link
                href={`/deals/${deal.jobId}`}
                className="block px-5 py-4 ps-6 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <span
                      className="mono text-[10px] uppercase tracking-[0.18em]"
                      style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'var(--lp-text-muted)' }}
                    >
                      [:{role} · {t.card.contextDeal}:]{' '}
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
                        {t.card.unit}
                      </span>
                    </div>
                    <p
                      className="mt-2 mono text-[10px] uppercase tracking-[0.12em]"
                      style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'var(--lp-text-muted)' }}
                    >
                      {counterRole} {counterparty.slice(0, 8)}…{counterparty.slice(-6)}
                    </p>
                  </div>
                  <div className="text-end shrink-0">
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
                      {t.card.open} →
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
