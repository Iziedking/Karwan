'use client';

import Link from 'next/link';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// The roadmap as a vertical timeline: what is true now, then each target in
/// order. Shared by the docs overview and the roadmap page.
export function RoadmapTimeline({ showFullLink = true }: { showFullLink?: boolean }) {
  const t = useTranslations().docsProduct.roadmap;
  return (
    <div className="mt-8 max-w-[68ch]">
      <ol className="relative">
        {t.milestones.map((m, i) => {
          const current = i === 0;
          const last = i === t.milestones.length - 1;
          return (
            <li key={m.title} className="relative grid grid-cols-[28px_1fr] gap-x-4 pb-8 last:pb-0">
              {!last && <span aria-hidden className="absolute start-[13px] top-[22px] bottom-0 w-px bg-[var(--line)]" />}
              <span
                aria-hidden
                className={
                  current
                    ? 'relative mt-[5px] h-[14px] w-[14px] justify-self-center rounded-full bg-[var(--ink)] ring-4 ring-[var(--line)]'
                    : 'relative mt-[5px] h-[14px] w-[14px] justify-self-center rounded-full border-2 border-[var(--line-strong)] bg-[var(--canvas)]'
                }
              />
              <div>
                <p className={`text-[14px] font-semibold tabular-nums ${current ? 'text-[var(--ink)]' : 'text-[var(--ink-secondary)]'}`}>{m.when}</p>
                <h3 className="mt-1 text-[17px] font-semibold text-[var(--ink)]">{m.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--ink-secondary)]">{m.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-8 border-t border-[var(--line)] pt-6">
        <p className="text-[14px] font-semibold text-[var(--ink)]">{t.later}</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {t.laterItems.map((item) => (
            <li key={item} className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[14px] text-[var(--ink-secondary)] font-medium">
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[14px] leading-relaxed text-[var(--ink-secondary)] font-medium">{t.note}</p>
        {showFullLink && (
          <Link href="/docs/roadmap" className="mt-4 inline-flex min-h-11 items-center text-[15px] font-semibold text-[var(--ink)] underline underline-offset-4">
            {t.full}
          </Link>
        )}
      </div>
    </div>
  );
}
