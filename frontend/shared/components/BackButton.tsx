'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { isLandingRoute, dealRouteBlocked } from '@/shared/utils/routes';
import { backWithinKarwan, installNavigationTracker } from '@/shared/utils/navigationHistory';
import { markRouterReady, watchTraversals } from '@/shared/utils/earlyTraversalScript';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Mounted once at the root; all back controls share the same tab history.
/// The page the app last showed. It lives outside React on purpose: when Back
/// crashes the app right after start-up, React unmounts this tree, and the
/// watch must still see the old page and reload at the new address.
const shown = { path: '' };
const watched = new WeakSet<Window>();

export function RouteTrail() {
  const pathname = usePathname();
  useEffect(() => { shown.path = pathname; }, [pathname]);
  useEffect(() => {
    markRouterReady(window);
    if (!watched.has(window)) {
      watched.add(window);
      watchTraversals(window, () => shown.path);
    }
    return installNavigationTracker(window);
  }, []);
  return null;
}

export function BackButton({
  tone = 'dark',
  showOnPublic = false,
  fallbackHref = '/app',
}: {
  tone?: 'dark' | 'light' | 'adaptive';
  showOnPublic?: boolean;
  fallbackHref?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();

  // Home is the root and landing renders its own chrome, so no back control on
  // either. Everywhere else the button shows.
  if ((isLandingRoute(pathname) && !showOnPublic) || pathname === '/app') return null;

  function goBack() {
    if (!backWithinKarwan(DEALS_AVAILABLE)) router.replace(dealRouteBlocked(fallbackHref.split(/[?#]/)[0],DEALS_AVAILABLE) ? '/' : fallbackHref);
  }

  // The lane matches the page's first band: dark on the dark heroes (most
  // pages), light on the doc-style / financier surfaces. Style the button for
  // whichever it sits on so it never washes out.
  const toneCls =
    tone === 'adaptive'
      ? ' text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]'
      : tone === 'light'
      ? ' text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] hover:bg-black/[0.04]'
      : ' text-white/70 hover:text-white hover:bg-white/5';

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={t.nav.backAria}
      className={`group inline-flex min-h-11 items-center gap-2 rounded-full px-2 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] ${toneCls}`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M9.5 3.5 5 8l4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-200 group-hover:-translate-x-0.5"
        />
      </svg>
      <span className="text-[14px] font-semibold tracking-[-0.005em]">
        {t.nav.back}
      </span>
    </button>
  );
}
