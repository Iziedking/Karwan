'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, type UserSettings, type ThemePreference } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Locale } from '@/shared/i18n/locales';
import { LanguagePicker } from './LanguagePicker';

type Saver = (patch: UserSettings) => Promise<void>;

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  soundEnabled: true,
  notificationsMuted: false,
  publicPassport: true,
};

export function SettingsBand() {
  const { address, isAuthenticated } = useAuth();
  const t = useTranslations();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !address) return;
    let cancelled = false;
    api
      .getSettings(address)
      .then((r) => {
        if (!cancelled) {
          setSettings({ ...DEFAULT_SETTINGS, ...r.settings });
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
    // Mirror to the document attribute used by the existing theme system,
    // so visual theme flips without a reload. 'system' clears the override.
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      if (next === 'system') {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', next);
      }
    }
  }

  return (
    <section
      className="border bg-[var(--color-surface)] p-6 md:p-7 fade-up"
      style={{
        borderColor: 'var(--color-line)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 4,
      }}
    >
      <header className="mb-5">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-faint)]">
          [:{t.settings.eyebrow}:]
        </span>
        <h2 className="mt-2 font-sans text-[22px] font-extrabold tracking-[-0.02em] text-[var(--color-ink)]">
          {t.settings.title}
        </h2>
        <p className="mt-1.5 text-[13.5px] text-[var(--color-ink-dim)] max-w-[52ch]">
          {t.settings.description}
        </p>
      </header>

      <Row label={t.settings.language} hint={t.settings.languageHint}>
        <LanguagePicker onChange={onLocaleChange} />
      </Row>

      <Row label={t.settings.theme}>
        <ToggleGroup
          value={settings.theme ?? 'system'}
          options={[
            { value: 'light', label: t.settings.themeLight },
            { value: 'dark', label: t.settings.themeDark },
            { value: 'system', label: t.settings.themeSystem },
          ]}
          onChange={(v) => onThemeChange(v as ThemePreference)}
        />
      </Row>

      <Row label={t.settings.sound}>
        <ToggleGroup
          value={settings.soundEnabled === false ? 'off' : 'on'}
          options={[
            { value: 'on', label: t.settings.soundOn },
            { value: 'off', label: t.settings.soundOff },
          ]}
          onChange={(v) => save({ soundEnabled: v === 'on' })}
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

      <div
        className="mt-6 pt-5 border-t"
        style={{ borderColor: 'var(--color-line)' }}
      >
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-critical)] mb-2">
          [:{t.settings.dangerZone}:]
        </p>
        <p className="text-[13px] text-[var(--color-ink-dim)] max-w-[52ch]">
          {t.settings.accountDeleteHint}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={t.settings.accountDeleteConfirm}
            className="px-3 py-2 text-[12px] mono border bg-[var(--color-surface)]"
            style={{ borderColor: 'var(--color-line)', borderRadius: 3 }}
          />
          <button
            type="button"
            disabled={deleteConfirm !== 'DELETE' || deleting}
            onClick={async () => {
              if (!address) return;
              setDeleting(true);
              try {
                await fetch(`/api/profile?address=${address}`, { method: 'DELETE' });
              } catch {
                /* delete endpoint may not exist yet; UI-only confirmation for now */
              } finally {
                setDeleting(false);
                setDeleteConfirm('');
              }
            }}
            className="px-4 py-2 text-[12px] mono uppercase tracking-[0.12em] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'var(--color-critical)',
              color: 'var(--color-surface)',
              border: '1px solid var(--color-critical)',
              borderRadius: 3,
            }}
          >
            {t.settings.accountDelete}
          </button>
        </div>
      </div>

      {saving && (
        <p className="mt-4 mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
          {t.common.loading}
        </p>
      )}
      {error && (
        <p className="mt-4 mono text-[11px] text-[var(--color-critical)]">
          {t.common.error}: {error}
        </p>
      )}
    </section>
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
      className="py-4 border-t first:border-t-0 first:pt-0"
      style={{ borderColor: 'var(--color-line)' }}
    >
      <p className="text-[13px] font-semibold text-[var(--color-ink)] mb-1">{label}</p>
      {hint && (
        <p className="text-[12px] text-[var(--color-ink-dim)] mb-3 max-w-[52ch]">{hint}</p>
      )}
      {children}
    </div>
  );
}

interface ToggleOption {
  value: string;
  label: string;
}

function ToggleGroup({
  value,
  options,
  onChange,
}: {
  value: string;
  options: ToggleOption[];
  onChange: (next: string) => void;
}) {
  return (
    <div className="inline-flex border" style={{ borderColor: 'var(--color-line)', borderRadius: 3 }}>
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="px-3.5 py-1.5 text-[12px] mono uppercase tracking-[0.12em] font-semibold"
            style={{
              background: active ? 'var(--color-ink)' : 'transparent',
              color: active ? 'var(--color-surface)' : 'var(--color-ink-dim)',
              borderLeft: i === 0 ? 'none' : '1px solid var(--color-line)',
            }}
          >
            {opt.label}
          </button>
        );
      })}
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
    <label className="inline-flex items-center gap-3 cursor-pointer">
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        className="relative inline-block w-9 h-5 transition-colors"
        style={{
          background: checked ? 'var(--color-accent, #b25425)' : 'var(--color-line-strong)',
          borderRadius: 999,
        }}
      >
        <span
          aria-hidden
          className="absolute top-0.5 inline-block w-4 h-4 bg-white transition-[left]"
          style={{ left: checked ? 18 : 2, borderRadius: 999 }}
        />
      </span>
      <span className="text-[13px] text-[var(--color-ink-dim)]">{label}</span>
    </label>
  );
}
