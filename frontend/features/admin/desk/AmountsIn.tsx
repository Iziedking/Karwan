'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { rateLine } from '@/features/money/displayCurrency';
import { DESK_CURRENCIES } from './deskMoney';
import { useDeskCurrency } from './useDeskCurrency';

/// "Show amounts in": the currency every amount on the desk reads in first.
export function AmountsIn() {
  const [currency, setCurrency, rates] = useDeskCurrency();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-[var(--d-hover)]"
      >
        <span className="flex-1 text-[12px] font-medium text-[var(--d-text-3)]">Show amounts in</span>
        <span className="text-[13px] font-semibold text-[var(--d-text)]">{currency}</span>
        <ChevronsUpDown aria-hidden="true" strokeWidth={1.5} className="size-3.5 text-[var(--d-text-3)]" />
      </button>
      {open && (
        <div className="absolute inset-x-0 bottom-full z-40 mb-1 max-h-[60vh] overflow-y-auto rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-1 shadow-lg">
          {DESK_CURRENCIES.map((c) => {
            const line = c === 'USDC' ? 'As the money moves' : rateLine(c, rates[c] ?? null, 'en') ?? 'No rate right now';
            return (
              <button
                key={c}
                type="button"
                onClick={() => { setCurrency(c); setOpen(false); }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--d-hover)] ${c === currency ? 'bg-[var(--d-hover)]' : ''}`}
              >
                <span className="w-11 text-[13px] font-medium text-[var(--d-text)]">{c}</span>
                <span className="flex-1 text-[12px] text-[var(--d-text-3)]">{line}</span>
                {c === currency && <Check aria-label="Chosen" strokeWidth={1.75} className="size-3.5 text-[var(--d-text-2)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
