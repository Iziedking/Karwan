'use client';

import Link from 'next/link';
import type { DirectDeal } from '@/core/api';
import { DealRoute } from '@/features/deals/DealRoute';
import { DealStatePill } from '@/features/deals/DealStatePill';
import { amountStruck, type DealState } from '@/features/deals/dealsList';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { cn } from '@/shared/utils/cn';

/// One deal in a list (view 48). `card` is the Deals list card: the person,
/// what it is, the amount, the route and one status line. `feature` is the
/// Home card for the deal that needs you, with its move as the screen's one
/// primary button. `row` is a line in Home's On the way list. `ended` is a
/// line in the Deals list's Ended card, with how it ended.
export function OpenDealRow({
  href,
  role,
  counterparty,
  counterpartyAddress,
  title,
  deal,
  reference,
  amount,
  unit,
  status,
  yourMove,
  next,
  due,
  move,
  state,
  variant = 'card',
}: {
  href: string;
  role: string;
  counterparty?: string;
  counterpartyAddress?: string;
  /// What the deal is for, when known.
  title?: string | null;
  /// A direct deal draws its route; requests and financed deals have none.
  deal?: DirectDeal;
  /// The short reference people read aloud (D68F-E7D8, REQ-1A2B-3C4D).
  reference?: string | null;
  amount: string;
  unit: string;
  status: string;
  yourMove: boolean;
  next?: string;
  due?: string;
  /// The move on a deal that needs you, in a word or two.
  move?: string;
  /// Where the deal stands, as the pill on the card (owner notes, 3 Nov 2026).
  state?: DealState;
  variant?: 'card' | 'feature' | 'row' | 'ended';
}) {
  const who = counterparty ?? role;
  const heading = title || who;
  const statusLine = [status, next, due].filter(Boolean).join(' · ');
  const label = [heading, status, reference, `${formatUsdc(amount)} ${unit}`].filter(Boolean).join(', ');

  if (variant === 'ended') {
    const struck = state ? amountStruck(state) : false;
    return (
      <li>
        <Link
          href={href}
          aria-label={label}
          data-ended-row
          className="flex min-h-16 items-center gap-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]"
        >
          <span className="min-w-0 flex-1">
            <span dir="auto" className="block truncate text-[15px] font-medium text-[var(--ink)]">{heading}</span>
            <span className="mt-0.5 block truncate text-[13px] text-[var(--ink-secondary)]">{[title ? who : role, due].filter(Boolean).join(' · ')}</span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1.5">
            <span className={cn('text-[15px] font-medium tabular-nums', struck ? 'text-[var(--ink-muted)] line-through' : 'text-[var(--ink)]')}>{formatUsdc(amount)} {unit}</span>
            {state ? <DealStatePill state={state} /> : null}
          </span>
        </Link>
      </li>
    );
  }

  if (variant === 'row') {
    return (
      <li>
        <Link
          href={href}
          aria-label={label}
          className="flex min-h-16 items-center gap-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]"
        >
          <span className="min-w-0 flex-1">
            <span dir="auto" className="block truncate text-[15px] font-semibold text-[var(--ink)]">{heading}</span>
            <span className="mt-0.5 block truncate text-[13px] text-[var(--ink-secondary)]">
              {[title ? who : null, status].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span className="shrink-0 text-end">
            <span className="block text-[15px] font-semibold tabular-nums text-[var(--ink)]">{formatUsdc(amount)} {unit}</span>
            {reference ? <span dir="ltr" className="mt-0.5 block text-[13px] tabular-nums text-[var(--ink-muted)]">{reference}</span> : null}
          </span>
        </Link>
      </li>
    );
  }

  return (
    <li className={cn(CARD_CLASS, 'list-none')}>
      <Link
        href={href}
        aria-label={label}
        className="group block space-y-4 rounded-[var(--radius-card)] p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] lg:p-6"
      >
        <span className="flex items-start gap-3">
          {counterpartyAddress ? (
            <PersonAvatar address={counterpartyAddress} name={who} size={44} />
          ) : (
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--ash)] text-[15px] font-semibold text-[var(--ink)]">
              {who.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span dir="auto" className="block truncate text-[15px] font-semibold text-[var(--ink)]">{heading}</span>
            <span className="mt-0.5 flex min-w-0 items-baseline gap-2 text-[13px] text-[var(--ink-secondary)]">
              <span className="truncate">{title ? who : role}</span>
              {reference ? <span dir="ltr" className="shrink-0 tabular-nums text-[var(--ink-muted)]">{reference}</span> : null}
            </span>
          </span>
          <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--ink)]">{formatUsdc(amount)} {unit}</span>
        </span>
        {deal ? <DealRoute deal={deal} /> : null}
        <span className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            {state ? <DealStatePill state={state} /> : null}
            <span className="min-w-0 truncate text-[13px] text-[var(--ink-secondary)]">{statusLine}</span>
          </span>
          {variant === 'card' && yourMove && move ? (
            <span aria-hidden data-row-move className={cn(buttonClasses({ variant: 'secondary', size: 'sm' }), 'hidden shrink-0 lg:inline-flex')}>
              {move}
            </span>
          ) : null}
        </span>
      </Link>
      {variant === 'feature' && move ? (
        <div className="px-5 pb-5 lg:px-6 lg:pb-6">
          <Link href={href} className={buttonClasses({ variant: 'primary', size: 'lg', className: 'w-full' })}>
            {move}
          </Link>
        </div>
      ) : null}
    </li>
  );
}

export function shortDate(value: number, locale: string): string {
  const ms = value < 10_000_000_000 ? value * 1_000 : value;
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
}

function formatUsdc(raw: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
