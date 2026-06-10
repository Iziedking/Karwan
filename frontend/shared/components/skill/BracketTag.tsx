'use client';
import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

/// SKILL.md §4.1. The signature element. Mono uppercase 11–12px wrapped in
/// `[:WORD]` brackets with a 1px square dot leading. Sits 8–12px above the
/// title it labels, never inline.
///
/// Variants:
///   - default: gray ink-3 dot, neutral
///   - live: lime dot with breathing pulse (real-time data, status LIVE)
///   - muted: dimmer dot for archived/closed states
///   - rail-{pos|warn|neg|info}: semantic dot for settlement state

export type BracketTagVariant = 'default' | 'live' | 'muted' | 'pos' | 'warn' | 'neg' | 'info';

const DOT_COLOR: Record<BracketTagVariant, string> = {
  default: 'var(--ink-3)',
  live: 'var(--accent)',
  muted: 'rgba(255,255,255,0.18)',
  pos: 'var(--pos)',
  warn: 'var(--warn)',
  neg: 'var(--neg)',
  info: 'var(--info)',
};

export function BracketTag({
  children,
  variant = 'default',
  className,
  onDark = true,
}: {
  children: ReactNode;
  variant?: BracketTagVariant;
  className?: string;
  onDark?: boolean;
}) {
  const dotColor = DOT_COLOR[variant];
  const textColor = onDark ? 'var(--ink-2)' : 'var(--ink-inv-2)';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.04em] leading-none',
        className,
      )}
      style={{ color: textColor }}
    >
      <span aria-hidden className="relative inline-flex w-[6px] h-[6px]">
        {variant === 'live' && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-[1px] motion-safe:animate-ping"
            style={{ background: dotColor, opacity: 0.55, animationDuration: '1.6s' }}
          />
        )}
        <span
          className="relative inline-block w-[6px] h-[6px]"
          style={{ background: dotColor, borderRadius: 1 }}
        />
      </span>
      <span>[:{children}]</span>
    </span>
  );
}
