'use client';
import { useEffect } from 'react';
import { reportRouteError } from '@/shared/observability/reportRouteError';
import { buttonClasses } from '@/shared/components/Button';

/// Any page outside /app and the deal page. A throw here used to blank the tab
/// to the browser's "Application error" with nothing reported.
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[root] route error', error);
    reportRouteError(error, 'root');
  }, [error]);

  return (
    <main className="product-surface mx-auto flex min-h-[70vh] max-w-[480px] flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--ink)]">This page stopped</h1>
      <p className="text-[15px] leading-relaxed text-[var(--ink-secondary)]">Your account and money are safe. Try again, and if it happens again, go to Home.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={reset} className={buttonClasses({ size: 'lg' })}>Try again</button>
        <a href="/app" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>Home</a>
      </div>
    </main>
  );
}
