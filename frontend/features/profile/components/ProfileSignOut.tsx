'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useDialog } from '@/shared/components/Dialog';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { confirmSignOut } from '../signOutFlow';

export function ProfileSignOut() {
  const { signOut } = useAuth();
  const dialog = useDialog();
  const router = useRouter();
  const t = useTranslations();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function requestSignOut() {
    if (pending.current) return;
    pending.current = true;
    setError(false);
    try {
      await confirmSignOut({
        confirm: () => dialog.confirm({
          title: t.profileSignOut.title,
          message: t.profileSignOut.body,
          confirmLabel: t.common.signOut,
          cancelLabel: t.common.cancel,
          compact: true,
        }),
        signOut: async () => {
          setBusy(true);
          await signOut();
        },
        leave: (destination) => router.replace(destination),
      });
    } catch {
      setError(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button type="button" onClick={requestSignOut} disabled={busy} aria-busy={busy} aria-haspopup="dialog" className="inline-flex min-h-11 items-center justify-center gap-2.5 rounded-full px-4 py-2 text-[14px] font-semibold text-[var(--color-critical)] transition-colors hover:bg-[var(--color-critical-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] disabled:cursor-wait disabled:opacity-60">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M10 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h3 M17 8l4 4-4 4 M9 12h12" />
        </svg>
        <span role={busy ? 'status' : undefined}>{busy ? t.profileSignOut.pending : t.common.signOut}</span>
      </button>
      {error && <p role="alert" className="max-w-[40ch] text-[13px] leading-relaxed text-[var(--lp-text-sub)]">{t.profileSignOut.error}</p>}
    </div>
  );
}
