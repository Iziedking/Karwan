'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { countryOptions } from '../countries';

/// The Country field under the tag (view 54): a select that opens a list with
/// a search box at the top, every country in the person's language.
export function CountrySelect({ value, onChange, locale, copy }: {
  value: string | null;
  onChange: (code: string) => void;
  locale: string;
  copy: { label: string; search: string; none: string };
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const options = useMemo(() => countryOptions(locale), [locale]);
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(locale);
    return q ? options.filter((o) => o.name.toLocaleLowerCase(locale).includes(q) || o.code.toLowerCase() === q) : options;
  }, [options, query, locale]);
  const chosen = options.find((o) => o.code === value) ?? null;

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(Math.max(0, options.findIndex((o) => o.code === value)));
    search.current?.focus();
    const away = (event: PointerEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, options, value]);
  useEffect(() => {
    document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, id]);

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div ref={box} className="relative">
      <span id={`${id}-label`} className="mb-1.5 block text-[14px] font-medium text-[var(--ink-secondary)]">{copy.label}</span>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-[14px] bg-[var(--ash)] px-4 text-start text-[16px] text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
      >
        <span id={`${id}-value`} className="truncate">{chosen?.name ?? copy.label}</span>
        <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--ink-secondary)]"><path d="m7 15 5 5 5-5M7 9l5-5 5 5" /></svg>
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_32px_rgba(0,0,0,0.16)]">
          <div className="border-b border-[var(--line)] p-2">
            <input
              ref={search}
              type="search"
              role="combobox"
              aria-controls={listId}
              aria-expanded
              aria-activedescendant={shown[active] ? `${id}-${active}` : undefined}
              aria-label={copy.label}
              placeholder={copy.search}
              value={query}
              autoComplete="off"
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, shown.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active].code); }
                else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); button.current?.focus(); }
              }}
              className="min-h-11 w-full rounded-[10px] border border-[var(--line-strong)] bg-[var(--canvas)] px-3 text-[16px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] focus-visible:border-[var(--ink)]"
            />
          </div>
          <ul id={listId} role="listbox" aria-labelledby={`${id}-label`} className="max-h-[280px] overflow-y-auto p-1.5">
            {shown.length === 0 ? <li className="px-3 py-2.5 text-[15px] text-[var(--ink-secondary)]">{copy.none}</li> : null}
            {shown.map((o, i) => (
              <li
                key={o.code}
                id={`${id}-${i}`}
                role="option"
                aria-selected={o.code === value}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(o.code)}
                onPointerEnter={() => setActive(i)}
                className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] px-3 text-[15px] text-[var(--ink)] ${i === active ? 'bg-[var(--ash)]' : ''}`}
              >
                <span aria-hidden className="w-4 shrink-0">{o.code === value ? '✓' : ''}</span>
                <span className="truncate">{o.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
