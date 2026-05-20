'use client';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { useGuide } from './GuideProvider';
import { WELCOME_ID, WELCOME_STEPS } from './tours';

/// Fires the first-run welcome tour once a user is signed in (it speaks in the
/// second person about "your" deals, so it waits for auth). Shows once, then
/// never again unless tips are re-enabled. Mounted globally in the layout.
export function GuideWelcome() {
  const auth = useAuth();
  const authed = !!auth.address;
  const { startTour, disabled, isSeen } = useGuide();
  const fired = useRef(false);

  useEffect(() => {
    if (!authed || fired.current) return;
    if (disabled || isSeen(WELCOME_ID)) return;
    fired.current = true;
    const t = setTimeout(() => startTour(WELCOME_ID, WELCOME_STEPS), 900);
    return () => clearTimeout(t);
  }, [authed, disabled, isSeen, startTour]);

  return null;
}
