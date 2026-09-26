'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useActivation } from '@/shared/hooks/useActivation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { dur, ease } from '@/shared/motion/tokens';
import { chooseWorkspaceNudge, workspaceNudgeDismissed } from './workspaceNudge';

const DISMISS_PREFIX = 'karwan:workspace-nudge-dismissed:';

interface NudgeCopy {
  step: string;
  title: string;
  body: string;
  cta: string;
  href: string;
}

/**
 * Shows one setup action at a time. Profile creation comes first, followed by
 * agent activation. Dismissal expires after seven days so unfinished setup
 * does not disappear forever.
 */
export function ProfileNudge() {
  const pathname = usePathname();
  const auth = useAuth();
  const translations = useTranslations();
  const profileCopy = translations.profileNudge;
  const activationCopy = translations.activation.gate;
  const address = auth.address;
  const { profile, fetchState } = useUserProfile();
  const activation = useActivation();
  const reduce = useHydratedReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const kind = chooseWorkspaceNudge({
    profileResolved: fetchState === 'success',
    hasProfile: profile != null,
    activationResolved: !activation.loading,
    activated: activation.activated,
  });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!address || !kind) {
      setDismissed(false);
      return;
    }
    try {
      const value = window.localStorage.getItem(
        `${DISMISS_PREFIX}${address.toLowerCase()}:${kind}`,
      );
      setDismissed(workspaceNudgeDismissed(value));
    } catch {
      setDismissed(false);
    }
  }, [address, kind]);

  const isApp = pathname !== '/' && pathname !== '/how-it-works';
  const onSetupRoute = pathname.startsWith('/onboarding') || pathname.startsWith('/profile');
  const visible =
    mounted &&
    isApp &&
    !onSetupRoute &&
    auth.isAuthenticated &&
    kind != null &&
    !dismissed;

  let copy: NudgeCopy | null = null;
  if (kind === 'profile') {
    copy = {
      step: profileCopy.stepOne,
      title: profileCopy.titleFragment,
      body: profileCopy.bodyFragment,
      cta: profileCopy.cta,
      href: '/start?mode=signup',
    };
  }
  if (kind === 'activation') {
    copy = {
      step: profileCopy.stepTwo,
      title: activationCopy.title,
      body: activationCopy.body,
      cta: activationCopy.cta,
      href: '/profile/agent-funds',
    };
  }

  function dismiss() {
    setDismissed(true);
    if (!address || !kind) return;
    try {
      window.localStorage.setItem(
        `${DISMISS_PREFIX}${address.toLowerCase()}:${kind}`,
        String(Date.now()),
      );
    } catch {
      // Storage may be unavailable in a private browsing context.
    }
  }

  return (
    <AnimatePresence initial={false}>
      {visible && copy ? (
        <motion.aside
          key={kind}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: reduce ? dur.micro : dur.fast, ease: ease.out }}
          className="border-b border-[var(--lp-border-light)] bg-[var(--lp-card)]"
          aria-label={copy.title}
        >
          <div className="mx-auto grid max-w-6xl grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-6 sm:px-6">
            <span className="mono row-span-2 shrink-0 text-[11px] font-semibold tracking-[0.04em] text-[var(--lp-accent-on-light)] sm:row-span-1">
                {copy.step}
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-snug text-[var(--lp-dark)]">{copy.title}</p>
              <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-[var(--lp-text-sub)]">{copy.body}</p>
            </div>
            <div className="col-start-2 flex items-center gap-2 sm:col-start-auto">
              <Link
                href={copy.href}
                className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[var(--lp-accent)] px-4 text-[14px] font-semibold text-[var(--accent-ink)] transition-colors hover:brightness-95"
              >
                {copy.cta}
                <span aria-hidden>→</span>
              </Link>
              <button
                type="button"
                onClick={dismiss}
                aria-label={profileCopy.dismissAria}
                className="inline-flex size-11 items-center justify-center rounded-[10px] text-[var(--lp-text-sub)] transition-colors hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
