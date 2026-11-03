'use client';
import type { ReactNode } from 'react';
import { CARD_CLASS } from '@/shared/components/Card';
import { Icon } from '@/shared/components/Icon';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import type { CheckSummary } from './checkSummary';

/// Checked by Karwan (rule 5, view 48): a shield, the result as the line under
/// the title, and what was compared. A gap or a pause is said in words in the
/// warning colour; the reasons the page gives for a pause sit under it.
export function CheckedCard({ summary, children }: { summary: CheckSummary; children?: ReactNode }) {
  const t = useTranslations().dealPage;
  const warn = summary.result === 'gap' || summary.result === 'held' || summary.result === 'unverified';
  return (
    <section data-checked-card aria-live="polite" className={cn(CARD_CLASS, 'flex gap-3 p-5 lg:p-6')}>
      <Icon name="shield-check" size={20} className="mt-0.5 shrink-0 text-[var(--ink)]" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-[var(--ink)]">{t.checkedTitle}</p>
        <p className={cn('mt-1 text-[13px] font-medium', warn ? 'text-[var(--color-warning)]' : 'text-[var(--ink)]')}>
          {summary.result === 'checking' ? <span className="me-2 inline-block align-middle"><span aria-hidden className="inline-block size-2 rounded-full bg-[var(--ink-secondary)] motion-safe:animate-pulse" /></span> : null}
          {t.result[summary.result]}
        </p>
        {summary.detail ? <p dir="auto" className="mt-1 text-[13px] leading-relaxed text-[var(--ink-secondary)]">{summary.detail}</p> : null}
        <p className="mt-1 text-[13px] text-[var(--ink-secondary)]">{t.compared[summary.compared]}</p>
        {children ? <div className="mt-3 space-y-2 [&_p]:text-[13px]">{children}</div> : null}
      </div>
    </section>
  );
}
