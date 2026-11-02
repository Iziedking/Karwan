'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, buttonClasses } from '@/shared/components/Button';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import {
  dealRouteRecoveryKey,
  shouldAutomaticallyReloadDeal,
} from '@/features/deals/dealRouteRecovery';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { reportRouteError } from '@/shared/observability/reportRouteError';

export default function DealError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const [showFallback, setShowFallback] = useState(false);
  const copy = useTranslations();
  const es = copy.directDealDetail.errorStates;

  useEffect(() => {
    // Keep the original trace available in the browser console without
    // exposing provider, wallet, or deal payload details to the user.
    console.error('[/deals/[id]] route error', error);
    reportRouteError(error, 'deal');
    const recoveryKey = dealRouteRecoveryKey(window.location.pathname);
    let previousAttempt: string | null = null;
    try {
      previousAttempt = window.sessionStorage.getItem(recoveryKey);
    } catch {
      // Continue to the fallback if storage is unavailable. Reloading without
      // a durable guard could trap the user in a loop.
      setShowFallback(true);
      return;
    }

    const now = Date.now();
    if (!shouldAutomaticallyReloadDeal(previousAttempt, now)) {
      setShowFallback(true);
      return;
    }

    try {
      window.sessionStorage.setItem(recoveryKey, String(now));
    } catch {
      // Reads can succeed even when storage is full or writes are blocked.
      // Do not reload unless the loop guard was persisted.
      setShowFallback(true);
      return;
    }
    window.location.reload();
  }, [error]);

  const retry = () => {
    const recoveryKey = dealRouteRecoveryKey(window.location.pathname);
    try {
      window.sessionStorage.setItem(recoveryKey, String(Date.now()));
    } catch {
      // A user-triggered reload is safe even when storage is unavailable.
    }
    window.location.reload();
  };

  if (!showFallback) {
    return (
      <div role="status" aria-live="polite" className="product-surface mx-auto min-h-[44vh] w-full max-w-[640px] space-y-4 py-10">
        <span className="sr-only">{es.transientRetrying}</span>
        <div className="h-3 w-28 rounded bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
        <div className="h-10 w-64 max-w-full rounded bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
      </div>
    );
  }

  return (
    <section aria-labelledby="deal-recovery-title" className="product-surface mx-auto w-full max-w-[640px] py-6 sm:py-10">
      <p className="text-[14px] font-medium text-[var(--ink-secondary)]">{es.transientEyebrow}</p>
      <h1 id="deal-recovery-title" className="mt-3 text-[24px] font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)]">{es.transientTitle}</h1>
      <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-[var(--ink-secondary)]">{es.crashBody}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="button" onClick={retry} className="rounded-full">{es.transientCta}</Button>
        <Link href={DEALS_AVAILABLE ? '/deals' : '/account'} className={buttonClasses({variant:'outline',className:'rounded-full'})}>
          {DEALS_AVAILABLE ? es.notFoundCta : copy.nav.home}
        </Link>
      </div>
    </section>
  );
}
