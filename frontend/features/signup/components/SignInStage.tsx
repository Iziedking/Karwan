'use client';

import type { ReactNode } from 'react';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { signInContext } from '@/shared/auth/signInContext';
import { FlowLines } from '@/shared/components/FlowLines';
import { Icon } from '@/shared/components/Icon';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// The sign-in and waitlist page: the card in the middle of a framed stage,
/// with the flow lines meeting behind it and what signing in can and cannot
/// do underneath. Phone and desktop share it; only the frame inset changes.
export function SignInStage({ children, next = null }: { children: ReactNode; next?: string | null }) {
  const { signIn: t, welcome } = useTranslations().signup;
  const context = signInContext(next);
  const paymentNote = context === 'direct' ? t.trustDirectPayment : context === 'deal' ? t.trustEscrow : null;
  return (
    <div className="w-full bg-[var(--canvas)] p-0 sm:p-3">
      <div className="relative isolate flex min-h-[calc(100svh-var(--lp-nav-h,72px))] flex-col items-center overflow-hidden bg-[var(--canvas)] px-4 sm:min-h-[calc(100svh-var(--lp-nav-h,72px)-24px)] sm:rounded-[24px] sm:border sm:border-[var(--line)]">
        <FlowLines focusY={0.46} />
        <div className="relative z-[1] my-auto w-full max-w-[400px] py-8 sm:py-12">
          {DEALS_AVAILABLE ? (
            <p data-demo-note className="mb-3 flex items-center gap-2.5 rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[14px] font-medium leading-[1.4] text-[var(--ink-secondary)]">
              <Icon name="info" size={20} />
              {welcome.demoNote}
            </p>
          ) : null}
          {children}
        </div>
        <ul className="relative z-[1] flex flex-col items-center gap-2 pb-6 text-[13px] font-semibold text-[var(--ink-secondary)] sm:flex-row sm:gap-6 sm:pb-7">
          <li className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent-on-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="10" width="14" height="10" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></svg>
            {t.trustNoMoney}
          </li>
          {paymentNote ? <li className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--lp-accent-on-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" /><path d="m9 12 2 2 4-4" /></svg>
            {paymentNote}
          </li> : null}
        </ul>
      </div>
    </div>
  );
}
