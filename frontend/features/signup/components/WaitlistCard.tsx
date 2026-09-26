'use client';

import { useState } from 'react';
import { api, ApiError } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = 'email' | 'code' | 'done';

export function WaitlistCard({ onSignIn, onCreate }: { onSignIn: () => void; onCreate: () => void }) {
  const t = useTranslations().signup.waitlist;
  const { locale } = useLocale();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [invited, setInvited] = useState(false);
  const [busy, setBusy] = useState<null | 'send' | 'verify'>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) return;
    setBusy('send');
    setError(null);
    try {
      await api.waitlistRequest(clean, locale);
      setEmail(clean);
      setCode('');
      setStep('code');
    } catch {
      setError(t.sendFailed);
    } finally {
      setBusy(null);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    setBusy('verify');
    setError(null);
    try {
      const r = await api.waitlistVerify(email, code);
      setInvited(r.invited);
      setStep('done');
    } catch (err) {
      const reason = err instanceof ApiError ? err.code : undefined;
      setError(reason === 'code_expired' || reason === 'no_code' ? t.expired : t.wrongCode);
    } finally {
      setBusy(null);
    }
  }

  const primary =
    'inline-flex min-h-[52px] w-full items-center justify-center rounded-[12px] bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)] disabled:cursor-not-allowed disabled:opacity-50';
  const link = 'font-semibold text-[var(--lp-dark)] underline underline-offset-4';

  return (
    <div className="w-full rounded-[16px] border border-[var(--lp-outline-strong)] bg-[var(--lp-card)] p-6 shadow-[var(--shadow-pop)] sm:p-8">
      <h1 className="text-[26px] font-bold leading-[1.15] tracking-[-0.03em] text-[var(--lp-dark)]">
        {step === 'code' ? t.codeTitle : step === 'done' ? t.doneTitle : t.title}
      </h1>

      {step === 'email' && (
        <form onSubmit={send} className="mt-2 space-y-3">
          <p className="text-[15px] leading-[1.5] text-[var(--lp-text-sub)]">{t.body}</p>
          <label className="block space-y-1.5 pt-3">
            <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.emailLabel}</span>
            <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              disabled={!!busy} className="form-input min-h-[52px]" autoFocus />
          </label>
          <button type="submit" className={primary} disabled={!!busy || !EMAIL_RE.test(email.trim())}>
            {busy === 'send' ? t.sending : t.join}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verify} className="mt-4 space-y-3">
          <p className="text-[15px] leading-[1.5] text-[var(--lp-text-sub)]">{t.codeSent.replace('{email}', email)}</p>
          <label className="block space-y-1.5">
            <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.codeLabel}</span>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={!!busy}
              className="form-input mono min-h-[52px] text-[18px] tracking-[0.3em]" autoFocus />
          </label>
          <button type="submit" className={primary} disabled={!!busy || code.length !== 6}>
            {busy === 'verify' ? t.verifying : t.verify}
          </button>
          <button type="button" onClick={() => void send()} disabled={!!busy}
            className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-text-sub)] underline underline-offset-4 hover:text-[var(--lp-dark)] disabled:opacity-50">
            {t.resend}
          </button>
        </form>
      )}

      {step === 'done' && (
        <div className="mt-3 space-y-4" role="status">
          <p className="text-[15px] leading-[1.5] text-[var(--lp-text-sub)]">
            {invited ? t.invitedBody : t.doneBody.replace('{email}', email)}
          </p>
          {invited && (
            <button type="button" className={primary} onClick={onCreate}>{t.createAccount}</button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 border-s-2 border-[var(--neg)] ps-3 text-[14px] leading-snug text-[var(--lp-critical)]">{error}</p>
      )}

      {step !== 'done' && (
        <p className="mt-7 border-t border-[var(--lp-outline-strong)] pt-5 text-[14px] text-[var(--lp-text-sub)]">
          {t.invitedPrompt}{' '}
          <button type="button" onClick={onSignIn} className={link}>{t.signIn}</button>
        </p>
      )}
    </div>
  );
}
