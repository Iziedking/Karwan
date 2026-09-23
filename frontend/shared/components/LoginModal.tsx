'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { api } from '@/core/api';
import { useAuth, emitAuthChanged } from '@/shared/hooks/useAuth';
import { useSiwe } from '@/shared/hooks/useSiwe';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { postAuthDestination } from '@/shared/auth/postAuthRoute';
import { MODULAR_WALLETS_ENABLED } from '@/features/modularWallet/config';
import { PasskeySignIn } from '@/features/modularWallet/components/PasskeySignIn';
import { PASSKEY_CONNECTOR_ID } from '@/features/modularWallet/connector';

interface Props {
  open: boolean;
  onClose: () => void;
  postAuthHref?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/// One entry screen: email lookup selects the right code/passkey path; wallet
/// sign-in keeps the existing SIWE flow. No new/returning guess is required.
type Stage = 'enter-email' | 'auth';

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

export function LoginModal({ open, onClose, postAuthHref = '/app' }: Props) {
  const { refresh, isAuthenticated } = useAuth();
  const { address: walletAddress, isConnected: walletConnected, connector: walletConnector } = useAccount();
  const passkeyConnected = walletConnector?.id === PASSKEY_CONNECTOR_ID;
  const siwe = useSiwe();
  const router = useRouter();
  const tAll = useTranslations();
  const t = tAll.auth.modal;
  const [stage, setStage] = useState<Stage>('enter-email');
  const [entryStarted, setEntryStarted] = useState(false);
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  const routedAuthRef = useRef(false);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Feedback is intentionally absent during identity work. The dialog is a
  // portal, so a document marker lets the global nudge stand down even when it
  // became eligible before the visitor opened sign in.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-auth-dialog', 'open');
    return () => root.removeAttribute('data-auth-dialog');
  }, [open]);

  useEffect(() => {
    if (open || typeof document === 'undefined') return;
    const rememberFocus = () => {
      if (document.activeElement instanceof HTMLElement) {
        openerRef.current = document.activeElement;
      }
    };
    rememberFocus();
    document.addEventListener('focusin', rememberFocus);
    return () => document.removeEventListener('focusin', rememberFocus);
  }, [open]);

  // Reset when the modal opens.
  useEffect(() => {
    if (!open) return;
    setStage('enter-email');
    setEntryStarted(false);
    routedAuthRef.current = false;
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
      // A network failure is not proof that email sign-in is unavailable.
      // Leave the method enabled and let its own request show a recovery state.
      .catch(() => setPasskeyConfigured(null));
  }, [open]);

  // Route only after the backend has resolved both identity and profile. The
  // verified account state, not a visitor's guess, selects onboarding or home.
  useEffect(() => {
    if (!open || !entryStarted || !isAuthenticated || routedAuthRef.current) return;
    routedAuthRef.current = true;
    let cancelled = false;
    void (async () => {
      let profileExists = true;
      try {
        const bootstrap = await api.bootstrap();
        profileExists = !!bootstrap.profile;
      } catch {
        // Deploy-order skew can leave bootstrap unavailable. `/app` retains its
        // own profile gate, so continuing there is the safe fallback.
        profileExists = true;
      }
      if (cancelled) return;
      const accountExists = plan ? plan.exists : profileExists;
      const outcome = postAuthDestination({
        intent: accountExists ? 'returning' : 'new',
        accountExists,
        profileExists,
        requestedHref: postAuthHref,
      });
      if (outcome.kind !== 'continue') return;
      onClose();
      if (outcome.destination) router.push(outcome.destination);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, entryStarted, isAuthenticated, onClose, plan, postAuthHref, router]);

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

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const previous =
      openerRef.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
      window.requestAnimationFrame(() => {
        if (previous?.isConnected) previous.focus();
      });
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const focusTimer = window.setTimeout(() => {
      const target = dialogRef.current?.querySelector<HTMLElement>(
        '[data-auth-primary]:not([disabled]), input:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      target?.focus();
    }, 50);
    return () => window.clearTimeout(focusTimer);
  }, [open, stage, otpSent, passkeyConfigured]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const walletProofInProgress =
    siwe.state === 'checking-session' ||
    siwe.state === 'switching-network' ||
    siwe.state === 'awaiting-signature' ||
    siwe.state === 'verifying';
  const walletActionLabel = (() => {
    if (!walletConnected || !walletAddress) return t.pickMethod.connectWallet;
    if (siwe.state === 'checking-session') return t.pickMethod.preparingWallet;
    if (siwe.state === 'switching-network') return t.pickMethod.switchingWallet;
    if (siwe.state === 'awaiting-signature') return t.pickMethod.checkWallet;
    if (siwe.state === 'verifying') return t.pickMethod.verifyingWallet;
    return t.pickMethod.continueWallet;
  })();

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
        // A brand-new email always goes through the emailed code first. A
        // passkey binds a credential to an address, and until the code comes
        // back there is nothing showing the person typing it owns that address.
        // Once they are in, they can add a passkey from the profile.
        if (!r.exists) return 'otp';
        if (r.exists && !r.hasPasskey) return 'otp';
        return 'passkey';
      })();
      setEmail(trimmed);
      setPlan({ exists: r.exists, hasPasskey: r.hasPasskey, supportsWebAuthn, pref });
      setEntryStarted(true);
      setStage('auth');
    } catch {
      setError(t.errors.lookupFailed);
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
      emitAuthChanged();
      await refresh();
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
      } else setError(t.errors.passkeyGeneric);
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
    } catch {
      setError(t.errors.otpSendFailed);
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
      emitAuthChanged();
      await refresh();
    } catch {
      setError(t.errors.codeRejected);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="auth-capsule-backdrop fixed inset-0 z-[100] flex items-end justify-center overflow-hidden sm:items-center sm:p-6"
      style={{ background: 'rgba(14,14,14,0.65)' }}
      onClick={() => !busy && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.aria.dialog}
        aria-labelledby="karwan-auth-title"
        aria-describedby="karwan-auth-description"
        onClick={(e) => e.stopPropagation()}
        className="auth-capsule auth-capsule-choice max-h-[94dvh] w-full overflow-y-auto rounded-t-[24px] border border-[var(--lp-outline-strong)] bg-[var(--lp-card)] shadow-[var(--shadow-pop)] sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:w-[min(620px,calc(100vw-48px))] sm:rounded-[16px]"
        style={{
          overscrollBehavior: 'contain',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4 sm:px-6 sm:pt-6">
          <div className="flex items-center gap-2 min-w-0">
            {stage === 'auth' && (
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
                  setStage('enter-email');
                  setError(null);
                }}
                aria-label={t.aria.back}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--lp-text-muted)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] transition-colors"
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
            <p className="truncate text-[13px] font-semibold text-[var(--lp-text-sub)]">
              {stage === 'enter-email' && t.eyebrow.signIn}
              {stage === 'auth' && (plan?.exists ? t.eyebrow.signIn : t.eyebrow.createAccount)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label={t.aria.close}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--lp-text-muted)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] transition-colors"
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
        <div className="px-5 pb-4 pt-1 sm:px-6 sm:pb-5 sm:pt-2">
          <h2 id="karwan-auth-title" className="font-sans text-[28px] font-bold leading-[1.1] tracking-[-0.035em] text-[var(--lp-dark)] sm:text-[32px]">
            {stage === 'enter-email' && t.title.choosePath}
            {stage === 'auth' && plan?.exists && (otpSent ? t.title.checkInbox : t.title.welcomeBack)}
            {stage === 'auth' && !plan?.exists && (otpSent ? t.title.checkInbox : t.title.createAccount)}
          </h2>
          <p id="karwan-auth-description" className="mt-3 max-w-[48ch] text-[16px] leading-[1.5] text-[var(--lp-text-sub)]">
            {stage === 'enter-email' && t.subtitle.choosePath}
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
        <div className="space-y-3.5 px-5 pb-5 sm:space-y-4 sm:px-6 sm:pb-6">
          {stage === 'enter-email' && (
            <div className="space-y-4">
            {MODULAR_WALLETS_ENABLED ? (
              <PasskeySignIn onStart={() => setEntryStarted(true)} />
            ) : (
            <>
            <form onSubmit={handleLookup} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-[14px] font-semibold text-[var(--lp-dark)]">
                  {t.enterEmail.label}
                </span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email webauthn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy || passkeyConfigured === false}
                  placeholder={t.enterEmail.placeholder}
                  className="form-input min-h-[52px]"
                  autoFocus
                />
              </label>
              <button
                type="submit"
                disabled={busy || !email || passkeyConfigured === false}
                className="auth-email-continue w-full inline-flex min-h-[52px] items-center justify-center gap-2 px-5 py-[13px] text-[15px] font-semibold bg-[var(--lp-accent)] text-[var(--accent-ink)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{
                  borderRadius: 12,
                }}
              >
                {busy ? t.enterEmail.submitBusy : `${t.enterEmail.submit} →`}
              </button>
            </form>
            {passkeyConfigured === false && (
              <p className="text-[14px] leading-snug text-[var(--lp-critical)]">
                {t.pickMethod.emailNotConfigured}
              </p>
            )}
            </>
            )}
            <div className="flex items-center gap-3 py-1" aria-hidden>
              <span className="h-px flex-1 bg-[var(--lp-outline-strong)]" />
              <span className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{t.pickMethod.or}</span>
              <span className="h-px flex-1 bg-[var(--lp-outline-strong)]" />
            </div>
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => (
                <button
                  type="button"
                  disabled={!mounted || walletProofInProgress}
                  onClick={() => {
                    setError(null);
                    setEntryStarted(true);
                    if (walletConnected && walletAddress) {
                      void siwe.promptSign();
                    } else {
                      openConnectModal();
                    }
                  }}
                  className="inline-flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border border-[var(--lp-outline-strong)] bg-transparent px-5 py-[14px] text-[15px] font-semibold text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-workspace-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <WalletIcon />
                    {walletActionLabel}
                  </span>
                  <span aria-hidden>→</span>
                </button>
              )}
            </ConnectButton.Custom>
            {walletConnected && !passkeyConnected && siwe.state === 'error' && (
              <p className="border-s border-[var(--neg)] ps-3 text-[14px] leading-snug text-[var(--lp-critical)]">
                {siwe.error === 'wrong-network' ? t.pickMethod.walletWrongNetwork : t.pickMethod.walletRetry}
              </p>
            )}
            </div>
          )}

          {stage === 'auth' && plan && !otpSent && plan.pref === 'passkey' && (
            <div className="space-y-3">
              <button
                type="button"
                data-auth-primary
                onClick={runPasskey}
                disabled={busy}
                className="w-full inline-flex min-h-11 items-center justify-center gap-2.5 px-5 py-[14px] text-[14px] font-semibold bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
                style={{
                  borderRadius: 12,
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
                className="inline-flex min-h-11 w-full items-center justify-center mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] underline underline-offset-2 disabled:opacity-50 transition-colors"
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
                data-auth-primary
                onClick={sendOtp}
                disabled={busy}
                className="w-full inline-flex min-h-11 items-center justify-center gap-2.5 px-5 py-[14px] text-[14px] font-semibold bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
                style={{
                  borderRadius: 12,
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
                  className="group w-full inline-flex min-h-11 items-center justify-between gap-2 px-3 py-2 text-start transition-colors"
                  style={{
                    background: 'rgba(175, 201, 91,0.12)',
                    border: '1px dashed rgba(175, 201, 91,0.55)',
                    borderRadius: 8,
                  }}
                  aria-label={`${t.otp.devTapToAutofill} ${otpDevHint}`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="mono text-[9px] font-bold uppercase tracking-[0.18em] px-1.5 py-[2px]"
                      style={{
                        background: 'var(--lp-band-dark)',
                        color: 'var(--lp-accent)',
                        borderRadius: 3,
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
                  className="inline-flex min-h-11 items-center mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] underline underline-offset-2 disabled:opacity-50"
                >
                  {t.otp.resend}
                </button>
                <button
                  type="submit"
                  disabled={busy || otpCode.length !== 6}
                  className="inline-flex min-h-11 items-center gap-2 px-5 py-[12px] text-[14px] font-semibold bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
                  style={{
                    borderRadius: 12,
                  }}
                >
                  {busy ? t.otp.verifyBusy : `${t.otp.verify} →`}
                </button>
              </div>
            </form>
          )}

          {error && (
            <p className="text-[13px] leading-snug text-[var(--lp-critical)]">{error}</p>
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
