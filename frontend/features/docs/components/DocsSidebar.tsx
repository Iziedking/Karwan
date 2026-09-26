'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/utils/cn';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export interface DocsSection {
  key: 'overview' | 'agents' | 'deals' | 'disputes' | 'escrow' | 'reputation' | 'bridge' | 'roadmap' | 'faq';
  href: string;
}

/// Single source of truth for the docs order. Drives the sidebar and the
/// prev/next pager at the bottom of each page. Labels and blurbs come from
/// the docsShell namespace so the order stays in sync across locales.
export const DOCS_SECTIONS: DocsSection[] = [
  { key: 'overview', href: '/docs' },
  { key: 'agents', href: '/docs/agents' },
  { key: 'deals', href: '/docs/deals' },
  { key: 'disputes', href: '/docs/disputes' },
  { key: 'escrow', href: '/docs/escrow' },
  { key: 'reputation', href: '/docs/reputation' },
  { key: 'bridge', href: '/docs/bridge' },
  { key: 'roadmap', href: '/docs/roadmap' },
  { key: 'faq', href: '/docs/faq' },
];

/// The escrow page keeps its copy in its own message module, so its label
/// comes from there rather than the shared docsShell section list.
export function useDocsSectionLabel() {
  const m = useTranslations();
  return (key: DocsSection['key']) =>
    key === 'escrow' ? m.docsEscrowPage.nav.label : m.docsShell.sidebar.sections[key].label;
}

export function DocsSidebar() {
  const pathname = usePathname();
  const t = useTranslations().docsShell;
  const labelFor = useDocsSectionLabel();
  return (
    <aside className="lg:sticky lg:top-[88px] lg:self-start">
      <p className="mono mb-4 hidden text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)] lg:block">
        {t.sidebar.eyebrow}
      </p>
      <nav
        aria-label={t.sidebar.eyebrow}
        className="-mx-[clamp(20px,5vw,72px)] flex gap-2 overflow-x-auto px-[clamp(20px,5vw,72px)] pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden"
      >
        {DOCS_SECTIONS.map((section) => {
          const active =
            section.href === '/docs'
              ? pathname === '/docs'
              : pathname?.startsWith(section.href) === true;
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? 'page' : undefined}
              ref={
                active
                  ? (el) => {
                      const row = el?.parentElement;
                      if (el && row && row.scrollWidth > row.clientWidth) {
                        row.scrollLeft = el.offsetLeft - row.clientWidth / 2 + el.clientWidth / 2;
                      }
                    }
                  : undefined
              }
              className={cn(
                'group flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border px-3 py-2 text-[14px] font-medium tracking-[-0.005em] transition-colors lg:border-transparent',
                active
                  ? 'border-[var(--lp-outline-strong)] bg-[var(--lp-card)] text-[var(--lp-dark)]'
                  : 'border-[var(--lp-border-light)] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] hover:bg-[var(--lp-card)]/60',
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
              {labelFor(section.key)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
