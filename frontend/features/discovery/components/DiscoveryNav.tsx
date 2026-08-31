'use client';

import Link from 'next/link';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';

export function DiscoveryNav({
  active,
  tone = 'dark',
}: {
  active: 'market' | 'partners';
  tone?: 'dark' | 'light';
}) {
  const copy = useTranslations().discovery;
  const dark = tone === 'dark';
  const items = [
    { key: 'market' as const, href: '/market', label: copy.requestsAndOffers },
    { key: 'partners' as const, href: '/partners', label: copy.businesses },
  ];

  return (
    <nav aria-label={copy.navLabel} className="mt-8 flex max-w-xl gap-1 border-b border-current/15">
      {items.map((item) => {
        const current = active === item.key;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'relative inline-flex min-h-11 items-center px-3 mono text-[11px] font-semibold uppercase tracking-[0.1em]',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]',
              current
                ? dark
                  ? 'text-[var(--lp-workspace-ink)]'
                  : 'text-[var(--lp-dark)]'
                : dark
                  ? 'text-[var(--lp-workspace-muted)] hover:text-[var(--lp-workspace-ink)]'
                  : 'text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)]',
            )}
          >
            {item.label}
            {current ? (
              <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 bg-[var(--lp-accent)]" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
