'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  startRegistration,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { api, ApiError, type UserSettings, type ThemePreference } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { purgeStoredNotifications } from '@/shared/utils/notificationStore';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Locale } from '@/shared/i18n/locales';
import { adoptPreferenceIfUnset } from '@/shared/hooks/useTheme';
import { LanguagePicker } from './LanguagePicker';
import { ThemePicker } from './ThemePicker';
import { Hint } from '@/shared/components/Hint';
import { sfx } from '@/shared/utils/sfx';

type Saver = (patch: UserSettings) => Promise<void>;

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  soundEnabled: true,
  notificationsMuted: false,
  publicPassport: true,
};

export function SettingsBand() {
  const { address, isAuthenticated, method, email, hasPasskey, refresh, signOut } = useAuth();
  const t = useTranslations();
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
          err instanceof ApiError && typeof err.detail === 'string' ? err.detail : null;
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
  }

  function onThemeChange(next: ThemePreference) {
    save({ theme: next });
  }

  return (
    <section
      className="border-t border-[var(--color-line)]"
    >
      <Row label={t.settings.language} hint={t.settings.languageHint}>
        <LanguagePicker onChange={onLocaleChange} />
      </Row>

      <Row label={t.settings.theme}>
        <ThemePicker onChange={onThemeChange} showLabel={false} />
      </Row>

      <Row label={t.settings.sound}>
        <Switch
          checked={soundsOn}
          label={t.money.settings.soundsSwitch}
          onChange={(on) => {
            sfx.setMuted(!on);
            if (on) sfx.tap();
          }}
        />
      </Row>

      <Row label={t.settings.notifications} hint={t.settings.notificationsHint}>
        <Switch
          checked={!!settings.notificationsMuted}
          label={t.settings.notificationsMute}
          onChange={(v) => save({ notificationsMuted: v })}
        />
      </Row>

      <Row label={t.settings.privacy}>
        <Switch
          checked={settings.publicPassport !== false}
          label={t.settings.privacyPublicPassport}
          onChange={(v) => save({ publicPassport: v })}
        />
      </Row>

      {method === 'circle' && email && (
        <PasskeyRow
          hasPasskey={hasPasskey}
          email={email}
          onAdded={() => refresh()}
        />
      )}

      <div
        className="mt-6 pt-5 border-t"
        style={{ borderColor: 'var(--color-line)' }}
      >
        <p className="mb-2 text-[13px] font-semibold text-[var(--color-critical)]">
          {t.settings.dangerZone}
        </p>
        <p className="max-w-[52ch] text-[14px] leading-6 text-[var(--color-ink-dim)]">
          {t.settings.accountDeleteHint}
        </p>
        <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={t.settings.accountDeleteConfirm}
            className="min-h-11 w-full rounded-[10px] border bg-[var(--color-surface)] px-3 py-2 text-[14px] text-[var(--color-ink)] sm:w-auto"
            style={{ borderColor: 'var(--color-line)' }}
          />
          <button
            type="button"
            disabled={deleteConfirm !== 'DELETE' || deleting || forceConfirm !== null}
            onClick={() => runDelete(false)}
            className="min-h-11 w-full rounded-[10px] px-4 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            style={{
              background: 'var(--color-critical)',
              color: 'var(--color-surface)',
              border: '1px solid var(--color-critical)',
            }}
          >
            {t.settings.accountDelete}
          </button>
        </div>
        {forceConfirm && (
          <div
            className="mt-3 max-w-[52ch] rounded-[10px] border p-4"
            style={{ borderColor: 'var(--color-critical)' }}
          >
            <p className="text-[14px] leading-6 text-[var(--color-ink-dim)]">{forceConfirm}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <button
                type="button"
                disabled={deleting}
                onClick={() => runDelete(true)}
                className="min-h-11 rounded-[10px] px-4 py-2 text-[13px] font-semibold disabled:opacity-40"
                style={{
                  background: 'var(--color-critical)',
                  color: 'var(--color-surface)',
                  border: '1px solid var(--color-critical)',
                }}
              >
                {deleting ? t.settings.deletingButton : t.settings.confirmDeleteYes}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setForceConfirm(null);
                  setDeleteConfirm('');
                }}
                className="min-h-11 rounded-[10px] px-4 py-2 text-[13px] font-semibold disabled:opacity-40"
                style={{
                  border: '1px solid var(--color-line)',
                  color: 'var(--color-ink-dim)',
                }}
              >
                {t.settings.confirmDeleteNo}
              </button>
            </div>
          </div>
        )}
        {deleteError && (
          <p className="mt-2 max-w-[52ch] text-[13px] leading-5 text-[var(--color-critical)]">
            {deleteError}
          </p>
        )}
      </div>

      {saving && (
        <p className="mt-4 text-[13px] text-[var(--color-ink-dim)]">
          {t.common.loading}
        </p>
      )}
      {error && (
        <p className="mt-4 text-[13px] text-[var(--color-critical)]">
          {t.common.error}: {error}
        </p>
      )}
    </section>
  );
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
  const t = useTranslations().settings.passkey;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  const supports = typeof window !== 'undefined' ? browserSupportsWebAuthn() : true;

  async function addPasskey() {
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

  return (
    <Row label={t.rowLabel} hint={t.rowHint}>
      {hasPasskey || justAdded ? (
        <div className="inline-flex items-center gap-2.5">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--color-accent, #b25425)' }}
          />
          <span className="text-[14px] text-[var(--color-ink-dim)]">
            {t.activeChip}
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={addPasskey}
            disabled={busy || !supports}
            className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[var(--color-ink)] px-4 py-2 text-[13px] font-semibold text-[var(--color-surface)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? t.addingButton : t.addButton}
            <span aria-hidden>→</span>
          </button>
          {!supports && (
            <p className="text-[13px] text-[var(--color-ink-dim)]">
              {t.noBrowserSupport}
            </p>
          )}
          {error && (
            <p className="text-[13px] text-[var(--color-critical)]">{error}</p>
          )}
        </div>
      )}
    </Row>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="grid items-center gap-3 border-t py-5 first:border-t-0 first:pt-0 sm:grid-cols-[minmax(150px,0.7fr)_minmax(0,1fr)] sm:gap-6"
      style={{ borderColor: 'var(--color-line)' }}
    >
      <p className="inline-flex items-center gap-2 text-[15px] font-semibold text-[var(--color-ink)]">
        {label}
        {hint && <Hint>{hint}</Hint>}
      </p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="inline-flex min-h-11 items-center gap-3 cursor-pointer">
      <span
        role="switch"
        aria-label={label}
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        className="inline-flex h-11 w-11 shrink-0 items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent,#b25425)] focus-visible:ring-offset-2"
      >
        <span
          aria-hidden
          className="relative inline-block h-6 w-11 shrink-0 transition-colors"
          style={{
            background: checked ? 'var(--color-accent, #b25425)' : 'var(--color-line-strong)',
            borderRadius: 999,
          }}
        >
          <span
            className="absolute top-0.5 inline-block h-5 w-5 bg-white transition-[inset-inline-start]"
            style={{ insetInlineStart: checked ? 22 : 2, borderRadius: 999 }}
          />
        </span>
      </span>
      <span className="text-[14px] text-[var(--color-ink-dim)]">{label}</span>
    </label>
  );
}
