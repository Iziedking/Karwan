'use client';

import { usePathname, useRouter } from 'next/navigation';
import { rememberReturn, takeReturn } from '@/features/assistant/assistantReturn';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { isAssistantRoute } from '@/shared/utils/routes';
import { cn } from '@/shared/utils/cn';

/// "Use assistant" in the top bar. On, the account runs from /assistant; off,
/// it goes back to the page it was switched on from.
export function AssistantModeSwitch() {
  const t = useTranslations().assistantMode;
  const pathname = usePathname();
  const router = useRouter();
  const on = isAssistantRoute(pathname);

  function toggle() {
    if (on) {
      router.push(takeReturn());
      return;
    }
    rememberReturn(pathname);
    router.push('/assistant');
  }

  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={toggle}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border py-0 pe-1.5 ps-3 text-[14px] font-semibold text-[var(--color-ink)] transition-colors duration-[220ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] sm:gap-2.5 sm:ps-4 sm:text-[15px]',
        on ? 'border-[var(--lp-accent)] bg-[var(--offer-surface)]' : 'border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]',
      )}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="hidden sm:block">
        <path d="M4 5h16v11H9l-5 4z" />
      </svg>
      <span className="sm:hidden">{t.short}</span>
      <span className="hidden sm:inline">{on ? t.on : t.use}</span>
      <span
        aria-hidden
        className={cn(
          'relative inline-block h-6 w-10 rounded-full transition-colors duration-[220ms] motion-reduce:transition-none',
          on ? 'bg-[var(--lp-accent)]' : 'bg-[var(--color-surface-2)]',
        )}
      >
        <span
          className={cn(
            'absolute start-[3px] top-[3px] size-[18px] rounded-full transition-transform duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
            on ? 'translate-x-4 bg-[var(--accent-ink)] rtl:-translate-x-4' : 'bg-[var(--color-ink-dim)]',
          )}
        />
      </span>
    </button>
  );
}
