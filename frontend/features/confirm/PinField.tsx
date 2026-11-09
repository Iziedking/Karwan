'use client';
import { forwardRef } from 'react';
import { CodeBoxes } from '@/shared/components/CodeBoxes';

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
      <div className="mt-2">
        <CodeBoxes ref={ref} id={id} value={value} onChange={onChange} onComplete={onSubmit} masked disabled={disabled} describedBy={describedBy} />
      </div>
    </div>
  );
});
