'use client';

import Link from 'next/link';
import { cn } from '@/shared/utils/cn';

/// One open deal: the amount is the loudest line, the status says whose move
/// it is, and only your own move is lime.
export function OpenDealRow({
  href,
  role,
  counterparty,
  reference,
  amount,
  unit,
  status,
  yourMove,
  next,
  due,
}: {
  href: string;
  role: string;
  counterparty?: string;
  /// The short reference people read aloud (D68F-E7D8, REQ-1A2B-3C4D).
  reference?: string | null;
  amount: string;
  unit: string;
  status: string;
  yourMove: boolean;
  next?: string;
  due?: string;
}) {
  const meta = [next, due].filter(Boolean).join(' · ');
  return (
    <li>
      <Link
        href={href}
        aria-label={[status, reference, `${formatUsdc(amount)} ${unit}`].filter(Boolean).join(', ')}
        className="group flex min-h-20 items-center gap-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[14px] text-[var(--lp-text-sub)] font-medium">
              {counterparty ? `${role} · ${counterparty}` : role}
            </span>
            {reference ? (
              <span dir="ltr" className="shrink-0 mono text-[13px] tracking-[0.04em] text-[var(--lp-text-muted)]">{reference}</span>
            ) : null}
          </span>
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[24px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[var(--lp-dark)]">
              {formatUsdc(amount)}
            </span>
            <span className="text-[14px] text-[var(--lp-text-sub)] font-medium">{unit}</span>
          </span>
          {meta ? <span className="mt-1.5 block truncate text-[14px] text-[var(--lp-text-muted)]">{meta}</span> : null}
        </span>
        <span
          className={cn(
            'inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[14px] font-medium',
            yourMove
              ? 'bg-[var(--lp-accent)] text-[var(--lp-band-dark)]'
              : 'bg-[var(--tint)] text-[var(--lp-text-sub)]',
          )}
        >
          {status}
        </span>
        <svg
          aria-hidden
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-[var(--lp-text-muted)] transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none rtl:-scale-x-100"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </Link>
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
