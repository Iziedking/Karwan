'use client';

import { useLocale } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import type { MarketSide } from '../marketQuery';

/// Buy or Sell (Figma 01, P1): two halves of one control; the picked one is
/// the raised white half.
export function BuySellSwitch({ value, onChange }: { value: MarketSide; onChange: (next: MarketSide) => void }) {
  const t = useLocale().t.marketShop;
  return (
    <div role="tablist" aria-label={t.switchLabel} data-guide="market-switch" className="grid grid-cols-2 gap-1 rounded-[16px] bg-[var(--color-surface-2)] p-1">
      {(['buy', 'sell'] as const).map((side) => (
        <button
          key={side}
          type="button"
          role="tab"
          aria-selected={value === side}
          onClick={() => onChange(side)}
          className={cn(
            'min-h-11 rounded-[12px] text-[15px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--action)]',
            value === side ? 'bg-[var(--lp-card)] text-[var(--ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-[var(--ink-secondary)] hover:text-[var(--ink)]',
          )}
        >
          {t[side]}
        </button>
      ))}
    </div>
  );
}
