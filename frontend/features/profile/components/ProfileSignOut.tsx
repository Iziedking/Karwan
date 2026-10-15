'use client';

import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useSignOutRequest } from '../useSignOutRequest';

export function ProfileSignOut() {
  const t = useTranslations();
  const { request: requestSignOut, busy, error } = useSignOutRequest();

  return (
    <div className="flex flex-col items-end gap-2">
      <button type="button" onClick={requestSignOut} disabled={busy} aria-busy={busy} aria-haspopup="dialog" className="inline-flex min-h-11 items-center justify-center gap-2.5 rounded-full px-4 py-2 text-[14px] font-semibold text-[var(--color-critical)] transition-colors hover:bg-[var(--color-critical-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] disabled:cursor-wait disabled:opacity-60">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M10 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h3 M17 8l4 4-4 4 M9 12h12" />
        </svg>
        <span role={busy ? 'status' : undefined}>{busy ? t.profileSignOut.pending : t.common.signOut}</span>
      </button>
      {error && <p role="alert" className="max-w-[40ch] text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">{t.profileSignOut.error}</p>}
    </div>
  );
}
