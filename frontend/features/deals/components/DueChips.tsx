'use client';
import { useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';

export type DeadlineUnit = 'min' | 'hr' | 'd';

const CHIPS = [[3, 'days3'], [7, 'week1'], [14, 'weeks2'], [30, 'month1']] as const;
const DAY_MS = 86_400_000;
const UNIT_MAX = { min: 1440, hr: 72 } as const;

const shortDate = (time: number) => new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const chipClass = (active: boolean) =>
  cn(
    'inline-flex min-h-11 flex-col items-start justify-center rounded-[14px] border px-3.5 py-1.5 text-start text-[14px] font-medium leading-tight transition-colors',
    active
      ? 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-light)]'
      : 'border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)] hover:border-[var(--lp-outline-strong)]',
  );

/// When the work is due: a few common lengths with their dates, any date from
/// the calendar, or hours and minutes for quick jobs. `optional` adds a "No
/// deadline" choice that leaves the value empty.
export function DueChips({
  value,
  unit,
  onChange,
  maxDays,
  disabled,
  optional,
}: {
  value: number | '';
  unit: DeadlineUnit;
  onChange: (value: number | '', unit: DeadlineUnit) => void;
  maxDays: number;
  disabled?: boolean;
  optional?: boolean;
}) {
  const t = useTranslations();
  const rs = t.dealCreation.requestSteps;
  const units = t.postJob.unitPickerLabels;
  const [exactTime, setExactTime] = useState(false);
  const [pickedDate, setPickedDate] = useState('');

  function pickDays(days: number) {
    setPickedDate('');
    setExactTime(false);
    onChange(days, 'd');
  }

  function pickDate(date: string) {
    setPickedDate(date);
    if (!date) return;
    // Whole days until the end of the chosen day, so "Due 14 Oct" means by the end of 14 Oct.
    const end = new Date(`${date}T23:59:59`).getTime();
    setExactTime(false);
    onChange(Math.max(1, Math.min(maxDays, Math.ceil((end - Date.now()) / DAY_MS))), 'd');
  }

  const unitMax = unit === 'd' ? maxDays : UNIT_MAX[unit];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {optional ? (
          <button
            type="button"
            aria-pressed={value === ''}
            disabled={disabled}
            onClick={() => {
              setPickedDate('');
              setExactTime(false);
              onChange('', 'd');
            }}
            className={chipClass(value === '')}
          >
            {rs.noDate}
          </button>
        ) : null}
        {CHIPS.filter(([days]) => days <= maxDays).map(([days, key]) => {
          const active = !exactTime && !pickedDate && unit === 'd' && value === days;
          return (
            <button key={key} type="button" aria-pressed={active} disabled={disabled} onClick={() => pickDays(days)} className={chipClass(active)}>
              {rs[key]}
              <span className="text-[12px] font-normal opacity-75">{shortDate(Date.now() + days * DAY_MS)}</span>
            </button>
          );
        })}
        <label
          className={cn(
            chipClass(Boolean(pickedDate) && value !== ''),
            'relative cursor-pointer flex-row items-center gap-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--lp-accent)]',
          )}
        >
          <span>{pickedDate && value !== '' ? rs.dueOn.replace('{date}', shortDate(new Date(`${pickedDate}T12:00:00`).getTime())) : rs.pickDate}</span>
          <input
            type="date"
            value={pickedDate}
            min={new Date(Date.now() + DAY_MS).toISOString().slice(0, 10)}
            max={new Date(Date.now() + maxDays * DAY_MS).toISOString().slice(0, 10)}
            onChange={(e) => pickDate(e.target.value)}
            disabled={disabled}
            aria-label={rs.pickDate}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
          />
        </label>
      </div>
      {exactTime ? (
        <div className="flex items-stretch gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={unitMax}
            step={1}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value), unit)}
            placeholder="0"
            aria-label={rs.exactTime}
            className="form-input form-input-num min-w-0 flex-1"
          />
          <div role="radiogroup" aria-label={t.postJob.deadlineUnitAria} className="grid shrink-0 grid-cols-3 gap-0.5 rounded-[12px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] p-0.5">
            {(['min', 'hr', 'd'] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={unit === key}
                disabled={disabled}
                // A sensible number per unit, so switching never lands on 90 minutes meant as 90 days.
                onClick={() => onChange({ min: 15, hr: 2, d: 5 }[key], key)}
                className={cn(
                  'min-h-11 min-w-11 rounded-[10px] px-2.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  unit === key ? 'bg-[var(--lp-control-active-bg)] text-[var(--lp-control-active-ink)]' : 'text-[var(--lp-text-sub)]',
                )}
              >
                {key === 'min' ? units.min : key === 'hr' ? units.hr : units.day}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setPickedDate('');
            setExactTime(true);
            if (value === '') onChange(2, 'hr');
          }}
          className="inline-flex min-h-11 items-center text-[13px] font-semibold text-[var(--lp-text-sub)] underline underline-offset-4 hover:text-[var(--lp-dark)]"
        >
          {rs.exactTime}
        </button>
      )}
    </div>
  );
}
