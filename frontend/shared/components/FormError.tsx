'use client';
import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';
import { stripMechanicalTags } from '@/shared/i18n/uiCopy';

/// Inline form failure. It stays attached to the field or form that needs
/// attention instead of becoming a large red alert card. This follows the
/// Errors use a one-pixel negative rail and a concise label.
export function FormError({
  children,
  eyebrow = 'ERR',
  className,
}: {
  children: ReactNode;
  eyebrow?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('border-s ps-3 py-1', className)}
      style={{
        borderInlineStartColor: 'var(--neg)',
      }}
    >
      <p
        className="mono text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: 'var(--neg)' }}
      >
        {stripMechanicalTags(eyebrow)}
      </p>
      <p className="mt-1 text-[13px] leading-snug text-[var(--lp-dark)]">{children}</p>
    </div>
  );
}
