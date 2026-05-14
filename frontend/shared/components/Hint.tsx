'use client';
import type { ReactNode } from 'react';

export function Hint({
  children,
  side = 'top',
  align = 'start',
}: {
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
}) {
  const tipPos = side === 'top' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]';

  const alignPos =
    align === 'start'
      ? 'left-0'
      : align === 'end'
      ? 'right-0'
      : 'left-1/2 -translate-x-1/2';

  const arrowSide =
    side === 'top'
      ? 'top-full -mt-px border-t-[var(--color-ink)]'
      : 'bottom-full -mb-px border-b-[var(--color-ink)]';

  const arrowAlign =
    align === 'start' ? 'left-2' : align === 'end' ? 'right-2' : 'left-1/2 -translate-x-1/2';

  return (
    <span className="group relative inline-flex items-center align-middle">
      <span
        role="button"
        tabIndex={0}
        aria-label="Details"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] focus:outline-none focus-visible:text-[var(--color-ink)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 transition-colors duration-150 cursor-help"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className="block"
        >
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="8" cy="5" r="0.85" fill="currentColor" />
          <path
            d="M8 7.5v4"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span
        role="tooltip"
        className={`absolute ${tipPos} ${alignPos} w-64 px-3 py-2 rounded-md bg-[var(--color-ink)] text-[var(--color-bg)] text-[11px] leading-snug opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-opacity duration-150 pointer-events-none z-50 shadow-lg normal-case tracking-normal font-normal`}
      >
        {children}
        <span className={`absolute ${arrowSide} ${arrowAlign} border-4 border-transparent`} />
      </span>
    </span>
  );
}
