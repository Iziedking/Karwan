'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { useActivation } from '@/shared/hooks/useActivation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Button } from './Button';
import { Skeleton, SkeletonText } from './Skeleton';

/// Wraps a flow that needs the agents. Karwan sets them up at sign-up (view 38);
/// an account made before that, or one whose setup failed, gets them here on
/// its own, with no step to take. Only a failure asks for a tap: Try again.
/// When the wallet is not connected, children render as is so the inner flow
/// can show its own connect prompt.
export function ActivationGate({ children }: { children: ReactNode }) {
  const { isConnected, activated, loading, activating, error, activate } = useActivation();
  const t = useTranslations().activation.gate;
  const tried = useRef(false);

  useEffect(() => {
    if (!isConnected || activated || loading || activating || tried.current) return;
    tried.current = true;
    void activate().catch(() => {});
  }, [isConnected, activated, loading, activating, activate]);

  if (!isConnected || activated) return <>{children}</>;

  if (error && !activating) {
    return (
      <div role="alert" className="rounded-[20px] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <p className="text-[15px] font-medium text-[var(--color-ink)]">{t.failed}</p>
        <Button type="button" onClick={() => void activate().catch(() => {})} className="mt-4">{t.retry}</Button>
      </div>
    );
  }

  return (
    <div role="status" aria-busy className="rounded-[20px] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <span className="sr-only">{t.loading}</span>
      <Skeleton className="h-3 w-28" />
      <SkeletonText lines={2} className="mt-4 max-w-lg" />
    </div>
  );
}
