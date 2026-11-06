'use client';
import { useTranslations, useLocale } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { EXPIRY_DAYS, dateBounds, expiryAt, type LinkExpiry } from './linkExpiry';

const chipClass = (active: boolean) =>
  cn(
    'inline-flex min-h-11 flex-col items-start justify-center rounded-[14px] border px-3.5 py-1.5 text-start text-[14px] font-medium leading-tight transition-colors',
    active
      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--raised)]'
      : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--line-strong)]',
  );

/// Until when the link asks for money: three lengths with their dates, or any
/// day on the calendar up to 90 days out.
export function LinkExpiryChips({ value, onChange, disabled }: { value: LinkExpiry; onChange: (value: LinkExpiry) => void; disabled?: boolean }) {
  const copy = useTranslations().payLink.create;
  const { locale } = useLocale();
  const day = (time: number) => new Date(time).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const labels: Record<(typeof EXPIRY_DAYS)[number], string> = { 1: copy.day1, 7: copy.days7, 30: copy.days30 };
  const bounds = dateBounds();
  const dateOn = value.kind === 'date';
  return (
    <div role="group" aria-label={copy.expiresLabel}>
      <span className="block text-[14px] font-medium text-[var(--ink-secondary)]">{copy.expiresLabel}</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {EXPIRY_DAYS.map((days) => {
          const active = value.kind === 'days' && value.days === days;
          return (
            <button key={days} type="button" aria-pressed={active} disabled={disabled} onClick={() => onChange({ kind: 'days', days })} className={chipClass(active)}>
              {labels[days]}
              <span className="text-[14px] font-normal opacity-75">{day(expiryAt({ kind: 'days', days }))}</span>
            </button>
          );
        })}
        <label
          className={cn(
            chipClass(dateOn),
            'relative cursor-pointer flex-row items-center gap-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--ink)]',
          )}
        >
          <span>{dateOn ? copy.until.replace('{date}', day(new Date(`${value.date}T12:00:00`).getTime())) : copy.pickDate}</span>
          <input
            type="date"
            value={dateOn ? value.date : ''}
            min={bounds.min}
            max={bounds.max}
            disabled={disabled}
            aria-label={copy.pickDate}
            onChange={(e) => {
              if (e.target.value) onChange({ kind: 'date', date: e.target.value });
            }}
            onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}
