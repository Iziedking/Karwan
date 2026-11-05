'use client';
import { useId, useState } from 'react';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { Hint } from '@/shared/components/Hint';
import { Row } from '@/features/profile/ui/ProfileUi';
import { DISPLAY_CURRENCIES, rateLine, type DisplayCurrency } from '@/features/money/displayCurrency';
import { useDisplayCurrency } from '@/features/money/hooks/useDisplayCurrency';

/// Show amounts in (view 51): a row in Preferences that opens the ten
/// currencies, each with today's rate. Money stays in USDC; the explanation
/// sits behind the info icon.
export function DisplayCurrencySection() {
  const copy = useTranslations().moneyMove.currency;
  const { locale } = useLocale();
  const { currency, rates, set } = useDisplayCurrency();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<DisplayCurrency | null>(null);
  const titleId = useId();

  async function choose(next: DisplayCurrency) {
    if (saving) return;
    setSaving(next);
    try {
      await set(next);
      setOpen(false);
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <Row label={copy.title} value={currency === 'USDC' ? 'USDC' : `${copy.names[currency]} (${currency})`} onClick={() => setOpen(true)} />
      <ConfirmSheetShell open={open} labelledBy={titleId} busy={saving !== null} onClose={() => setOpen(false)}>
        <h2 id={titleId} className="mb-4 flex items-center gap-2 text-[20px] font-semibold text-[var(--ink)]">
          {copy.title}
          <Hint>{copy.tip}</Hint>
        </h2>
        <div role="radiogroup" aria-labelledby={titleId} data-display-currencies className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)]">
          {DISPLAY_CURRENCIES.map((code) => {
            const line = code === 'USDC' ? copy.asHeld : rateLine(code, rates[code] ?? null, locale) ?? copy.noRate;
            const checked = currency === code;
            return (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={checked}
                data-currency={code}
                onClick={() => void choose(code)}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-start transition-colors duration-[var(--dur-press)] hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]"
              >
                <span aria-hidden className="grid h-7 w-12 shrink-0 place-items-center rounded-[8px] bg-[var(--raised)] text-[13px] font-semibold text-[var(--ink)]">{code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-[var(--ink)]">{copy.names[code]}</span>
                  <span dir="ltr" className="block text-[13px] font-medium text-[var(--ink-secondary)]">{line}</span>
                </span>
                <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] ${checked ? 'border-[var(--ink)]' : 'border-[var(--line-strong)]'}`}>
                  {checked ? <span className="size-2.5 rounded-full bg-[var(--ink)]" /> : null}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[13px] font-medium text-[var(--ink-muted)]">{copy.rateNote}</p>
      </ConfirmSheetShell>
    </>
  );
}
