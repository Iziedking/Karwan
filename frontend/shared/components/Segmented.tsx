'use client';
import { useRef, type KeyboardEvent } from 'react';

/// A two or three way switch, as a tab list (view 51): the chosen option sits
/// on a raised pill, the others read quieter. Arrow keys move between options.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className = '',
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (event.key !== forward && event.key !== back) return;
    event.preventDefault();
    const next = (index + (event.key === forward ? 1 : -1) + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className={`flex gap-1 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-1 ${className}`}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => { refs.current[index] = node; }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKey(event, index)}
            className={`min-h-9 flex-1 rounded-[10px] px-3 text-[14px] transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] ${
              selected ? 'bg-[var(--raised)] font-semibold text-[var(--ink)]' : 'font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)]'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
