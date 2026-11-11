'use client';

import { fieldLabel } from '@/features/deals/workspace/Sheet';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { Hint } from '@/shared/components/Hint';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Sessions a month on monthly work (view 76). Empty means one fixed monthly
/// price; the price of one session shows only when the month divides to a cent.
export function SessionsField({ value, onChange, monthUsdc }: { value: string; onChange: (v: string) => void; monthUsdc: string }) {
  const t = useTranslations().work.sessions;
  const mt = useMoneyText({ compact: true });
  const cents = (Number(monthUsdc) * 100) / Number(value);
  const each = Number(value) >= 1 && Number(monthUsdc) > 0 && Math.abs(cents - Math.round(cents)) < 1e-6 ? String(Math.round(cents) / 100) : null;
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
