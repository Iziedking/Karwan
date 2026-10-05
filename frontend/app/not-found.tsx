'use client';

import Link from 'next/link';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export default function NotFound() {
  const copy = useTranslations().pageNotFound;
  return (
    <main className="product-surface mx-auto flex min-h-[60vh] w-full max-w-[560px] flex-col justify-center px-4 py-16 sm:px-6">
      <p className="text-[14px] font-semibold tabular-nums text-[var(--lp-text-sub)]">404</p>
      <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--lp-dark)]">{copy.title}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">{copy.body}</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          href="/app"
          className="inline-flex min-h-11 items-center rounded-full bg-[var(--accent)] px-5 text-[14px] font-semibold text-[var(--accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        >
          {copy.home}
        </Link>
        <Link
          href="/docs"
          className="inline-flex min-h-11 items-center rounded-full border border-[var(--lp-border-light)] px-5 text-[14px] font-semibold text-[var(--lp-dark)] hover:border-[var(--lp-outline-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        >
          {copy.help}
        </Link>
      </div>
    </main>
  );
}
