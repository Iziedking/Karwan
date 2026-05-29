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

  const [data, setData] = useState<InviteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stage, setStage] = useState<'review' | 'send-code' | 'verify-code' | 'claiming'>('review');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

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
      const r = await api.authOtpRequest(data.invite.email);
      if (r.devCode) setDevCode(r.devCode);
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
      setActionError('Code must be 6 digits.');
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
          <SectionTag tone="dark">INVITE</SectionTag>
          <HeroHeadline size="md">
            Loading<Punc>.</Punc>
          </HeroHeadline>
        </Band>
      </FullBleed>
    );
  }

  if (loadError || !data) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <SectionTag tone="dark">INVITE</SectionTag>
          <HeroHeadline size="md">
            Not available<Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-6 text-[15px] text-[var(--lp-text-muted)] leading-relaxed max-w-[58ch]">
            {loadError ?? 'This invite is no longer valid.'}
          </p>
        </Band>
      </FullBleed>
    );
  }

  const { invite, deal } = data;

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <SectionTag tone="dark" dot="live">
          INVITE
        </SectionTag>
        <HeroHeadline size="md">
          A deal is <Accent>waiting</Accent> for you<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[58ch]">
          {deal.inviterMasked} opened a Karwan deal and shared the link with{' '}
          <span className="text-white font-semibold">{invite.email}</span>. Verify the email is
          yours and the escrow is bound to your wallet. No app to install. No signup if you don&apos;t
          want one later.
        </p>
      </Band>

      <Band tone="light" compact>
        <SectionTag>DEAL</SectionTag>
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
                  [:TERMS:]
                </p>
                <p className="text-[14px] leading-relaxed text-[var(--lp-dark)] whitespace-pre-wrap">
                  {deal.terms}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--lp-border-light)]">
                <Stat label="On delivery" value={`${deal.firstReleasePct}%`} />
                <Stat label="On verification" value={`${100 - deal.firstReleasePct}%`} />
                <Stat
                  label="Deadline"
                  value={
                    deal.deadlineUnix
                      ? relativeTime(deal.deadlineUnix * 1000)
                      : 'Open-ended'
                  }
                />
                <Stat
                  label="Claim by"
                  value={relativeTime(invite.expiresAt)}
                />
              </div>
            </div>
          </PageCard>
        </div>

        <div className="mt-8 max-w-[58ch]">
          {stage === 'review' && !sessionMatchesEmail && (
            <div className="space-y-4">
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                We send a 6-digit code to <strong>{invite.email}</strong>. Enter it on the next step
                and the escrow is bound to a Karwan wallet on Arc, all yours.
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
                {busy ? 'Sending…' : 'Send code to my email'}
              </button>
            </div>
          )}

          {(stage === 'send-code' || stage === 'verify-code') && (
            <div className="space-y-4">
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                Enter the 6-digit code we just emailed to <strong>{invite.email}</strong>. If you
                don&apos;t see it, check your spam folder.
              </p>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="form-input form-input-mono w-[180px] tracking-[0.4em] text-center text-[18px]"
              />
              {devCode && (
                <p className="mono text-[12px] text-[var(--lp-text-muted)]">
                  Dev mode code: <strong className="text-[var(--lp-dark)]">{devCode}</strong>
                </p>
              )}
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
                  {busy ? 'Verifying…' : 'Verify and claim'}
                </button>
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={busy}
                  className="px-4 py-3 mono text-[12px] uppercase tracking-[0.08em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] underline underline-offset-2"
                >
                  Resend
                </button>
              </div>
            </div>
          )}

          {stage === 'claiming' && (
            <p className="text-[14px] text-[var(--lp-text-sub)]">Binding the escrow to your wallet…</p>
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
