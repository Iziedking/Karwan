'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { OpenDealRow } from '@/features/notifications/components/OpenDealRow';
import { Button, buttonClasses } from '@/shared/components/Button';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { useDealRows } from './useDealRows';

const PAGE = 10;

export function DealsPage() {
  const { t: messages } = useLocale();
  const t = messages.dealsPage;
  const p = messages.pending;
  const { groups, failed, loaded, refresh } = useDealRows();
  const [finishedShown, setFinishedShown] = useState(PAGE);
  const total = groups.needsYou.length + groups.active.length + groups.finished.length;

  return (
    <div>
      <header className="pt-2 pb-5 sm:pt-3">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)]">{t.title}</h1>
      </header>

      {total > 0 ? (
        <nav aria-label={t.title} className="mb-6 grid grid-cols-3 gap-1 rounded-[var(--radius-input)] border border-[var(--line)] bg-[var(--surface)] p-1">
          {([['needsYou', t.needsYou, groups.needsYou.length], ['active', t.active, groups.active.length], ['finished', t.finished, groups.finished.length]] as const).map(([id, label, count]) => (
            <a
              key={id}
              href={`#deals-${id}`}
              aria-disabled={count === 0 || undefined}
              className={cn(
                'flex min-h-11 items-center justify-center truncate rounded-[10px] px-2 text-[13px] font-medium transition-colors duration-[var(--dur-fade)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]',
                count === 0 ? 'pointer-events-none text-[var(--ink-muted)]' : 'text-[var(--ink)] hover:bg-[var(--raised)]',
              )}
            >
              {label} · {count}
            </a>
          ))}
        </nav>
      ) : null}

      {failed && total === 0 ? (
        <div className="flex items-center justify-between gap-4 py-4">
          <p role="status" className="text-[14px] font-medium text-[var(--lp-text-sub)]">{p.matches.loadError}</p>
          <Button type="button" variant="outline" onClick={refresh}>{p.matches.retry}</Button>
        </div>
      ) : null}

      {!failed && loaded && total === 0 ? (
        <div className="py-10">
          <p className="text-[15px] font-medium text-[var(--lp-text-sub)]">{t.empty}</p>
          <Link href="/market" className={cn(buttonClasses({ variant: 'primary' }), 'mt-4')}>{t.emptyCta}</Link>
        </div>
      ) : null}

      <Section id="needsYou" title={t.needsYou} count={groups.needsYou.length}>
        {groups.needsYou.map((r) => <OpenDealRow key={r.key} {...r.row} yourMove />)}
      </Section>
      <Section id="active" title={t.active} count={groups.active.length}>
        {groups.active.map((r) => <OpenDealRow key={r.key} {...r.row} yourMove={false} />)}
      </Section>
      <Section
        id="finished"
        title={t.finished}
        count={groups.finished.length}
        more={groups.finished.length > finishedShown ? (
          <button
            type="button"
            onClick={() => setFinishedShown((n) => n + PAGE)}
            className={cn(buttonClasses({ variant: 'outline', size: 'sm' }), 'mt-3')}
          >
            {t.showMore}
          </button>
        ) : null}
      >
        {groups.finished.slice(0, finishedShown).map((r) => <OpenDealRow key={r.key} {...r.row} yourMove={false} />)}
      </Section>

      {total > 0 ? (
        <p className="mt-8 border-t border-[var(--line)] pt-4">
          <Link
            href="/activity"
            className="inline-flex min-h-11 items-center text-[14px] font-medium text-[var(--ink-secondary)] underline-offset-4 hover:text-[var(--ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
          >
            {t.allActivity}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function Section({
  id,
  title,
  count,
  more,
  children,
}: {
  id: string;
  title: string;
  count: number;
  more?: ReactNode;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section id={`deals-${id}`} aria-label={title} className="mt-8 scroll-mt-24 first-of-type:mt-0">
      <h2 className="flex items-baseline justify-between gap-2 pb-3 text-[17px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
        {title}
        <span className="text-[13px] font-medium tabular-nums text-[var(--ink-muted)]">{count}</span>
      </h2>
      <ul className="space-y-3">
        {children}
      </ul>
      {more}
    </section>
  );
}
