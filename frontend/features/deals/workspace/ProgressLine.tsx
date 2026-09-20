'use client';
import type { DealView } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { formatDealDate } from './presentation';

export function ProgressLine({ view }: { view: DealView }) {
  const copy = useTranslations().dealWorkspace;
  const { locale } = useLocale();
  return (
    <section aria-labelledby="deal-progress" className="space-y-3">
      <h2 id="deal-progress" className="text-[20px] font-semibold text-[var(--lp-dark)]">{copy.progress.title}</h2>
      <ol className="grid gap-3 sm:grid-cols-5">
        {view.progress.map((item) => (
          <li
            key={item.step}
            aria-current={item.state === 'current' ? 'step' : undefined}
            className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2 sm:border-t-2 sm:pt-3"
            style={{ borderColor: item.state === 'upcoming' ? 'var(--lp-border-light)' : 'var(--lp-dark)' }}
          >
            <span
              aria-hidden
              className="grid size-5 shrink-0 place-items-center rounded-full border text-[11px] sm:hidden"
              style={{
                background: item.state === 'done' ? 'var(--lp-dark)' : 'transparent',
                borderColor: item.state === 'upcoming' ? 'var(--lp-border-light)' : 'var(--lp-dark)',
                color: 'var(--lp-light)',
              }}
            >
              {item.state === 'done' ? '✓' : ''}
            </span>
            <span className={item.state === 'upcoming' ? 'text-[14px] text-[var(--lp-text-sub)]' : 'text-[14px] font-semibold text-[var(--lp-dark)]'}>
              {copy.progress[item.step]}
            </span>
            {item.at ? <span className="text-[12px] tabular-nums text-[var(--lp-text-sub)]">{formatDealDate(item.at, locale)}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
