'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/shared/utils/cn';
import { BracketTag, type BracketTagVariant } from './BracketTag';

/// SKILL.md §4.8 — the data row. 64px min height, 24px horizontal padding.
/// Bracket-tag id column, title with optional secondary line, right-aligned
/// tabular numeric column, status pill, trailing chevron. Hover shifts row bg
/// to `rgba(255,255,255,0.03)` on dark (3% on light) at dur.fast. Numeric
/// values use tabular-nums.
///
/// Pass `href` to make the whole row a Link (skill §4.8: click whole row, not
/// just the chevron). The chevron auto-slides 4px on hover.

export function DataRow({
  tag,
  tagVariant = 'default',
  tagId,
  title,
  subtitle,
  value,
  unit = 'USDC',
  trailing,
  href,
  onClick,
  onDark = true,
  className,
}: {
  tag: ReactNode;
  tagVariant?: BracketTagVariant;
  tagId?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  unit?: string;
  /// Status pill or other right-side block.
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  onDark?: boolean;
  className?: string;
}) {
  const body = (
    <div
      className={cn(
        'group flex items-center gap-6 px-6 min-h-[64px] py-4 transition-colors duration-[var(--dur-fast)]',
        onDark
          ? 'hover:bg-[rgba(255,255,255,0.03)]'
          : 'hover:bg-[rgba(10,10,11,0.03)]',
        className,
      )}
    >
      {/* id column */}
      <div className="shrink-0 min-w-[140px] space-y-1.5">
        <BracketTag variant={tagVariant} onDark={onDark}>
          {tag}
        </BracketTag>
        {tagId && (
          <div
            className="font-mono text-[11px] tabular-nums uppercase tracking-[0.04em]"
            style={{ color: onDark ? 'var(--ink-2)' : 'var(--ink-inv-2)' }}
          >
            {tagId}
          </div>
        )}
      </div>

      {/* title column */}
      <div className="flex-1 min-w-0 space-y-1">
        <div
          className={cn(
            'font-sans text-[15px] font-medium tracking-[-0.005em] leading-tight truncate',
            onDark ? 'text-[var(--ink-0)]' : 'text-[var(--ink-inv-0)]',
          )}
        >
          {title}
        </div>
        {subtitle && (
          <div
            className="text-[13px] leading-snug truncate"
            style={{ color: onDark ? 'var(--ink-2)' : 'var(--ink-inv-2)' }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {/* value column */}
      {value !== undefined && (
        <div className="shrink-0 text-right">
          <div
            className={cn(
              'font-sans text-[18px] font-bold tabular-nums tracking-[-0.015em] leading-none',
              onDark ? 'text-[var(--ink-0)]' : 'text-[var(--ink-inv-0)]',
            )}
          >
            {value}
          </div>
          <div
            className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em]"
            style={{ color: onDark ? 'var(--ink-2)' : 'var(--ink-inv-2)' }}
          >
            {unit}
          </div>
        </div>
      )}

      {/* trailing block (status pill, etc) */}
      {trailing && <div className="shrink-0">{trailing}</div>}

      {/* chevron */}
      <span
        aria-hidden
        className="shrink-0 transition-transform duration-[var(--dur-fast)] group-hover:translate-x-1"
        style={{
          color: onDark ? 'var(--ink-3)' : 'var(--ink-inv-2)',
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        ›
      </span>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-inset"
      >
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-inset"
      >
        {body}
      </button>
    );
  }
  return body;
}
