'use client';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { Hint } from '@/shared/components/Hint';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { GUARANTEE_SHARES, guaranteeUsdc } from '../guaranteeAsk';

/// The buyer asks the seller to back the deal with a share of its value, from
/// the seller's savings pocket (view 82).
export function GuaranteeAskField({ on, pct, amountUsdc, seller, disabled, onToggle, onPct }: {
  on: boolean;
  pct: number;
  amountUsdc: number | null;
  seller: string;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
  onPct: (next: number) => void;
}) {
  const a = useTranslations().dealGuarantee.ask;
  const mt = useMoneyText({ compact: true });
  return (
    <div data-guarantee-ask className="space-y-3 border-t border-[var(--line)] pt-4">
      <div className="flex min-h-11 items-center gap-3">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px] font-medium text-[var(--ink)]">
          <span id="guarantee-ask-label">{a.label}</span>
          <Hint>{a.hintBuyer}</Hint>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="guarantee-ask-label"
          disabled={disabled}
          onClick={() => onToggle(!on)}
          className="relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] disabled:opacity-50"
          style={{ background: on ? 'var(--karwan-green)' : 'var(--color-line-strong)' }}
        >
          <span aria-hidden className="absolute top-0.5 size-5 rounded-full bg-[var(--canvas)] shadow-sm transition-[inset-inline-start] duration-200 motion-reduce:transition-none" style={{ insetInlineStart: on ? 22 : 2 }} />
        </button>
      </div>
      {on ? (
        <div className="space-y-2">
          <div role="radiogroup" aria-labelledby="guarantee-ask-label" className="flex flex-wrap gap-2">
            {GUARANTEE_SHARES.map((share) => (
              <button
                key={share}
                type="button"
                role="radio"
                aria-checked={pct === share}
                disabled={disabled}
                onClick={() => onPct(share)}
                className={`min-h-11 rounded-full px-4 text-[14px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] ${pct === share ? 'bg-[var(--ink)] text-[var(--canvas)]' : 'border border-[var(--line-strong)] text-[var(--ink)]'}`}
              >
                {share}%
              </button>
            ))}
          </div>
          {amountUsdc !== null ? (
            <p data-guarantee-amount className="text-[14px] font-medium text-[var(--ink-secondary)]">
              {mt.fill(a.from, { amount: guaranteeUsdc(amountUsdc, pct) }, { name: seller })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
