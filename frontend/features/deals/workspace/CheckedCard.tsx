'use client';
import type { ReactNode } from 'react';
import { Icon } from '@/shared/components/Icon';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import type { CheckSummary } from './checkSummary';

/// Checked by Karwan (rule 5): a shield, what the agents compared, and the
/// result in a soft strip. A gap or a pause is said in words; the reasons the
/// page already gives for a pause sit under the strip.
export function CheckedCard({ summary, children }: { summary: CheckSummary; children?: ReactNode }) {
  const t = useTranslations().dealPage;
  const warn = summary.result === 'gap' || summary.result === 'held' || summary.result === 'unverified';
  return (
    <section data-checked-card aria-live="polite" className="rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-[var(--lp-dark)]">
        <Icon name="shield-check" size={20} className="shrink-0" />
        {t.checkedTitle}
      </p>
      <p className="mt-1 text-[14px] text-[var(--lp-text-sub)]">{t.compared[summary.compared]}</p>
      <div className={cn('mt-3 rounded-[12px] px-3 py-2.5', warn ? 'bg-[var(--color-warning-soft)]' : 'bg-[color-mix(in_srgb,var(--lp-accent)_22%,transparent)]')}>
        <p className="text-[14px] font-semibold text-[var(--lp-dark)]">
          {summary.result === 'checking' ? (
            <span aria-hidden className="me-2 inline-block size-2 rounded-full bg-[var(--accent)] align-middle motion-safe:animate-pulse" />
          ) : null}
          {t.result[summary.result]}
        </p>
        {summary.detail ? <p dir="auto" className="mt-0.5 text-[14px] leading-relaxed text-[var(--lp-dark)]">{summary.detail}</p> : null}
      </div>
      {children ? <div className="mt-3 space-y-2">{children}</div> : null}
    </section>
  );
}
