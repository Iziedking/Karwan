'use client';
import React, { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export function CreationReview({ rows, children, onEdit, busy }: {
  rows: Array<{ label: string; value: ReactNode }>;
  children: ReactNode;
  onEdit: () => void;
  busy: boolean;
}) {
  const c = useTranslations().dealCreation;
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <section aria-labelledby={titleId} className="space-y-5">
      <div>
        <h2 id={titleId} ref={heading} tabIndex={-1} className="text-[22px] font-semibold tracking-tight text-[var(--lp-dark)] focus:outline-none">{c.reviewTitle}</h2>
        <p className="mt-2 text-[14px] text-[var(--lp-text-sub)]">{c.notes}</p>
      </div>
      <dl className="divide-y divide-[var(--lp-border-light)]">
        {rows.map((row, index) => (
          <div key={index} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-5">
            <dt className="text-[13px] text-[var(--lp-text-sub)]">{row.label}</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words text-[15px] leading-6 text-[var(--lp-dark)] [overflow-wrap:anywhere]">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="border-s-2 border-[var(--lp-accent)] ps-4 text-[14px] leading-6 text-[var(--lp-dark)]">{children}</div>
      <button type="button" disabled={busy} onClick={onEdit} className="min-h-11 rounded-xl border border-[var(--lp-outline)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] disabled:opacity-50">{c.edit}</button>
    </section>
  );
}
