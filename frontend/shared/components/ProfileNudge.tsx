'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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
  const reduce = useReducedMotion();
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
      step: '[:STEP 01/02]',
      title: profileCopy.titleFragment,
      body: profileCopy.bodyFragment,
      cta: profileCopy.cta,
      href: '/onboarding',
    };
  }
  if (kind === 'activation') {
    copy = {
      step: '[:STEP 02/02]',
      title: activationCopy.title,
      body: activationCopy.body,
      cta: activationCopy.cta,
      href: '/profile#agents',
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
          className="border-b border-[var(--color-line)] bg-[var(--color-surface-2)]"
          aria-label={copy.title}
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
              <span className="mono shrink-0 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)] sm:pt-0">
                {copy.step}
              </span>
              <p className="min-w-0 text-[12.5px] leading-snug text-[var(--color-ink-dim)]">
                <span className="font-semibold text-[var(--color-ink)]">{copy.title}</span>{' '}
                {copy.body}
              </p>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Link
                href={copy.href}
                className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[var(--color-ink)] px-4 mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-surface)] transition-[transform,background-color] duration-[var(--dur-fast)] hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
              >
                {copy.cta}
                <span aria-hidden>→</span>
              </Link>
              <button
                type="button"
                onClick={dismiss}
                aria-label={profileCopy.dismissAria}
                className="inline-flex size-11 items-center justify-center rounded-[10px] text-[var(--color-ink-faint)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
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
