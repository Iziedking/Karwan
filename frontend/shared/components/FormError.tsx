'use client';
import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

/// Branded form error / notice. Editorial, not glassy: a flat warm-clay fill,
/// a mono bracket-tag eyebrow, and the brand's asymmetric corner (sharp bottom
/// right). Replaces the soft pink rounded boxes. Pass `eyebrow` to retitle it
/// and `className` for outer spacing.
export function FormError({
  children,
  eyebrow = 'HEADS UP',
  className,
}: {
  children: ReactNode;
  eyebrow?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('px-4 py-3', className)}
      style={{
        background: 'rgba(178,84,37,0.08)',
        border: '1px solid rgba(178,84,37,0.30)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      <p
        className="mono text-[9px] font-bold uppercase tracking-[0.18em]"
        style={{ color: '#b25425' }}
      >
        [:{eyebrow}:]
      </p>
      <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--lp-dark)]">{children}</p>
    </div>
  );
}
