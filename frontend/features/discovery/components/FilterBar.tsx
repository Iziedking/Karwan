'use client';

import { useEffect, useRef, useState } from 'react';

/// The filter bar Discover's tabs share: groups of toggle buttons (segmented
/// or outlined) and a small sort menu at the end.
export function FilterGroup({ label, segmented = false, children }: { label: string; segmented?: boolean; children: React.ReactNode }) {
  return (
    <fieldset className={`min-w-0 max-w-full ${segmented ? 'basis-full sm:basis-auto' : ''}`}>
      <legend className="sr-only">{label}</legend>
      {/* One row per group on phones, scrolled sideways, so options never orphan. */}
      <div
        className={`flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          segmented ? 'rounded-full bg-[var(--tint)] p-1 sm:w-auto' : 'p-1'
        }`}
      >
        {children}
      </div>
    </fieldset>
  );
}

export function FilterButton({
  pressed,
  onClick,
  segmented = false,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  segmented?: boolean;
  children: React.ReactNode;
}) {
  const look = segmented
    ? pressed
      ? 'bg-[var(--lp-card)] text-[var(--ink)] shadow-[0_0_0_1px_var(--lp-border-light)]'
      : 'text-[var(--ink-secondary)] hover:text-[var(--ink)]'
    : pressed
      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)]'
      : 'border-[var(--lp-border-light)] text-[var(--ink)] hover:border-[var(--lp-outline-strong)]';
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)] ${segmented ? 'flex-1 px-3 sm:flex-none sm:px-4' : 'border px-4'} ${look}`}
    >
      {children}
    </button>
  );
}

/// Sort is a choice of order, not a filter, so it is one small menu at the end
/// of the bar. Arrow keys move through the options, Enter or Space picks one,
/// Escape closes and focus goes back to the button.
export function SortMenu<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const current = options.find((option) => option.value === value) ?? options[0]!;

  useEffect(() => {
    if (!open) return;
    items.current[Math.max(0, options.findIndex((option) => option.value === value))]?.focus();
    const away = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, options, value]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div ref={wrap} className="relative p-1">
        <button
          ref={trigger}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--lp-outline-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]"
        >
          {current.label}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {open ? (
          <div
            role="menu"
            aria-label={label}
            className="absolute end-1 top-full z-30 mt-1 min-w-[200px] rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
            onKeyDown={(event) => {
              const at = items.current.findIndex((item) => item === document.activeElement);
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                items.current[(at + step + options.length) % options.length]?.focus();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                close();
              } else if (event.key === 'Tab') {
                setOpen(false);
              }
            }}
          >
            {options.map((option, index) => (
              <button
                key={option.value}
                ref={(el) => {
                  items.current[index] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[10px] px-3 text-start text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--tint)] focus-visible:bg-[var(--tint)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--action)]"
              >
                {option.label}
                {option.value === value ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12 5 5 9-10" /></svg>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}

