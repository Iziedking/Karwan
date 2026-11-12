'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { backWithinKarwan } from '@/shared/utils/navigationHistory';
import { getProductBackHref } from '@/shared/utils/routes';
import { cn } from '@/shared/utils/cn';

export function ProductBackLink({
  pathname,
  isAuthenticated,
  className,
  shell = false,
  fallbackHref,
  onBack,
  disabled = false,
}: {
  pathname: string | null;
  isAuthenticated: boolean;
  className?: string;
  /// Where Back goes when the route itself has no parent: a view inside a
  /// top-level page, such as a list opened from the market.
  fallbackHref?: string;
  /// The page-edge copy the app frame draws. A page that draws Back on its own
  /// content column hides this one (globals.css, data-own-back).
  shell?: boolean;
  /// A step inside the page goes back to the page's previous step first.
  onBack?: () => void;
  /// While money is on its way, Back waits.
  disabled?: boolean;
}) {
  const href = getProductBackHref(pathname, isAuthenticated, DEALS_AVAILABLE) ?? fallbackHref ?? null;
  const t = useTranslations();
  const router = useRouter();

  if (!href && !onBack) return null;

  // A round chevron, no word and no arrow (owner, 12 Nov 2026, Figma 298:593);
  // screen readers hear its label.
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (onBack) {
          onBack();
          return;
        }
        if (!href) return;
        if (!backWithinKarwan(DEALS_AVAILABLE)) router.replace(href);
      }}
      aria-label={t.nav.backAria}
      data-shell-back={shell ? '' : undefined}
      data-back
      className={cn(
        'group relative z-10 inline-grid size-11 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition-colors hover:bg-[var(--raised)] active:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
    >
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" className="rtl-flip" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
    </button>
  );
}
