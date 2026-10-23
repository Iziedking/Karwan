'use client';
import { forwardRef } from 'react';

/// Six digits in one field: a phone opens its number pad, a pasted PIN with
/// spaces is cleaned, and Enter submits.
export const PinField = forwardRef<HTMLInputElement, {
  id: string;
  label: string;
  value: string;
  onChange: (pin: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  describedBy?: string;
}>(function PinField({ id, label, value, onChange, onSubmit, disabled, describedBy }, ref) {
  return (
    <div>
      <label htmlFor={id} className="block text-[14px] font-medium text-[var(--lp-dark)]">{label}</label>
      <input
        ref={ref}
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={12}
        value={value}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => { if (e.key === 'Enter' && value.length === 6) onSubmit?.(); }}
        className="mt-2 block min-h-12 w-full max-w-[220px] rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-center font-mono text-[22px] tracking-[0.5em] text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] disabled:opacity-60"
      />
    </div>
  );
});
