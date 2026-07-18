'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTerms } from '@/shared/hooks/useTerms';
import { useGuide } from './GuideProvider';
import { WELCOME_ID, WELCOME_STEPS } from './tours';
import { isNoTourRoute } from './routes';

/// Fires the first-run welcome tour once a signed-in user is on an app page
/// (it speaks in the second person about "your" deals, so it waits for auth,
/// and it never opens on the landing/marketing pages). Shows once. Mounted
/// globally in the layout.
export function GuideWelcome() {
  const auth = useAuth();
  const authed = !!auth.address;
  const terms = useTerms();
  const pathname = usePathname();
  const { startTour, disabled, isSeen } = useGuide();
  const fired = useRef(false);

  useEffect(() => {
    if (!authed || fired.current) return;
    if (disabled || isSeen(WELCOME_ID)) return;
    // Terms come first: never start the welcome tour while a signed-in user still
    // owes acceptance, or the tour paints under/over the Terms gate. It fires once
    // terms is accepted (needsAcceptance clears and this effect re-runs).
    if (terms.needsAcceptance) return;
    // Wait until they leave the landing/marketing pages; re-checks on each
    // navigation because the layout (and this component) persist across routes.
    if (isNoTourRoute(pathname)) return;
    fired.current = true;
    const t = setTimeout(() => startTour(WELCOME_ID, WELCOME_STEPS), 900);
    return () => clearTimeout(t);
  }, [authed, disabled, isSeen, startTour, pathname, terms.needsAcceptance]);

  return null;
}
