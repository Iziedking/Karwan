'use client';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { api } from '@/core/api';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';
import { currencySign, isLocal, typedFor, typingFilter, usdcFor } from '../localAmount';

export interface MoneyInputHandle {
  /// The signed quote for the figure typed (view 55), for a form to send with
  /// the price so the record keeps it. Undefined in USDC or with no rate.
  quote: () => Promise<{ token: string; usdc: number } | undefined>;
}

/// An inline amount field in the person's own currency (view 55): "₦ 50000".
/// The form around it keeps working in USDC: `value` and `onChange` are USDC,
/// and the figure the person types is turned into USDC (rounded down to the
/// micro) as they type. With USDC chosen, or no fresh rate, it is a USDC field.
export function MoneyInput({
  value,
  onChange,
  handle,
  id,
  disabled,
  placeholder = '0',
  className = 'form-input form-input-num',
  ariaLabel,
  ariaDescribedBy,
  required,
  agreed,
  onTyped,
  inputRef,
  dataGuide,
}: {
  value: number | string | null | undefined;
  onChange: (usdc: number | null) => void;
  /// The price as agreed in a local currency, read back as agreed.
  agreed?: { currency: string; amount: string } | null;
  /// The figure as typed in a local currency, told before `onChange`; null in
  /// USDC or while the figure is not whole yet. For a form that keeps it (view 77).
  onTyped?: (said: { currency: string; amount: string } | null) => void;
  handle?: Ref<MoneyInputHandle>;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  required?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /// A guided tour's anchor on the field itself.
  dataGuide?: string;
}) {
  const { locale } = useLocale();
  const { currency, rate } = useDisplayCurrency();
  const unit = isLocal(currency) && rate ? currency : 'USDC';
  const usdcValue = value === '' || value === null || value === undefined ? null : Number(value);
  // A price agreed in this currency reads back exactly as agreed, not
  // re-worked from its USDC at today's rate.
  const said = (usdc: number | null) =>
    usdc === null ? '' : agreed && agreed.currency === unit && usdc === agreedUsdc ? agreed.amount : typedFor(usdc, unit, rate);
  const agreedUsdc = useRef(usdcValue).current;
  const [typed, setTyped] = useState(() => said(usdcValue));
  const lastSent = useRef<number | null>(usdcValue);
  const touched = useRef(false);
  const shownIn = useRef(unit);

  // A value set from outside (a reset, a prefill, a counter-offer) is said
  // again in the person's currency, and so is everything when the currency
  // itself arrives late. The person's own typing is never rewritten.
  useEffect(() => {
    const unitChanged = shownIn.current !== unit;
    shownIn.current = unit;
    if (!unitChanged && touched.current && usdcValue === lastSent.current) return;
    lastSent.current = usdcValue;
    setTyped(said(usdcValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usdcValue, unit]);

  useImperativeHandle(handle, () => ({
    quote: async () => {
      if (unit === 'USDC' || !typed) return undefined;
      try {
        const q = await api.moneyQuote(unit, typed);
        return { token: q.token, usdc: Number(q.usdcMicros) / 1_000_000 };
      } catch {
        return undefined;
      }
    },
  }), [unit, typed]);

  const sign = currencySign(unit, locale);
  const before = unit !== 'USDC';
  return (
    <span dir="ltr" className="relative flex items-center">
      {before ? (
        <span data-amount-sign aria-hidden className="pointer-events-none absolute start-3.5 text-[15px] font-semibold text-[var(--ink-secondary)]">{sign}</span>
      ) : null}
      <input
        id={id}
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={typed}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        data-money-input={unit}
        data-guide={dataGuide}
        onChange={(event) => {
          const next = typingFilter(event.target.value, unit);
          touched.current = true;
          setTyped(next);
          const usdc = usdcFor(next, unit, rate);
          lastSent.current = usdc;
          onTyped?.(unit !== 'USDC' && /^\d{1,15}(\.\d{1,2})?$/.test(next) ? { currency: unit, amount: next } : null);
          onChange(usdc);
        }}
        className={`${className} w-full`}
        // Inline, because the global .form-input padding outranks a utility class
        // and put the sign on top of the figure (owner, 7 Nov 2026).
        style={before ? { paddingInlineStart: `calc(1.4rem + ${Math.max(1, sign.length)}ch)` } : { paddingInlineEnd: '4rem' }}
      />
      {before ? null : (
        <span aria-hidden className="pointer-events-none absolute end-3.5 text-[14px] font-semibold text-[var(--ink-secondary)]">USDC</span>
      )}
    </span>
  );
}
