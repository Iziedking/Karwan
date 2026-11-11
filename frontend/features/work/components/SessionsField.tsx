'use client';

import { fieldLabel } from '@/features/deals/workspace/Sheet';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { Hint } from '@/shared/components/Hint';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { sessionPriceTyped } from '../workModel';

/// Sessions a month on monthly work (view 76). Empty means one fixed monthly
/// price. The price of one session shows as soon as both figures are in.
export function SessionsField({ value, onChange, monthUsdc }: { value: string; onChange: (v: string) => void; monthUsdc: string }) {
  const t = useTranslations().work.sessions;
  const mt = useMoneyText({ compact: true });
  const each = sessionPriceTyped(monthUsdc, value);
  return (
    <div>
      <span className="flex items-center gap-2">
        <label htmlFor="work-sessions" className={fieldLabel}>{t.field}</label>
        <Hint>{t.fieldNote}</Hint>
      </span>
      <input id="work-sessions" className="form-input block w-full mt-2 tabular-nums" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 2))} />
      {each ? <span className="mt-1 block text-[14px] text-[var(--ink-secondary)]">{mt.fill(t.each, { amount: each })}</span> : null}
    </div>
  );
}

/// Empty, or a whole number the server accepts.
export const sessionsOk = (value: string) => value === '' || (Number(value) >= 1 && Number(value) <= 60);
