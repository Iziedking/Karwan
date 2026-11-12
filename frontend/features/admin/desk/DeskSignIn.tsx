'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, ApiError, type AdminDeskMe } from '@/core/api';
import { START, nextSignInStep, type SignInEvent, type SignInState } from './signInSteps';

/// Sign in to the desk (view 79; Figma 281:4124, 283:5169, 288:6128, 283:5466).
/// The password first, on the desk chosen here; on mainnet the authenticator
/// code after it, or setting the code up on a first mainnet sign-in.

type Net = 'mainnet' | 'testnet';

const RULE =
  'Refreshing or moving between pages keeps you signed in. Closing the browser, 30 minutes without use, or 12 hours signs you out. Mainnet asks for a code from your authenticator app as well.';

function errorOf(err: unknown): SignInEvent {
  if (err instanceof ApiError) return { kind: 'error', status: err.status, message: err.message || 'Sign-in could not be checked.' };
  return { kind: 'error', status: 0, message: 'Sign-in could not be checked. Check the connection and try again.' };
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/brand/karwan-mark-lime.svg" alt="" className="size-[34px] rounded-[8px]" />
      <span className="text-[19px] font-semibold tracking-[-0.01em] text-[#EDEDED]">Karwan</span>
      <span className="text-[13px] text-[#8A8B90]">Desk</span>
    </div>
  );
}

function MainnetChip() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#E0A43A]/45 px-2.5 py-1 text-[12px] text-[#EDEDED]">
      <span className="size-2 rounded-full bg-[#E0A43A]" aria-hidden="true" />
      Mainnet · real money
    </span>
  );
}

function PrimaryButton({ children, disabled, type = 'submit', onClick }: { children: React.ReactNode; disabled?: boolean; type?: 'submit' | 'button'; onClick?: () => void }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 w-full rounded-[10px] bg-[#B3C95A] px-4 text-[14px] font-semibold text-[#0E0F11] transition hover:bg-[#BFD46A] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 w-full rounded-[10px] border border-[#2C2D32] px-4 text-[14px] font-semibold text-[#EDEDED] transition hover:border-[#3A3B41]">
      {children}
    </button>
  );
}

function Problem({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-[10px] border border-[#E5645A]/30 bg-[#E5645A]/10 px-3 py-2.5 text-[13px] text-[#F2A39C]">
      {text}
    </p>
  );
}

function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');
  useEffect(() => {
    refs.current[0]?.focus();
  }, []);
  function setAt(i: number, raw: string) {
    const typed = raw.replace(/\D/g, '');
    if (typed.length > 1) {
      // A pasted code fills every box.
      onChange(typed.slice(0, 6));
      refs.current[Math.min(typed.length, 6) - 1]?.focus();
      return;
    }
    const next = digits.slice();
    next[i] = typed;
    onChange(next.join('').slice(0, 6));
    if (typed && i < 5) refs.current[i + 1]?.focus();
  }
  return (
    <div className="flex gap-2" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d && i > 0) refs.current[i - 1]?.focus();
          }}
          className="h-14 w-12 rounded-[10px] border border-[#2C2D32] bg-[#1C1D21] text-center text-[20px] font-semibold text-[#EDEDED] outline-none focus:border-[#8A8B90]"
        />
      ))}
    </div>
  );
}

function SetupPicture({ otpauth }: { otpauth: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(otpauth, { margin: 1, width: 168, color: { dark: '#0E0F11', light: '#FFFFFF' } })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [otpauth]);
  const secret = new URL(otpauth.replace('otpauth://', 'https://')).searchParams.get('secret') ?? '';
  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-[10px] bg-white p-3">
        {src ? <img src={src} alt="Code to scan with your authenticator app" className="size-[152px]" /> : <div className="size-[152px]" aria-hidden="true" />}
      </div>
      <p className="text-[12px] text-[#8A8B90]">
        Can&apos;t scan? Enter this key in the app: <span className="font-mono text-[#C9CACF] select-all">{secret}</span>
      </p>
    </div>
  );
}

export function DeskSignIn({ onSignedIn }: { onSignedIn: (me: AdminDeskMe) => void }) {
  const [state, setState] = useState<SignInState>(START);
  const [net, setNet] = useState<Net>('mainnet');
  const [mainnetOpen, setMainnetOpen] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [showRule, setShowRule] = useState(false);

  useEffect(() => {
    void api.adminDesks().then((d) => {
      setMainnetOpen(d.mainnet);
      if (!d.mainnet) setNet('testnet');
    });
  }, []);

  function apply(event: SignInEvent) {
    const next = nextSignInStep(state, event);
    setState(next);
    if (next.step === 'done') {
      setPassword('');
      onSignedIn(next.me);
    }
    if (next.step === 'password' || event.kind === 'error') setCode('');
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    try {
      apply({ kind: 'answer', body: await api.adminSignIn(email.trim(), password, net) });
    } catch (err) {
      apply(errorOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.length !== 6 || (state.step !== 'code' && state.step !== 'setup')) return;
    setBusy(true);
    try {
      const { me } = await api.adminSignInCode(state.ticket, code);
      apply({ kind: 'signed-in', me });
    } catch (err) {
      apply(errorOf(err));
    } finally {
      setBusy(false);
    }
  }

  const card = 'w-full max-w-[366px] rounded-[16px] border border-[#26272B] bg-[#17181B] p-6 sm:p-8';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0E0F11] px-4 py-10 font-sans text-[#EDEDED]">
      {state.step === 'password' || state.step === 'done' ? (
        <form onSubmit={submitPassword} className={`${card} space-y-5`}>
          <Brand />
          <h1 className="text-[24px] font-semibold tracking-[-0.01em]">Sign in to the desk</h1>
          <fieldset className="space-y-2">
            <legend className="text-[13px] text-[#9A9BA0]">Which desk</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['mainnet', 'Mainnet', mainnetOpen ? 'Real money' : 'Not open yet', '#E0A43A'],
                  ['testnet', 'Testnet', 'Test money', '#8A8B90'],
                ] as const
              ).map(([key, label, sub, dot]) => {
                const chosen = net === key;
                const off = key === 'mainnet' && !mainnetOpen;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={off}
                    aria-pressed={chosen}
                    onClick={() => setNet(key)}
                    className={`min-h-[60px] rounded-[10px] border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${chosen ? 'border-[#4A4B51] bg-[#1F2024]' : 'border-[#26272B] hover:border-[#3A3B41]'}`}
                  >
                    <span className="flex items-center gap-2 text-[15px] font-semibold">
                      <span className="size-2 rounded-full" style={{ background: dot }} aria-hidden="true" />
                      {label}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-[#8A8B90]">{sub}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="space-y-2">
            <label htmlFor="desk-email" className="block text-[13px] text-[#9A9BA0]">Team email</label>
            <input
              id="desk-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className="min-h-11 w-full rounded-[10px] border border-transparent bg-[#1F2024] px-3 text-[15px] text-[#EDEDED] outline-none focus:border-[#4A4B51]"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="desk-password" className="block text-[13px] text-[#9A9BA0]">Password</label>
            <input
              id="desk-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="min-h-11 w-full rounded-[10px] border border-transparent bg-[#1F2024] px-3 text-[15px] text-[#EDEDED] outline-none focus:border-[#4A4B51]"
            />
          </div>
          <Problem text={state.error} />
          <PrimaryButton disabled={busy || !email.trim() || !password}>{busy ? 'Signing in' : 'Sign in'}</PrimaryButton>
          <div className="relative flex items-center gap-1.5 text-[12px] text-[#8A8B90]">
            Stays signed in until you close the browser
            <button
              type="button"
              aria-label="How long you stay signed in"
              aria-expanded={showRule}
              onClick={() => setShowRule((v) => !v)}
              className="inline-flex size-6 items-center justify-center rounded-full border border-[#3A3B41] text-[11px] text-[#9A9BA0]"
            >
              i
            </button>
            {showRule && (
              <p role="note" className="absolute left-0 top-8 z-10 w-[min(300px,calc(100vw-48px))] rounded-[10px] border border-[#2C2D32] bg-[#1C1D21] p-3 text-[12px] leading-[18px] text-[#C9CACF]">
                {RULE}
              </p>
            )}
          </div>
        </form>
      ) : (
        <form onSubmit={submitCode} className={`${card} space-y-5`}>
          <Brand />
          <MainnetChip />
          <h1 className="text-[24px] font-semibold tracking-[-0.01em]">{state.step === 'setup' ? 'Set up your code' : 'Enter your code'}</h1>
          <p className="text-[14px] leading-[22px] text-[#9A9BA0]">
            {state.step === 'setup'
              ? 'Scan this with the authenticator app on your phone, then enter the code it shows. You do this once.'
              : `From the authenticator app on your phone. ${email.trim()} signed in with a password.`}
          </p>
          {state.step === 'setup' && <SetupPicture otpauth={state.otpauth} />}
          <CodeBoxes value={code} onChange={setCode} />
          <Problem text={state.error} />
          <PrimaryButton disabled={busy || code.length !== 6}>{busy ? 'Checking' : 'Confirm'}</PrimaryButton>
          <SecondaryButton
            onClick={() => {
              setPassword('');
              apply({ kind: 'restart' });
            }}
          >
            Use a different account
          </SecondaryButton>
          <p className="text-[12px] text-[#8A8B90]">{state.step === 'setup' ? 'Lost your phone? The owner resets your code.' : 'Codes change every 30 seconds'}</p>
        </form>
      )}
      <p className="mt-5 max-w-[366px] text-center text-[12px] text-[#6E6F75]">
        {state.step === 'password' || state.step === 'done'
          ? 'admin.karwan.site · only emails on the team list reach this page'
          : 'Five wrong codes lock this email for 15 minutes and tell the owner'}
      </p>
    </main>
  );
}
