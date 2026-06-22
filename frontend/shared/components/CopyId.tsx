'use client';
import { useState } from 'react';

/// A monospace ID with a copy button. Used for deal IDs so a user can grab the
/// full ID (even after a deal completes) and hand it to live support. Shows a
/// shortened label by default; copies the full value.
export function CopyId({
  value,
  label,
  className = '',
}: {
  value: string;
  /// Optional shortened display label; falls back to the full value.
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the value is still selectable on screen */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${value}`}
      aria-label={`Copy ID ${value}`}
      className={`group inline-flex items-center gap-1.5 mono tabular-nums hover:opacity-80 transition ${className}`}
    >
      <span className={`text-start ${label ? 'whitespace-nowrap' : 'break-all'}`}>
        {label ?? value}
      </span>
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 opacity-60 group-hover:opacity-100">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3.5 10.5h-1a1 1 0 01-1-1v-7a1 1 0 011-1h7a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
