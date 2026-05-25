'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { api, ApiError } from '@/core/api';
import { useAuth, emitAuthChanged } from '@/shared/hooks/useAuth';

interface Props {
  open: boolean;
  onClose: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/// One linear flow:
///   1. pick-method  -> Email or Wallet
///   2. enter-email  -> user types email, we look up account + passkey state
///   3. auth         -> passkey ceremony OR email code, decided by lookup
type Stage = 'pick-method' | 'enter-email' | 'auth';

interface AuthPlan {
  /// True when this email already has an account row.
  exists: boolean;
  /// True when this account has at least one passkey credential.
  hasPasskey: boolean;
  /// True when the current browser supports WebAuthn at all.
  supportsWebAuthn: boolean;
  /// 'passkey' or 'otp'. Computed from the three flags above. The user can
  /// override via the "use email code instead" link when both are possible.
  pref: 'passkey' | 'otp';
}

export function LoginModal({ open, onClose }: Props) {
  const { refresh, isAuthenticated } = useAuth();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('pick-method');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<AuthPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeyConfigured, setPasskeyConfigured] = useState<boolean | null>(null);
  // Pre-fetched WebAuthn options. iOS Safari only shows the passkey sheet when
  // navigator.credentials.create/get fires inside the tap's user-activation
  // window; an await on the options fetch in between drops that activation and
  // the sheet silently never appears. We fetch the options when the user reaches
  // the auth step so the button tap can call the ceremony directly.
  type PrefetchedOptions =
    | { kind: 'register'; options: Awaited<ReturnType<typeof api.authRegisterOptions>>['options'] }
    | { kind: 'login'; options: Awaited<ReturnType<typeof api.authLoginOptions>>['options'] };
  const [passkeyOpts, setPasskeyOpts] = useState<PrefetchedOptions | null>(null);

  /// OTP sub-state. We jump straight from the unified flow into "show 6-digit
  /// input" once a code has been sent.
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpDevHint, setOtpDevHint] = useState<string | null>(null);

  // Reset when the modal opens.
  useEffect(() => {
    if (!open) return;
    setStage('pick-method');
    setEmail('');
    setPlan(null);
    setError(null);
    setOtpSent(false);
    setOtpCode('');
    setOtpDevHint(null);
    setPasskeyOpts(null);
    api
      .authStatus()
      .then((r) => setPasskeyConfigured(r.configured))
      .catch(() => setPasskeyConfigured(false));
  }, [open]);

  // Auto-close once authentication actually lands (covers both the Circle
  // passkey/OTP path and a web3 wallet connecting via RainbowKit). On login we
  // send the user to the app home; the /app page routes brand-new users (no
  // profile) onward to onboarding. Net: existing users land on home, new users
  // onboard, from wherever they logged in.
  useEffect(() => {
    if (open && isAuthenticated) {
      onClose();
      router.push('/app');
    }
  }, [open, isAuthenticated, onClose, router]);

  // Fetch the right WebAuthn options ahead of the tap. Stored so runPasskey can
  // fire the ceremony with no await in between (the iOS activation fix). A fresh
  // challenge each time, so a retry after a cancel uses a valid one. MUST sit
  // above the early returns below so the hook order is identical whether the
  // modal is open or closed — otherwise opening it runs extra hooks and React
  // throws #310 ("rendered more hooks than during the previous render").
  const prefetchPasskey = useCallback(async () => {
    if (!plan || plan.pref !== 'passkey') return;
    try {
      if (plan.exists) {
        const r = await api.authLoginOptions(email);
        setPasskeyOpts({ kind: 'login', options: r.options });
      } else {
        const r = await api.authRegisterOptions(email);
        setPasskeyOpts({ kind: 'register', options: r.options });
      }
    } catch {
      // Leave it null; runPasskey falls back to fetching inline on tap.
      setPasskeyOpts(null);
    }
  }, [plan, email]);

  // Warm the options the moment the passkey step is shown.
  useEffect(() => {
    if (stage !== 'auth' || !plan || plan.pref !== 'passkey' || otpSent) {
      setPasskeyOpts(null);
      return;
    }
    setPasskeyOpts(null);
    void prefetchPasskey();
  }, [stage, plan, otpSent, prefetchPasskey]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Enter a valid email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.authLookup(trimmed);
      const supportsWebAuthn = browserSupportsWebAuthn();
      const pref: 'passkey' | 'otp' = (() => {
        if (!supportsWebAuthn) return 'otp';
        if (r.exists && !r.hasPasskey) return 'otp';
        return 'passkey';
      })();
      setEmail(trimmed);
      setPlan({ exists: r.exists, hasPasskey: r.hasPasskey, supportsWebAuthn, pref });
      setStage('auth');
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setError(detail || "Couldn't check that email.");
    } finally {
      setBusy(false);
    }
  }

  async function runPasskey() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      if (plan.exists) {
        // Use the pre-fetched options when ready so the ceremony fires inside the
        // tap gesture. Fall back to an inline fetch only if the warm-up lost a race.
        const options =
          passkeyOpts?.kind === 'login'
            ? passkeyOpts.options
            : (await api.authLoginOptions(email)).options;
        const assertResp = await startAuthentication({ optionsJSON: options });
        await api.authLoginVerify(email, assertResp);
      } else {
        const options =
          passkeyOpts?.kind === 'register'
            ? passkeyOpts.options
            : (await api.authRegisterOptions(email)).options;
        const attResp = await startRegistration({ optionsJSON: options });
        await api.authRegisterVerify(email, attResp);
      }
      await refresh();
      emitAuthChanged();
      onClose();
    } catch (err) {
      // The pre-fetched challenge is single-use; warm a fresh one for the retry.
      void prefetchPasskey();
      const e = err as Error & { name?: string };
      if (e.name === 'NotAllowedError' || /timed out|not allowed/i.test(e.message ?? '')) {
        setError(
          plan.exists
            ? 'Passkey prompt cancelled. Try again, or use a code.'
            : 'Passkey setup cancelled. Try again, or use a code.',
        );
      } else {
        const detail =
          err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
        setError(detail || 'Passkey ceremony failed.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.authOtpRequest(email);
      setOtpSent(true);
      setOtpCode('');
      setOtpDevHint(r.devCode ?? null);
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setError(detail || "Couldn't send a code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const code = otpCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setError('Code is 6 digits.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.authOtpVerify(email, code);
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

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(14,14,14,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to Karwan"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] overflow-hidden fade-up"
        style={{
          background: 'var(--lp-card)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 5,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 22px 64px -22px rgba(0,0,0,0.38)',
        }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {stage !== 'pick-method' && (
              <button
                type="button"
                onClick={() => {
                  if (busy) return;
                  if (stage === 'auth' && otpSent) {
                    setOtpSent(false);
                    setOtpCode('');
                    setError(null);
                    return;
                  }
                  if (stage === 'auth') {
                    setStage('enter-email');
                    setError(null);
                    return;
                  }
                  setStage('pick-method');
                  setError(null);
                }}
                aria-label="Back"
                className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[var(--lp-text-muted)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    d="M10 3L4 8l6 5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)] truncate">
              {stage === 'pick-method' && 'WELCOME'}
              {stage === 'enter-email' && 'EMAIL'}
              {stage === 'auth' && (plan?.exists ? 'SIGN IN' : 'CREATE ACCOUNT')}
            </p>
          </div>
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

        {/* Title block — fixed height keeps the modal from jumping between stages */}
        <div className="px-6 pt-2 pb-5">
          <h2 className="font-sans text-[22px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)] leading-tight">
            {stage === 'pick-method' && 'Sign in to Karwan'}
            {stage === 'enter-email' && "What's your email?"}
            {stage === 'auth' && plan?.exists && (otpSent ? 'Check your inbox' : 'Welcome back')}
            {stage === 'auth' && !plan?.exists && (otpSent ? 'Check your inbox' : 'Create your account')}
          </h2>
          <p className="mt-2 text-[13px] leading-snug text-[var(--lp-text-sub)] max-w-[36ch]">
            {stage === 'pick-method' && 'Karwan identifies you by a wallet. Pick a path. We provision the rest.'}
            {stage === 'enter-email' && "We'll check if you already have an account and pick the right sign-in path."}
            {stage === 'auth' && plan?.exists && !otpSent && (
              <>Signing in as <span className="mono text-[var(--lp-dark)]">{email}</span>.</>
            )}
            {stage === 'auth' && !plan?.exists && !otpSent && (
              <>Creating <span className="mono text-[var(--lp-dark)]">{email}</span>. Your wallet is provisioned automatically.</>
            )}
            {stage === 'auth' && otpSent && (
              <>Code sent to <span className="mono text-[var(--lp-dark)]">{email}</span>. Enter the 6 digits.</>
            )}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 space-y-4">
          {stage === 'pick-method' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setStage('enter-email');
                  setError(null);
                }}
                disabled={passkeyConfigured === false}
                className="w-full inline-flex items-center justify-between gap-3 px-5 py-[14px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
                style={{
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  borderBottomLeftRadius: 12,
                  borderBottomRightRadius: 3,
                }}
              >
                <span className="inline-flex items-center gap-2.5">
                  <EmailIcon />
                  Continue with email
                </span>
                <span aria-hidden>→</span>
              </button>
              {passkeyConfigured === false && (
                <p className="mono text-[11px] text-[#b25425] leading-snug">
                  Email login is not configured on this backend.
                </p>
              )}

              <div className="flex items-center gap-3 py-1">
                <span className="flex-1 h-px bg-[var(--lp-border-light)]" />
                <span className="mono text-[9px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                  OR
                </span>
                <span className="flex-1 h-px bg-[var(--lp-border-light)]" />
              </div>

              <ConnectButton.Custom>
                {({ openConnectModal, mounted }) => (
                  <button
                    type="button"
                    disabled={!mounted}
                    onClick={openConnectModal}
                    className="w-full inline-flex items-center justify-between gap-3 px-5 py-[14px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-transparent text-[var(--lp-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    style={{
                      border: '1px solid var(--lp-border-light)',
                      borderTopLeftRadius: 12,
                      borderTopRightRadius: 12,
                      borderBottomLeftRadius: 12,
                      borderBottomRightRadius: 3,
                    }}
                  >
                    <span className="inline-flex items-center gap-2.5">
                      <WalletIcon />
                      Connect a wallet
                    </span>
                    <span aria-hidden>→</span>
                  </button>
                )}
              </ConnectButton.Custom>
            </>
          )}

          {stage === 'enter-email' && (
            <form onSubmit={handleLookup} className="space-y-4">
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
                  autoFocus
                />
              </label>
              <button
                type="submit"
                disabled={busy || !email}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-[13px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
                style={{
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  borderBottomLeftRadius: 12,
                  borderBottomRightRadius: 3,
                }}
              >
                {busy ? 'Checking…' : 'Continue →'}
              </button>
            </form>
          )}

          {stage === 'auth' && plan && !otpSent && plan.pref === 'passkey' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={runPasskey}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-[14px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
                style={{
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  borderBottomLeftRadius: 12,
                  borderBottomRightRadius: 3,
                }}
              >
                <PasskeyIcon />
                {busy
                  ? plan.exists ? 'Verifying…' : 'Setting up…'
                  : plan.exists ? 'Sign in with Passkey' : 'Set up Passkey'}
              </button>
              <button
                type="button"
                onClick={sendOtp}
                disabled={busy}
                className="w-full mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] underline underline-offset-2 disabled:opacity-50 transition-colors"
              >
                Use an email code instead
              </button>
            </div>
          )}

          {stage === 'auth' && plan && !otpSent && plan.pref === 'otp' && (
            <div className="space-y-3">
              {!plan.supportsWebAuthn && (
                <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-snug">
                  This browser doesn't support passkeys.
                </p>
              )}
              <button
                type="button"
                onClick={sendOtp}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-[14px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
                style={{
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  borderBottomLeftRadius: 12,
                  borderBottomRightRadius: 3,
                }}
              >
                <EmailIcon />
                {busy ? 'Sending…' : 'Send a code'}
              </button>
              {plan.supportsWebAuthn && plan.exists && !plan.hasPasskey && (
                <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-snug">
                  No passkey on this account yet. Sign in with a code, set one up after.
                </p>
              )}
            </div>
          )}

          {stage === 'auth' && otpSent && (
            <form onSubmit={verifyOtp} className="space-y-4">
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
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
                    background: 'rgba(175, 201, 91,0.12)',
                    border: '1px dashed rgba(175, 201, 91,0.55)',
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
                        background: 'var(--lp-band-dark)',
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
                  onClick={sendOtp}
                  disabled={busy}
                  className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] underline underline-offset-2 disabled:opacity-50"
                >
                  Resend
                </button>
                <button
                  type="submit"
                  disabled={busy || otpCode.length !== 6}
                  className="inline-flex items-center gap-2 px-5 py-[12px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
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
      </div>
    </div>,
    document.body,
  );
}

function EmailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 4.5l5.5 4 5.5-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 7h12M10 10h1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PasskeyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M11 8l3 3-1.5 1.5L11 11l-1.5 1.5L8 11l3-3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
