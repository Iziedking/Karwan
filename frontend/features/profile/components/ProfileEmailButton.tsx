'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { useUserProfile, PROFILE_SAVED_EVENT } from '@/shared/hooks/useUserProfile';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useQueryClient } from '@tanstack/react-query';

function MailGlyph({ size = 13 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-[5px] shrink-0"
      style={{ background: 'var(--lp-dark)', width: size + 5, height: size + 5 }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="var(--lp-light)" strokeWidth="1.8" />
        <path d="M4 7l8 6 8-6" stroke="var(--lp-light)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/// Email add + verify, as a pill that matches the Telegram / X connect chips.
/// Lives in the identity header (tone dark) and the REACH PIPES preferences
/// band (tone light). Opens a modal carrying the request -> code -> verify
/// flow. Email-login users already see a verified address; web3 users add one.
export function ProfileEmailButton({
  address,
  tone = 'dark',
}: {
  address: string;
  tone?: 'dark' | 'light';
}) {
  const t = useTranslations().profileEmail;
  const { profile } = useUserProfile();
  const auth = useAuth();
  const [open, setOpen] = useState(false);

  // Email-login users already gave us a verified email at sign-up; it IS their
  // identity, so surface it instead of an "Add email" CTA. Only web3 users,
  // who logged in with a wallet and no email, see the add flow.
  const sessionEmail = auth.method === 'circle' ? auth.email : undefined;
  const displayEmail = profile?.email ?? sessionEmail;
  const verified = !!displayEmail && (!!profile?.emailVerified || !!sessionEmail);
  const onLight = tone === 'light';
  const chipClass = onLight
    ? 'border-[var(--lp-border)] text-[var(--lp-dark)] hover:bg-[var(--lp-light)]'
    : 'border-white/20 text-white hover:bg-white/[0.08] hover:border-white/35';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={verified ? (displayEmail ?? '') : t.add}
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 mono text-[11px] font-bold uppercase tracking-[0.08em] border ${chipClass} transition-colors w-fit max-w-[240px]`}
        style={{
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 2,
        }}
      >
        <MailGlyph />
        <span className="truncate normal-case tracking-normal">
          {verified ? displayEmail : t.add}
        </span>
        {verified && (
          <span
            className="text-[9px] uppercase tracking-[0.12em] font-bold px-1.5 py-0.5"
            style={{ background: 'rgba(175, 201, 91,0.18)', color: 'var(--lp-accent)', borderRadius: 3 }}
          >
            {t.verifiedTag}
          </span>
        )}
      </button>
      {open && <EmailModal address={address} onClose={() => setOpen(false)} />}
    </>
  );
}

function EmailModal({ address, onClose }: { address: string; onClose: () => void }) {
  const t = useTranslations().profileEmail;
  const qc = useQueryClient();
  const { profile, loading: profileLoading } = useUserProfile();
  const auth = useAuth();
  // Until auth + profile resolve we can't tell verified from not, so hold the
  // body in a neutral skeleton instead of flashing the "Add email" form before
  // the verified card paints.
  const notReady = auth.isLoading || profileLoading;
  const isBusiness = profile?.accountKind === 'business';
  // An email-login user's verified email is their login email even before the
  // backend backfills profile.email, so prefer it for display + prefill.
  const sessionEmail = auth.method === 'circle' ? auth.email : undefined;
  const displayEmail = profile?.email ?? sessionEmail;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [emailInput, setEmailInput] = useState(displayEmail ?? '');
  const [codeInput, setCodeInput] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verified = !!displayEmail && (!!profile?.emailVerified || !!sessionEmail);

  function refresh() {
    qc.invalidateQueries({ queryKey: qk.profile.me(address) });
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_SAVED_EVENT));
  }

  async function sendCode() {
    setError(null);
    const email = emailInput.trim();
    if (!email) {
      setError(t.errors.emailRequired);
      return;
    }
    setSending(true);
    try {
      const r = await api.requestEmailVerify(address, email);
      setPendingEmail(email);
      setDevCode(r.devCode ?? null);
      setStep('code');
    } catch (e) {
      // The 409 "email in use" carries the friendly line on `detail`; prefer it
      // over the terse top-level error code.
      setError(e instanceof ApiError && e.detail ? String(e.detail) : (e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    setError(null);
    if (!/^\d{6}$/.test(codeInput.trim())) {
      setError(t.errors.codeShape);
      return;
    }
    setVerifying(true);
    try {
      await api.verifyEmail(address, codeInput.trim());
      refresh();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVerifying(false);
    }
  }

  async function remove() {
    setError(null);
    try {
      await api.removeEmail(address);
      refresh();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(14,14,14,0.55)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md my-auto max-h-[90vh] overflow-y-auto bg-[var(--lp-card)] text-[var(--lp-dark)] fade-up"
        style={{
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 5,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.35)',
        }}
      >
        <div className="px-6 pt-6 pb-3 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <MailGlyph size={16} />
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                {isBusiness ? t.businessEmailLabel : t.emailLabel}
              </span>
            </div>
            <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-none">
              {isBusiness ? t.headlineBusiness : t.headlineIndividual}
              <span style={{ color: 'var(--lp-accent)' }}>.</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.cancel}
            className="size-8 inline-flex items-center justify-center rounded-full text-[var(--lp-text-sub)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {notReady && step === 'email' ? (
            <div className="space-y-3" aria-hidden>
              <div className="h-[68px] rounded-xl bg-[var(--lp-light)] animate-pulse motion-reduce:animate-none" />
              <div className="h-4 w-2/3 rounded-md bg-[var(--lp-light)] animate-pulse motion-reduce:animate-none" />
            </div>
          ) : verified && step === 'email' ? (
            <div
              className="px-4 py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
              style={{
                background: 'var(--lp-light)',
                border: '1px solid var(--lp-border-light)',
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              <div className="min-w-0">
                <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                  {t.currentLabel}
                </p>
                <p className="mt-1 font-sans text-[16px] font-extrabold tracking-[-0.01em] truncate">
                  {displayEmail}
                </p>
              </div>
              <span
                className="inline-flex items-center gap-1.5 mono text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-0.5"
                style={{ background: 'rgba(175, 201, 91,0.18)', color: 'var(--lp-accent)', borderRadius: 3 }}
              >
                {t.verifiedTag}
              </span>
            </div>
          ) : null}

          {step === 'email' && verified ? (
            // One email at a time. Once verified, the only action is removal;
            // adding a different address means removing this one first.
            <>
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                {t.manageNote}
              </p>
              <button
                type="button"
                onClick={remove}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 mono text-[12px] font-bold uppercase tracking-[0.08em] border border-[var(--lp-border)] text-[var(--lp-text-sub)] hover:border-[var(--lp-critical)] hover:text-[var(--lp-critical)] transition-colors"
                style={{ borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomLeftRadius: 12, borderBottomRightRadius: 4 }}
              >
                {t.remove}
              </button>
            </>
          ) : step === 'email' ? (
            <>
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                {isBusiness ? t.descriptionBusiness : t.descriptionIndividual}
              </p>
              <label className="block space-y-2">
                <span className="mono text-[10px] uppercase tracking-[0.14em] font-medium text-[var(--lp-text-muted)]">
                  {isBusiness ? t.businessEmailLabel : t.emailLabel}
                </span>
                <input
                  type="email"
                  value={emailInput}
                  disabled={sending}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder={isBusiness ? 'ops@yourcompany.com' : 'you@example.com'}
                  maxLength={200}
                  className="form-input"
                />
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={sending}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 mono text-[12px] font-bold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-60 transition-colors"
                  style={{ borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomLeftRadius: 12, borderBottomRightRadius: 4 }}
                >
                  {sending ? t.sending : t.sendCode}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[13.5px] leading-relaxed text-[var(--lp-text-sub)]">
                {t.sentNote.replace('{email}', pendingEmail)}
              </p>
              {devCode ? (
                <p className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-accent)]">
                  {t.devCodeNote.replace('{code}', devCode)}
                </p>
              ) : null}
              <label className="block space-y-2">
                <span className="mono text-[10px] uppercase tracking-[0.14em] font-medium text-[var(--lp-text-muted)]">
                  {t.codeLabel}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={codeInput}
                  disabled={verifying}
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="form-input tabular-nums tracking-[0.3em]"
                />
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={verify}
                  disabled={verifying}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 mono text-[12px] font-bold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-60 transition-colors"
                  style={{ borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomLeftRadius: 12, borderBottomRightRadius: 4 }}
                >
                  {verifying ? t.verifying : t.verify}
                </button>
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={sending || verifying}
                  className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
                >
                  {sending ? t.sending : t.resend}
                </button>
              </div>
            </>
          )}

          {error ? (
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-critical)]">{error}</p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
