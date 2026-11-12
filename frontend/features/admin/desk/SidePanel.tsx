'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Check, Copy, ExternalLink, X } from 'lucide-react';
import { DOT, type PillTone } from './StatusPill';

/// A record opened beside its list: 440px on the right, closes on Escape.
export function SidePanel({ title, badge, idLine, href, actions, onClose, children }: {
  title: ReactNode;
  badge?: ReactNode;
  idLine?: ReactNode;
  /// The record's own page, opened from the panel's corner.
  href?: string;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside aria-label="Details" className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[440px] flex-col border-l border-[var(--d-line)] bg-[var(--d-surface)] shadow-2xl">
      <header className="flex items-start gap-2 px-5 pb-3 pt-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-semibold leading-[22px]">{title}</h2>
            {badge}
          </div>
          {idLine}
        </div>
        {href && (
          <Link href={href} aria-label="Open the full page" className="grid h-7 w-9 place-items-center rounded-md border border-[var(--d-line)] bg-[var(--d-button)] text-[var(--d-text-2)] hover:text-[var(--d-text)]">
            <ExternalLink aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
          </Link>
        )}
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-7 w-9 place-items-center rounded-md border border-[var(--d-line)] bg-[var(--d-button)] text-[var(--d-text-2)] hover:text-[var(--d-text)]">
          <X aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
        </button>
      </header>
      {actions && <div className="flex flex-wrap gap-2 px-5 pb-3.5">{actions}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}

export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-[var(--d-line)]">
      <h3 className="px-5 pb-2.5 pt-3.5 text-[13px] font-semibold">{title}</h3>
      <div className="space-y-2.5 px-5 pb-3.5">{children}</div>
    </section>
  );
}

export interface TimelineItem {
  key: string;
  tone: PillTone;
  title: ReactNode;
  line?: ReactNode;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.key} className="flex gap-2.5">
          <span className="mt-[5px] size-2 shrink-0 rounded-full" style={{ background: DOT[item.tone] }} />
          <div className="min-w-0">
            <p className="text-[13px] font-medium">{item.title}</p>
            {item.line && <p className="mt-0.5 text-[12px] text-[var(--d-text-3)]">{item.line}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/// A short form of a long id, copied in full on a click.
export function CopyableId({ value, shown }: { value: string; shown?: string }) {
  const [copied, setCopied] = useState(false);
  const short = shown ?? (value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button type="button" onClick={() => void copy()} title={value} className="inline-flex items-center gap-1.5 text-[12px] text-[var(--d-text-2)] hover:text-[var(--d-text)]">
      <span className="tabular-nums">{short}</span>
      {copied
        ? <Check aria-label="Copied" strokeWidth={1.75} className="size-3 text-[var(--d-green)]" />
        : <Copy aria-hidden="true" strokeWidth={1.5} className="size-3 text-[var(--d-text-3)]" />}
    </button>
  );
}
