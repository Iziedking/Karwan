'use client';
import type { Ref } from 'react';

/// The amount, large and centred, in the person's own currency: "₦ 50000"
/// (view 55). It is the one figure a send or a request is about (view 50). A
/// real input, typed on a computer; on a phone the keypad fills it and the
/// system keyboard stays closed. USDC moves underneath and is never shown,
/// unless USDC is the chosen currency.
export function AmountHero({ id, label, value, onChange, keypad, disabled, inputRef, sign }: {
  id: string;
  label: string;
  value: string;
  onChange?: (value: string) => void;
  keypad: boolean;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /// "₦", "€", or "USDC". A symbol sits before the figure, a code after it.
  sign: string;
}) {
  const size = value.length > 9 ? 'text-[40px]' : value.length > 6 ? 'text-[54px]' : 'text-[72px]';
  const before = sign !== 'USDC';
  const mark = <span data-amount-sign className={`font-semibold text-[var(--ink-secondary)] ${before ? 'text-[32px]' : 'text-[19px]'}`}>{sign}</span>;
  return (
    <div className="flex flex-col items-center">
      <label htmlFor={id} className="sr-only">{label}</label>
      <div dir="ltr" className="flex max-w-full items-baseline justify-center gap-2">
        {before ? mark : null}
        <input
          id={id}
          ref={inputRef}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          readOnly={!onChange}
          disabled={disabled}
          inputMode={keypad ? 'none' : 'decimal'}
          autoComplete="off"
          placeholder="0"
          size={Math.max(1, value.length || 1)}
          className={`amount-input min-w-0 bg-transparent text-center ${size} font-semibold leading-none tracking-[-0.03em] tabular-nums text-[var(--ink)] caret-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] [field-sizing:content]`}
        />
        {before ? null : mark}
      </div>
    </div>
  );
}
