'use client';
import type { AmountKey } from '../amountEntry';

const ROWS: AmountKey[][] = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', 'back']];

/// The number keypad for an amount on a phone. Numerals only, so it reads the
/// same in every language; keys have no fill until pressed.
export function Keypad({ onKey, disabled, label, backLabel }: {
  onKey: (key: AmountKey) => void;
  disabled?: boolean;
  label: string;
  backLabel: string;
}) {
  return (
    <div role="group" aria-label={label} dir="ltr" className="grid grid-cols-3 gap-1 select-none">
      {ROWS.flat().map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onKey(key)}
          aria-label={key === 'back' ? backLabel : undefined}
          className="grid h-[60px] place-items-center rounded-[16px] text-[26px] font-medium tabular-nums text-[var(--ink)] transition-colors duration-100 active:bg-[var(--raised)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] [touch-action:manipulation]"
        >
          {key === 'back' ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" />
              <path d="m17 9-6 6M11 9l6 6" />
            </svg>
          ) : key}
        </button>
      ))}
    </div>
  );
}
