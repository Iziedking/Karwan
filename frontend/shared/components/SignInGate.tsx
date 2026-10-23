'use client';
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { START_ROUTE } from '@/shared/utils/routes';

/// A signed-out visit to a private page goes straight to sign in, so the app
/// has one sign-in screen. A shared link that needs its own words first (a
/// cash-out) passes a title and gets a short card on the way.
export function SignInGate({
  title,
  body,
  buttonLabel,
}: {
  variant?: 'hero' | 'page';
  tag?: string;
  title?: ReactNode;
  body?: ReactNode;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const copy = useTranslations().auth.signInGate;
  const redirect = !title;

  useEffect(() => {
    if (redirect) router.replace(START_ROUTE);
  }, [redirect, router]);

  if (redirect) return <div data-auth-gate="redirect" className="min-h-[60vh]" aria-hidden />;

  return (
    <div data-auth-gate="card" className="mx-auto w-full max-w-[440px] px-4 py-16">
      <section className="rounded-[24px] border border-[var(--lp-border-light)] bg-[linear-gradient(115deg,var(--hero-from),var(--hero-to)_70%)] p-6 shadow-[var(--hero-shadow)]">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[var(--lp-dark)]">{title}</h1>
        {body ? <p className="mt-2 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">{body}</p> : null}
        <button
          type="button"
          onClick={() => router.push(START_ROUTE)}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--action)] px-6 text-[15px] font-semibold text-[var(--on-action)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2"
        >
          {buttonLabel ?? copy.button}
        </button>
      </section>
    </div>
  );
}
