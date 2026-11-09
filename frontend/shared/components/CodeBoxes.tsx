'use client';
import { forwardRef, useState } from 'react';
import { cn } from '@/shared/utils/cn';

/// Six boxes for a code or a PIN (owner, 9 Nov 2026, Figma 218:570). One real
/// input sits over the boxes, so paste, the phone's code autofill, the number
/// pad and screen readers work as with any field; the boxes only draw it. A PIN
/// shows dots.
export const CodeBoxes = forwardRef<HTMLInputElement, {
  id: string;
  value: string;
  onChange: (code: string) => void;
  /// Enter on a full code. With `autoSubmit`, also the moment the last digit lands.
  onComplete?: () => void;
  autoSubmit?: boolean;
  length?: number;
  masked?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
  ariaLabel?: string;
  /// Kept for callers that already name the input (tests, forms).
  autoComplete?: string;
}>(function CodeBoxes({ id, value, onChange, onComplete, autoSubmit = false, length = 6, masked = false, disabled, autoFocus, describedBy, ariaLabel, autoComplete }, ref) {
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, length - 1);
  return (
    <div className="relative w-full max-w-[360px]" data-code-boxes>
      <div aria-hidden className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
        {Array.from({ length }, (_, i) => {
          const digit = value[i];
          return (
            <span
              key={i}
              data-code-box={digit ? 'filled' : 'empty'}
              className={cn(
                'grid h-14 place-items-center rounded-[14px] border bg-[var(--surface)] text-[22px] font-bold tabular-nums text-[var(--ink)] transition-colors',
                focused && i === active && !disabled ? 'border-2 border-[var(--action)]' : 'border-[var(--line)]',
                disabled && 'opacity-60',
              )}
            >
              {digit ? (masked ? <span className="size-3 rounded-full bg-[var(--ink)]" /> : digit) : null}
            </span>
          );
        })}
      </div>
      <input
        ref={ref}
        id={id}
        type={masked ? 'password' : 'text'}
        inputMode="numeric"
        autoComplete={autoComplete ?? (masked ? 'off' : 'one-time-code')}
        pattern={`\\d{${length}}`}
        maxLength={length * 2}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, '').slice(0, length);
          onChange(next);
          if (autoSubmit && next.length === length && value.length !== length) onComplete?.();
        }}
        onKeyDown={(e) => { if (e.key === 'Enter' && value.length === length) onComplete?.(); }}
        // Transparent, not hidden: the input stays the thing that is tapped and read.
        className="absolute inset-0 h-full w-full cursor-text rounded-[14px] bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent disabled:cursor-not-allowed"
      />
    </div>
  );
});
