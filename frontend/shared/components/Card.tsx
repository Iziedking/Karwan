import React, { type ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';
import { stripMechanicalTags } from '@/shared/i18n/uiCopy';

/// The one card (view 48): surface, a hairline, radius 16, 20px padding on
/// phones and 24px on desktop, no shadow.
export const CARD_CLASS = 'rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)]';
export const CARD_PADDING = 'p-5 lg:p-6';

export function Card({
  title,
  eyebrow,
  action,
  children,
  footer,
  className,
  noPadding,
  interactive,
}: {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  noPadding?: boolean;
  interactive?: boolean;
}) {
  return (
    <section
      className={cn(
        CARD_CLASS,
        'overflow-hidden',
        interactive && 'transition-colors duration-[var(--dur-press)] hover:border-[var(--line-strong)]',
        className,
      )}
    >
      {(title || eyebrow || action) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-5 lg:px-6 lg:pt-6">
          <div className="min-w-0">
            {eyebrow && <p className="mb-1 text-[13px] text-[var(--ink-secondary)]">{stripMechanicalTags(eyebrow)}</p>}
            {title && <h2 className="truncate text-[17px] font-semibold tracking-[-0.01em] text-[var(--ink)]">{title}</h2>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={noPadding ? '' : CARD_PADDING}>{children}</div>
      {footer && <footer className="border-t border-[var(--line)] px-5 py-3 text-[14px] text-[var(--ink-secondary)] lg:px-6">{footer}</footer>}
    </section>
  );
}
