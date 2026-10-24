'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { DEV_GROUPS, devHref, devPageLabel, searchDevPages, type DevGroupKey } from '../sections';

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn('shrink-0 transition-transform duration-200', open ? 'rotate-180' : '')}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/// Search on top, then each group with its pages, open by default and
/// collapsible. On a phone the whole list sits behind one Menu button that names
/// the page you are on.
export function DevelopersSidebar() {
  const m = useTranslations();
  const t = m.developers.nav;
  const pathname = usePathname() ?? '/developers';
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Partial<Record<DevGroupKey, boolean>>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);

  const matches = new Set(searchDevPages(m, query));
  const searching = query.trim().length > 0;
  const current = DEV_GROUPS.flatMap((g) => g.pages).find((slug) => devHref(slug) === pathname) ?? '';

  const list = (
    <div className="flex flex-col">
      <label className="relative block">
        <span className="sr-only">{t.search}</span>
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--lp-text-sub)]">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search}
          className="min-h-12 w-full rounded-[12px] border border-transparent bg-[var(--lp-card)] ps-11 pe-3 text-[15px] text-[var(--lp-dark)] placeholder:text-[var(--lp-text-sub)] focus-visible:border-[var(--lp-outline-strong)] focus-visible:outline-none"
        />
      </label>
      <nav aria-label={m.developers.eyebrow} className="mt-4 flex flex-col gap-1">
        {DEV_GROUPS.map((group) => {
          const pages = group.pages.filter((slug) => matches.has(slug));
          if (pages.length === 0) return null;
          const open = searching || !closed[group.key];
          return (
            <div key={group.key} className="py-1">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setClosed((c) => ({ ...c, [group.key]: open }))}
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[10px] px-3 text-start text-[14px] font-semibold text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                {t.groups[group.key]}
                <Chevron open={open} />
              </button>
              {open ? (
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {pages.map((slug) => {
                    const active = devHref(slug) === pathname;
                    return (
                      <li key={slug || 'overview'}>
                        <Link
                          href={devHref(slug)}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex min-h-11 items-center rounded-[10px] px-3 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                            active ? 'bg-[var(--lp-card)] font-semibold text-[var(--lp-dark)]' : 'text-[var(--lp-dark)] hover:bg-[var(--lp-card)]/70',
                          )}
                        >
                          {devPageLabel(m, slug)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}
        {matches.size === 0 ? <p className="px-3 py-2 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.noResults}</p> : null}
      </nav>
    </div>
  );

  return (
    <aside className="lg:sticky lg:top-[88px] lg:max-h-[calc(100svh-112px)] lg:self-start lg:overflow-y-auto lg:border-e lg:border-[var(--lp-border-light)] lg:pe-6" data-own-scroll>
      <div className="lg:hidden">
        <button
          type="button"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[12px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-4 text-start text-[15px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <span className="min-w-0 truncate">
            <span className="text-[var(--lp-text-sub)]">{t.menu}</span> · {devPageLabel(m, current)}
          </span>
          <Chevron open={menuOpen} />
        </button>
        {menuOpen ? <div className="mt-3 rounded-[14px] border border-[var(--lp-border-light)] p-3">{list}</div> : null}
      </div>
      <div className="hidden lg:block">{list}</div>
    </aside>
  );
}
