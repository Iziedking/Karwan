'use client';
import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

/// SKILL.md §4.9. Status pill. Leading 6px dot in the semantic color. Mono
/// uppercase 11px text. Background = surface tint at 8% opacity of the
/// semantic color. Border = 1px at 16% opacity. Radius 999px.
///
/// Reserved for settlement state, never decorative. Variants map to the
/// rail color set.

export type StatusPillVariant = 'pos' | 'warn' | 'neg' | 'info' | 'neutral';

const COLOR: Record<StatusPillVariant, string> = {
  pos: 'var(--pos)',
  warn: 'var(--warn)',
  neg: 'var(--neg)',
  info: 'var(--info)',
  neutral: 'var(--ink-2)',
};

export function StatusPill({
  children,
  variant = 'neutral',
  className,
}: {
  children: ReactNode;
  variant?: StatusPillVariant;
  className?: string;
}) {
  const c = COLOR[variant];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-[5px] font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] leading-none rounded-full whitespace-nowrap',
        className,
      )}
      style={{
        background: `color-mix(in srgb, ${c} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${c} 16%, transparent)`,
        color: c,
      }}
    >
      <span
        aria-hidden
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: c }}
      />
      {children}
    </span>
  );
}
