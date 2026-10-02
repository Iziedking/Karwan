'use client';
import { useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';

const HOUR_MS = 3_600_000;
/// The backend takes the window in quarter hours, up to 30 days.
const MAX_HOURS = 720;
const SAMPLES = [0.25, 1, 24] as const;

const chip = (active: boolean) =>
  cn(
    'inline-flex min-h-11 items-center rounded-full border px-4 text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)] disabled:opacity-50',
    active
      ? 'border-[var(--lp-dark)] bg-[var(--lp-dark)] text-[var(--lp-light)]'
      : 'border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)] hover:border-[var(--lp-outline-strong)]',
  );

const quarter = (hours: number) => Math.min(MAX_HOURS, Math.max(0.25, Math.round(hours * 4) / 4));

export function formatWindow(hours: number, labels: { min: string; hr: string }): string {
  return hours < 1 ? `${Math.round(hours * 60)} ${labels.min}` : `${hours % 1 === 0 ? hours : hours.toFixed(2)} ${labels.hr}`;
}

/// How long the seller has to accept: three common windows, a day on the
/// calendar, or minutes and hours typed in.
export function AcceptWithin({ hours, onChange, disabled }: { hours: number; onChange: (hours: number) => void; disabled?: boolean }) {
  const t = useTranslations();
  const rs = t.dealCreation.requestSteps;
  const presets = t.directDeal.terms.presets;
  const units = t.postJob.unitPickerLabels;
  const [mode, setMode] = useState<'sample' | 'date' | 'exact'>(SAMPLES.includes(hours as (typeof SAMPLES)[number]) ? 'sample' : 'exact');
  const [date, setDate] = useState('');
  const [unit, setUnit] = useState<'min' | 'hr'>(hours < 1 ? 'min' : 'hr');
  const [text, setText] = useState(String(hours < 1 ? Math.round(hours * 60) : hours));

  const labels = [presets.fifteenMin, presets.oneHr, presets.dayOne];
  const today = new Date();
  const maxDate = new Date(Date.now() + MAX_HOURS * HOUR_MS).toISOString().slice(0, 10);

  function pickDate(value: string) {
    setDate(value);
    if (!value) return;
    const end = new Date(`${value}T23:59:59`).getTime();
    setMode('date');
    onChange(quarter((end - Date.now()) / HOUR_MS));
  }

  function typeExact(value: string, nextUnit = unit) {
    const digits = value.replace(/\D/g, '').slice(0, 3);
    setText(digits);
    const n = Number(digits);
    if (n >= 1) onChange(quarter(nextUnit === 'min' ? n / 60 : n));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {SAMPLES.map((sample, i) => (
          <button
            key={sample}
            type="button"
            disabled={disabled}
            aria-pressed={mode === 'sample' && hours === sample}
            onClick={() => {
              setMode('sample');
              setDate('');
              onChange(sample);
            }}
            className={chip(mode === 'sample' && hours === sample)}
          >
            {labels[i]}
          </button>
        ))}
        <label className={cn(chip(mode === 'date' && !!date), 'relative cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--lp-accent)]')}>
          <span>{mode === 'date' && date ? rs.until.replace('{date}', new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })) : rs.pickDate}</span>
          <input
            type="date"
            value={date}
            min={today.toISOString().slice(0, 10)}
            max={maxDate}
            disabled={disabled}
            onChange={(e) => pickDate(e.target.value)}
            onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
            aria-label={rs.pickDate}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
      {mode === 'exact' ? (
        <div className="flex items-stretch gap-2">
          <span className="block w-28 shrink-0">
            <input
              inputMode="numeric"
              value={text}
              disabled={disabled}
              onChange={(e) => typeExact(e.target.value)}
              aria-label={rs.exactTime}
              className="form-input form-input-num"
            />
          </span>
          <div role="radiogroup" aria-label={t.postJob.deadlineUnitAria} className="grid shrink-0 grid-cols-2 gap-0.5 rounded-[12px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] p-0.5">
            {(['min', 'hr'] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={unit === key}
                disabled={disabled}
                onClick={() => {
                  setUnit(key);
                  typeExact(text, key);
                }}
                className={cn(
                  'min-h-11 min-w-11 rounded-[10px] px-3 text-[13px] font-semibold transition-colors',
                  unit === key ? 'bg-[var(--lp-control-active-bg)] text-[var(--lp-control-active-ink)]' : 'text-[var(--lp-text-sub)]',
                )}
              >
                {key === 'min' ? units.min : units.hr}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setMode('exact');
            setDate('');
            typeExact(text);
          }}
          className="inline-flex min-h-11 items-center text-[13px] font-semibold text-[var(--lp-text-sub)] underline underline-offset-4 hover:text-[var(--lp-dark)]"
        >
          {rs.exactTime}
        </button>
      )}
    </div>
  );
}
