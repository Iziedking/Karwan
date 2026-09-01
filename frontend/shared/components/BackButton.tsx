'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isLandingRoute } from '@/shared/utils/routes';
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

  // Record each in-app route as it is entered. Landing routes never enter the
  // stack, so back can never hand the user to the marketing site, and a repeated
  // path (re-render on the same route) is not pushed twice.
  useEffect(() => {
    if (isLandingRoute(pathname)) return;
    const stack = readStack();
    if (stack[stack.length - 1] === pathname) return;
    writeStack([...stack, pathname]);
  }, [pathname]);

  // Home is the root and landing renders its own chrome, so no back control on
  // either. Everywhere else the button shows.
  if ((isLandingRoute(pathname) && !showOnPublic) || pathname === '/app') return null;

  function goBack() {
    const stack = readStack();
    // Drop the current route, then walk back past any repeats of it to the last
    // genuinely different in-app route.
    let i = stack.length - 1;
    while (i >= 0 && stack[i] === pathname) i--;
    const target = i >= 0 ? stack[i] : null;
    if (target && !isLandingRoute(target)) {
      writeStack(stack.slice(0, i)); // pop past the target so the next back steps again
      router.push(target);
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
      ? 'border-[var(--color-line-strong)] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:border-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)]'
      : tone === 'light'
      ? 'border-[var(--lp-outline)] text-[var(--lp-dark)]/70 hover:text-[var(--lp-dark)] hover:border-[var(--lp-outline-hover)] hover:bg-black/[0.04]'
      : 'border-white/20 text-white/70 hover:text-white hover:border-white/40 hover:bg-white/5';

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={t.nav.backAria}
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
