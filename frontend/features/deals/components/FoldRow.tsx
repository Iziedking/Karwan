'use client';
import type { ReactNode } from 'react';
import { Icon } from '@/shared/components/Icon';
import { cn } from '@/shared/utils/cn';

/// One row of a form card that opens in place: the setting, what it is set to
/// now, and the controls once opened (Figma Row/Link, view 48 batch 9b).
export function FoldRow({
  label,
  fact,
  open,
  onToggle,
  payInParts,
  children,
}: {
  label: string;
  fact: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  payInParts?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} onToggle={(event) => onToggle(event.currentTarget.open)} {...(payInParts ? { 'data-pay-in-parts': '' } : {})}>
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 px-4 text-[15px] font-medium text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{label}</span>
        <span className="min-w-0 truncate text-end text-[14px] tabular-nums text-[var(--ink-muted)]">{fact}</span>
        <Icon name="chevron-right" size={16} className={cn('shrink-0 text-[var(--ink-muted)] transition-transform', open ? '-rotate-90' : 'rotate-90')} />
      </summary>
      {open ? <div className="px-4 pb-5">{children}</div> : null}
    </details>
  );
}
