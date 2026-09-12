'use client';

import React, { useEffect, useRef, useState } from 'react';
import { IDKitSessionWidget, CredentialRequest, any, type IDKitResultSession } from '@worldcoin/idkit';
import { api, type DirectDeal } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

type Role = 'buyer' | 'seller';

type Props = { deal: DirectDeal; caller: string; onRefresh: () => void };

export function HighSignalVerificationCard(props: Props) {
  const { deal, caller } = props;
  // A pending World App request must never follow the user into another deal/account.
  return <DealWorldCheck key={`${deal.jobId}:${caller.toLowerCase()}:${deal.agreementVersion ?? 1}:${deal.agreementDigest ?? ''}:${deal.verificationPolicy}:${deal.verificationSubject}`} {...props} />;
}

function DealWorldCheck({
  deal,
  caller,
  onRefresh,
}: Props) {
  const copy = useTranslations().worldCheck;
  const role: Role | null = caller.toLowerCase() === deal.buyer.toLowerCase() ? 'buyer' : caller.toLowerCase() === deal.seller.toLowerCase() ? 'seller' : null;
  const [state, setState] = useState<Awaited<ReturnType<typeof api.highSignalStatus>> | null>(null);
  const [request, setRequest] = useState<Awaited<ReturnType<typeof api.requestHighSignal>>['request']>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  useEffect(() => {
    if (deal.verificationPolicy !== 'high_signal' || !role) return;
    let live = true;
    api.highSignalStatus(deal.jobId, caller).then((next) => {
      if (live) setState(next);
    }).catch(() => {
      if (live) setError(copy.error);
    });
    return () => { live = false; };
  }, [caller, deal.jobId, deal.highSignalVerification, deal.verificationPolicy, role, copy.error]);

  if (deal.verificationPolicy !== 'high_signal' || !role) return null;
  const party = deal.highSignalVerification?.[role];
  const staleAgreement = !deal.agreementDigest || party?.agreementKey !== `${deal.agreementVersion ?? 1}:${deal.agreementDigest}`;
  const status = state?.callerStatus ?? (staleAgreement ? 'pending' : party?.status) ?? 'pending';
  const required = state?.subject === 'both' || state?.subject === role || deal.verificationSubject === role || deal.verificationSubject === 'both';
  if (!required) return null;

  async function begin() {
    if (request && request.expires_at * 1000 > Date.now()) {
      setError(null);
      setWidgetOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.requestHighSignal(deal.jobId, caller);
      if (!active.current) return;
      if (result.request && result.request.proofMode !== 'session') {
        setError(copy.unavailable);
        return;
      }
      setRequest(result.request);
      if (result.request) setWidgetOpen(true);
      onRefresh();
    } catch {
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  }

  const verified = status === 'verified';
  const providerUnavailable = state?.world ? !state.world.configured : false;
  const unavailable = status === 'unavailable' || providerUnavailable;
  const rpContext = request
    ? {
        rp_id: request.rpId,
        nonce: request.nonce,
        created_at: request.created_at,
        expires_at: request.expires_at,
        signature: request.sig,
      }
    : null;

  async function handleVerify(result: IDKitResultSession) {
    if (!active.current) throw new Error(copy.error);
    try {
      await api.verifyHighSignal(deal.jobId, caller, result as unknown as Record<string, unknown>);
      if (!active.current) return;
      setState((previous) => previous ? { ...previous, callerStatus: 'verified' } : previous);
    } catch (error) {
      if (active.current) {
        setError(copy.error);
        setRequest(null);
        setWidgetOpen(false);
      }
      throw error;
    }
  }

  return (
    <section
      className="rounded-[16px] border p-5 md:p-6"
      style={{
        background: verified ? 'rgba(79,138,63,0.08)' : 'var(--lp-card)',
        borderColor: verified ? 'rgba(79,138,63,0.35)' : 'var(--lp-border-light)',
      }}
      aria-labelledby="high-signal-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold text-[var(--lp-text-sub)]">{copy.title}</p>
          <h2 id="high-signal-title" className="mt-2 text-[18px] font-bold text-[var(--lp-dark)]">
            {verified ? copy.verified : copy[role]}
          </h2>
          <p className="mt-2 max-w-[58ch] text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
            {verified ? copy.recordedBody : copy.body}
          </p>
        </div>
        <span className="mono rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          {verified ? copy.verified : unavailable ? copy.unavailableLabel : status === 'rejected' ? copy.rejected : copy.pending}
        </span>
      </div>
      <p className="mt-3 max-w-[62ch] text-[12px] leading-relaxed text-[var(--lp-text-sub)]">{copy.limit}</p>

      {!verified ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={begin}
            disabled={busy}
            className="min-h-11 rounded-[10px] rounded-br-[3px] px-4 py-2.5 text-[13px] font-bold disabled:opacity-60"
            style={{ background: 'var(--lp-accent)', color: 'var(--accent-ink)' }}
          >
            {busy ? copy.preparing : request ? copy.resume : copy.start}
          </button>
        </div>
      ) : null}
      {request && rpContext ? (
        <IDKitSessionWidget
          key={request.nonce}
          open={widgetOpen}
          onOpenChange={setWidgetOpen}
          app_id={request.appId as `app_${string}`}
          rp_context={rpContext}
          environment={request.environment}
          existing_session_id={request.sessionId as `session_${string}` | undefined}
          require_user_presence={true}
          constraints={any(CredentialRequest('selfie'))}
          handleVerify={handleVerify}
          onSuccess={() => {
            if (!active.current) return;
            setWidgetOpen(false);
            setRequest(null);
            onRefresh();
          }}
          onError={() => setError(copy.error)}
        />
      ) : null}
      {unavailable ? (
        <p className="mt-4 text-[12px] leading-relaxed text-[var(--lp-text-sub)]">
          {copy.unavailable}
        </p>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-[12px] text-[var(--lp-dark)]">{error}</p> : null}
    </section>
  );
}
