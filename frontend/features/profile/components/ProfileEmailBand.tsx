'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { PROFILE_SAVED_EVENT } from '@/shared/hooks/useUserProfile';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Band, SectionTag, HeroHeadline, Punc, PageCard } from '@/shared/components/Bands';

const cornerStyle = {
  borderTopLeftRadius: 6,
  borderTopRightRadius: 6,
  borderBottomLeftRadius: 6,
  borderBottomRightRadius: 2,
} as const;

/// Contact email band on /profile, for every wallet user. Email-login users see
/// their address already verified; web3 users add one and confirm it with a
/// 6-digit code. Business accounts read it as the business email. The email
/// drives deal alerts and Karwan product updates. Top-level component so the
/// rest of /profile re-renders nothing while this is edited.
export function ProfileEmailBand({ address }: { address: string }) {
  const t = useTranslations().profileEmail;
  const qc = useQueryClient();
  const { profile, loading } = useUserProfile();
  const business = useQuery({
    queryKey: qk.business.status(address),
    queryFn: () => api.getBusinessStatus(address),
    enabled: !!address,
    staleTime: 60_000,
  });
  const isBusiness =
    business.data?.accountType === 'business' ||
    business.data?.status === 'verified' ||
    business.data?.status === 'submitted';

  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [emailInput, setEmailInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentEmail = profile?.email;
  const verified = !!profile?.email && !!profile?.emailVerified;
  const headline = isBusiness ? t.headlineBusiness : t.headlineIndividual;

  function refresh() {
    qc.invalidateQueries({ queryKey: qk.profile.me(address) });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(PROFILE_SAVED_EVENT));
    }
  }

  function startEditing() {
    setEmailInput(currentEmail ?? '');
    setCodeInput('');
    setPendingEmail('');
    setDevCode(null);
    setError(null);
    setStep('email');
    setEditing(true);
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
      setError((e as Error).message);
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
      setEditing(false);
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
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) {
    return (
      <Band tone="light" compact>
        <SectionTag>[:EMAIL:]</SectionTag>
        <HeroHeadline size="md">
          Loading<Punc>…</Punc>
        </HeroHeadline>
      </Band>
    );
  }

  return (
    <Band tone="light" compact>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <SectionTag dot={verified ? 'live' : undefined}>[:EMAIL:]</SectionTag>
          <HeroHeadline size="md">
            {headline}
            <Punc>.</Punc>
          </HeroHeadline>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={startEditing}
            className="mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 border border-black/15 hover:border-black/40 transition-colors"
            style={cornerStyle}
          >
            {verified ? t.change : t.add}
          </button>
        ) : null}
      </div>

      <div className="mt-7">
        <PageCard>
          <div className="p-5 md:p-6 space-y-4">
            {!editing ? (
              verified ? (
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                      {t.currentLabel}
                    </p>
                    <p className="mt-1.5 text-[15px] text-[var(--lp-dark)] truncate">
                      {currentEmail}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className="inline-flex items-center gap-2 mono text-[10px] font-bold uppercase tracking-[0.16em] px-2.5 py-1 border"
                      style={{ color: 'var(--lp-positive)', borderColor: 'var(--lp-positive)', ...cornerStyle }}
                    >
                      <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--lp-positive)' }} />
                      {t.verifiedTag}
                    </span>
                    <button
                      type="button"
                      onClick={remove}
                      className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-critical)] transition-colors"
                    >
                      {t.remove}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[14px] text-[var(--lp-text-sub)] leading-relaxed">
                  {isBusiness ? t.descriptionBusiness : t.descriptionIndividual}
                </p>
              )
            ) : step === 'email' ? (
              <div className="space-y-3">
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
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={sendCode}
                    disabled={sending}
                    className="mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 bg-[var(--lp-dark)] text-[var(--lp-light)] disabled:opacity-60"
                    style={cornerStyle}
                  >
                    {sending ? t.sending : t.sendCode}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={sending}
                    className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]"
                  >
                    {t.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[13.5px] text-[var(--lp-text-sub)] leading-relaxed">
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
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={verify}
                    disabled={verifying}
                    className="mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-1.5 bg-[var(--lp-dark)] text-[var(--lp-light)] disabled:opacity-60"
                    style={cornerStyle}
                  >
                    {verifying ? t.verifying : t.verify}
                  </button>
                  <button
                    type="button"
                    onClick={sendCode}
                    disabled={sending || verifying}
                    className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
                  >
                    {sending ? t.sending : t.resend}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={verifying}
                    className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]"
                  >
                    {t.cancel}
                  </button>
                </div>
              </div>
            )}
            {error ? (
              <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-critical)]">
                {error}
              </p>
            ) : null}
          </div>
        </PageCard>
      </div>
    </Band>
  );
}
