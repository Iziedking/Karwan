'use client';

import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Paged } from '@/shared/utils/paged';

const BUTTON = 'inline-flex min-h-11 items-center rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]';

/// "1 to 5 of 14" with Previous and Next under a list. Shows nothing when the
/// whole list fits on one page.
export function Pager({ page, label, onPage }: { page: Paged<unknown>; label: string; onPage: (next: number) => void }) {
  const t = useTranslations().startFlow.pager;
  if (page.pages <= 1) return null;
  return (
    <nav aria-label={`${label}, ${t.label}`} className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p aria-live="polite" className="text-[14px] font-semibold tabular-nums text-[var(--lp-text-sub)]">
        {t.range.replace('{from}', String(page.from)).replace('{to}', String(page.to)).replace('{total}', String(page.total))}
      </p>
      <div className="flex gap-2">
        <button type="button" className={BUTTON} disabled={!page.hasPrev} onClick={() => onPage(page.page - 1)}>{t.prev}</button>
        <button type="button" className={BUTTON} disabled={!page.hasNext} onClick={() => onPage(page.page + 1)}>{t.next}</button>
      </div>
    </nav>
  );
}
