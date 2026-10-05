'use client';

import { useState } from 'react';
import type { Hex } from 'viem';
import { api, ApiError } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { EmailSuggestion } from '@/shared/components/EmailSuggestion';
import { deriveVerifier, unlockRecoveryKey, WrongPasswordError, type KdfParams } from '../crypto';

type Step = 'email' | 'code' | 'password' | 'waiting' | 'tooEarly' | 'neverOn' | 'locked' | 'ready' | 'working' | 'done';
type Released = { kdf: KdfParams; iv: string; blob: string; walletAddress: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/// Lost passkey: email, code, recovery password, then a 48-hour wait the
/// owner can cancel. Coming back after the wait: email, code, password again,
/// a new passkey, and the wallet is the same one with the same balance.
export function RecoverFlow({ onBack, signInWithStoredPasskey }: {
  onBack: () => void;
  /// Connects the passkey saved on this device and signs in with it.
  signInWithStoredPasskey: () => Promise<void>;
}) {
  const copy = useTranslations().recovery;
  const t = copy.flow;
  const { locale } = useLocale();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const [kdf, setKdf] = useState<KdfParams | null>(null);
  const [released, setReleased] = useState<Released | null>(null);
  const [until, setUntil] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const when = (ms: number) =>
    new Date(ms).toLocaleString(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const codeOf = (err: unknown) => (err instanceof ApiError ? err.code : undefined);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      const c = codeOf(err);
      if (c === 'ticket_expired' || c === 'code_expired' || c === 'no_code') {
        setStep('email');
        setError(t.expired);
      } else setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  const sendCode = (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) return;
    void run(async () => {
      await api.recoveryCodeRequest(clean);
      setEmail(clean);
      setCode('');
      setStep('code');
    });
  };

  const verifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    void run(async () => {
      let tk: string;
      try {
        tk = (await api.recoveryCodeVerify(email, code)).ticket;
      } catch (err) {
        if (codeOf(err) === 'wrong_code') return setError(t.wrongCode);
        throw err;
      }
      setTicket(tk);
      const { request } = await api.recoveryState(tk);
      if (request && request.state === 'waiting' && request.releasableAt > Date.now()) {
        setUntil(request.releasableAt);
        return setStep('tooEarly');
      }
      if (request) {
        const r = await api.recoveryRelease(tk);
        setReleased(r);
        return setStep('ready');
      }
      try {
        setKdf((await api.recoveryKdf(tk)).kdf);
        setStep('password');
      } catch (err) {
        if (codeOf(err) === 'not_registered' || codeOf(err) === 'no_backup') return setStep('neverOn');
        throw err;
      }
    });
  };

  const start = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !kdf || !password) return;
    void run(async () => {
      const verifier = await deriveVerifier(password, kdf);
      try {
        const r = await api.recoveryStart(ticket, verifier);
        setPassword('');
        setUntil(r.releasableAt);
        setStep('waiting');
      } catch (err) {
        const body = err instanceof ApiError ? (err.body as { remaining?: number; retryAt?: number } | undefined) : undefined;
        if (codeOf(err) === 'wrong_password') {
          // A wrong guess uses up the ticket; ask for a fresh code before the next try.
          setStep('email');
          return setError(t.wrong.replace('{n}', String(body?.remaining ?? 0)));
        }
        if (codeOf(err) === 'locked') {
          setUntil(body?.retryAt ?? null);
          return setStep('locked');
        }
        throw err;
      }
    });
  };

  const recover = (e: React.FormEvent) => {
    e.preventDefault();
    if (!released || !password) return;
    void run(async () => {
      let key: Hex;
      try {
        key = await unlockRecoveryKey({ password, ...released });
      } catch (err) {
        if (err instanceof WrongPasswordError) return setError(copy.sheet.wrong);
        throw err;
      }
      setStep('working');
      const [{ obtainPasskey }, { executeRecoveryOnchain }] = await Promise.all([
        import('@/features/modularWallet/passkey'),
        import('@/features/modularWallet/recovery'),
      ]);
      try {
        const passkey = await obtainPasskey('register', email);
        await executeRecoveryOnchain(key, passkey);
        await signInWithStoredPasskey();
        await api.recoveryCompleted().catch(() => undefined);
        setPassword('');
        setStep('done');
      } catch (err) {
        setStep('ready');
        throw err;
      }
    });
  };

  const input = 'form-input min-h-12 sm:min-h-[52px]';
  const primary =
    'inline-flex min-h-12 sm:min-h-[52px] w-full items-center justify-center rounded-[12px] bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)] disabled:cursor-not-allowed disabled:opacity-50';
  const title =
    step === 'waiting' ? t.waitingTitle
      : step === 'ready' || step === 'working' ? t.readyTitle
        : step === 'done' ? t.doneTitle
          : t.title;

  return (
    <div>
      <h1 className="text-[22px] font-bold leading-[1.15] tracking-[-0.03em] text-[var(--lp-dark)] sm:text-[26px]">{title}</h1>

      {step === 'email' && (
        <form onSubmit={sendCode} className="mt-2 space-y-3">
          <p className="text-[14px] leading-[1.5] text-[var(--lp-text-sub)] sm:text-[15px] font-medium">{t.intro}</p>
          <label className="block space-y-1.5 pt-3">
            <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.email}</span>
            <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              disabled={busy} className={input} autoFocus />
          </label>
          <EmailSuggestion email={email} onApply={setEmail} />
          <button type="submit" className={primary} disabled={busy || !EMAIL_RE.test(email.trim())}>{busy ? t.sending : t.sendCode}</button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verifyCode} className="mt-4 space-y-3">
          <p className="text-[14px] leading-[1.5] text-[var(--lp-text-sub)] sm:text-[15px] font-medium">{t.codeSent.replace('{email}', email)}</p>
          <label className="block space-y-1.5">
            <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.code}</span>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy}
              className={`${input} mono text-[18px] tracking-[0.3em]`} autoFocus />
          </label>
          <button type="submit" className={primary} disabled={busy || code.length !== 6}>{busy ? t.checking : t.continue}</button>
        </form>
      )}

      {(step === 'password' || step === 'ready' || step === 'working') && (
        <form onSubmit={step === 'password' ? start : recover} className="mt-4 space-y-3">
          {step !== 'password' && <p className="text-[14px] leading-[1.5] text-[var(--lp-text-sub)] sm:text-[15px] font-medium">{t.readyBody}</p>}
          <label className="block space-y-1.5">
            <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.password}</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
              disabled={busy} className={input} autoFocus />
          </label>
          <button type="submit" className={primary} disabled={busy || !password}>
            {step === 'password' ? (busy ? t.checking : t.start) : busy ? t.working : t.createPasskey}
          </button>
        </form>
      )}

      {step === 'waiting' && until && (
        <p role="status" className="mt-3 text-[14px] leading-[1.5] text-[var(--lp-text-sub)] sm:text-[15px] font-medium">{t.waitingBody.replace('{date}', when(until))}</p>
      )}
      {step === 'tooEarly' && until && (
        <p role="status" className="mt-3 text-[14px] leading-[1.5] text-[var(--lp-text-sub)] sm:text-[15px] font-medium">{t.tooEarly.replace('{date}', when(until))}</p>
      )}
      {step === 'locked' && (
        <p role="status" className="mt-3 text-[14px] leading-[1.5] text-[var(--lp-text-sub)] sm:text-[15px] font-medium">{t.locked.replace('{date}', until ? when(until) : '')}</p>
      )}
      {step === 'neverOn' && (
        <p role="status" className="mt-3 text-[14px] leading-[1.5] text-[var(--lp-text-sub)] sm:text-[15px] font-medium">{t.neverOn}</p>
      )}
      {step === 'done' && (
        <div className="mt-3 space-y-4" role="status">
          <p className="text-[14px] leading-[1.5] text-[var(--lp-text-sub)] sm:text-[15px] font-medium">{t.doneBody}</p>
          <a href="/account" className={primary}>{t.openWallet}</a>
        </div>
      )}

      {error && <p role="alert" className="mt-4 border-s-2 border-[var(--neg)] ps-3 text-[14px] leading-snug text-[var(--lp-critical)]">{error}</p>}

      {step !== 'working' && step !== 'done' && (
        <p className="mt-5 border-t border-[var(--lp-outline-strong)] pt-4 sm:mt-7 sm:pt-5 text-[14px]">
          <button type="button" onClick={onBack} className="font-semibold text-[var(--lp-text-sub)] underline underline-offset-4 hover:text-[var(--lp-dark)]">
            {t.back}
          </button>
        </p>
      )}
    </div>
  );
}
