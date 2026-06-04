'use client';
import { useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// A span-based copy control. Renders as a span (not a button) so it can sit
/// inside a clickable parent without nesting interactive elements. Stops
/// propagation so copying does not trigger the parent.
export function CopyAddress({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations().inlineControls;

  function copy(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {});
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={copy}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') copy(e);
      }}
      title={t.copyAddressTooltip}
      className={`inline-flex items-center gap-1 text-[10px] cursor-pointer transition-colors ${
        copied
          ? 'text-[var(--color-positive)]'
          : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
      } ${className ?? ''}`}
    >
      <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden>
        {copied ? (
          <path
            d="M3.5 8.5l3 3 6-7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M3.5 10.5h-.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
      {copied ? t.copiedLabel : t.copyLabel}
    </span>
  );
}
