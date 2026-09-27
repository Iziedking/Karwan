'use client';

import { useState } from 'react';
import { api, ApiError, WAITLIST_USE_CASES, type WaitlistUseCase } from '@/core/api';
import { TESTNET_ORIGIN } from '@/shared/utils/routes';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { WaitlistSeal } from './WaitlistSeal';
import { START_CARD } from '@/features/signup/components/cardStyles';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = 'email' | 'code' | 'done';

export function WaitlistCard({ onSignIn, onCreate }: { onSignIn: () => void; onCreate: () => void }) {
  const t = useTranslations().signup.waitlist;
  const { locale } = useLocale();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [invited, setInvited] = useState(false);
  const [position, setPosition] = useState<number | null>(null);
  const [joinedBefore, setJoinedBefore] = useState<number | null>(null);
  const [answerToken, setAnswerToken] = useState<string | null>(null);
  const [useCase, setUseCase] = useState<WaitlistUseCase | null>(null);
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
      setPosition(r.position);
      setJoinedBefore(r.alreadyJoined ? r.joinedAt : null);
      setAnswerToken(r.answerToken);
      setStep('done');
    } catch (err) {
      const reason = err instanceof ApiError ? err.code : undefined;
      setError(reason === 'code_expired' || reason === 'no_code' ? t.expired : t.wrongCode);
    } finally {
      setBusy(null);
    }
  }

  function answer(choice: WaitlistUseCase) {
    setUseCase(choice);
    // The answer only shapes who we let in first, so a failed save is not worth an error on screen.
    if (answerToken) void api.waitlistUseCase(answerToken, choice).catch(() => undefined);
  }

  const primary =
    'inline-flex min-h-12 sm:min-h-[52px] w-full items-center justify-center rounded-[12px] bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)] disabled:cursor-not-allowed disabled:opacity-50';
  const link = 'font-semibold text-[var(--lp-dark)] underline underline-offset-4';

  return (
    <div className={START_CARD}>
      {step === 'done' && (
        <div className="mb-4 sm:mb-5">
          <WaitlistSeal />
        </div>
      )}
      <h1 className="text-[22px] font-bold leading-[1.15] tracking-[-0.03em] text-[var(--lp-dark)] sm:text-[26px]">
        {step === 'code' ? t.codeTitle : step === 'done' ? (joinedBefore && !invited ? t.alreadyTitle : t.doneTitle) : t.title}
      </h1>

      {step === 'email' && (
        <form onSubmit={send} className="mt-2 space-y-3">
          <p className="text-[14px] leading-[1.5] text-[var(--lp-text-sub)] sm:text-[15px]">{t.body}</p>
          <label className="block space-y-1.5 pt-3">
            <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.emailLabel}</span>
            <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              disabled={!!busy} className="form-input min-h-12 sm:min-h-[52px]" autoFocus />
          </label>
          <button type="submit" className={primary} disabled={!!busy || !EMAIL_RE.test(email.trim())}>
            {busy === 'send' ? t.sending : t.join}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verify} className="mt-4 space-y-3">
          <p className="text-[14px] leading-[1.5] text-[var(--lp-text-sub)] sm:text-[15px]">{t.codeSent.replace('{email}', email)}</p>
          <label className="block space-y-1.5">
            <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.codeLabel}</span>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={!!busy}
              className="form-input mono min-h-12 sm:min-h-[52px] text-[18px] tracking-[0.3em]" autoFocus />
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
        <div className="mt-3 space-y-3 sm:space-y-4" role="status">
          {position && !invited && (
            <p className="mono text-[15px] font-semibold text-[var(--lp-dark)] sm:text-[17px]">{t.position.replace('{n}', position.toLocaleString('en-US'))}</p>
          )}
          <p className="text-[14px] leading-[1.5] text-[var(--lp-text-sub)] sm:text-[15px]">
            {invited
              ? t.invitedBody
              : joinedBefore
                ? t.alreadyBody
                    .replace('{date}', new Date(joinedBefore).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }))
                    .replace('{email}', email)
                : t.doneBody.replace('{email}', email)}
          </p>
          {invited ? (
            <button type="button" className={primary} onClick={onCreate}>{t.createAccount}</button>
          ) : (
            <>
              <div className="space-y-2 pt-1">
                <a href={`${TESTNET_ORIGIN}/start?mode=signup`} className={primary}>{t.tryTestnet}</a>
                <p className="text-center text-[13px] text-[var(--lp-text-sub)]">{t.tryTestnetNote}</p>
              </div>
              <fieldset className="border-t border-[var(--lp-outline-strong)] pt-4 sm:pt-5">
                <legend className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.useCaseTitle}</legend>
                {useCase ? (
                  <p className="mt-2 text-[14px] text-[var(--lp-text-sub)]">{t.useCaseThanks}</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {WAITLIST_USE_CASES.map((choice) => (
                      <button key={choice} type="button" onClick={() => answer(choice)}
                        className="inline-flex min-h-11 items-center rounded-full border border-[var(--lp-outline-strong)] px-3.5 text-[13px] font-medium sm:px-4 sm:text-[14px] text-[var(--lp-dark)] transition-colors hover:border-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]">
                        {t.useCases[choice]}
                      </button>
                    ))}
                  </div>
                )}
              </fieldset>
              <a href="https://x.com/karwanBuild" target="_blank" rel="noreferrer"
                className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-text-sub)] underline underline-offset-4 hover:text-[var(--lp-dark)]">
                {t.follow}
              </a>
            </>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 border-s-2 border-[var(--neg)] ps-3 text-[14px] leading-snug text-[var(--lp-critical)]">{error}</p>
      )}

      {step !== 'done' && (
        <p className="mt-5 border-t border-[var(--lp-outline-strong)] pt-4 sm:mt-7 sm:pt-5 text-[14px] text-[var(--lp-text-sub)]">
          {t.invitedPrompt}{' '}
          <button type="button" onClick={onSignIn} className={link}>{t.signIn}</button>
        </p>
      )}
    </div>
  );
}
