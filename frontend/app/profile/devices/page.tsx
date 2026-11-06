'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type SignedInDevice } from '@/core/api';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { useDialog } from '@/shared/components/Dialog';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { relativeTime } from '@/shared/utils/format';
import { ProfileFrame } from '@/features/profile/ui/ProfileUi';
import { useSignOutRequest } from '@/features/profile/useSignOutRequest';

/// Where this account is signed in (view 65), with Sign out on each device and
/// Sign out everywhere. Signing out this device is the usual sign-out.
export default function SignedInDevicesPage() {
  const t = useTranslations();
  const copy = t.profile.hub.devicesPage;
  const { locale } = useLocale();
  const { signOut } = useAuth();
  const router = useRouter();
  const dialog = useDialog();
  const thisDevice = useSignOutRequest();
  const [devices, setDevices] = useState<SignedInDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .mySessions()
      .then((r) => {
        setDevices(r.sessions);
        setError(null);
      })
      .catch(() => setError(copy.loadError));
  }, [copy.loadError]);
  useEffect(load, [load]);

  async function signOutOne(d: SignedInDevice) {
    if (d.current) return thisDevice.request();
    setBusy(d.id);
    try {
      await api.closeSession(d.id);
      load();
    } catch {
      setError(copy.actionError);
    } finally {
      setBusy(null);
    }
  }

  async function signOutEverywhere() {
    const ok = await dialog.confirm({ title: copy.signOutEverywhere, message: copy.everywhereBody, confirmLabel: copy.signOutEverywhere, cancelLabel: t.common.cancel, danger: true });
    if (!ok) return;
    setBusy('all');
    try {
      await api.closeAllSessions();
      await signOut().catch(() => undefined);
      router.replace('/');
    } catch {
      setError(copy.actionError);
      setBusy(null);
    }
  }

  return (
    <AuthGuard gateTag={t.profile.signInGate.tag} gateBody={t.profile.signInGate.body}>
      <ProfileFrame title={copy.title} backHref="/profile">
        <p className="text-[15px] leading-relaxed text-[var(--ink-secondary)]">{copy.intro}</p>
        {error && <p role="alert" className="text-[14px] text-[var(--ink-secondary)]">{error}</p>}
        <ul data-devices className={`${CARD_CLASS} divide-y divide-[var(--line)] px-5`}>
          {devices?.map((d) => (
            <li key={d.id} className="flex min-h-16 items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-[var(--ink)]">{d.via === 'open_link' ? copy.chatLink : d.device}</p>
                <p className="text-[14px] text-[var(--ink-secondary)]">
                  {d.current ? copy.thisDevice : `${copy.lastUsed} ${relativeTime(d.lastSeenAt, locale)}`}
                </p>
              </div>
              <button type="button" onClick={() => void signOutOne(d)} disabled={busy !== null || thisDevice.busy} className={buttonClasses({ variant: 'secondary', size: 'md' })}>
                {copy.signOut}
              </button>
            </li>
          ))}
        </ul>
        {devices && devices.length > 0 ? (
          <button type="button" onClick={() => void signOutEverywhere()} disabled={busy !== null} className={`w-full ${buttonClasses({ variant: 'secondary', size: 'lg' })}`}>
            {copy.signOutEverywhere}
          </button>
        ) : null}
      </ProfileFrame>
    </AuthGuard>
  );
}
