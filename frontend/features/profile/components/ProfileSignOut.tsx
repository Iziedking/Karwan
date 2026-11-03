'use client';

import { buttonClasses } from '@/shared/components/Button';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useSignOutRequest } from '../useSignOutRequest';

export function ProfileSignOut() {
  const t = useTranslations();
  const { request: requestSignOut, busy, error } = useSignOutRequest();

  return (
    <div className="space-y-2">
      <button type="button" onClick={requestSignOut} disabled={busy} aria-busy={busy} aria-haspopup="dialog" className={`w-full ${buttonClasses({ variant: 'secondary', size: 'lg' })}`}>
        <span role={busy ? 'status' : undefined}>{busy ? t.profileSignOut.pending : t.common.signOut}</span>
      </button>
      {error && <p role="alert" className="text-[14px] leading-relaxed text-[var(--ink-secondary)]">{t.profileSignOut.error}</p>}
    </div>
  );
}
