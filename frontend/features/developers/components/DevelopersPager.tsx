'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { DEV_PAGES, devHref, devPageLabel } from '../sections';

/// The previous and next page in sidebar order, so a reader moves on without
/// going back to the menu.
export function DevelopersPager() {
  const m = useTranslations();
  const pathname = usePathname();
  const i = DEV_PAGES.findIndex((slug) => devHref(slug) === pathname);
  if (i < 0) return null;
  const prev = i > 0 ? DEV_PAGES[i - 1] : null;
  const next = i < DEV_PAGES.length - 1 ? DEV_PAGES[i + 1] : null;
  return (
    <nav aria-label={m.developers.eyebrow} className="mt-14 grid grid-cols-2 gap-3 border-t border-[var(--lp-border-light)] pt-6">
      {prev !== null ? (
        <Link href={devHref(prev)} className="flex min-h-12 items-center gap-2 rounded-[12px] px-3 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-card)]">
          <span aria-hidden className="rtl-flip">←</span>
          <span className="truncate">{devPageLabel(m, prev)}</span>
        </Link>
      ) : <span />}
      {next !== null ? (
        <Link href={devHref(next)} className="col-start-2 flex min-h-12 items-center justify-end gap-2 rounded-[12px] px-3 text-end text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-card)]">
          <span className="truncate">{devPageLabel(m, next)}</span>
          <span aria-hidden className="rtl-flip">→</span>
        </Link>
      ) : null}
    </nav>
  );
}
