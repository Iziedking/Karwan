'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useAccount, useConnect, useSignMessage } from 'wagmi';
import { api, ApiError } from '@/core/api';
import { DEALS_AVAILABLE, ARC_NETWORK } from '@/core/arcNetwork';
import { MODULAR_WALLETS_ENABLED } from '@/features/modularWallet/config';
import { PASSKEY_CONNECTOR_ID } from '@/features/modularWallet/connector';
import { clearEmailProof, holdEmailProof } from '@/features/modularWallet/pendingEmail';
import { useAuth, emitAuthChanged } from '@/shared/hooks/useAuth';
import { useSiwe } from '@/shared/hooks/useSiwe';
import { termsAcceptanceMessage } from '@/shared/hooks/useTerms';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { WALLET_HOME } from '@/shared/utils/routes';
import { localTagIssue, normalizeTag, type TagIssue } from '../tag';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOME = DEALS_AVAILABLE ? '/app' : WALLET_HOME;

type Mode = 'signin' | 'signup';
type SignInStep = 'email' | 'passkey' | 'code' | 'not-found';
type SignUpStep = 'tag' | 'method' | 'code' | 'passkey' | 'kind';
type Busy = null | 'lookup' | 'send' | 'verify' | 'passkey' | 'wallet' | 'create';

function isCancel(error: unknown): boolean {
  const e = error as { name?: string; message?: string };
  return e?.name === 'NotAllowedError' || e?.name === 'AbortError' || /cancel|not allowed|denied|rejected/i.test(e?.message ?? '');
}

export function AuthCard({ initialMode = 'signin' }: { initialMode?: Mode }) {
  const t = useTranslations().signup;
  const auth = useAuth();
  const siwe = useSiwe();
  const { address: walletAddress, isConnected, connector } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { signMessageAsync } = useSignMessage();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [inStep, setInStep] = useState<SignInStep>('email');
  const [upStep, setUpStep] = useState<SignUpStep>('tag');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [tag, setTag] = useState('');
  const [tagState, setTagState] = useState<'idle' | 'checking' | 'available' | TagIssue>('idle');
  const [kind, setKind] = useState<'person' | 'business'>('person');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [awaitingAuth, setAwaitingAuth] = useState(false);
  const [walletPending, setWalletPending] = useState(false);
  const [authedWithoutAccount, setAuthedWithoutAccount] = useState(false);
  const resolvedFor = useRef<string | null>(null);
  const testnetPasskey = useRef(false);

  const goHome = useCallback(() => window.location.assign(HOME), []);

  // Once a session exists, the server decides what happens next: an account
  // goes home, a session without one finishes sign-up at the tag or kind step.
  useEffect(() => {
    if (auth.isLoading || !auth.isAuthenticated || !auth.address) return;
    const key = auth.address.toLowerCase();
    if (resolvedFor.current === key) return;
    resolvedFor.current = key;
    let cancelled = false;
    void (async () => {
      const bootstrap = await api.bootstrap().catch(() => null);
      if (cancelled) return;
      if (bootstrap?.profile) {
        goHome();
        return;
      }
      setAwaitingAuth(false);
      setBusy(null);
      setAuthedWithoutAccount(true);
      setMode('signup');
      setUpStep(normalizeTag(tag) && tagState === 'available' ? 'kind' : 'tag');
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.isLoading, auth.isAuthenticated, auth.address, goHome, tag, tagState]);

  // A wallet the person chose to connect here signs in straight away.
  useEffect(() => {
    if (!walletPending || !isConnected || !walletAddress || connector?.id === PASSKEY_CONNECTOR_ID) return;
    setWalletPending(false);
    setAwaitingAuth(true);
    void siwe.signInAs(walletAddress);
  }, [walletPending, isConnected, walletAddress, connector?.id, siwe]);

  useEffect(() => {
    if (!awaitingAuth || siwe.state !== 'error') return;
    setAwaitingAuth(false);
    setBusy(null);
    setError(
      siwe.error === 'email-in-use' ? t.errors.emailInUse
        : siwe.error === 'email-expired' ? t.errors.emailExpired
          : siwe.error === 'cancelled' ? t.errors.walletCancelled
            : t.errors.generic,
    );
  }, [awaitingAuth, siwe.state, siwe.error, t]);

  // Live tag availability, after the shape passes locally.
  useEffect(() => {
    const clean = normalizeTag(tag);
    const issue = localTagIssue(tag);
    if (!clean) return setTagState('idle');
    if (issue) return setTagState(issue);
    setTagState('checking');
    const id = window.setTimeout(async () => {
      try {
        const r = await api.signupTagCheck(clean);
        if (normalizeTag(tag) !== r.tag) return;
        setTagState(r.available ? 'available' : (r.reason ?? 'taken'));
      } catch {
        setTagState('idle');
      }
    }, 350);
    return () => window.clearTimeout(id);
  }, [tag]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setCode('');
    setInStep('email');
    setUpStep('tag');
  }

  async function connectPasskey(kindOf: 'register' | 'login') {
    const { obtainPasskey } = await import('@/features/modularWallet/passkey');
    await obtainPasskey(kindOf, kindOf === 'register' ? email.trim().toLowerCase() : undefined);
    const passkey = connectors.find((c) => c.id === PASSKEY_CONNECTOR_ID);
    if (!passkey) throw new Error('passkey connector missing');
    const { accounts } = await connectAsync({ connector: passkey });
    if (!accounts[0]) throw new Error('no passkey account');
    setAwaitingAuth(true);
    await siwe.signInAs(accounts[0]);
  }

  async function signInLookup(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) return;
    setBusy('lookup');
    setError(null);
    try {
      const r = await api.authLookup(clean);
      setEmail(clean);
      if (!r.exists) return setInStep('not-found');
      if (MODULAR_WALLETS_ENABLED) return setInStep('passkey');
      if (r.hasPasskey && browserSupportsWebAuthn()) {
        testnetPasskey.current = true;
        return setInStep('passkey');
      }
      await api.authOtpRequest(clean);
      setInStep('code');
    } catch {
      setError(t.errors.lookupFailed);
    } finally {
      setBusy(null);
    }
  }

  async function signInWithPasskey() {
    setBusy('passkey');
    setError(null);
    try {
      if (testnetPasskey.current) {
        const { options } = await api.authLoginOptions(email);
        const response = await startAuthentication({ optionsJSON: options });
        await api.authLoginVerify(email, response);
        emitAuthChanged();
        await auth.refresh();
      } else {
        await connectPasskey('login');
      }
    } catch (err) {
      if (!isCancel(err)) console.warn('passkey sign-in failed', err);
      setError(isCancel(err) ? t.errors.passkeyCancelled : t.errors.passkeyFailed);
      setBusy(null);
    }
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) return;
    setBusy('send');
    setError(null);
    try {
      await api.authOtpRequest(clean);
      setEmail(clean);
      setCode('');
      if (mode === 'signup') setUpStep('code');
      else setInStep('code');
    } catch {
      setError(t.errors.codeSendFailed);
    } finally {
      setBusy(null);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    setBusy('verify');
    setError(null);
    try {
      const res = await api.authOtpVerify(email, code);
      if ('emailProof' in res) {
        // Mainnet: the code proves the email; the passkey made next owns the wallet.
        holdEmailProof(res.emailProof);
        setUpStep('passkey');
        setBusy(null);
        return;
      }
      setAwaitingAuth(true);
      emitAuthChanged();
      await auth.refresh();
    } catch {
      setError(t.errors.codeRejected);
      setBusy(null);
    }
  }

  async function createPasskey() {
    setBusy('passkey');
    setError(null);
    try {
      await connectPasskey('register');
    } catch (err) {
      if (!isCancel(err)) console.warn('passkey creation failed', err);
      setError(isCancel(err) ? t.errors.passkeyCancelled : t.errors.passkeyFailed);
      setBusy(null);
    }
  }

  function startWallet(openConnectModal: () => void) {
    setError(null);
    setBusy('wallet');
    if (isConnected && walletAddress && connector?.id !== PASSKEY_CONNECTOR_ID) {
      setAwaitingAuth(true);
      void siwe.signInAs(walletAddress);
      return;
    }
    setWalletPending(true);
    openConnectModal();
    setBusy(null);
  }

  async function acceptTerms(address: string, method: string | null) {
    const status = await api.termsStatus(address);
    if (status.acceptedVersion === status.currentVersion) return;
    const signature = method === 'web3'
      ? await signMessageAsync({ message: termsAcceptanceMessage(address, status.currentVersion) })
      : undefined;
    await api.acceptTerms(status.currentVersion, signature);
  }

  async function createAccount() {
    if (!auth.address || !agreed) return;
    setBusy('create');
    setError(null);
    try {
      await acceptTerms(auth.address, auth.method);
    } catch (err) {
      setError(isCancel(err) ? t.errors.walletCancelled : t.errors.termsFailed);
      setBusy(null);
      return;
    }
    try {
      await api.signupCreate(normalizeTag(tag), kind);
      clearEmailProof();
      goHome();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === 'account_exists') return goHome();
      setBusy(null);
      if (code === 'tag_taken') {
        setTagState('taken');
        setUpStep('tag');
        setError(t.errors.tagTaken);
      } else setError(code === 'business_unavailable' ? t.errors.businessUnavailable : t.errors.generic);
    }
  }

  const s = t.signUp;
  const cleanTag = normalizeTag(tag);
  const tagLine =
    tagState === 'checking' ? s.tagChecking
      : tagState === 'available' ? s.tagAvailable.replace('{tag}', cleanTag)
        : tagState === 'taken' ? s.tagTaken.replace('{tag}', cleanTag)
          : tagState === 'too_short' ? s.tagTooShort
            : tagState === 'too_long' ? s.tagTooLong
              : tagState === 'invalid' ? s.tagInvalid
                : tagState === 'reserved' ? s.tagReserved
                  : s.tagHint;
  const stepNumber = upStep === 'tag' ? 1 : upStep === 'kind' ? 3 : 2;
  const businessOpen = ARC_NETWORK !== 'mainnet';
  const waitingForSignIn = awaitingAuth && (siwe.state === 'awaiting-signature' || siwe.state === 'verifying' || siwe.state === 'switching-network');

  return (
    <div className="w-full rounded-[16px] border border-[var(--lp-outline-strong)] bg-[var(--lp-card)] p-6 shadow-[var(--shadow-pop)] sm:p-8">
      {mode === 'signin' ? (
        <>
          <h1 className="text-[26px] font-bold leading-[1.15] tracking-[-0.03em] text-[var(--lp-dark)]">
            {inStep === 'code' ? t.signIn.codeTitle : inStep === 'passkey' ? t.signIn.passkeyTitle : t.signIn.title}
          </h1>
          {inStep === 'email' && (
            <p className="mt-2 text-[15px] leading-[1.5] text-[var(--lp-text-sub)]">{t.welcome.tagline}</p>
          )}

          {inStep === 'email' && (
            <form onSubmit={signInLookup} className="mt-6 space-y-3">
              <Field label={t.signIn.emailLabel}>
                <input type="email" inputMode="email" autoComplete="email webauthn" value={email}
                  onChange={(e) => setEmail(e.target.value)} disabled={!!busy} className="form-input min-h-[52px]" autoFocus />
              </Field>
              <Primary type="submit" disabled={!!busy || !EMAIL_RE.test(email.trim())}>
                {busy === 'lookup' ? t.signIn.checking : t.signIn.continue}
              </Primary>
            </form>
          )}

          {inStep === 'passkey' && (
            <div className="mt-6 space-y-3">
              <p className="mono text-[14px] text-[var(--lp-text-sub)]">{email}</p>
              <Primary onClick={() => void signInWithPasskey()} disabled={!!busy || waitingForSignIn}>
                {busy === 'passkey' || waitingForSignIn ? t.signIn.passkeyWaiting : t.signIn.passkeyButton}
              </Primary>
            </div>
          )}

          {inStep === 'code' && (
            <CodeForm label={t.signIn.codeLabel} hint={t.signIn.codeSent.replace('{email}', email)} code={code} setCode={setCode}
              busy={busy} onSubmit={verifyCode} submit={busy === 'verify' ? t.signIn.verifying : t.signIn.verify}
              resend={t.signIn.resend} onResend={() => void sendCode()} />
          )}

          {inStep === 'not-found' && (
            <div className="mt-6 space-y-3">
              <p className="text-[15px] text-[var(--lp-text-sub)]">{t.signIn.notFound}</p>
              <Primary onClick={() => switchMode('signup')}>{t.signIn.createInstead}</Primary>
            </div>
          )}

          {(inStep === 'email' || inStep === 'not-found') && (
            <>
              <Divider label={t.signIn.or} />
              <WalletButton label={busy === 'wallet' || waitingForSignIn ? t.signIn.walletSigning : t.signIn.wallet}
                disabled={!!busy || waitingForSignIn} onStart={startWallet} />
            </>
          )}

          <ErrorLine error={error} />

          <div className="mt-7 space-y-2 border-t border-[var(--lp-outline-strong)] pt-5 text-[14px] text-[var(--lp-text-sub)]">
            <p>
              {t.signIn.noAccount}{' '}
              <button type="button" onClick={() => switchMode('signup')} className="font-semibold text-[var(--lp-dark)] underline underline-offset-4">
                {t.signIn.signUp}
              </button>
            </p>
            <p>
              {t.signIn.browsePrompt}{' '}
              <Link href="/market" className="font-semibold text-[var(--lp-dark)] underline underline-offset-4">{t.signIn.browse}</Link>
            </p>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{s.step.replace('{n}', String(stepNumber))}</p>
          <h1 className="mt-1 text-[26px] font-bold leading-[1.15] tracking-[-0.03em] text-[var(--lp-dark)]">
            {upStep === 'tag' ? s.tagLabel
              : upStep === 'code' ? s.codeTitle
                : upStep === 'passkey' ? s.passkeyTitle
                  : upStep === 'kind' ? s.kindTitle
                    : s.title}
          </h1>

          {upStep === 'tag' && (
            <form className="mt-6 space-y-3" onSubmit={(e) => {
              e.preventDefault();
              if (tagState !== 'available') return;
              setUpStep(authedWithoutAccount ? 'kind' : 'method');
            }}>
              <div className="flex min-h-[52px] items-center rounded-[12px] border border-[var(--lp-outline-strong)] bg-transparent px-4 focus-within:ring-2 focus-within:ring-[var(--lp-accent)]">
                <span className="text-[17px] font-semibold text-[var(--lp-text-sub)]" aria-hidden>@</span>
                <input aria-label={s.tagLabel} value={tag} onChange={(e) => setTag(e.target.value.replace(/\s/g, ''))}
                  autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={21} autoFocus
                  className="ms-1 h-[50px] w-full bg-transparent text-[17px] text-[var(--lp-dark)] outline-none" />
              </div>
              <p aria-live="polite" className={`text-[14px] ${tagState === 'available' ? 'text-[var(--lp-dark)]' : tagState === 'idle' || tagState === 'checking' ? 'text-[var(--lp-text-sub)]' : 'text-[var(--lp-critical)]'}`}>
                {tagLine}
              </p>
              <Primary type="submit" disabled={tagState !== 'available'}>{s.next}</Primary>
            </form>
          )}

          {upStep === 'method' && (
            <div className="mt-6 space-y-3">
              <p className="text-[15px] font-semibold text-[var(--lp-dark)]">@{cleanTag}</p>
              <form onSubmit={sendCode} className="space-y-3">
                <Field label={s.emailLabel}>
                  <input type="email" inputMode="email" autoComplete="email" value={email}
                    onChange={(e) => setEmail(e.target.value)} disabled={!!busy} className="form-input min-h-[52px]" autoFocus />
                </Field>
                <Primary type="submit" disabled={!!busy || !EMAIL_RE.test(email.trim())}>
                  {busy === 'send' ? s.sending : s.sendCode}
                </Primary>
              </form>
              <Divider label={t.signIn.or} />
              <WalletButton label={busy === 'wallet' || waitingForSignIn ? s.walletSigning : s.wallet}
                disabled={!!busy || waitingForSignIn} onStart={startWallet} />
              <BackLink label={s.back} onClick={() => setUpStep('tag')} />
            </div>
          )}

          {upStep === 'code' && (
            <>
              <CodeForm label={s.codeLabel} hint={s.codeSent.replace('{email}', email)} code={code} setCode={setCode}
                busy={busy} onSubmit={verifyCode} submit={busy === 'verify' ? s.verifying : s.verify}
                resend={s.resend} onResend={() => void sendCode()} />
              <BackLink label={s.back} onClick={() => setUpStep('method')} />
            </>
          )}

          {upStep === 'passkey' && (
            <div className="mt-6 space-y-3">
              <p className="text-[15px] leading-[1.5] text-[var(--lp-text-sub)]">{s.passkeyBody}</p>
              <Primary onClick={() => void createPasskey()} disabled={!!busy || waitingForSignIn}>
                {busy === 'passkey' || waitingForSignIn ? s.passkeyWaiting : s.passkeyCreate}
              </Primary>
            </div>
          )}

          {upStep === 'kind' && (
            <div className="mt-6 space-y-3">
              <p className="text-[15px] font-semibold text-[var(--lp-dark)]">@{cleanTag}</p>
              <div role="radiogroup" aria-label={s.kindTitle} className="grid gap-3 sm:grid-cols-2">
                <KindOption selected={kind === 'person'} title={s.person} body={s.personBody} onSelect={() => setKind('person')} />
                <KindOption selected={kind === 'business'} title={s.business} body={s.businessBody}
                  badge={businessOpen ? undefined : s.comingSoon} disabled={!businessOpen} onSelect={() => setKind('business')} />
              </div>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 pt-2 text-[14px] leading-[1.5] text-[var(--lp-text-sub)]">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--lp-accent)]" />
                <span>
                  {s.termsPrefix}{' '}
                  <Link href="/terms" target="_blank" className="font-semibold text-[var(--lp-dark)] underline underline-offset-4">{s.termsLink}</Link>
                </span>
              </label>
              <Primary onClick={() => void createAccount()} disabled={!agreed || !!busy || !auth.address}>
                {busy === 'create' ? s.creating : s.create}
              </Primary>
            </div>
          )}

          <ErrorLine error={error} />

          {!authedWithoutAccount && (
            <p className="mt-7 border-t border-[var(--lp-outline-strong)] pt-5 text-[14px] text-[var(--lp-text-sub)]">
              {s.haveAccount}{' '}
              <button type="button" onClick={() => switchMode('signin')} className="font-semibold text-[var(--lp-dark)] underline underline-offset-4">
                {s.signIn}
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[14px] font-semibold text-[var(--lp-dark)]">{label}</span>
      {children}
    </label>
  );
}

function Primary(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props}
      className="inline-flex min-h-[52px] w-full items-center justify-center rounded-[12px] bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)] disabled:cursor-not-allowed disabled:opacity-50" />
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-4" aria-hidden>
      <span className="h-px flex-1 bg-[var(--lp-outline-strong)]" />
      <span className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{label}</span>
      <span className="h-px flex-1 bg-[var(--lp-outline-strong)]" />
    </div>
  );
}

function WalletButton({ label, disabled, onStart }: { label: string; disabled: boolean; onStart: (open: () => void) => void }) {
  return (
    <ConnectButton.Custom>
      {({ openConnectModal, mounted }) => (
        <button type="button" disabled={!mounted || disabled} onClick={() => onStart(openConnectModal)}
          className="inline-flex min-h-[52px] w-full items-center justify-between gap-3 rounded-[12px] border border-[var(--lp-outline-strong)] bg-transparent px-5 text-[15px] font-semibold text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-workspace-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] disabled:cursor-not-allowed disabled:opacity-50">
          {label}
          <span aria-hidden className="rtl:rotate-180">→</span>
        </button>
      )}
    </ConnectButton.Custom>
  );
}

function CodeForm(props: {
  label: string; hint: string; code: string; setCode: (v: string) => void; busy: Busy;
  onSubmit: (e: React.FormEvent) => void; submit: string; resend: string; onResend: () => void;
}) {
  return (
    <form onSubmit={props.onSubmit} className="mt-6 space-y-3">
      <p className="text-[15px] leading-[1.5] text-[var(--lp-text-sub)]">{props.hint}</p>
      <Field label={props.label}>
        <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={props.code}
          onChange={(e) => props.setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={!!props.busy}
          className="form-input mono min-h-[52px] text-[18px] tracking-[0.3em]" autoFocus />
      </Field>
      <Primary type="submit" disabled={!!props.busy || props.code.length !== 6}>{props.submit}</Primary>
      <button type="button" onClick={props.onResend} disabled={!!props.busy}
        className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-text-sub)] underline underline-offset-4 hover:text-[var(--lp-dark)] disabled:opacity-50">
        {props.resend}
      </button>
    </form>
  );
}

function KindOption(props: { selected: boolean; title: string; body: string; badge?: string; disabled?: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={props.selected} disabled={props.disabled} onClick={props.onSelect}
      className={`min-h-[96px] rounded-[12px] border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] disabled:cursor-not-allowed disabled:opacity-60 ${props.selected ? 'border-[var(--lp-dark)] bg-[var(--lp-workspace-soft)]' : 'border-[var(--lp-outline-strong)] hover:bg-[var(--lp-workspace-soft)]'}`}>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[16px] font-semibold text-[var(--lp-dark)]">{props.title}</span>
        {props.badge && <span className="rounded-[6px] border border-[var(--lp-outline-strong)] px-2 py-0.5 text-[12px] font-semibold text-[var(--lp-text-sub)]">{props.badge}</span>}
      </span>
      <span className="mt-1 block text-[14px] leading-[1.45] text-[var(--lp-text-sub)]">{props.body}</span>
    </button>
  );
}

function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-text-sub)] underline underline-offset-4 hover:text-[var(--lp-dark)]">
      {label}
    </button>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-4 border-s-2 border-[var(--neg)] ps-3 text-[14px] leading-snug text-[var(--lp-critical)]">
      {error}
    </p>
  );
}
