import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

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
  const baseStyle =
    'overflow-hidden rounded-t-[16px] rounded-bl-[16px] rounded-br-[4px] bg-[var(--color-surface)] border border-[var(--color-line)] shadow-[var(--shadow-card)] transition-[transform,border-color,box-shadow] duration-[var(--dur-fast)]';
  const interactiveStyle = interactive
    ? 'hover:-translate-y-0.5 hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-card-hover)]'
    : '';
  return (
    <section className={cn(baseStyle, interactiveStyle, className)}>
      {(title || eyebrow || action) && (
        <header className="px-5 pt-4 pb-3 flex items-start justify-between gap-4 border-b border-[var(--color-line)]">
          <div className="min-w-0">
            {eyebrow && (
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)] mb-1">
                • [:{eyebrow}:]
              </p>
            )}
            {title && <h2 className="text-[15px] font-medium text-[var(--color-ink)] tracking-tight truncate">{title}</h2>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={noPadding ? '' : 'px-5 py-4'}>{children}</div>
      {footer && (
        <footer className="px-5 py-3 border-t border-[var(--color-line)] text-xs text-[var(--color-ink-faint)]">
          {footer}
        </footer>
      )}
    </section>
  );
}
