'use client';

import { useState } from 'react';
import { api, ApiError, WAITLIST_USE_CASES, type WaitlistUseCase } from '@/core/api';
import { TESTNET_ORIGIN } from '@/shared/utils/routes';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { WaitlistSeal } from './WaitlistSeal';
import { EmailSuggestion } from '@/shared/components/EmailSuggestion';
import { START_CARD, START_TITLE } from '@/features/signup/components/cardStyles';

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
  const [useCases, setUseCases] = useState<WaitlistUseCase[]>([]);
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

  function toggle(choice: WaitlistUseCase) {
    const next = useCases.includes(choice) ? useCases.filter((u) => u !== choice) : [...useCases, choice];
    setUseCases(next);
    // The answer only shapes who we let in first, so a failed save is not worth an error on screen.
    if (answerToken && next.length) void api.waitlistUseCases(answerToken, next).catch(() => undefined);
  }

  const primary =
    'inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--action)] px-5 text-[15px] font-medium text-[var(--on-action)] transition-opacity duration-[var(--dur-small)] ease-[var(--ease-ui)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50';
  const link = 'inline-flex min-h-11 items-center rounded-full font-medium text-[var(--ink)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]';

  return (
    <div className={START_CARD}>
      {step === 'done' && (
        <div className="hidden">
          <WaitlistSeal />
        </div>
      )}
      <h1 className={START_TITLE}>
        {step === 'code' ? t.codeTitle : step === 'done' ? (joinedBefore && !invited ? t.alreadyTitle : t.doneTitle) : t.title}
      </h1>

      {step === 'email' && (
        <form onSubmit={send} className="mt-2 space-y-3">
          <p className="text-[15px] leading-[1.5] text-[var(--ink-secondary)]">{t.body}</p>
          <label className="block space-y-1.5 pt-3">
            <span className="text-[14px] font-medium text-[var(--ink)]">{t.emailLabel}</span>
            <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              disabled={!!busy} className="min-h-[52px] w-full rounded-[14px] border-0 bg-[var(--tint)] px-4 py-3 text-[16px] text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] disabled:cursor-not-allowed disabled:opacity-50" autoFocus />
          </label>
          <EmailSuggestion email={email} onApply={setEmail} />
          <button type="submit" className={primary} disabled={!!busy || !EMAIL_RE.test(email.trim())}>
            {busy === 'send' ? t.sending : t.join}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verify} className="mt-4 space-y-3">
          <p className="break-words text-[15px] leading-[1.5] text-[var(--ink-secondary)]">{t.codeSent.replace('{email}', email)}</p>
          <label className="block space-y-1.5">
            <span className="text-[14px] font-medium text-[var(--ink)]">{t.codeLabel}</span>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={!!busy}
              className="min-h-[52px] w-full rounded-[14px] border-0 bg-[var(--tint)] px-4 py-3 text-[18px] tabular-nums tracking-[0.3em] text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] disabled:cursor-not-allowed disabled:opacity-50" autoFocus />
          </label>
          <button type="submit" className={primary} disabled={!!busy || code.length !== 6}>
            {busy === 'verify' ? t.verifying : t.verify}
          </button>
          <button type="button" onClick={() => void send()} disabled={!!busy}
            className="inline-flex min-h-11 items-center rounded-full text-[14px] font-medium text-[var(--ink-secondary)] underline underline-offset-4 hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] disabled:cursor-not-allowed disabled:opacity-50">
            {t.resend}
          </button>
        </form>
      )}

      {step === 'done' && (
        <div className="mt-3 space-y-3 sm:space-y-4" role="status">
          {position && !invited && (
            <p className="text-[16px] font-medium tabular-nums text-[var(--ink)] sm:text-[17px]">{t.position.replace('{n}', position.toLocaleString('en-US'))}</p>
          )}
          <p className="break-words text-[15px] leading-[1.5] text-[var(--ink-secondary)]">
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
                <p className="text-center text-[14px] text-[var(--ink-secondary)] font-medium">{t.tryTestnetNote}</p>
              </div>
              <fieldset className="border-t border-[var(--line)] pt-4 sm:pt-5">
                <legend className="text-[14px] font-medium text-[var(--ink)]">{t.useCaseTitle}</legend>
                <p className="mt-1 text-[14px] text-[var(--ink-secondary)] font-medium">{t.useCaseHint}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {WAITLIST_USE_CASES.map((choice) => {
                    const on = useCases.includes(choice);
                    return (
                      <button key={choice} type="button" aria-pressed={on} onClick={() => toggle(choice)}
                        className={`inline-flex min-h-11 items-center rounded-full px-4 text-[14px] font-medium transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] ${on ? 'bg-[var(--ink)] text-[var(--canvas)]' : 'bg-[var(--tint)] text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--ink)_12%,var(--surface))]'}`}>
                        {t.useCases[choice]}
                      </button>
                    );
                  })}
                </div>
                <p aria-live="polite" className="mt-2 min-h-5 text-[14px] text-[var(--ink-secondary)] font-medium">{useCases.length ? t.useCaseThanks : null}</p>
              </fieldset>
              <a href="https://x.com/karwanBuild" target="_blank" rel="noreferrer"
                className="inline-flex min-h-11 items-center rounded-full text-[14px] font-medium text-[var(--ink-secondary)] underline underline-offset-4 hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]">
                {t.follow}
              </a>
            </>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-[14px] leading-snug text-[var(--color-critical)]">{error}</p>
      )}

      {step !== 'done' && (
        <p className="mt-5 border-t border-[var(--line)] pt-4 text-[14px] text-[var(--ink-secondary)] sm:mt-7 sm:pt-5 font-medium">
          {t.invitedPrompt}{' '}
          <button type="button" onClick={onSignIn} className={link}>{t.signIn}</button>
        </p>
      )}
    </div>
  );
}
