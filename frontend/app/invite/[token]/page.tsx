'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/core/api';
import { useAuth, emitAuthChanged } from '@/shared/hooks/useAuth';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
  PageCard,
} from '@/shared/components/Bands';
import { formatUsdc, relativeTime } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

type InviteResponse = Awaited<ReturnType<typeof api.getDealInvite>>;

/// /invite/[token] is the only page in Karwan that walks an unauthenticated
/// recipient through email verification and binds them to a deal in a single
/// flow. The page is intentionally permissive: anyone with the link can see
/// the deal summary, but only the holder of the invited email can claim it.
export default function InvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';
  const auth = useAuth();
  const ip = useTranslations().invitePage;

  const [data, setData] = useState<InviteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stage, setStage] = useState<'review' | 'send-code' | 'verify-code' | 'claiming'>('review');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!token) return;
    api
      .getDealInvite(token)
      .then((r) => {
        if (!alive) return;
        setData(r);
      })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ApiError && err.code === 'CLAIMED') {
          const body = err.detail as { jobId?: string } | undefined;
          if (body?.jobId) {
            router.replace(`/deals/${body.jobId}`);
            return;
          }
        }
        const msg =
          err instanceof ApiError && err.detail
            ? typeof err.detail === 'string'
              ? err.detail
              : (err.detail as { error?: string }).error ?? err.message
            : (err as Error).message;
        setLoadError(msg);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, router]);

  const sessionMatchesEmail = useMemo(
    () =>
      !!auth.email &&
      !!data?.invite.email &&
      auth.email.toLowerCase() === data.invite.email.toLowerCase(),
    [auth.email, data?.invite.email],
  );

  const claim = useCallback(async () => {
    if (!data) return;
    setBusy(true);
    setActionError(null);
    setStage('claiming');
    try {
      const r = await api.claimDealInvite(token);
      router.replace(r.redirectTo);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.detail
          ? String(err.detail)
          : (err as Error).message;
      setActionError(msg);
      setStage('review');
    } finally {
      setBusy(false);
    }
  }, [data, token, router]);

  // If the viewer is already signed in with the matching email, auto-claim
  // when the data loads so the page acts as a deep link.
  useEffect(() => {
    if (sessionMatchesEmail && data && !busy && stage === 'review') {
      void claim();
    }
  }, [sessionMatchesEmail, data, busy, stage, claim]);

  async function sendCode() {
    if (!data) return;
    setBusy(true);
    setActionError(null);
    try {
      // Go through the api client so the request hits the backend host
      // (NEXT_PUBLIC_BACKEND_URL). A raw fetch('/api/...') resolves against
      // the current origin (karwan.site) and lands on Vercel's HTML 404 page,
      // which the .json() parser then chokes on as "<!DOCTYPE ..." not JSON.
      await api.authOtpRequest(data.invite.email);
      setStage('verify-code');
    } catch (err) {
      const msg =
        err instanceof ApiError && err.detail
          ? String(err.detail)
          : (err as Error).message;
      setActionError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!data) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setActionError(ip.errors.codeSixDigits);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await api.authOtpVerify(data.invite.email, code.trim());
      emitAuthChanged();
      await auth.refresh();
      // Claim runs automatically from the effect above once the auth slice updates.
      await claim();
    } catch (err) {
      const msg =
        err instanceof ApiError && err.detail
          ? String(err.detail)
          : (err as Error).message;
      setActionError(msg);
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <SectionTag tone="dark">{ip.eyebrow}</SectionTag>
          <HeroHeadline size="md">
            {ip.loading.headline}<Punc>.</Punc>
          </HeroHeadline>
        </Band>
      </FullBleed>
    );
  }

  if (loadError || !data) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <SectionTag tone="dark">{ip.eyebrow}</SectionTag>
          <HeroHeadline size="md">
            {ip.unavailable.headline}<Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-6 text-[15px] text-[var(--lp-text-muted)] leading-relaxed max-w-[58ch]">
            {loadError ?? ip.unavailable.fallback}
          </p>
        </Band>
      </FullBleed>
    );
  }

  const { invite, deal } = data;

  const heroIntroParts = ip.hero.intro.split('{email}');
  const sendIntroParts = ip.sendCode.intro.split('{email}');
  const verifyIntroParts = ip.verifyCode.intro.split('{email}');

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <SectionTag tone="dark" dot="live">
          {ip.eyebrow}
        </SectionTag>
        <HeroHeadline size="md">
          {ip.hero.headlineBefore}<Accent>{ip.hero.headlineAccent}</Accent>{ip.hero.headlineAfter}<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[58ch]">
          {heroIntroParts[0].replace('{inviter}', deal.inviterMasked)}
          <span className="text-white font-semibold">{invite.email}</span>
          {heroIntroParts[1] ?? ''}
        </p>
      </Band>

      <Band tone="light" compact>
        <SectionTag>{ip.deal.eyebrow}</SectionTag>
        <HeroHeadline size="md">
          {formatUsdc(deal.dealAmountUsdc, { withSuffix: false })}{' '}
          <span className="mono text-[18px] font-semibold uppercase tracking-[0.08em] text-[var(--lp-text-sub)]">
            USDC
          </span>
          <Punc>.</Punc>
        </HeroHeadline>

        <div className="mt-8">
          <PageCard>
            <div className="px-5 py-4 space-y-4">
              <div>
                <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] mb-1">
                  {ip.deal.termsLabel}
                </p>
                <p className="text-[14px] leading-relaxed text-[var(--lp-dark)] whitespace-pre-wrap">
                  {deal.terms}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--lp-border-light)]">
                <Stat label={ip.deal.onDelivery} value={`${deal.firstReleasePct}%`} />
                <Stat label={ip.deal.onVerification} value={`${100 - deal.firstReleasePct}%`} />
                <Stat
                  label={ip.deal.deadline}
                  value={
                    deal.deadlineUnix
                      ? relativeTime(deal.deadlineUnix * 1000)
                      : ip.deal.openEnded
                  }
                />
                <Stat
                  label={ip.deal.claimBy}
                  /// Prefer the deal's acceptanceDeadlineUnix (the time the
                  /// recipient has to actually accept the deal, set by the
                  /// buyer at create time, default 24h). The invite link's
                  /// own expiresAt is a generous 7-day TTL; using it here
                  /// misrepresented the real "you have N to claim" window
                  /// when the buyer chose something shorter like 1 hour.
                  value={
                    deal.acceptanceDeadlineUnix
                      ? relativeTime(deal.acceptanceDeadlineUnix * 1000)
                      : relativeTime(invite.expiresAt)
                  }
                />
              </div>
            </div>
          </PageCard>
        </div>

        <div className="mt-8 max-w-[58ch]">
          {stage === 'review' && !sessionMatchesEmail && (
            <div className="space-y-4">
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                {sendIntroParts[0]}
                <strong>{invite.email}</strong>
                {sendIntroParts[1] ?? ''}
              </p>
              <button
                type="button"
                onClick={sendCode}
                disabled={busy}
                className={cn(
                  'inline-flex items-center gap-2 px-5 py-3 mono text-[12px] font-bold uppercase tracking-[0.08em]',
                  'bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
                style={{
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  borderBottomLeftRadius: 12,
                  borderBottomRightRadius: 3,
                }}
              >
                {busy ? ip.sendCode.busy : ip.sendCode.cta}
              </button>
            </div>
          )}

          {(stage === 'send-code' || stage === 'verify-code') && (
            <div className="space-y-4">
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                {verifyIntroParts[0]}
                <strong>{invite.email}</strong>
                {verifyIntroParts[1] ?? ''}
              </p>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="form-input form-input-mono w-[180px] tracking-[0.4em] text-center text-[18px]"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={verifyCode}
                  disabled={busy || code.length !== 6}
                  className={cn(
                    'inline-flex items-center gap-2 px-5 py-3 mono text-[12px] font-bold uppercase tracking-[0.08em]',
                    'bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                  style={{
                    borderTopLeftRadius: 12,
                    borderTopRightRadius: 12,
                    borderBottomLeftRadius: 12,
                    borderBottomRightRadius: 3,
                  }}
                >
                  {busy ? ip.verifyCode.busy : ip.verifyCode.cta}
                </button>
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={busy}
                  className="px-4 py-3 mono text-[12px] uppercase tracking-[0.08em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] underline underline-offset-2"
                >
                  {ip.verifyCode.resend}
                </button>
              </div>
            </div>
          )}

          {stage === 'claiming' && (
            <p className="text-[14px] text-[var(--lp-text-sub)]">{ip.claiming.status}</p>
          )}

          {actionError && (
            <p className="mt-4 mono text-[12px] text-[#7a1f1a]">{actionError}</p>
          )}
        </div>
      </Band>
    </FullBleed>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {label}
      </p>
      <p className="mt-1 font-sans text-[15px] font-extrabold text-[var(--lp-dark)] tabular-nums tracking-[-0.01em]">
        {value}
      </p>
    </div>
  );
}
