'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useGuide } from './GuideProvider';
import { WELCOME_ID, WELCOME_STEPS } from './tours';

/// Public / marketing routes where tours never run. The guide starts once the
/// user is inside the app proper, not on the landing or info pages.
function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname === '/') return true;
  return (
    pathname.startsWith('/docs') ||
    pathname.startsWith('/how-it-works') ||
    pathname.startsWith('/feedback') ||
    pathname.startsWith('/terms')
  );
}

/// Fires the first-run welcome tour once a signed-in user is on an app page
/// (it speaks in the second person about "your" deals, so it waits for auth,
/// and it never opens on the landing/marketing pages). Shows once. Mounted
/// globally in the layout.
export function GuideWelcome() {
  const auth = useAuth();
  const authed = !!auth.address;
  const pathname = usePathname();
  const { startTour, disabled, isSeen } = useGuide();
  const fired = useRef(false);

  useEffect(() => {
    if (!authed || fired.current) return;
    if (disabled || isSeen(WELCOME_ID)) return;
    // Wait until they leave the landing/marketing pages; re-checks on each
    // navigation because the layout (and this component) persist across routes.
    if (isPublicRoute(pathname)) return;
    fired.current = true;
    const t = setTimeout(() => startTour(WELCOME_ID, WELCOME_STEPS), 900);
    return () => clearTimeout(t);
  }, [authed, disabled, isSeen, startTour, pathname]);

  return null;
}
