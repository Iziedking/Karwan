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
      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--raised)]'
      : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--line-strong)]',
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
  // A day count set from outside (an offer's ready-in time) that is not a chip reads as its date.
  const setElsewhere =
    unit === 'd' && typeof value === 'number' && value > 0 && !exactTime && !pickedDate && !CHIPS.some(([days]) => days === value);
  const dateChipOn = (Boolean(pickedDate) && value !== '') || setElsewhere;
  const dateChipLabel = pickedDate && value !== ''
    ? rs.dueOn.replace('{date}', shortDate(new Date(`${pickedDate}T12:00:00`).getTime()))
    : setElsewhere
      ? rs.dueOn.replace('{date}', shortDate(Date.now() + (value as number) * DAY_MS))
      : rs.pickDate;

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
              <span className="text-[14px] font-normal opacity-75">{shortDate(Date.now() + days * DAY_MS)}</span>
            </button>
          );
        })}
        <label
          className={cn(
            chipClass(dateChipOn),
            'relative cursor-pointer flex-row items-center gap-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--ink)]',
          )}
        >
          <span>{dateChipLabel}</span>
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
        {/* Hours or minutes for a quick job, in the row with the other lengths (owner notes, 4 Nov 2026). */}
        <div
          data-due-time
          className={cn(
            'inline-flex min-h-11 items-stretch overflow-hidden rounded-[14px] border transition-colors',
            exactTime ? 'border-[var(--ink)]' : 'border-[var(--line)] hover:border-[var(--line-strong)]',
          )}
        >
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={unit === 'd' ? UNIT_MAX.hr : unitMax}
            step={1}
            value={exactTime ? value : ''}
            disabled={disabled}
            onChange={(e) => {
              setPickedDate('');
              setExactTime(e.target.value !== '');
              onChange(e.target.value === '' ? '' : Number(e.target.value), unit === 'd' ? 'hr' : unit);
            }}
            placeholder="0"
            aria-label={rs.exactTime}
            className="no-spinner w-14 min-w-0 bg-[var(--surface)] px-3 text-[15px] font-medium tabular-nums text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none"
          />
          <div role="radiogroup" aria-label={t.postJob.deadlineUnitAria} className="flex bg-[var(--surface)] p-0.5">
            {(['hr', 'min'] as const).map((key) => {
              const on = exactTime && unit === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={disabled}
                  // A sensible number per unit, so switching never lands on 90 minutes meant as 90 hours.
                  onClick={() => {
                    setPickedDate('');
                    setExactTime(true);
                    onChange(exactTime && value !== '' && unit === key ? value : { min: 15, hr: 2 }[key], key);
                  }}
                  className={cn(
                    'min-h-10 min-w-10 rounded-[11px] px-2 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    on ? 'bg-[var(--ink)] text-[var(--raised)]' : 'text-[var(--ink-secondary)]',
                  )}
                >
                  {key === 'min' ? units.min : units.hr}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
