'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, ApiError, type UserProfile } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

const HANDLE_RE = /^@?[A-Za-z0-9_]{1,15}$/;

function XBrandTile({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-[5px] shrink-0 bg-black border border-white/12 text-white"
      style={{ width: size + 4, height: size + 4 }}
    >
      <svg width={size - 2} height={size - 2} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    </span>
  );
}

export function ConnectXButton({ tone = 'dark' }: { tone?: 'dark' | 'light' } = {}) {
  const auth = useAuth();
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
  const cx = useTranslations().connectX;

  // Theme-aware chip colors. `dark` keeps white-on-dark. `light` uses --lp-dark
  // and --lp-text-sub which both flip under html[data-theme="dark"], so the
  // chip stays readable in dark mode instead of dark-on-dark.
  const onLight = tone === 'light';
  const chipBase = onLight
    ? 'border-[var(--lp-border)] text-[var(--lp-dark)] hover:bg-[var(--lp-light)]'
    : 'border-white/20 text-white hover:bg-white/[0.06] hover:border-white/35';
  const chipMuted = onLight
    ? 'border-[var(--lp-border)] text-[var(--lp-text-sub)]'
    : 'border-white/20 text-white/45';
  const sublabel = onLight ? 'text-[var(--lp-text-sub)]' : 'text-white/55';
  const errClass = onLight ? 'text-[#a73a37]' : 'text-[#e8806b]';
  const search = useSearchParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !isConnected) {
      setProfile(null);
      return;
    }
    api.getProfile(address).then((r) => setProfile(r.profile)).catch(() => {});
  }, [address, isConnected, search]);

  useEffect(() => {
    api.xStatus().then((r) => setOauthConfigured(r.configured)).catch(() => setOauthConfigured(false));
  }, []);

  // Surface the OAuth callback outcome inline so the user sees it without
  // hunting for it. The callback redirected with ?x=ok|error.
  const xParam = search.get('x');
  useEffect(() => {
    if (xParam === 'error') {
      const reason = search.get('reason') ?? cx.errors.bindFailed;
      setError(reason);
    } else if (xParam === 'taken') {
      const h = search.get('handle');
      setError(
        h
          ? cx.errors.handleTakenTemplate.replace('{handle}', h)
          : cx.errors.accountTaken,
      );
    }
  }, [xParam, search, cx]);

  const bound = !!profile?.xHandle;

  async function startOAuth() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.xOauthStart(address);
      window.location.assign(r.url);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function saveHandle() {
    if (!address) return;
    const trimmed = handle.trim();
    if (!HANDLE_RE.test(trimmed)) {
      setError(cx.errors.invalidHandle);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.setXHandle(address, trimmed);
      setProfile(r.profile);
      setOpen(false);
      setHandle('');
    } catch (err) {
      // Prefer the server's friendly detail (e.g. the "already connected"
      // message) over the terse error code.
      const detail = err instanceof ApiError && typeof err.detail === 'string' ? err.detail : null;
      setError(detail ?? (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!address) return;
    setBusy(true);
    try {
      const r = await api.setXHandle(address, null);
      setProfile(r.profile);
    } catch {
      /* keep prior state */
    } finally {
      setBusy(false);
    }
  }

  if (!isConnected || !profile) {
    return (
      <button
        type="button"
        disabled
        title={cx.disabledTitle}
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 mono text-[11px] font-bold uppercase tracking-[0.08em] border ${chipMuted} cursor-not-allowed w-fit`}
        style={{
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 2,
        }}
      >
        <XBrandTile />
        {cx.connectCta}
      </button>
    );
  }

  if (bound) {
    return (
      <div className="inline-flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 mono text-[11px] font-bold uppercase tracking-[0.08em] border ${chipBase}`}
          style={{
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 2,
          }}
        >
          {profile.xProfileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.xProfileImageUrl}
              alt=""
              className="w-[18px] h-[18px] rounded-full object-cover shrink-0"
            />
          ) : (
            <XBrandTile />
          )}
          @{profile.xHandle}
        </span>
        <button
          type="button"
          onClick={unlink}
          disabled={busy}
          className={`mono text-[10px] uppercase tracking-[0.12em] ${sublabel} hover:${onLight ? 'text-[var(--lp-band-dark)]' : 'text-white'} transition-colors disabled:opacity-50`}
        >
          {busy ? cx.working : cx.unlink}
        </button>
      </div>
    );
  }

  // OAuth path. single click bounces to X and back.
  if (oauthConfigured && !open) {
    return (
      <div className="inline-flex flex-col items-start gap-1.5">
        <button
          type="button"
          onClick={startOAuth}
          disabled={busy}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 mono text-[11px] font-bold uppercase tracking-[0.08em] border ${chipBase} transition-colors w-fit disabled:opacity-50`}
          style={{
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 2,
          }}
        >
          <XBrandTile />
          {busy ? cx.redirecting : cx.connectCta}
        </button>
        {error && (
          <p className={`mono text-[10px] ${errClass} leading-snug max-w-[34ch]`}>{error}</p>
        )}
      </div>
    );
  }

  // Handle-entry fallback (OAuth not configured, or user picked manual).
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 mono text-[11px] font-bold uppercase tracking-[0.08em] border ${chipBase} transition-colors w-fit`}
        style={{
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 2,
        }}
      >
        <XBrandTile />
        {cx.connectCta}
      </button>
    );
  }

  return (
    <div
      className="inline-flex flex-col gap-2 p-3 border border-white/12 w-fit"
      style={{
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 2,
        background: 'var(--surface-1)',
      }}
    >
      <label className="mono text-[10px] uppercase tracking-[0.14em] text-white/55">
        {cx.handleLabel}
      </label>
      <div className="inline-flex items-center gap-2">
        <span className="mono text-[12px] text-white/55">@</span>
        <input
          autoFocus
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveHandle();
            if (e.key === 'Escape') {
              setOpen(false);
              setHandle('');
              setError(null);
            }
          }}
          placeholder={cx.handlePlaceholder}
          maxLength={15}
          className="bg-transparent border-b border-white/20 focus:border-white/60 focus:outline-none mono text-[13px] text-white w-44 py-1"
        />
        <button
          type="button"
          onClick={saveHandle}
          disabled={busy || !handle.trim()}
          className="mono text-[10px] uppercase tracking-[0.12em] font-bold px-2 py-1 bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50"
        >
          {busy ? cx.saving : cx.save}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setHandle('');
            setError(null);
          }}
          className="mono text-[10px] uppercase tracking-[0.12em] text-white/55 hover:text-white transition-colors"
        >
          {cx.cancel}
        </button>
      </div>
      <p className="mono text-[10px] text-white/45 leading-snug max-w-[34ch]">
        {cx.handleNote}
      </p>
      {error && (
        <p className="mono text-[10px] text-[#e8806b] leading-snug max-w-[34ch]">{error}</p>
      )}
    </div>
  );
}
