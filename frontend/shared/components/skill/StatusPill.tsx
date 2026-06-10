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
  pos: '#6BE39A',
  warn: '#FFC857',
  neg: '#FF6A6A',
  info: '#7CC2FF',
  neutral: '#9A9A95',
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
        // hexToRgba for the 8% bg and 16% border.
        background: `${c}14`,   // 0x14 / 255 ≈ 0.078
        border: `1px solid ${c}29`, // 0x29 / 255 ≈ 0.16
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
