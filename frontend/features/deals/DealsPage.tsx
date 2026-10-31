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
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)]">{t.title}</h1>
      </header>

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

      <Section title={t.needsYou} count={groups.needsYou.length} highlight>
        {groups.needsYou.map((r) => <OpenDealRow key={r.key} {...r.row} yourMove />)}
      </Section>
      <Section title={t.active} count={groups.active.length}>
        {groups.active.map((r) => <OpenDealRow key={r.key} {...r.row} yourMove={false} />)}
      </Section>
      <Section
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
        <p className="mt-8 border-t border-[var(--lp-border-light)] pt-4">
          <Link
            href="/activity"
            className="inline-flex min-h-11 items-center text-[14px] font-medium text-[var(--lp-text-sub)] underline-offset-4 hover:text-[var(--lp-dark)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            {t.allActivity}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function Section({
  title,
  count,
  highlight = false,
  more,
  children,
}: {
  title: string;
  count: number;
  highlight?: boolean;
  more?: ReactNode;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section aria-label={title} className="mt-6 first-of-type:mt-0">
      <h2 className="flex items-baseline gap-2 pb-1 text-[15px] font-semibold text-[var(--lp-dark)]">
        {title}
        <span className="text-[14px] font-medium tabular-nums text-[var(--lp-text-muted)]">{count}</span>
      </h2>
      <ul
        className={cn(
          'divide-y divide-[var(--lp-border-light)]',
          highlight && 'rounded-[14px] border border-[var(--lp-accent)] px-4',
        )}
      >
        {children}
      </ul>
      {more}
    </section>
  );
}
