'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { api, ApiError } from '@/core/api';
import { useAuth, emitAuthChanged } from '@/shared/hooks/useAuth';

type Tab = 'wallet' | 'passkey';
type Mode = 'login' | 'register';

interface Props {
  open: boolean;
  onClose: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginModal({ open, onClose }: Props) {
  const { refresh, isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>('wallet');
  const [mode, setMode] = useState<Mode>('login');
  /// `passkey` is the default proof method when the browser supports it.
  /// `otp` is the fallback (email code) for devices without WebAuthn or
  /// users who'd rather paste a 6-digit code than do a biometric prompt.
  const [proof, setProof] = useState<'passkey' | 'otp'>('passkey');
  const [otpStage, setOtpStage] = useState<'request' | 'verify'>('request');
  const [otpCode, setOtpCode] = useState('');
  const [otpDevHint, setOtpDevHint] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeyConfigured, setPasskeyConfigured] = useState<boolean | null>(null);
  const [supportsWebAuthn, setSupportsWebAuthn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setOtpStage('request');
    setOtpCode('');
    setOtpDevHint(null);
    const supports = browserSupportsWebAuthn();
    setSupportsWebAuthn(supports);
    // Auto-fall-back to the OTP path when the browser has no WebAuthn at all
    // (older Safari, some embedded webviews). Users can still toggle back.
    if (!supports) setProof('otp');
    api
      .authStatus()
      .then((r) => setPasskeyConfigured(r.configured))
      .catch(() => setPasskeyConfigured(false));
  }, [open]);

  // Auto-close once authentication actually lands. Covers both paths: a
  // wallet just connected via wagmi, or a passkey ceremony just finished.
  useEffect(() => {
    if (open && isAuthenticated) onClose();
  }, [open, isAuthenticated, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Enter a valid email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.authOtpRequest(trimmed);
      setOtpStage('verify');
      setOtpCode('');
      // In dev the backend can return the code so the user can autofill it
      // without checking the terminal. Production never returns this field.
      setOtpDevHint(r.devCode ?? null);
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setError(detail || "Couldn't send a code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    const code = otpCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setError('Code is 6 digits.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.authOtpVerify(trimmed, code);
      await refresh();
      emitAuthChanged();
      onClose();
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setError(detail || 'Code rejected.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasskey(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Enter a valid email.');
      return;
    }
    if (!supportsWebAuthn) {
      setError("Your browser doesn't support passkeys. Try a wallet instead.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') {
        const optsRes = await api.authRegisterOptions(trimmed);
        const attResp = await startRegistration({ optionsJSON: optsRes.options });
        await api.authRegisterVerify(trimmed, attResp);
      } else {
        const optsRes = await api.authLoginOptions(trimmed);
        const assertResp = await startAuthentication({ optionsJSON: optsRes.options });
        await api.authLoginVerify(trimmed, assertResp);
      }
      await refresh();
      emitAuthChanged();
      onClose();
    } catch (err) {
      const e = err as Error & { name?: string };
      // WebAuthn surfaces a NotAllowedError when the user closes the passkey
      // prompt OR when it times out. The raw browser message links to a W3C
      // spec page — fine for devtools, hostile in product. Show a human one.
      if (
        e.name === 'NotAllowedError' ||
        /timed out|not allowed/i.test(e.message ?? '')
      ) {
        setError(
          mode === 'register'
            ? 'Passkey setup cancelled. Try again, or use email code instead.'
            : 'Passkey prompt cancelled. Try again, or use email code instead.',
        );
      } else {
        const detail =
          err instanceof ApiError && err.detail
            ? String(err.detail)
            : (err as Error).message;
        setError(detail || 'Passkey ceremony failed.');
      }
    } finally {
      setBusy(false);
    }
  }

  // Portal to document.body so a transformed ancestor (e.g. the sticky top
  // nav) can't pull `position: fixed` out of viewport coordinates. Without
  // this the modal occasionally renders glued to the top of the page.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(14,14,14,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Log in"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden fade-up"
        style={{
          background: 'var(--lp-card)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 5,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.35)',
        }}
      >
        <div className="px-5 pt-5 pb-4 flex items-center justify-between gap-3">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:LOG IN:]
          </p>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[var(--lp-text-muted)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M3 3l10 10M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="px-5">
          <div
            className="inline-flex p-1 gap-1 w-full"
            style={{
              background: 'var(--lp-dark)',
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 2,
            }}
          >
            <TabPill active={tab === 'wallet'} onClick={() => setTab('wallet')}>
              Wallet
            </TabPill>
            <TabPill active={tab === 'passkey'} onClick={() => setTab('passkey')}>
              Email
            </TabPill>
          </div>
        </div>

        <div className="px-5 py-5 space-y-4">
          {tab === 'wallet' && (
            <div>
              <ConnectButton.Custom>
                {({ openConnectModal, mounted }) => (
                  <button
                    type="button"
                    disabled={!mounted}
                    onClick={openConnectModal}
                    className="w-full inline-flex items-center justify-center gap-2 px-[20px] py-[14px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
                    style={{
                      borderTopLeftRadius: 12,
                      borderTopRightRadius: 12,
                      borderBottomLeftRadius: 12,
                      borderBottomRightRadius: 3,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <rect
                        x="2"
                        y="4"
                        width="12"
                        height="9"
                        rx="1.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M2 7h12M10 10h1"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    Connect wallet
                    <span aria-hidden>→</span>
                  </button>
                )}
              </ConnectButton.Custom>
            </div>
          )}
          {tab === 'passkey' && (
            <div className="space-y-4">
              {passkeyConfigured === false && (
                <p className="mono text-[11px] text-[#b25425] leading-snug">
                  Email login is not configured on this backend.
                </p>
              )}

              {/* Proof-method toggle. passkey first, OTP fallback. The active
                  pill colour matches the lime accent so the two paths read
                  as a single choice, not two competing CTAs. */}
              <div
                className="inline-flex p-1 gap-1 w-full"
                style={{
                  background: 'var(--lp-dark)',
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                  borderBottomLeftRadius: 8,
                  borderBottomRightRadius: 2,
                }}
              >
                <ModePill
                  active={proof === 'passkey'}
                  onClick={() => {
                    setProof('passkey');
                    setError(null);
                  }}
                >
                  Passkey
                </ModePill>
                <ModePill
                  active={proof === 'otp'}
                  onClick={() => {
                    setProof('otp');
                    setOtpStage('request');
                    setError(null);
                  }}
                >
                  Email code
                </ModePill>
              </div>

              {proof === 'passkey' && (
                <form onSubmit={handlePasskey} className="space-y-4">
                  {supportsWebAuthn === false && (
                    <p className="mono text-[11px] text-[#b25425] leading-snug">
                      This browser has no passkey support. Switch to Email code above.
                    </p>
                  )}
                  <label className="block space-y-1.5">
                    <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                      Email
                    </span>
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email webauthn"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={busy}
                      placeholder="you@example.com"
                      className="form-input"
                    />
                  </label>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div
                      className="inline-flex p-1 gap-1"
                      style={{
                        background: 'var(--lp-dark)',
                        borderTopLeftRadius: 8,
                        borderTopRightRadius: 8,
                        borderBottomLeftRadius: 8,
                        borderBottomRightRadius: 2,
                      }}
                    >
                      <ModePill active={mode === 'login'} onClick={() => setMode('login')}>
                        Sign in
                      </ModePill>
                      <ModePill active={mode === 'register'} onClick={() => setMode('register')}>
                        Create
                      </ModePill>
                    </div>
                    <button
                      type="submit"
                      disabled={
                        busy ||
                        !email ||
                        passkeyConfigured === false ||
                        supportsWebAuthn === false
                      }
                      className="inline-flex items-center gap-2 px-[18px] py-[11px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
                      style={{
                        borderTopLeftRadius: 12,
                        borderTopRightRadius: 12,
                        borderBottomLeftRadius: 12,
                        borderBottomRightRadius: 3,
                      }}
                    >
                      {busy
                        ? mode === 'register'
                          ? 'Creating…'
                          : 'Verifying…'
                        : mode === 'register'
                          ? 'Create →'
                          : 'Sign in →'}
                    </button>
                  </div>
                </form>
              )}

              {proof === 'otp' && otpStage === 'request' && (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <label className="block space-y-1.5">
                    <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                      Email
                    </span>
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={busy}
                      placeholder="you@example.com"
                      className="form-input"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busy || !email || passkeyConfigured === false}
                    className="w-full inline-flex items-center justify-center gap-2 px-[18px] py-[12px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
                    style={{
                      borderTopLeftRadius: 12,
                      borderTopRightRadius: 12,
                      borderBottomLeftRadius: 12,
                      borderBottomRightRadius: 3,
                    }}
                  >
                    {busy ? 'Sending…' : 'Send code →'}
                  </button>
                  <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-snug">
                    A 6-digit code lands in your inbox. Works on any device.
                  </p>
                </form>
              )}

              {proof === 'otp' && otpStage === 'verify' && (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <p className="text-[13px] leading-snug text-[var(--lp-text-sub)]">
                    Code sent to <span className="mono text-[var(--lp-dark)]">{email}</span>.
                    Check your inbox.
                  </p>
                  <label className="block space-y-1.5">
                    <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                      6-digit code
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      autoComplete="one-time-code"
                      value={otpCode}
                      onChange={(e) =>
                        setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      disabled={busy}
                      placeholder="000000"
                      className="form-input mono text-[18px] tabular-nums tracking-[0.4em]"
                      autoFocus
                    />
                  </label>
                  {otpDevHint && (
                    <button
                      type="button"
                      onClick={() => setOtpCode(otpDevHint)}
                      className="group w-full inline-flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors"
                      style={{
                        background: 'rgba(189, 225, 34,0.12)',
                        border: '1px dashed rgba(189, 225, 34,0.55)',
                        borderTopLeftRadius: 8,
                        borderTopRightRadius: 8,
                        borderBottomLeftRadius: 8,
                        borderBottomRightRadius: 2,
                      }}
                      title="Dev mode only. Hidden in production."
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="mono text-[9px] font-bold uppercase tracking-[0.18em] px-1.5 py-[2px]"
                          style={{
                            background: 'var(--lp-dark)',
                            color: 'var(--lp-accent)',
                            borderTopLeftRadius: 3,
                            borderTopRightRadius: 3,
                            borderBottomLeftRadius: 3,
                            borderBottomRightRadius: 1,
                          }}
                        >
                          DEV
                        </span>
                        <span className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
                          Tap to autofill
                        </span>
                      </span>
                      <span className="mono text-[14px] font-bold tabular-nums tracking-[0.18em] text-[var(--lp-dark)] group-hover:opacity-80 transition-opacity">
                        {otpDevHint}
                      </span>
                    </button>
                  )}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setOtpStage('request');
                        setOtpCode('');
                        setError(null);
                      }}
                      disabled={busy}
                      className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] underline underline-offset-2 disabled:opacity-50"
                    >
                      Resend
                    </button>
                    <button
                      type="submit"
                      disabled={busy || otpCode.length !== 6}
                      className="inline-flex items-center gap-2 px-[18px] py-[11px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
                      style={{
                        borderTopLeftRadius: 12,
                        borderTopRightRadius: 12,
                        borderBottomLeftRadius: 12,
                        borderBottomRightRadius: 3,
                      }}
                    >
                      {busy ? 'Verifying…' : 'Verify →'}
                    </button>
                  </div>
                </form>
              )}

              {error && (
                <p className="mono text-[11px] text-[#b25425] leading-snug">{error}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 px-3 py-2 mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors"
      style={{
        background: active ? 'var(--lp-accent)' : 'transparent',
        color: active ? 'var(--lp-dark)' : 'rgba(255,255,255,0.55)',
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 2,
      }}
    >
      {children}
    </button>
  );
}

function ModePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors"
      style={{
        background: active ? 'var(--lp-accent)' : 'transparent',
        color: active ? 'var(--lp-dark)' : 'rgba(255,255,255,0.55)',
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        borderBottomLeftRadius: 6,
        borderBottomRightRadius: 2,
      }}
    >
      {children}
    </button>
  );
}
