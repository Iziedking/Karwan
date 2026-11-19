'use client';

import { m } from 'motion/react';
import { cn } from '@/shared/utils/cn';
import { ease } from '@/shared/motion/tokens';

/// A choice in the setup conversation: the whole card is the button, and a
/// picked one fills with the accent while its tick draws in.
export function ChoiceCard({ label, note, on, multi, reduce, onPick }: {
  label: string;
  note: string;
  on: boolean;
  multi: boolean;
  reduce: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={on}
      onClick={onPick}
      className={cn(
        'flex min-h-[68px] w-full items-center gap-4 rounded-[16px] border px-[18px] py-3 text-start transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]',
        on ? 'border-[var(--ink)] bg-[var(--surface)] shadow-[inset_0_0_0_1px_var(--ink)]' : 'border-[var(--line-strong)] bg-[var(--surface)] hover:bg-[var(--raised)]',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold text-[var(--ink)]">{label}</span>
        <span className="mt-0.5 block text-[14px] font-medium text-[var(--ink-secondary)]">{note}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          'grid size-[26px] shrink-0 place-items-center border transition-colors duration-[180ms]',
          multi ? 'rounded-[8px]' : 'rounded-full',
          on ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)]' : 'border-[var(--line-strong)]',
        )}
      >
        {on ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <m.path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.18, ease: ease.out }}
            />
          </svg>
        ) : null}
      </span>
    </button>
  );
}
