import type { ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

/// A short name for an icon-only control, shown on hover after a beat and at
/// once on keyboard focus. The control keeps its own aria-label, so the tip is
/// hidden from screen readers rather than read twice. Touch screens never see
/// it: there is no hover there, and a tap should act, not explain.
export function Tooltip({
  label,
  shortcut,
  side = 'bottom',
  align = 'center',
  className,
  off = false,
  children,
}: {
  label: string;
  shortcut?: string;
  side?: 'bottom' | 'end';
  align?: 'center' | 'end';
  className?: string;
  /// Hides the tip while the control's own panel is open.
  off?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      {children}
      {off ? null : <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute z-50 inline-flex items-center gap-2 whitespace-nowrap rounded-[10px] bg-[var(--lp-dark)] px-3 py-2 text-[14px] font-medium leading-none text-[var(--lp-card)] opacity-0 transition-opacity duration-150',
          'group-hover/tip:opacity-100 group-hover/tip:delay-300 group-has-[:focus-visible]/tip:opacity-100 group-has-[:focus-visible]/tip:delay-0',
          'motion-reduce:transition-none [@media(hover:none)]:hidden',
          side === 'end'
            ? 'start-full top-1/2 ms-2 -translate-y-1/2'
            : align === 'end'
              ? 'end-0 top-full mt-2'
              : 'left-1/2 top-full mt-2 -translate-x-1/2',
        )}
      >
        {label}
        {shortcut ? (
          <kbd className="rounded-[6px] border border-[color-mix(in_srgb,var(--lp-card)_30%,transparent)] px-1.5 py-1 font-sans text-[13px] font-medium leading-none">
            {shortcut}
          </kbd>
        ) : null}
      </span>}
    </span>
  );
}
