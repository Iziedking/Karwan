'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isLandingRoute, isPublicEditorialRoute, previousRoute } from '@/shared/utils/routes';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// A back control in the top nav. It returns the user to the route they actually
/// came FROM, not to a fixed home.
///
/// The previous version trailed the last route in component refs. Those reset on
/// any hard load, so a page reached by refresh or by a direct link (the assistant
/// links to /bridge, for one) had no remembered previous route and every "back"
/// dumped the user on /app. We keep an in-app route stack in sessionStorage
/// instead: it survives reloads within the tab, so back goes where they came from
/// no matter how they arrived.
const STACK_KEY = 'karwan.nav.stack';

function readStack(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(STACK_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]): void {
  try {
    window.sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-20)));
  } catch {
    /* private mode / quota — degrade to home-only back */
  }
}

/// Records every in-app route as it is entered, mounted once at the root so a
/// page without its own back control still counts as where the user came from.
/// The marketing site never enters the stack, so back can never hand the user
/// to it. Public discovery pages (market, passports, statements) do: a person
/// who opened a statement from a passport goes back to that passport.
/// A repeated path is not pushed twice.
export function RouteTrail() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || isPublicEditorialRoute(pathname)) return;
    const stack = readStack();
    if (stack.length && stack[stack.length - 1].toLowerCase() === pathname.toLowerCase()) return;
    writeStack([...stack, pathname]);
  }, [pathname]);
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
    const target = previousRoute(readStack(), pathname ?? '');
    if (target) {
      writeStack(target.rest); // pop past the target so the next back steps again
      router.push(target.route);
    } else {
      writeStack([]);
      router.push(fallbackHref);
    }
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
