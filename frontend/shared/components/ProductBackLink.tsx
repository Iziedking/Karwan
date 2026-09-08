'use client';

import Link from 'next/link';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { getProductBackHref } from '@/shared/utils/routes';
import { cn } from '@/shared/utils/cn';

export function ProductBackLink({
  pathname,
  isAuthenticated,
  className,
}: {
  pathname: string | null;
  isAuthenticated: boolean;
  className?: string;
}) {
  const href = getProductBackHref(pathname, isAuthenticated);
  const t = useTranslations();

  if (!href) return null;

  return (
    <Link
      href={href}
      aria-label={t.nav.backAria}
      className={cn(
        'group relative z-10 inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-[13px] font-semibold text-[var(--lp-text-sub)] transition-colors hover:bg-[var(--lp-card)] hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
        className,
      )}
    >
      <span aria-hidden className="rtl-flip text-[18px] leading-none transition-transform duration-200 group-hover:-translate-x-0.5">←</span>
      <span>{t.nav.back}</span>
    </Link>
  );
}
