'use client';
import Link from 'next/link';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { DirectDeal } from '@/core/api';
import { useDirectDeals } from '../hooks/useDirectDeals';
import { useDismissed } from '@/shared/hooks/useDismissed';
import { useAuth } from '@/shared/hooks/useAuth';
import { shortAddress, shortHash, formatUsdc } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export type DealStage =
  | 'awaiting-acceptance'
  | 'awaiting-delivery'
  | 'awaiting-first-release'
  | 'awaiting-final-release'
  | 'settled'
  | 'cancelled'
  | 'disputed';

export function stageOf(deal: DirectDeal): DealStage {
  // v2.D EscrowState enum: None=0, Funded=1, Accepted=2, Settled=3, Disputed=4,
  // Refunded=5. Off-chain lifecycle fields lead; the on-chain state only
  // confirms the terminal hops (Settled, Refunded). This ordering matters:
  // when `onChain` is briefly absent on a fresh fetch, the cached snapshot
  // used to default state to 1 (Funded), which then mapped a long-settled
  // deal to `awaiting-acceptance`, the "completed deal flashes as pending"
  // bug on the home book.
  const state = deal.onChain?.state;
  if (deal.cancelledAt || state === 5) return 'cancelled';
  if (deal.disputed || state === 4) return 'disputed';
  const released = deal.onChain?.milestonesReleased ?? 0;
  // Total funded milestones. The escrow is the source of truth; when onChain is
  // briefly absent on a fresh fetch, fall back to two (the direct-deal shape).
  const total = deal.onChain?.milestonePcts?.length ?? 2;
  // Settled if any one of:
  //   - the backend record carries settledAt (manual or auto release path),
  //   - the chain says Settled,
  //   - every funded milestone has been released,
  //   - the auto-release path completed.
  // settledAt was added because backends sometimes ship onChain:null on a
  // transient chain-read failure, which used to let a settled deal fall
  // through to `awaiting-first-release` and reappear in the pending bands.
  if (
    deal.settledAt ||
    state === 3 ||
    released >= total ||
    deal.autoReleasedAt
  ) {
    return 'settled';
  }
  if (released >= 1 || deal.firstAutoReleased) return 'awaiting-final-release';
  if (deal.delivered || deal.deliveredAt) return 'awaiting-first-release';
  if (deal.acceptedAt) return 'awaiting-delivery';
  return 'awaiting-acceptance';
}

// Curated palette. slight off-axis hues so the badges feel designed, not
// pulled from default success/error/warning. Each tone has matching bg, fg, and
// a slightly punchier rail color for the row edge marker. Labels live in the
// dealStage.labels namespace so each locale supplies its own wording.
export const STAGE_META: Record<
  DealStage,
  { rail: string; chipBg: string; chipFg: string }
> = {
  'awaiting-acceptance': {
    rail: '#4a5aa3',
    chipBg: 'rgba(60, 74, 138, 0.10)',
    chipFg: '#3a4a85',
  },
  'awaiting-delivery': {
    rail: '#4a5aa3',
    chipBg: 'rgba(60, 74, 138, 0.10)',
    chipFg: '#3a4a85',
  },
  'awaiting-first-release': {
    rail: '#c96030',
    chipBg: 'rgba(178, 84, 37, 0.12)',
    chipFg: '#b25425',
  },
  'awaiting-final-release': {
    rail: '#c96030',
    chipBg: 'rgba(178, 84, 37, 0.12)',
    chipFg: '#b25425',
  },
  settled: {
    rail: '#0e8c5f',
    chipBg: 'rgba(10, 117, 83, 0.12)',
    chipFg: '#0a7553',
  },
  cancelled: {
    rail: '#b03d3a',
    chipBg: 'rgba(156, 55, 53, 0.10)',
    chipFg: '#9c3735',
  },
  disputed: {
    rail: '#92294a',
    chipBg: 'rgba(126, 36, 64, 0.10)',
    chipFg: '#7e2440',
  },
};

export function StageBadge({ stage }: { stage: DealStage }) {
  const m = STAGE_META[stage];
  const label = useTranslations().dealStage.labels[stage];
  return (
    <span
      className="inline-flex items-stretch overflow-hidden text-[10px] mono font-bold uppercase tracking-[0.18em] leading-none"
      style={{
        background: 'var(--lp-card)',
        border: `1px solid ${m.chipFg}33`,
        color: m.chipFg,
        borderTopLeftRadius: 5,
        borderTopRightRadius: 5,
        borderBottomLeftRadius: 5,
        borderBottomRightRadius: 2,
        boxShadow: `0 1px 0 ${m.chipFg}1f`,
      }}
    >
      <span
        aria-hidden
        className="flex items-center justify-center px-1.5"
        style={{ background: m.chipFg }}
      >
        <span className="block w-[5px] h-[5px] bg-white" />
      </span>
      <span className="px-2 py-[7px]">{label}</span>
    </span>
  );
}

export function DirectDealList({ role }: { role?: 'buyer' | 'seller' }) {
  const t = useTranslations().directDealList;
  const auth = useAuth();
  const address = auth.address ?? undefined;
  const { deals, fetchState } = useDirectDeals();
  const { dismissed, dismiss } = useDismissed('direct-deals');

  const a = address?.toLowerCase();
  const scoped = deals.filter((d) => {
    if (role === 'buyer') return d.buyer === a;
    if (role === 'seller') return d.seller === a;
    return true;
  });
  const visible = scoped.filter((d) => !dismissed.has(d.jobId));

  if (fetchState === 'loading' || fetchState === 'idle') {
    return (
      <div className="p-8 space-y-3">
        <div className="h-16 rounded-lg bg-black/[0.05] animate-pulse motion-reduce:animate-none" />
        <div className="h-16 rounded-lg bg-black/[0.05] animate-pulse motion-reduce:animate-none" />
        <div className="h-16 rounded-lg bg-black/[0.05] animate-pulse motion-reduce:animate-none" />
      </div>
    );
  }
  if (fetchState === 'error') {
    return (
      <p className="p-8 text-center mono text-[12px] uppercase tracking-[0.1em] text-[#7a1f1a]">
        {t.errorBody}
      </p>
    );
  }
  if (visible.length === 0) {
    return (
      <div className="p-10 text-center space-y-2">
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          {scoped.length === 0 ? t.empty.noDealsTag : t.empty.allDismissedTag}
        </p>
        <p className="text-[13px] text-[var(--lp-text-sub)] max-w-[40ch] mx-auto leading-relaxed">
          {scoped.length === 0
            ? role === 'seller'
              ? t.empty.promptSeller
              : role === 'buyer'
                ? t.empty.promptBuyer
                : t.empty.promptBoth
            : t.empty.promptAllDismissed}
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--lp-border-light)]">
      {visible.map((deal) => {
        const stage = stageOf(deal);
        const isBuyer = address?.toLowerCase() === deal.buyer;
        const counterparty = isBuyer ? deal.seller : deal.buyer;
        const meta = STAGE_META[stage];
        const dismissable = stage === 'cancelled' || stage === 'settled' || stage === 'disputed';
        return (
          <SwipeableRow
            key={deal.jobId}
            dismissable={dismissable}
            onDismiss={() => dismiss(deal.jobId)}
            railColor={meta.rail}
          >
            <Link
              href={`/deals/${deal.jobId}`}
              className={cn(
                'block px-6 py-5 transition-colors hover:bg-[var(--lp-light)]',
                'focus-visible:outline-none focus-visible:bg-[var(--lp-light)]',
              )}
            >
              <div className="flex items-center justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="mono text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--lp-text-muted)]">
                      {isBuyer ? t.roleEyebrow.buying : t.roleEyebrow.selling}
                    </span>
                    <StageBadge stage={stage} />
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-2">
                    <span className="font-sans text-[26px] font-extrabold tabular-nums tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
                      {formatUsdc(deal.dealAmountUsdc, { withSuffix: false })}
                    </span>
                    <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                      USDC
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] text-[var(--lp-text-sub)] line-clamp-1 max-w-[60ch]">
                    {deal.terms}
                  </p>
                </div>
                <div className="text-end shrink-0 space-y-1.5">
                  <p className="mono text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--lp-text-muted)]">
                    {isBuyer ? t.counterpartyEyebrow.seller : t.counterpartyEyebrow.buyer}
                  </p>
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 mono text-[11px] border"
                    style={{
                      borderColor: 'var(--lp-border-light)',
                      background: 'var(--lp-light)',
                      color: 'var(--lp-dark)',
                      borderRadius: 2,
                    }}
                  >
                    <span
                      aria-hidden
                      className="w-[5px] h-[5px]"
                      style={{ background: 'var(--lp-accent)' }}
                    />
                    {shortAddress(counterparty)}
                  </span>
                  <p className="mono text-[10px] tabular-nums text-[var(--lp-text-muted)]">
                    {shortHash(deal.jobId, 6, 4)}
                  </p>
                </div>
                <span
                  aria-hidden
                  className="hidden md:inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--lp-light)] transition-transform duration-200 group-hover:rotate-[20deg] group-hover:translate-x-0.5"
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M5 11l6-6M5.5 5h5.5v5.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </div>
            </Link>
          </SwipeableRow>
        );
      })}
    </ul>
  );
}

/// Row wrapper for DirectDealList. Renders the deal link plus, when the deal
/// is in a terminal state:
///   - a large always-visible dismiss button at top-right on desktop / mobile
///   - a swipe-left-to-dismiss interaction backed by a red reveal layer
/// Non-dismissable rows pass through with no wrapper overhead beyond the rail.
function SwipeableRow({
  dismissable,
  onDismiss,
  railColor,
  children,
}: {
  dismissable: boolean;
  onDismiss: () => void;
  railColor: string;
  children: ReactNode;
}) {
  const t = useTranslations().directDealList.swipe;
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  // Direction-lock: once a touch resolves as a horizontal drag, we own it and
  // suppress the wrapped <Link> click; once it resolves as vertical scroll we
  // bail out for the rest of the gesture.
  const axisRef = useRef<'none' | 'horizontal' | 'vertical'>('none');
  // True until the next touchstart resets it. Used to swallow the click that
  // Safari/Chrome fires after a touchend on a tappable element.
  const draggedRef = useRef(false);
  const DIRECTION_LOCK_PX = 8;
  const DISMISS_THRESHOLD_PX = 100;

  const reset = useCallback(() => {
    startXRef.current = null;
    startYRef.current = null;
    axisRef.current = 'none';
    setDragging(false);
    setDragX(0);
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLLIElement>) => {
      if (!dismissable) return;
      const t = e.touches[0];
      if (!t) return;
      startXRef.current = t.clientX;
      startYRef.current = t.clientY;
      axisRef.current = 'none';
      draggedRef.current = false;
      setDragging(true);
    },
    [dismissable],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLLIElement>) => {
      if (!dismissable) return;
      if (startXRef.current === null || startYRef.current === null) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startXRef.current;
      const dy = t.clientY - startYRef.current;

      if (axisRef.current === 'none') {
        // Lock to whichever axis crosses the threshold first.
        if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return;
        axisRef.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      }
      if (axisRef.current === 'vertical') {
        // Let the page scroll; we will not interfere this gesture.
        return;
      }

      // Horizontal drag: respond to motion toward the inline-end edge, clamp,
      // and own the gesture so the browser doesn't try to scroll the page
      // sideways. In LTR that's leftward (negative dx); in RTL it's rightward
      // (positive dx) since the end edge sits on the visual left under rtl.
      draggedRef.current = true;
      if (e.cancelable) e.preventDefault();
      const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
      const clamped = isRtl ? Math.min(180, Math.max(0, dx)) : Math.max(-180, Math.min(0, dx));
      setDragX(clamped);
    },
    [dismissable],
  );

  const handleTouchEnd = useCallback(() => {
    if (!dismissable) {
      reset();
      return;
    }
    const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
    const past = isRtl ? dragX >= DISMISS_THRESHOLD_PX : dragX <= -DISMISS_THRESHOLD_PX;
    if (axisRef.current === 'horizontal' && past) {
      // Past the threshold: slide off toward the inline-end edge and dismiss
      // after the animation lands.
      setDragX(isRtl ? window.innerWidth : -window.innerWidth);
      window.setTimeout(() => onDismiss(), 180);
      return;
    }
    reset();
  }, [dismissable, dragX, onDismiss, reset]);

  // The browser fires a click immediately after a touchend on a tappable
  // element. When we just handled a drag, swallow that click so the wrapped
  // <Link> does not navigate.
  const handleClickCapture = useCallback((e: React.MouseEvent<HTMLLIElement>) => {
    if (draggedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      draggedRef.current = false;
    }
  }, []);

  return (
    <li
      className="group relative overflow-hidden"
      style={{ touchAction: dismissable ? 'pan-y' : undefined }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={reset}
      onClickCapture={handleClickCapture}
    >
      {/* Rail indicator. Stays at the row's left edge regardless of drag. */}
      <span
        aria-hidden
        className="absolute start-0 top-3 bottom-3 w-[3px] z-[1] transition-opacity duration-200 opacity-50 group-hover:opacity-100"
        style={{ background: railColor }}
      />
      {/* Red reveal layer behind the row; fades in as the row slides left. */}
      {dismissable && (
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-end pe-6 pointer-events-none"
          style={{
            background: '#9c3735',
            opacity: Math.min(1, Math.abs(dragX) / 100),
          }}
        >
          <span className="mono text-[11px] uppercase tracking-[0.18em] font-bold text-white">
            {t.dismissReveal}
          </span>
        </div>
      )}
      <div
        className="relative bg-[var(--lp-card)]"
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? 'none' : 'transform 200ms cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {children}
      </div>
      {dismissable && (
        <button
          type="button"
          title={t.dismissTitle}
          aria-label={t.dismissAria}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDismiss();
          }}
          className={cn(
            'absolute top-3 end-3 z-10 inline-flex items-center justify-center w-9 h-9 rounded-full mono text-[16px]',
            'transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
            'opacity-60 md:opacity-40 md:group-hover:opacity-100 hover:opacity-100',
            'hover:-translate-y-0.5 hover:text-[var(--lp-dark)] hover:bg-[var(--lp-light)] hover:border-[var(--lp-accent)]',
          )}
          style={{
            background: 'var(--lp-card)',
            border: '1px solid var(--lp-border-light)',
            color: 'var(--lp-text-muted)',
            boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 6px 16px -12px rgba(0,0,0,0.12)',
          }}
        >
          ×
        </button>
      )}
    </li>
  );
}
