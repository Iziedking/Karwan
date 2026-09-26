'use client';

import { useEffect, useState } from 'react';
import { useConnect } from 'wagmi';
import { api } from '@/core/api';
import { useSiwe } from '@/shared/hooks/useSiwe';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { PASSKEY_CONNECTOR_ID } from '../connector';
import { holdEmailProof, clearEmailProof } from '../pendingEmail';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = 'start' | 'code' | 'create';

function isCancel(error: unknown): boolean {
  const e = error as { name?: string; message?: string };
  return e?.name === 'NotAllowedError' || e?.name === 'AbortError' || /cancel|not allowed/i.test(e?.message ?? '');
}

/// Email sign-in where the user holds the key: the email is confirmed with a
/// code, then a passkey on this device creates and owns a Circle smart account.
/// Returning users only need the passkey.
export function PasskeySignIn({ onStart }: { onStart: () => void }) {
  const t = useTranslations().auth.modal.pickMethod;
  const siwe = useSiwe();
  const { connectors, connectAsync } = useConnect();
  const [step, setStep] = useState<Step>('start');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'passkey' | 'send' | 'confirm'>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  // iOS shows the passkey sheet only close to the tap, so have the SDK loaded
  // before it. Circle's options request still sits in between; that part is
  // the SDK's and cannot be moved.
  useEffect(() => {
    void import('../passkey');
    void import('@circle-fin/modular-wallets-core');
  }, []);

  async function connectWith(mode: 'register' | 'login') {
    setError(null);
    setBusy('passkey');
    setAttempted(true);
    onStart();
    try {
      const { obtainPasskey } = await import('../passkey');
      await obtainPasskey(mode, mode === 'register' ? email.trim().toLowerCase() : undefined);
      const connector = connectors.find((c) => c.id === PASSKEY_CONNECTOR_ID);
      if (!connector) throw new Error('passkey connector missing');
      const { accounts } = await connectAsync({ connector });
      if (accounts[0]) await siwe.signInAs(accounts[0]);
    } catch (err) {
      if (!isCancel(err)) console.warn('passkey sign-in failed', err);
      setError(isCancel(err) ? t.passkeyCancelled : t.passkeyFailed);
    } finally {
      setBusy(null);
    }
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return;
    setError(null);
    setBusy('send');
    try {
      await api.authOtpRequest(email.trim().toLowerCase());
      setStep('code');
    } catch {
      setError(t.passkeyFailed);
    } finally {
      setBusy(null);
    }
  }

  async function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy('confirm');
    try {
      const res = await api.authOtpVerify(email.trim().toLowerCase(), code.trim());
      if (!('emailProof' in res)) throw new Error('unexpected sign-in response');
      holdEmailProof(res.emailProof);
      setStep('create');
    } catch {
      setError(t.passkeyCodeFailed);
    } finally {
      setBusy(null);
    }
  }

  const siweMessage =
    attempted && siwe.state === 'error'
      ? siwe.error === 'email-in-use'
        ? t.passkeyEmailInUse
        : siwe.error === 'email-expired'
          ? t.passkeyEmailExpired
          : siwe.error === 'cancelled'
            ? t.passkeyCancelled
            : t.walletRetry
      : null;
  const shown = error ?? siweMessage;
  const signingIn = siwe.state === 'awaiting-signature' || siwe.state === 'verifying' || siwe.state === 'checking-session';

  const primary =
    'w-full inline-flex min-h-[52px] items-center justify-center gap-2 px-5 py-[13px] text-[15px] font-semibold bg-[var(--lp-accent)] text-[var(--accent-ink)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
  const secondary =
    'w-full inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-[var(--lp-outline-strong)] bg-transparent px-5 py-[13px] text-[15px] font-semibold text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-workspace-soft)] disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="space-y-4">
      {step === 'start' && (
        <>
          <button
            type="button"
            data-auth-primary
            className={primary}
            style={{ borderRadius: 12 }}
            disabled={!!busy || signingIn}
            onClick={() => void connectWith('login')}
          >
            {busy === 'passkey' || signingIn ? t.passkeyWaiting : `${t.passkeySignIn} →`}
          </button>
          <form onSubmit={sendCode} className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.passkeyNewHere}</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!busy}
                className="form-input min-h-[52px]"
              />
            </label>
            <button type="submit" className={secondary} disabled={!!busy || !EMAIL_RE.test(email.trim())}>
              {busy === 'send' ? t.passkeySending : t.passkeySendCode}
            </button>
          </form>
        </>
      )}

      {step === 'code' && (
        <form onSubmit={confirmCode} className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.passkeyCodeLabel}</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              disabled={!!busy}
              className="form-input mono min-h-[52px] tracking-[0.3em]"
              autoFocus
            />
          </label>
          <button type="submit" data-auth-primary className={primary} style={{ borderRadius: 12 }} disabled={!!busy || code.length !== 6}>
            {busy === 'confirm' ? t.passkeyConfirming : t.passkeyConfirm}
          </button>
        </form>
      )}

      {step === 'create' && (
        <div className="space-y-3">
          <p className="text-[14px] leading-snug text-[var(--lp-text-sub)]">{t.passkeyCreateHint}</p>
          <button
            type="button"
            data-auth-primary
            className={primary}
            style={{ borderRadius: 12 }}
            disabled={!!busy || signingIn}
            onClick={() => void connectWith('register')}
          >
            {busy === 'passkey' || signingIn ? t.passkeyWaiting : t.passkeyCreate}
          </button>
        </div>
      )}

      {shown && (
        <p role="alert" className="border-s border-[var(--neg)] ps-3 text-[14px] leading-snug text-[var(--lp-critical)]">
          {shown}
        </p>
      )}
      {siwe.error === 'email-expired' && step !== 'start' && (
        <button
          type="button"
          className="text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4"
          onClick={() => {
            clearEmailProof();
            setCode('');
            setStep('start');
          }}
        >
          {t.passkeySendCode}
        </button>
      )}
    </div>
  );
}
