'use client';
import { useEffect, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { api, ApiError } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';

type Tab = 'wallet' | 'passkey';
type Mode = 'login' | 'register';

interface Props {
  open: boolean;
  onClose: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginModal({ open, onClose }: Props) {
  const { refresh, isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>('wallet');
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeyConfigured, setPasskeyConfigured] = useState<boolean | null>(null);
  const [supportsWebAuthn, setSupportsWebAuthn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSupportsWebAuthn(browserSupportsWebAuthn());
    api
      .authStatus()
      .then((r) => setPasskeyConfigured(r.configured))
      .catch(() => setPasskeyConfigured(false));
  }, [open]);

  // Auto-close once authentication actually lands. Covers both paths: a
  // wallet just connected via wagmi, or a passkey ceremony just finished.
  useEffect(() => {
    if (open && isAuthenticated) onClose();
  }, [open, isAuthenticated, onClose]);

  if (!open) return null;

  async function handlePasskey(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Enter a valid email.');
      return;
    }
    if (!supportsWebAuthn) {
      setError("Your browser doesn't support passkeys. Try a wallet instead.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') {
        const optsRes = await api.authRegisterOptions(trimmed);
        const attResp = await startRegistration({ optionsJSON: optsRes.options });
        await api.authRegisterVerify(trimmed, attResp);
      } else {
        const optsRes = await api.authLoginOptions(trimmed);
        const assertResp = await startAuthentication({ optionsJSON: optsRes.options });
        await api.authLoginVerify(trimmed, assertResp);
      }
      await refresh();
      onClose();
    } catch (err) {
      const detail =
        err instanceof ApiError && err.detail
          ? String(err.detail)
          : (err as Error).message;
      setError(detail || 'Passkey ceremony failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(14,14,14,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Log in"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden fade-up"
        style={{
          background: 'var(--lp-card)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 5,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.35)',
        }}
      >
        <div className="px-6 pt-6 pb-4 border-b border-[var(--lp-border-light)]">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:LOG IN TO KARWAN:]
          </p>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-tight text-[var(--lp-dark)]">
            Pick a way in<span style={{ color: 'var(--lp-accent)' }}>.</span>
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
            Connect a wallet or sign in with a passkey. Both give you an on-chain identity on
            Arc.
          </p>
        </div>

        <div className="px-6 pt-4">
          <div
            className="inline-flex p-1 gap-1 w-full"
            style={{
              background: 'var(--lp-light)',
              border: '1px solid var(--lp-border-light)',
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 2,
            }}
          >
            <TabPill active={tab === 'wallet'} onClick={() => setTab('wallet')}>
              Wallet
            </TabPill>
            <TabPill active={tab === 'passkey'} onClick={() => setTab('passkey')}>
              Email + passkey
            </TabPill>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {tab === 'wallet' && (
            <div className="space-y-3">
              <p className="text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
                MetaMask, Rabby, WalletConnect — any EVM wallet. Your address is your identity.
              </p>
              <ConnectButton />
            </div>
          )}
          {tab === 'passkey' && (
            <form onSubmit={handlePasskey} className="space-y-4">
              {passkeyConfigured === false && (
                <p className="mono text-[11px] text-[#b25425] leading-snug">
                  Passkey login is not configured on this backend. Use a wallet instead.
                </p>
              )}
              {supportsWebAuthn === false && (
                <p className="mono text-[11px] text-[#b25425] leading-snug">
                  This browser doesn&apos;t support passkeys. Try a different browser or use a
                  wallet.
                </p>
              )}
              <label className="block space-y-1.5">
                <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                  Email
                </span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email webauthn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  placeholder="you@example.com"
                  className="form-input"
                />
              </label>
              <div
                className="inline-flex p-1 gap-1"
                style={{
                  background: 'var(--lp-light)',
                  border: '1px solid var(--lp-border-light)',
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                  borderBottomLeftRadius: 8,
                  borderBottomRightRadius: 2,
                }}
              >
                <ModePill active={mode === 'login'} onClick={() => setMode('login')}>
                  Sign in
                </ModePill>
                <ModePill active={mode === 'register'} onClick={() => setMode('register')}>
                  Create
                </ModePill>
              </div>
              <button
                type="submit"
                disabled={
                  busy ||
                  !email ||
                  passkeyConfigured === false ||
                  supportsWebAuthn === false
                }
                className="inline-flex items-center gap-2 px-[20px] py-[12px] mono text-[12px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  borderBottomLeftRadius: 12,
                  borderBottomRightRadius: 3,
                }}
              >
                {busy
                  ? mode === 'register'
                    ? 'Creating account…'
                    : 'Verifying passkey…'
                  : mode === 'register'
                    ? 'Create with passkey'
                    : 'Sign in with passkey'}
              </button>
              <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-snug">
                {mode === 'register'
                  ? 'We create a Circle wallet for you. No private key to manage.'
                  : 'We never see your passkey. Your device signs the challenge.'}
              </p>
              {error && (
                <p className="mono text-[11px] text-[#b25425] leading-snug">{error}</p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 px-3 py-1.5 mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors"
      style={{
        background: active ? 'var(--lp-card)' : 'transparent',
        color: active ? 'var(--lp-dark)' : 'var(--lp-text-sub)',
        border: active ? '1px solid var(--lp-border-light)' : '1px solid transparent',
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 2,
        boxShadow: active ? '0 1px 0 rgba(0,0,0,0.04)' : 'none',
      }}
    >
      {children}
    </button>
  );
}

function ModePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1 mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors"
      style={{
        background: active ? 'var(--lp-card)' : 'transparent',
        color: active ? 'var(--lp-dark)' : 'var(--lp-text-sub)',
        border: active ? '1px solid var(--lp-border-light)' : '1px solid transparent',
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        borderBottomLeftRadius: 6,
        borderBottomRightRadius: 2,
      }}
    >
      {children}
    </button>
  );
}
