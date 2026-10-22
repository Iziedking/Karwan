'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOCS_SECTIONS, useDocsSectionLabel } from './DocsSidebar';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Icon } from '@/shared/components/Icon';

/// Prev/next pager at the foot of every docs page. Lets a reader (especially on
/// mobile) move to the adjacent section without scrolling back up to the
/// sidebar. Order comes from DOCS_SECTIONS so it stays in sync with the nav.
export function DocsPager() {
  const pathname = usePathname();
  const t = useTranslations().docsShell;
  const labelFor = useDocsSectionLabel();
  const idx = DOCS_SECTIONS.findIndex((s) =>
    s.href === '/docs' ? pathname === '/docs' : pathname?.startsWith(s.href) === true,
  );
  if (idx === -1) return null;

  const prev = idx > 0 ? DOCS_SECTIONS[idx - 1] : null;
  const next = idx < DOCS_SECTIONS.length - 1 ? DOCS_SECTIONS[idx + 1] : null;
  if (!prev && !next) return null;

  return (
    <nav className="mt-14 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[var(--lp-border-light)] pt-8">
      {prev ? (
        <Link
          href={prev.href}
          className="group flex flex-col gap-1 p-4 bg-[var(--lp-card)] border border-[var(--lp-border-light)] hover:border-[var(--lp-accent)] transition-colors"
          style={{ borderRadius: 12, borderBottomLeftRadius: 3 }}
        >
          <span className="text-[14px] text-[var(--ink-secondary)] inline-flex items-center gap-1 font-medium">
            <Icon name="arrow-left" size={16} directional className="transition-transform duration-200 group-hover:-translate-x-0.5" />
            {t.pager.previous}
          </span>
          <span className="font-sans text-[15px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
            {labelFor(prev.key)}
          </span>
        </Link>
      ) : (
        <span aria-hidden />
      )}
      {next && (
        <Link
          href={next.href}
          className="group flex flex-col gap-1 p-4 text-end bg-[var(--lp-card)] border border-[var(--lp-border-light)] hover:border-[var(--lp-accent)] transition-colors sm:col-start-2"
          style={{ borderRadius: 12 }}
        >
          <span className="text-[14px] text-[var(--ink-secondary)] inline-flex items-center gap-1 justify-end font-medium">
            {t.pager.next}
            <Icon name="arrow-right" size={16} directional className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
          <span className="font-sans text-[15px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
            {labelFor(next.key)}
          </span>
        </Link>
      )}
    </nav>
  );
}
