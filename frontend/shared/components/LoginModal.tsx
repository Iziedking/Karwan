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
import {
  postAuthDestination,
  type AuthEntryIntent,
} from '@/shared/auth/postAuthRoute';

interface Props {
  open: boolean;
  onClose: () => void;
  postAuthHref?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/// One intent-led flow:
///   1. choose-path  -> New here or returning
///   2. pick-method  -> Email or Wallet
///   3. enter-email  -> user types email, we look up account + passkey state
///   4. auth         -> passkey ceremony OR email code, decided by lookup
type Stage = 'choose-path' | 'pick-method' | 'enter-email' | 'auth' | 'intent-mismatch';
type IntentMismatch = 'needs-create' | 'needs-sign-in';

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
  const { address: walletAddress, isConnected: walletConnected } = useAccount();
  const siwe = useSiwe();
  const router = useRouter();
  const tAll = useTranslations();
  const t = tAll.auth.modal;
  const [stage, setStage] = useState<Stage>('choose-path');
  const [entryIntent, setEntryIntent] = useState<AuthEntryIntent | null>(null);
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<AuthPlan | null>(null);
  const [intentMismatch, setIntentMismatch] = useState<IntentMismatch | null>(null);
  const [resolvedIdentity, setResolvedIdentity] = useState<{
    accountExists: boolean;
    profileExists: boolean;
  } | null>(null);
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
    setStage('choose-path');
    setEntryIntent(null);
    routedAuthRef.current = false;
    setEmail('');
    setPlan(null);
    setIntentMismatch(null);
    setResolvedIdentity(null);
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
  // visitor's New/Returning choice shapes the flow, but it is never treated as
  // account truth: a missing profile always enters onboarding and an existing
  // profile always continues without exposing a destructive create path.
  useEffect(() => {
    if (!open || !isAuthenticated || !entryIntent || routedAuthRef.current) return;
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
        intent: entryIntent,
        accountExists,
        profileExists,
        requestedHref: postAuthHref,
      });
      if (outcome.kind !== 'continue') {
        setResolvedIdentity({ accountExists, profileExists });
        setIntentMismatch(outcome.kind);
        setStage('intent-mismatch');
        return;
      }
      onClose();
      if (outcome.destination) router.push(outcome.destination);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isAuthenticated, entryIntent, onClose, plan, postAuthHref, router]);

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
    siwe.state === 'awaiting-signature' ||
    siwe.state === 'verifying';
  const walletActionLabel = (() => {
    if (!walletConnected || !walletAddress) return t.pickMethod.connectWallet;
    if (siwe.state === 'checking-session') return t.pickMethod.preparingWallet;
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

  function continueFromMismatch() {
    if (!intentMismatch || !resolvedIdentity) return;
    const correctedIntent: AuthEntryIntent =
      intentMismatch === 'needs-create' ? 'new' : 'returning';
    const outcome = postAuthDestination({
      intent: correctedIntent,
      accountExists: resolvedIdentity.accountExists,
      profileExists: resolvedIdentity.profileExists,
      requestedHref: postAuthHref,
    });
    if (outcome.kind !== 'continue') return;
    onClose();
    if (outcome.destination) router.push(outcome.destination);
  }

  return createPortal(
    <div
      className="auth-capsule-backdrop fixed inset-0 z-[100] flex items-center justify-center overflow-hidden p-3 sm:p-6"
      style={{ background: 'rgba(14,14,14,0.65)', backdropFilter: 'blur(4px)' }}
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
        className={`auth-capsule w-full max-h-[calc(100dvh-24px)] overflow-y-auto border border-[var(--lp-border-light)] bg-[var(--lp-card)] shadow-[0_28px_90px_-34px_rgba(0,0,0,0.62)] ${
          stage === 'choose-path'
            ? 'auth-capsule-choice max-w-[390px] rounded-[28px] md:max-w-[920px] md:rounded-[76px]'
            : 'max-w-[620px] rounded-[32px] md:rounded-[48px]'
        }`}
        style={{
          overscrollBehavior: 'contain',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4 sm:px-6 sm:pt-6">
          <div className="flex items-center gap-2 min-w-0">
            {stage !== 'choose-path' && stage !== 'intent-mismatch' && (
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
                  if (stage === 'enter-email') {
                    setStage('pick-method');
                    setError(null);
                    return;
                  }
                  setStage('choose-path');
                  setEntryIntent(null);
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
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)] truncate">
              {(stage === 'choose-path' || stage === 'pick-method') && t.eyebrow.welcome}
              {stage === 'enter-email' && t.eyebrow.email}
              {stage === 'auth' && (plan?.exists ? t.eyebrow.signIn : t.eyebrow.createAccount)}
              {stage === 'intent-mismatch' &&
                (intentMismatch === 'needs-create' ? t.eyebrow.createAccount : t.eyebrow.signIn)}
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
          <h2 id="karwan-auth-title" className="font-sans text-[23px] font-extrabold leading-[1.08] tracking-[-0.025em] text-[var(--lp-dark)] sm:text-[26px]">
            {stage === 'choose-path' && t.title.choosePath}
            {stage === 'pick-method' &&
              (entryIntent === 'new' ? t.title.createAccount : t.title.signIn)}
            {stage === 'enter-email' && t.title.askEmail}
            {stage === 'auth' && plan?.exists && (otpSent ? t.title.checkInbox : t.title.welcomeBack)}
            {stage === 'auth' && !plan?.exists && (otpSent ? t.title.checkInbox : t.title.createAccount)}
            {stage === 'intent-mismatch' && intentMismatch === 'needs-create' && t.mismatch.needsCreateTitle}
            {stage === 'intent-mismatch' && intentMismatch === 'needs-sign-in' && t.mismatch.needsSignInTitle}
          </h2>
          <p id="karwan-auth-description" className="mt-2 max-w-[38ch] text-[13px] leading-relaxed text-[var(--lp-text-sub)] sm:text-[14px]">
            {stage === 'choose-path' && t.subtitle.choosePath}
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
            {stage === 'intent-mismatch' && intentMismatch === 'needs-create' && t.mismatch.needsCreateBody}
            {stage === 'intent-mismatch' && intentMismatch === 'needs-sign-in' && t.mismatch.needsSignInBody}
          </p>
        </div>

        {/* Body */}
        <div className="space-y-3.5 px-5 pb-5 sm:space-y-4 sm:px-6 sm:pb-6">
          {stage === 'choose-path' && (
            <div className="grid gap-2.5 md:grid-cols-2 md:gap-4">
              <button
                type="button"
                data-auth-primary
                onClick={() => {
                  setEntryIntent('new');
                  setStage('pick-method');
                  setError(null);
                }}
                className="group min-h-[146px] w-full border border-[var(--lp-accent-hover)] bg-[var(--lp-accent)] px-5 py-5 text-start text-[var(--lp-band-dark)] transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-band-dark)] focus-visible:ring-offset-2 md:min-h-[178px] md:px-7 md:py-6"
                style={{ borderRadius: 24 }}
              >
                <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-band-dark)]/70">
                  [:01:]
                </span>
                <span className="mt-2.5 flex items-center justify-between gap-4 md:mt-3">
                  <span>
                    <span className="block font-sans text-[17px] font-extrabold tracking-[-0.02em] sm:text-[18px]">
                      {t.entry.newUser}
                    </span>
                    <span className="mt-1 block max-w-[34ch] text-[12px] leading-relaxed text-black/65 sm:mt-1.5 sm:text-[13px]">
                      {t.entry.newUserBody}
                    </span>
                  </span>
                  <span aria-hidden className="text-[18px] text-[var(--lp-band-dark)] transition-transform group-hover:translate-x-1">→</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryIntent('returning');
                  setStage('pick-method');
                  setError(null);
                }}
                className="group min-h-[146px] w-full border border-[var(--lp-border-light)] bg-white px-5 py-5 text-start text-[#0a0a0b] transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-[#0a0a0b] hover:bg-[#f4f4f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 md:min-h-[178px] md:px-7 md:py-6"
                style={{ borderRadius: 24 }}
              >
                <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
                  [:02:]
                </span>
                <span className="mt-2.5 flex items-center justify-between gap-4 md:mt-3">
                  <span>
                    <span className="block font-sans text-[17px] font-extrabold tracking-[-0.02em] sm:text-[18px]">
                      {t.entry.returningUser}
                    </span>
                    <span className="mt-1 block max-w-[34ch] text-[12px] leading-relaxed text-[#5a5a57] sm:mt-1.5 sm:text-[13px]">
                      {t.entry.returningUserBody}
                    </span>
                  </span>
                  <span aria-hidden className="text-[18px] transition-transform group-hover:translate-x-1">→</span>
                </span>
              </button>
            </div>
          )}
          {stage === 'pick-method' && (
            <>
              <button
                type="button"
                data-auth-primary
                autoFocus={passkeyConfigured !== false}
                onClick={() => {
                  setStage('enter-email');
                  setError(null);
                }}
                disabled={passkeyConfigured === false}
                className="w-full inline-flex min-h-11 items-center justify-between gap-3 px-5 py-[14px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
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
                    data-auth-primary={passkeyConfigured === false ? true : undefined}
                    autoFocus={passkeyConfigured === false}
                    disabled={!mounted || walletProofInProgress}
                    onClick={() => {
                      setError(null);
                      if (walletConnected && walletAddress) {
                        void siwe.promptSign();
                      } else {
                        openConnectModal();
                      }
                    }}
                    className="w-full inline-flex min-h-11 items-center justify-between gap-3 px-5 py-[14px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-transparent text-[var(--lp-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                      {walletActionLabel}
                    </span>
                    <span aria-hidden>→</span>
                  </button>
                )}
              </ConnectButton.Custom>
              {walletConnected && siwe.state === 'error' && (
                <p className="border-s border-[var(--neg)] ps-3 mono text-[10px] uppercase tracking-[0.08em] text-[var(--lp-text-muted)]">
                  {t.pickMethod.walletRetry}
                </p>
              )}
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
                className="w-full inline-flex min-h-11 items-center justify-center gap-2 px-5 py-[13px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
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
                data-auth-primary
                onClick={runPasskey}
                disabled={busy}
                className="w-full inline-flex min-h-11 items-center justify-center gap-2.5 px-5 py-[14px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
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
                className="w-full inline-flex min-h-11 items-center justify-center gap-2.5 px-5 py-[14px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
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
                  className="group w-full inline-flex min-h-11 items-center justify-between gap-2 px-3 py-2 text-start transition-colors"
                  style={{
                    background: 'rgba(175, 201, 91,0.12)',
                    border: '1px dashed rgba(175, 201, 91,0.55)',
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                    borderBottomLeftRadius: 8,
                    borderBottomRightRadius: 2,
                  }}
                  aria-label={`${t.otp.devTapToAutofill} ${otpDevHint}`}
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
                  className="inline-flex min-h-11 items-center mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] underline underline-offset-2 disabled:opacity-50"
                >
                  {t.otp.resend}
                </button>
                <button
                  type="submit"
                  disabled={busy || otpCode.length !== 6}
                  className="inline-flex min-h-11 items-center gap-2 px-5 py-[12px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:shadow-[0_4px_0_rgba(0,0,0,0.18)] active:shadow-[0_1px_0_rgba(0,0,0,0.18)]"
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

          {stage === 'intent-mismatch' && intentMismatch && (
            <div className="rounded-[24px] border border-[var(--lp-border-light)] bg-[var(--lp-light)] p-4 sm:p-5">
              <div className="mb-5 flex items-start gap-3">
                <span
                  className="mt-1 inline-flex h-3 w-3 shrink-0 rounded-full bg-[var(--lp-accent)] shadow-[0_0_0_6px_rgba(175,201,91,0.16)]"
                  aria-hidden
                />
                <p className="text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
                  {intentMismatch === 'needs-create'
                    ? t.mismatch.needsCreateNote
                    : t.mismatch.needsSignInNote}
                </p>
              </div>
              <button
                type="button"
                data-auth-primary
                onClick={continueFromMismatch}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--lp-band-dark)] px-6 py-3 mono text-[12px] font-semibold uppercase tracking-[0.08em] text-white transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
              >
                {intentMismatch === 'needs-create'
                  ? t.mismatch.createAccount
                  : t.mismatch.signIn}
                <span aria-hidden>→</span>
              </button>
            </div>
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
