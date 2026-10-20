'use client';
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  startRegistration,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { api, ApiError, type UserSettings, type ThemePreference } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { purgeStoredNotifications } from '@/shared/utils/notificationStore';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { LOCALE_NAMES, type Locale } from '@/shared/i18n/locales';
import { adoptPreferenceIfUnset, setThemePreference, useTheme } from '@/shared/hooks/useTheme';
import { LanguagePicker } from './LanguagePicker';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { PublishDealsRows } from './PublishDealsRows';
import { ThemeIcon } from '@/shared/components/ThemeControl';
import { Row, RowGroup, ToggleRow } from '@/features/profile/ui/ProfileUi';
import { sfx } from '@/shared/utils/sfx';
import { TRADE_ENTRY_COPY } from '@/features/home/tradeEntry';

type Saver = (patch: UserSettings) => Promise<void>;

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  soundEnabled: true,
  notificationsMuted: false,
  publicPassport: true,
};

export function SettingsBand() {
  const { address, isAuthenticated, method, email, hasPasskey, refresh, signOut } = useAuth();
  const { locale, t } = useLocale();
  const { preference, mounted } = useTheme();
  const [sheet, setSheet] = useState<null | 'language' | 'theme' | 'reach' | 'delete'>(null);
  const titleId = useId();
  const deleteInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // When the account still has funded agent wallets, the server returns a
  // confirmable warning instead of deleting. We hold the message here and show
  // a Yes/No so the user can proceed with eyes open.
  const [forceConfirm, setForceConfirm] = useState<string | null>(null);
  // Sounds are a per-device choice, kept where the sound kit reads it
  // (localStorage 'karwan-sfx'). The account setting this row used to save was
  // never read by anything, so switching it did nothing.
  const soundsOn = useSyncExternalStore(sfx.subscribe, () => !sfx.muted, () => true);

  const runDelete = useCallback(
    async (force: boolean) => {
      if (!address) return;
      setDeleting(true);
      setDeleteError(null);
      try {
        await api.deleteAccount(address, force);
        // Wipe this account's bell cache + read-state so a re-created account on
        // the same wallet starts clean. Sign-out no longer purges (it preserves
        // read state for normal re-login), so deletion owns the purge now.
        purgeStoredNotifications(address);
        await signOut();
        router.push('/');
      } catch (err) {
        // Funded agent wallets: surface the warning with a Yes/No instead of a
        // hard error.
        if (err instanceof ApiError && err.code === 'agent-funds' && !force) {
          setForceConfirm(
            typeof err.detail === 'string'
              ? err.detail
              : t.settings.fundedFallback,
          );
          setDeleting(false);
          return;
        }
        const detail =
          err instanceof ApiError && err.code === 'chat-account'
            ? t.settings.chatAccountDelete
            : err instanceof ApiError && typeof err.detail === 'string'
              ? err.detail
              : null;
        setDeleteError(detail ?? (err as Error).message);
        setForceConfirm(null);
        setDeleting(false);
        setDeleteConfirm('');
      }
    },
    [address, signOut, router],
  );

  useEffect(() => {
    if (!isAuthenticated || !address) return;
    let cancelled = false;
    api
      .getSettings(address)
      .then((r) => {
        if (!cancelled) {
          setSettings({ ...DEFAULT_SETTINGS, ...r.settings });
          // Pick up the account preference on a device that has never expressed
          // one, so signing in on a new machine honours the theme you saved
          // instead of showing the OS default while this panel reads "Dark".
          // Never overrides an existing local choice: see adoptPreferenceIfUnset.
          if (r.settings?.theme) adoptPreferenceIfUnset(r.settings.theme);
        }
      })
      .catch(() => {
        // Non-fatal. User sees defaults; first save will create the row.
      });
    return () => {
      cancelled = true;
    };
  }, [address, isAuthenticated]);

  const save: Saver = useCallback(
    async (patch) => {
      setError(null);
      // Optimistic update so toggles feel instant.
      setSettings((cur) => ({ ...cur, ...patch }));
      if (!address) return;
      setSaving(true);
      try {
        const r = await api.saveSettings(address, patch);
        setSettings((cur) => ({ ...cur, ...r.settings }));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [address],
  );

  function onLocaleChange(next: Locale) {
    save({ locale: next });
    setSheet(null);
  }

  function chooseTheme(next: ThemePreference) {
    setThemePreference(next);
    save({ theme: next });
    setSheet(null);
  }

  function closeDelete() {
    if (deleting) return;
    setSheet(null);
    setDeleteConfirm('');
    setForceConfirm(null);
    setDeleteError(null);
  }

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t.settings.themeSystem },
    { value: 'light', label: t.settings.themeLight },
    { value: 'dark', label: t.settings.themeDark },
  ];
  // How we reach you: the same three answers as the setup question (view 19).
  const reach = t.setup.choices.reach;
  const reachNow = settings.notifyVia ?? 'both';
  const reachOptions = (Object.entries(reach.options) as Array<[NonNullable<UserSettings['notifyVia']>, { label: string; note: string }]>);
  const themeNow = mounted ? preference : 'system';
  const themeLabel = themeOptions.find((o) => o.value === themeNow)?.label ?? t.settings.themeSystem;

  return (
    <div className="space-y-7">
      <RowGroup title={t.settings.groups.preferences}>
        <Row label={t.settings.language} value={LOCALE_NAMES[locale]} onClick={() => setSheet('language')} />
        <Row label={t.settings.theme} value={themeLabel} onClick={() => setSheet('theme')} />
        <ToggleRow
          label={t.settings.sound}
          note={t.money.settings.soundsSwitch}
          checked={soundsOn}
          onChange={(on) => {
            sfx.setMuted(!on);
            if (on) sfx.tap();
          }}
        />
        <ToggleRow
          label={TRADE_ENTRY_COPY[locale].entry.settingsLabel}
          checked={settings.tradesAs === 'business'}
          onChange={(on) => save({ tradesAs: on ? 'business' : 'self' })}
        />
      </RowGroup>

      <RowGroup title={t.settings.groups.notificationsPrivacy}>
        <ToggleRow
          label={t.settings.notifications}
          note={t.settings.notificationsNote}
          checked={!settings.notificationsMuted}
          onChange={(on) => save({ notificationsMuted: !on })}
        />
        <Row label={t.setup.reachSetting} value={reach.options[reachNow].label} onClick={() => setSheet('reach')} />
        <ToggleRow
          label={t.settings.privacyPublicPassport}
          checked={settings.publicPassport !== false}
          onChange={(v) => save({ publicPassport: v })}
        />
        <PublishDealsRows settings={settings} save={save} />
      </RowGroup>

      {method === 'circle' && email && (
        <RowGroup title={t.settings.groups.security}>
          <PasskeyRow hasPasskey={hasPasskey} email={email} onAdded={() => refresh()} />
        </RowGroup>
      )}

      <RowGroup>
        <Row label={<span className="text-[var(--color-critical)]">{t.settings.accountDelete}</span>} onClick={() => setSheet('delete')} />
      </RowGroup>

      {error && (
        <p role="alert" className="px-1 text-[14px] font-medium text-[var(--color-critical)]">
          {t.common.error}: {error}
        </p>
      )}
      {saving ? <span role="status" className="sr-only">{t.common.loading}</span> : null}

      <ConfirmSheetShell open={sheet === 'language'} labelledBy={`${titleId}-language`} busy={false} onClose={() => setSheet(null)}>
        <h2 id={`${titleId}-language`} className="text-[20px] font-semibold text-[var(--lp-dark)]">{t.settings.language}</h2>
        <p className="mt-1 mb-4 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.settings.languageHint}</p>
        <LanguagePicker onChange={onLocaleChange} />
      </ConfirmSheetShell>

      <ConfirmSheetShell open={sheet === 'theme'} labelledBy={`${titleId}-theme`} busy={false} onClose={() => setSheet(null)}>
        <h2 id={`${titleId}-theme`} className="mb-4 text-[20px] font-semibold text-[var(--lp-dark)]">{t.settings.theme}</h2>
        <div role="radiogroup" aria-labelledby={`${titleId}-theme`} className="divide-y divide-[var(--lp-border-light)] overflow-hidden rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
          {themeOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={themeNow === o.value}
              onClick={() => chooseTheme(o.value)}
              className="flex min-h-[56px] w-full items-center gap-3 px-4 text-start text-[15px] font-semibold text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)]"
            >
              <span aria-hidden className="grid size-5 place-items-center text-[var(--lp-text-sub)]"><ThemeIcon preference={o.value} /></span>
              <span className="flex-1">{o.label}</span>
              {themeNow === o.value ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-[var(--lp-accent-on-light)]"><path d="m5 12 5 5 9-10" /></svg>
              ) : null}
            </button>
          ))}
        </div>
      </ConfirmSheetShell>

      <ConfirmSheetShell open={sheet === 'reach'} labelledBy={`${titleId}-reach`} busy={false} onClose={() => setSheet(null)}>
        <h2 id={`${titleId}-reach`} className="text-[20px] font-semibold text-[var(--lp-dark)]">{reach.title}</h2>
        <p className="mt-1 mb-4 text-[14px] font-medium text-[var(--lp-text-sub)]">{reach.help}</p>
        <div role="radiogroup" aria-labelledby={`${titleId}-reach`} className="divide-y divide-[var(--lp-border-light)] overflow-hidden rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
          {reachOptions.map(([value, o]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={reachNow === value}
              onClick={() => {
                save({ notifyVia: value });
                setSheet(null);
              }}
              className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-start transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--lp-accent)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{o.label}</span>
                <span className="mt-0.5 block text-[14px] font-medium text-[var(--lp-text-sub)]">{o.note}</span>
              </span>
              {reachNow === value ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-[var(--lp-accent-on-light)]"><path d="m5 12 5 5 9-10" /></svg>
              ) : null}
            </button>
          ))}
        </div>
      </ConfirmSheetShell>

      <ConfirmSheetShell open={sheet === 'delete'} labelledBy={`${titleId}-delete`} busy={deleting} onClose={closeDelete} initialFocus={deleteInput}>
        <h2 id={`${titleId}-delete`} className="text-[20px] font-semibold text-[var(--lp-dark)]">{t.settings.deleteTitle}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--lp-text-sub)] font-medium">{t.settings.accountDeleteHint}</p>
        {forceConfirm ? (
          <p role="alert" className="mt-4 rounded-[14px] border border-[var(--color-critical)] p-4 text-[14px] leading-relaxed text-[var(--lp-dark)] font-medium">{forceConfirm}</p>
        ) : (
          <label className="mt-5 block">
            <span className="sr-only">{t.settings.accountDeleteConfirm}</span>
            <input
              ref={deleteInput}
              type="text"
              autoComplete="off"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={t.settings.accountDeleteConfirm}
              disabled={deleting}
              className="min-h-[52px] w-full rounded-[14px] border-0 bg-[var(--tint)] px-4 text-[16px] text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
            />
          </label>
        )}
        {deleteError ? <p role="alert" className="mt-3 text-[14px] font-medium text-[var(--color-critical)]">{deleteError}</p> : null}
        <div className="mt-5 grid gap-2">
          <button
            type="button"
            disabled={deleting || (!forceConfirm && deleteConfirm !== 'DELETE')}
            onClick={() => runDelete(!!forceConfirm)}
            className="min-h-12 rounded-full bg-[var(--color-critical)] px-5 text-[15px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleting ? t.settings.deletingButton : forceConfirm ? t.settings.confirmDeleteYes : t.settings.accountDelete}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={closeDelete}
            className="min-h-12 rounded-full border border-[var(--lp-border-light)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-light)] disabled:opacity-40"
          >
            {t.settings.confirmDeleteNo}
          </button>
        </div>
      </ConfirmSheetShell>
    </div>
  );
}

/// Adds a passkey to a Circle account in place: the browser asks, the server
/// verifies, and the caller refreshes the session.
export function useAddPasskey(email: string | null | undefined, onAdded: () => void | Promise<void>) {
  const t = useTranslations().settings.passkey;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  const supports = typeof window !== 'undefined' ? browserSupportsWebAuthn() : true;

  async function addPasskey() {
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      const optsRes = await api.authPasskeyAddOptions();
      const attResp = await startRegistration({ optionsJSON: optsRes.options });
      await api.authPasskeyAddVerify(email, attResp);
      setJustAdded(true);
      await onAdded();
    } catch (err) {
      const e = err as Error & { name?: string };
      if (e.name === 'NotAllowedError' || /timed out|not allowed/i.test(e.message ?? '')) {
        setError(t.errorCancelled);
      } else {
        const detail =
          err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
        setError(detail || t.errorGeneric);
      }
    } finally {
      setBusy(false);
    }
  }

  return { addPasskey, busy, error, justAdded, supports, copy: t };
}

function PasskeyRow({
  hasPasskey,
  email,
  onAdded,
}: {
  hasPasskey: boolean;
  email: string;
  onAdded: () => void | Promise<void>;
}) {
  const { addPasskey, busy, error, justAdded, supports, copy: t } = useAddPasskey(email, onAdded);
  const on = useLocale().t.profile.simple.on;
  if (hasPasskey || justAdded) return <Row label={t.passkeyLabel} value={on} />;
  return (
    <>
      <Row
        label={t.passkeyLabel}
        value={busy ? t.addingButton : !supports ? t.noBrowserSupport : t.addButton}
        onClick={supports && !busy ? () => void addPasskey() : undefined}
      />
      {error ? <p role="alert" className="px-4 py-3 text-[14px] font-medium text-[var(--color-critical)]">{error}</p> : null}
    </>
  );
}
