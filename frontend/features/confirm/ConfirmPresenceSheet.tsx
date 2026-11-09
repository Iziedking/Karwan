'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CodeBoxes } from '@/shared/components/CodeBoxes';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { useSignMessage } from 'wagmi';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { api, ApiError, type ConfirmRequired } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { actionLines, confirmView, fillIn, type ConfirmView } from './confirmModel';
import { addConfirmPasskey, confirmWithPasskey } from './presencePasskey';
import { PinField } from './PinField';

const PRIMARY =
  'inline-flex min-h-12 items-center rounded-full bg-[var(--action)] px-5 text-[15px] font-medium text-[var(--on-action)] transition-opacity duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]';
const SECONDARY =
  'inline-flex min-h-12 items-center rounded-full bg-[var(--tint)] px-5 text-[15px] font-medium text-[var(--ink)] transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none hover:bg-[var(--line)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]';
const LINK = 'min-h-11 text-[14px] font-medium text-[var(--ink)] underline underline-offset-4 disabled:opacity-60';

/// One sheet for every confirmation: what will happen, then a passkey, the
/// person's PIN or their wallet, then "Confirmed" in place.
export function ConfirmPresenceSheet({ required, onDone, onClose }: {
  required: ConfirmRequired;
  onDone: (grant: string) => void;
  onClose: () => void;
}) {
  const copy = useTranslations().confirmPresence;
  const { locale } = useLocale();
  const mt = useMoneyText();
  const { signMessageAsync } = useSignMessage();
  const [state, setState] = useState(required);
  const [view, setView] = useState<ConfirmView>(() => confirmView(required, Date.now()));
  const [pin, setPin] = useState('');
  // With a passkey, the PIN waits behind "Use PIN instead" (Figma 218:570).
  const [pinOpen, setPinOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const recipient = required.action.kind === 'move_out' ? required.action.recipient ?? '' : '';
  const toProfile = useQuery({ queryKey: ['profile', recipient], queryFn: () => api.getProfile(recipient), enabled: !!recipient, staleTime: 60_000 });
  const toTag = toProfile.data?.profile?.handle;
  const { headline, lines } = useMemo(() => actionLines(required.action, copy, toTag ? `@${toTag}` : null), [required.action, copy, toTag]);
  useEffect(() => { if (pinOpen) pinRef.current?.focus(); }, [pinOpen]);
  const timeOf = (ms: number) => new Date(ms).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

  useEffect(() => {
    setState(required);
    setView(confirmView(required, Date.now()));
  }, [required]);

  const finish = (grant: string) => {
    setView({ step: 'done' });
    window.setTimeout(() => onDone(grant), 600);
  };

  const fail = (err: unknown) => {
    const body = err instanceof ApiError ? (err.body as { code?: string; left?: number; until?: number } | undefined) : undefined;
    if (body?.code === 'WRONG_PIN') setError(fillIn(copy.wrongPin, { left: String(body.left ?? 0) }));
    else if (body?.code === 'PIN_LOCKED' && body.until) {
      setError(fillIn(copy.locked, { time: timeOf(body.until) }));
      if (view.step === 'confirm') setView({ ...view, pinLockedUntil: body.until });
    } else if (body?.code === 'PIN_TOO_SIMPLE') setError(copy.tooSimple);
    else if (body?.code === 'CHALLENGE_EXPIRED') setError(copy.expired);
    else if (body?.code === 'EMAIL_CODE_WRONG') setError(copy.codeWrong);
    else if (body?.code === 'EMAIL_CODE_LIMIT') setError(copy.codeLimit);
    else if (body?.code === 'PIN_FORMAT') setError(copy.pinFormat);
    else setError(copy.failed);
    // A wrong or used-up email code says nothing about the new PIN, so it stays.
    if (body?.code !== 'EMAIL_CODE_WRONG' && body?.code !== 'EMAIL_CODE_LIMIT') setPin('');
  };

  const run = async (step: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await step();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const confirmPin = () => run(async () => finish((await api.confirmPresence(state.challengeId, { pin })).grant));
  const confirmByPasskey = () => run(async () => finish(await confirmWithPasskey(state.challengeId)));
  const confirmByWallet = () =>
    run(async () => {
      const signature = await signMessageAsync({ message: state.text });
      finish((await api.confirmPresence(state.challengeId, { signature })).grant);
    });
  const sendCode = () =>
    run(async () => {
      const again = codeSent;
      await api.confirmEmailCode();
      setCodeSent(true);
      setCode('');
      setResent(again);
    });
  const enrolPin = (emailCode?: string) =>
    run(async () => {
      await api.setConfirmPin(pin, emailCode);
      const next = { ...state, pinSet: true, enrol: null };
      setState(next);
      setPin('');
      setView(confirmView(next, Date.now()));
    });
  const enrolPasskey = (emailCode?: string) =>
    run(async () => {
      await addConfirmPasskey(emailCode);
      const next = { ...state, passkeys: state.passkeys + 1, enrol: null };
      setState(next);
      setView(confirmView(next, Date.now()));
    });
  const resetPin = () =>
    run(async () => {
      await api.resetConfirmPin(pin, code);
      const next = { ...state, pinSet: true, pinLockedUntil: null };
      setState(next);
      setPin('');
      setCode('');
      setView(confirmView(next, Date.now()));
    });

  const codeField = (
    <div>
      <label htmlFor="confirm-email-code" className="block text-[14px] font-medium text-[var(--lp-dark)]">
        {copy.emailCode}
      </label>
      <div className="mt-2">
        <CodeBoxes id="confirm-email-code" value={code} onChange={setCode} />
      </div>
    </div>
  );

  let body: React.ReactNode;
  if (view.step === 'done') {
    body = <p role="status" className="mt-6 text-[17px] font-medium text-[var(--ink)]">{copy.done}</p>;
  } else if (view.step === 'add_email') {
    body = <p className="mt-6 text-[15px] text-[var(--lp-dark)]">{copy.addEmail}</p>;
  } else if (view.step === 'enrol' || view.step === 'reset') {
    const needsCode = view.step === 'reset' || view.via === 'email_code';
    body = (
      <div className="mt-6 space-y-5">
        <h3 className="text-[16px] font-medium text-[var(--ink)]">{copy.setTitle}</h3>
        {needsCode && !codeSent ? (
          <button type="button" className={SECONDARY} disabled={busy} onClick={sendCode}>{copy.sendCode}</button>
        ) : null}
        {needsCode && codeSent ? (
          <>
            {codeField}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={LINK} disabled={busy} onClick={sendCode}>{copy.resendCode}</button>
              {resent ? <p role="status" className="text-[14px] text-[var(--lp-dark)]">{copy.codeResent}</p> : null}
            </div>
          </>
        ) : null}
        {!needsCode || codeSent ? (
          <>
            <PinField id="confirm-new-pin" label={copy.setHint} value={pin} onChange={setPin} disabled={busy} />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={PRIMARY}
                disabled={busy || pin.length !== 6 || (needsCode && code.length !== 6)}
                onClick={() => (view.step === 'reset' ? resetPin() : enrolPin(needsCode ? code : undefined))}
                data-testid="confirm-set-pin"
              >
                {copy.confirm}
              </button>
              {view.step === 'enrol' ? (
                <button type="button" className={LINK} disabled={busy || (needsCode && code.length !== 6)} onClick={() => enrolPasskey(needsCode ? code : undefined)}>
                  {copy.addPasskey}
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    );
  } else {
    const locked = view.pinLockedUntil !== null;
    body = (
      <div className="mt-6 space-y-5">
        {view.methods.includes('wallet') ? (
          <button type="button" className={PRIMARY} disabled={busy} onClick={confirmByWallet}>{copy.walletSign}</button>
        ) : null}
        {view.methods.includes('passkey') ? (
          <button type="button" className={`${PRIMARY} gap-2.5`} disabled={busy} onClick={confirmByPasskey} data-testid="confirm-passkey">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden className="shrink-0">
              <path d="M12 11v3a8 8 0 0 0 1.5 4.6M8.5 9.5A3.5 3.5 0 0 1 15.5 10v2.5M5.5 13a9.6 9.6 0 0 0 .8 3.6M18 14.5a13 13 0 0 1-.4 3M4.5 9A8 8 0 0 1 19 8.2M9 13.5a12 12 0 0 0 1.6 6" />
            </svg>
            {copy.usePasskey}
          </button>
        ) : null}
        {view.methods.includes('pin') && view.methods.includes('passkey') && !pinOpen && !locked ? (
          <button type="button" className={SECONDARY} disabled={busy} onClick={() => setPinOpen(true)} data-testid="confirm-use-pin">{copy.usePinInstead}</button>
        ) : view.methods.includes('pin') ? (
          locked ? (
            <p className="text-[14px] text-[var(--lp-dark)]">{fillIn(copy.locked, { time: timeOf(view.pinLockedUntil!) })}</p>
          ) : (
            <div className="space-y-4">
              <PinField ref={pinRef} id="confirm-pin" label={copy.pinLabel} value={pin} onChange={setPin} onSubmit={confirmPin} disabled={busy} />
              <button type="button" className={view.methods.includes('passkey') ? SECONDARY : PRIMARY} disabled={busy || pin.length !== 6} onClick={confirmPin} data-testid="confirm-pin-submit">
                {copy.confirm}
              </button>
            </div>
          )
        ) : null}
        {view.methods.includes('pin') && (pinOpen || !view.methods.includes('passkey')) ? (
          <button type="button" className={LINK} disabled={busy} onClick={() => { setError(null); setPin(''); setView({ step: 'reset' }); }}>
            {copy.forgot}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <ConfirmSheetShell open labelledBy="confirm-presence-title" busy={busy} onClose={onClose} initialFocus={pinRef}>
      <p className="text-[14px] font-medium text-[var(--lp-dark)]">{copy.title}</p>
      {/* The amount reads in the person's currency; the exact USDC that moves stays on one line (view 54). */}
      <h2 id="confirm-presence-title" className="mt-1 text-[20px] font-medium text-[var(--lp-dark)]">{mt.line(headline)}</h2>
      {mt.currency !== 'USDC' && required.action.amountMicros !== null ? (
        <p data-exact-usdc className="mt-1 text-[14px] font-medium tabular-nums text-[var(--lp-text-sub)]">{mt.usdc(Number(required.action.amountMicros) / 1_000_000, { exact: true })}</p>
      ) : null}
      {lines.map((line) => <p key={line} className="mt-3 text-[15px] leading-relaxed text-[var(--lp-dark)]">{line}</p>)}
      {body}
      {error ? (
        <p role="alert" className="mt-4 border-s-2 border-[var(--color-critical)] ps-3 text-[14px] text-[var(--lp-dark)]">{error}</p>
      ) : null}
      {view.step !== 'done' ? (
        <div className="mt-6">
          <button type="button" className={SECONDARY} disabled={busy} onClick={onClose}>{copy.cancel}</button>
        </div>
      ) : null}
    </ConfirmSheetShell>
  );
}
