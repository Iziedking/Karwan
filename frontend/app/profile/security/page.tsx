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
import { profilePagesFor } from '@/shared/i18n/messages/profilePages';
import { relativeTime, shortAddress } from '@/shared/utils/format';
import { ProfileFrame, Row, RowGroup } from '@/features/profile/ui/ProfileUi';
import { PasskeyRow } from '@/features/settings/components/SettingsBand';
import { useSignOutRequest } from '@/features/profile/useSignOutRequest';

/// Sign-in and security (view 83): how this account signs in, then every
/// device it is signed in on (view 65) with Sign out on each and Sign out
/// everywhere. Signing out this device is the usual sign-out.
export default function SignInAndSecurityPage() {
  const t = useTranslations();
  return (
    <AuthGuard gateTag={t.profile.signInGate.tag} gateBody={t.profile.signInGate.body}>
      <SignInAndSecurity />
    </AuthGuard>
  );
}

function SignInAndSecurity() {
  const t = useTranslations();
  const copy = t.profile.hub.devicesPage;
  const hub = t.profile.hub;
  const { locale } = useLocale();
  const page = profilePagesFor(locale).security;
  const { signOut, method, email, address, hasPasskey, refresh } = useAuth();
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
    <ProfileFrame title={page.title} backHref="/profile">
      {/* An email account signs in with its email and a passkey; a wallet account with its wallet. */}
      <RowGroup title={page.howYouSignIn}>
        {method === 'circle' ? (
          <>
            <Row label={page.email} value={email ?? undefined} />
            {email ? <PasskeyRow hasPasskey={hasPasskey} email={email} onAdded={() => refresh()} /> : null}
            <Row label={hub.recovery} soon={hub.soon} />
          </>
        ) : (
          <Row label={page.wallet} value={address ? shortAddress(address) : undefined} />
        )}
      </RowGroup>

      <section data-signed-in-now>
        <h2 className="mb-1 flex min-h-11 items-center ps-4 text-[15px] font-semibold text-[var(--ink)]">{page.signedInNow}</h2>
        {error && <p role="alert" className="mb-2 px-4 text-[14px] text-[var(--ink-secondary)]">{error}</p>}
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
      </section>
      {devices && devices.length > 0 ? (
        <button type="button" onClick={() => void signOutEverywhere()} disabled={busy !== null} className={`w-full ${buttonClasses({ variant: 'secondary', size: 'lg' })}`}>
          {copy.signOutEverywhere}
        </button>
      ) : null}
    </ProfileFrame>
  );
}
