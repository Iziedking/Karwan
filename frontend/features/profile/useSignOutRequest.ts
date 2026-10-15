'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useDialog } from '@/shared/components/Dialog';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { confirmSignOut } from './signOutFlow';

/// Sign out the same way from anywhere: ask first, then end the session and
/// leave for the signed-out page. A second press while one is open is ignored.
export function useSignOutRequest() {
  const { signOut } = useAuth();
  const dialog = useDialog();
  const router = useRouter();
  const t = useTranslations();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function request() {
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

  return { request, busy, error };
}
