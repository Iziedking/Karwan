'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOCS_SECTIONS } from './DocsSidebar';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Prev/next pager at the foot of every docs page. Lets a reader (especially on
/// mobile) move to the adjacent section without scrolling back up to the
/// sidebar. Order comes from DOCS_SECTIONS so it stays in sync with the nav.
export function DocsPager() {
  const pathname = usePathname();
  const t = useTranslations().docsShell;
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
          <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)] inline-flex items-center gap-1">
            <span aria-hidden className="transition-transform duration-200 group-hover:-translate-x-0.5">←</span>
            {t.pager.previous}
          </span>
          <span className="font-sans text-[15px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
            {t.sidebar.sections[prev.key].label}
          </span>
        </Link>
      ) : (
        <span aria-hidden />
      )}
      {next && (
        <Link
          href={next.href}
          className="group flex flex-col gap-1 p-4 text-end bg-[var(--lp-card)] border border-[var(--lp-border-light)] hover:border-[var(--lp-accent)] transition-colors sm:col-start-2"
          style={{ borderRadius: 12, borderBottomRightRadius: 3 }}
        >
          <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)] inline-flex items-center gap-1 justify-end">
            {t.pager.next}
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </span>
          <span className="font-sans text-[15px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
            {t.sidebar.sections[next.key].label}
          </span>
        </Link>
      )}
    </nav>
  );
}
