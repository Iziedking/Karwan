'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/utils/cn';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export interface DocsSection {
  key: 'overview' | 'agents' | 'deals' | 'reputation' | 'bridge' | 'roadmap' | 'faq';
  href: string;
}

/// Single source of truth for the docs order. Drives the sidebar and the
/// prev/next pager at the bottom of each page. Labels and blurbs come from
/// the docsShell namespace so the order stays in sync across locales.
export const DOCS_SECTIONS: DocsSection[] = [
  { key: 'overview', href: '/docs' },
  { key: 'agents', href: '/docs/agents' },
  { key: 'deals', href: '/docs/deals' },
  { key: 'reputation', href: '/docs/reputation' },
  { key: 'bridge', href: '/docs/bridge' },
  { key: 'roadmap', href: '/docs/roadmap' },
  { key: 'faq', href: '/docs/faq' },
];

export function DocsSidebar() {
  const pathname = usePathname();
  const t = useTranslations().docsShell;
  return (
    <aside className="lg:sticky lg:top-[88px] lg:self-start">
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)] mb-4">
        [:{t.sidebar.eyebrow}:]
      </p>
      <nav className="flex flex-col gap-1">
        {DOCS_SECTIONS.map((section) => {
          const active =
            section.href === '/docs'
              ? pathname === '/docs'
              : pathname?.startsWith(section.href) === true;
          return (
            <Link
              key={section.href}
              href={section.href}
              className={cn(
                'group flex items-baseline gap-2 py-2 px-3 text-[14px] font-medium tracking-[-0.005em] transition-colors',
                active
                  ? 'bg-[var(--lp-card)] text-[var(--lp-dark)]'
                  : 'text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] hover:bg-[var(--lp-card)]/60',
              )}
              style={{
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 3,
              }}
            >
              <span
                aria-hidden
                className={cn(
                  'inline-block w-1.5 h-1.5 rounded-full transition-colors',
                  active ? 'bg-[var(--lp-accent)]' : 'bg-[var(--lp-border-light)] group-hover:bg-[var(--lp-accent)]',
                )}
              />
              {t.sidebar.sections[section.key].label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
