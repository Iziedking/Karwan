'use client';

import { useEffect, useRef, useState } from 'react';
import { CirclePlus, CircleX } from 'lucide-react';

export interface SavedView {
  key: string;
  label: string;
  count?: number;
}

/// The page's ready-made lists, each with how many rows it holds.
export function SavedViews({ views, active, onChange }: { views: SavedView[]; active: string; onChange: (key: string) => void }) {
  return (
    <div role="tablist" aria-label="Lists" className="flex flex-wrap gap-1.5">
      {views.map((v) => {
        const on = v.key === active;
        return (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(v.key)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition ${on ? 'border-[#3A3F48] bg-[var(--d-hover)] text-[var(--d-text)]' : 'border-transparent text-[var(--d-text-2)] hover:text-[var(--d-text)]'}`}
          >
            {v.label}
            {v.count !== undefined && <span className="text-[12px] font-normal text-[var(--d-text-3)]">{v.count.toLocaleString('en-GB')}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

/// A filter on one field: shows the field, then the chosen value; a list of
/// buttons to choose from, never a native select.
export function FilterChip({ label, options, value, onChange }: {
  label: string;
  options: FilterOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const chosen = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <span className={`inline-flex h-[25px] items-center gap-1.5 rounded-full border pl-2 pr-2.5 text-[12px] font-medium ${chosen ? 'border-[#3A3F48]' : 'border-[var(--d-line-2)]'}`}>
        {chosen ? (
          <button type="button" aria-label={`Clear ${label}`} onClick={() => onChange(null)} className="text-[var(--d-text-3)] hover:text-[var(--d-text)]">
            <CircleX aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
          </button>
        ) : (
          <CirclePlus aria-hidden="true" strokeWidth={1.5} className="size-3.5 text-[var(--d-text-3)]" />
        )}
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-[var(--d-text-2)]">
          {label}
          {chosen && <><span className="text-[var(--d-text-3)]">|</span><span className="text-[var(--d-blue)]">{chosen.label}</span></>}
        </button>
      </span>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[180px] rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)] p-1 shadow-lg">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] ${o.value === value ? 'bg-[var(--d-hover)] text-[var(--d-text)]' : 'text-[var(--d-text-2)] hover:bg-[var(--d-hover)] hover:text-[var(--d-text)]'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
