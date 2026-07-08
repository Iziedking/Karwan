'use client';
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isLandingRoute } from '@/shared/utils/routes';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// A back control that lives in the top nav, left of the rail. It is deliberately
/// history-aware: the app home (/app) is the root, so it never renders there, and
/// launching the app from the landing page puts landing directly behind home —
/// we never hand the user back onto the marketing site. Everywhere else it goes
/// back one step (router.back) when there is a real in-app previous route, and
/// falls back to home on a cold load / refresh where the in-app history was lost.
export function BackButton({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();

  // The nav is mounted once in the root layout and survives soft navigations, so
  // these refs persist across route changes. `prevRef` trails one step behind the
  // current route, which is exactly what router.back() targets.
  const prevRef = useRef<string | null>(null);
  const lastRef = useRef<string | null>(null);
  useEffect(() => {
    prevRef.current = lastRef.current;
    lastRef.current = pathname;
  }, [pathname]);

  // Home is the root and landing renders its own chrome, so no back control on
  // either. Everywhere else the button shows.
  if (isLandingRoute(pathname) || pathname === '/app') return null;

  function goBack() {
    const prev = prevRef.current;
    // A real in-app previous route (not landing) → step back. Otherwise land on
    // home: this covers a cold load / refresh (history lost) and the launch-from-
    // landing case, so the button never returns the user to the marketing site.
    if (prev && !isLandingRoute(prev)) router.back();
    else router.push('/app');
  }

  // The lane matches the page's first band: dark on the dark heroes (most
  // pages), light on the doc-style / financier surfaces. Style the button for
  // whichever it sits on so it never washes out.
  const toneCls =
    tone === 'light'
      ? 'border-black/15 text-[var(--lp-dark)]/70 hover:text-[var(--lp-dark)] hover:border-black/40 hover:bg-black/[0.04]'
      : 'border-white/20 text-white/70 hover:text-white hover:border-white/40 hover:bg-white/5';

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={t.nav.backAria}
      title={t.nav.backAria}
      className={`group inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-md border transition-colors shrink-0 ${toneCls}`}
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
      <span className="text-[13px] font-semibold tracking-[-0.005em]">
        {t.nav.back}
      </span>
    </button>
  );
}
