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
import { useTranslations } from '@/shared/i18n/LocaleProvider';

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
  const tAll = useTranslations();
  const t = tAll.auth.modal;
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
  // modal is open or closed, otherwise opening it runs extra hooks and React
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
      setError(t.errors.invalidEmail);
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
      setError(detail || t.errors.lookupFailed);
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
      // Close optimistically. Verify returned 200, so the cookie is set and the
      // user is signed in. Awaiting refresh() here would hang the modal on
      // mobile in-app browsers where /api/auth/me sometimes never resolves.
      // emitAuthChanged broadcasts to every useAuth instance so they refresh
      // in the background; this modal's local refresh is fire-and-forget.
      emitAuthChanged();
      void refresh();
      onClose();
    } catch (err) {
      // The pre-fetched challenge is single-use; warm a fresh one for the retry.
      void prefetchPasskey();
      const e = err as Error & { name?: string };
      if (e.name === 'NotAllowedError' || /timed out|not allowed/i.test(e.message ?? '')) {
        setError(
          plan.exists
            ? t.errors.passkeyCancelledSignIn
            : t.errors.passkeyCancelledCreate,
        );
      } else {
        const detail =
          err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
        setError(detail || t.errors.passkeyGeneric);
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
      // Only ever surface the dev autofill chip on localhost. The backend
      // gates devCode on isDev() && !delivered, but if NODE_ENV is misconfigured
      // on a deployed environment that gate fails open. Hostname check makes
      // the UI strictly local-only.
      const isLocalhost =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1');
      setOtpDevHint(isLocalhost ? r.devCode ?? null : null);
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message;
      setError(detail || t.errors.otpSendFailed);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const code = otpCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setError(t.errors.codeMustBeSixDigits);
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
      setError(detail || t.errors.codeRejected);
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
        aria-label={t.aria.dialog}
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
                aria-label={t.aria.back}
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
              {stage === 'pick-method' && t.eyebrow.welcome}
              {stage === 'enter-email' && t.eyebrow.email}
              {stage === 'auth' && (plan?.exists ? t.eyebrow.signIn : t.eyebrow.createAccount)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label={t.aria.close}
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

        {/* Title block, fixed height keeps the modal from jumping between stages */}
        <div className="px-6 pt-2 pb-5">
          <h2 className="font-sans text-[22px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)] leading-tight">
            {stage === 'pick-method' && t.title.signIn}
            {stage === 'enter-email' && t.title.askEmail}
            {stage === 'auth' && plan?.exists && (otpSent ? t.title.checkInbox : t.title.welcomeBack)}
            {stage === 'auth' && !plan?.exists && (otpSent ? t.title.checkInbox : t.title.createAccount)}
          </h2>
          <p className="mt-2 text-[13px] leading-snug text-[var(--lp-text-sub)] max-w-[36ch]">
            {stage === 'pick-method' && t.subtitle.pickMethod}
            {stage === 'enter-email' && t.subtitle.lookup}
            {stage === 'auth' && plan?.exists && !otpSent && (
              <>{t.subtitle.signingInAs} <span className="mono text-[var(--lp-dark)]">{email}</span>.</>
            )}
            {stage === 'auth' && !plan?.exists && !otpSent && (
              <><span className="mono text-[var(--lp-dark)]">{email}</span>. {t.subtitle.creatingAccount}</>
            )}
            {stage === 'auth' && otpSent && (
              <><span className="mono text-[var(--lp-dark)]">{email}</span>. {t.subtitle.codeSentTo}</>
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
                  {t.pickMethod.continueEmail}
                </span>
                <span aria-hidden>→</span>
              </button>
              {passkeyConfigured === false && (
                <p className="mono text-[11px] text-[#b25425] leading-snug">
                  {t.pickMethod.emailNotConfigured}
                </p>
              )}

              <div className="flex items-center gap-3 py-1">
                <span className="flex-1 h-px bg-[var(--lp-border-light)]" />
                <span className="mono text-[9px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                  {t.pickMethod.or}
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
                      {t.pickMethod.connectWallet}
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
                  {t.enterEmail.label}
                </span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email webauthn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  placeholder={t.enterEmail.placeholder}
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
                {busy ? t.enterEmail.submitBusy : `${t.enterEmail.submit} →`}
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
                  ? plan.exists ? t.authStep.passkeyVerifying : t.authStep.passkeySettingUp
                  : plan.exists ? t.authStep.passkeySignIn : t.authStep.passkeyCreate}
              </button>
              <button
                type="button"
                onClick={sendOtp}
                disabled={busy}
                className="w-full mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] underline underline-offset-2 disabled:opacity-50 transition-colors"
              >
                {t.authStep.useCodeInstead}
              </button>
            </div>
          )}

          {stage === 'auth' && plan && !otpSent && plan.pref === 'otp' && (
            <div className="space-y-3">
              {!plan.supportsWebAuthn && (
                <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-snug">
                  {t.authStep.noWebAuthnHint}
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
                {busy ? t.authStep.sendingCode : t.authStep.sendCode}
              </button>
              {plan.supportsWebAuthn && plan.exists && !plan.hasPasskey && (
                <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-snug">
                  {t.authStep.noPasskeyHint}
                </p>
              )}
            </div>
          )}

          {stage === 'auth' && otpSent && (
            <form onSubmit={verifyOtp} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                  {t.otp.label}
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
                  className="form-input mono text-[18px] tabular-nums tracking-[0.4em]"
                  autoFocus
                />
              </label>
              {otpDevHint && (
                <button
                  type="button"
                  onClick={() => setOtpCode(otpDevHint)}
                  className="group w-full inline-flex items-center justify-between gap-2 px-3 py-2 text-start transition-colors"
                  style={{
                    background: 'rgba(175, 201, 91,0.12)',
                    border: '1px dashed rgba(175, 201, 91,0.55)',
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                    borderBottomLeftRadius: 8,
                    borderBottomRightRadius: 2,
                  }}
                  title={t.otp.devTooltip}
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
                      {t.otp.devChip}
                    </span>
                    <span className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
                      {t.otp.devTapToAutofill}
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
                  {t.otp.resend}
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
                  {busy ? t.otp.verifyBusy : `${t.otp.verify} →`}
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
