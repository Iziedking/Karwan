'use client';

import { useEffect, useState } from 'react';
import { IDKitRequestWidget, selfieCheckLegacy, type IDKitResult } from '@worldcoin/idkit';
import { api, ApiError, type DirectDeal } from '@/core/api';

type Role = 'buyer' | 'seller';

export function HighSignalVerificationCard({
  deal,
  caller,
  onRefresh,
}: {
  deal: DirectDeal;
  caller: string;
  onRefresh: () => void;
}) {
  const role: Role | null = caller.toLowerCase() === deal.buyer ? 'buyer' : caller.toLowerCase() === deal.seller ? 'seller' : null;
  const [state, setState] = useState<Awaited<ReturnType<typeof api.highSignalStatus>> | null>(null);
  const [request, setRequest] = useState<Awaited<ReturnType<typeof api.requestHighSignal>>['request']>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.highSignalStatus(deal.jobId, caller).then((next) => {
      if (live) setState(next);
    }).catch(() => {
      if (live) setError('Verification status is temporarily unavailable.');
    });
    return () => { live = false; };
  }, [caller, deal.jobId, deal.highSignalVerification]);

  if (deal.verificationPolicy !== 'high_signal' || !role) return null;
  const status = state?.callerStatus ?? deal.highSignalVerification?.[role]?.status ?? 'pending';
  const required = state?.subject === 'both' || state?.subject === role || deal.verificationSubject === role || deal.verificationSubject === 'both';
  if (!required) return null;

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.requestHighSignal(deal.jobId, caller);
      setRequest(result.request);
      if (result.request) setWidgetOpen(true);
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'World ID verification is unavailable.');
    } finally {
      setBusy(false);
    }
  }

  const verified = status === 'verified';
  const unavailable = status === 'unavailable';
  const rpContext = request
    ? {
        rp_id: request.rpId,
        nonce: request.nonce,
        created_at: request.created_at,
        expires_at: request.expires_at,
        signature: request.sig,
      }
    : null;

  async function handleVerify(result: IDKitResult) {
    await api.verifyHighSignal(deal.jobId, caller, result as unknown as Record<string, unknown>);
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
          <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">High-signal deal</p>
          <h2 id="high-signal-title" className="mt-2 text-[18px] font-bold text-[var(--lp-dark)]">
            {verified ? 'Selfie Check recorded' : 'Verify before this deal moves forward'}
          </h2>
          <p className="mt-2 max-w-[58ch] text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
            {verified
              ? 'Your proof is recorded as a privacy-preserving trust signal. It does not authorize a payment or release.'
              : 'This buyer selected a Selfie Check signal for a sensitive deal. Karwan keeps the proof result, not biometric data.'}
          </p>
        </div>
        <span className="mono rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          {status.replace('_', ' ')}
        </span>
      </div>

      {!verified ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={begin}
            disabled={busy}
            className="min-h-11 rounded-[10px] rounded-br-[3px] bg-[var(--lp-accent)] px-4 py-2.5 mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--lp-band-dark)] disabled:opacity-60"
          >
            {busy ? 'Preparing…' : unavailable ? 'Retry Selfie Check' : 'Prepare Selfie Check'}
          </button>
          <span className="text-[11px] text-[var(--lp-text-muted)]">You complete the Selfie Check beta flow in a supported World client.</span>
        </div>
      ) : null}
      {request ? (
        <div className="mt-4 space-y-2 rounded-[10px] border border-[var(--lp-border-light)] p-3">
          <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">Verification request ready</p>
          <p className="text-[12px] leading-relaxed text-[var(--lp-text-sub)]">
            Open the World credential client with action <strong>{request.action}</strong>. The Selfie Check beta challenge expires at {new Date(request.expires_at * 1000).toLocaleTimeString()}.
          </p>
        </div>
      ) : null}
      {request && rpContext ? (
        <IDKitRequestWidget
          open={widgetOpen}
          onOpenChange={setWidgetOpen}
          app_id={request.appId as `app_${string}`}
          action={request.action}
          rp_context={rpContext}
          environment={request.environment}
          allow_legacy_proofs={true}
          preset={selfieCheckLegacy()}
          handleVerify={handleVerify}
          onSuccess={() => {
            setWidgetOpen(false);
            setRequest(null);
            onRefresh();
          }}
          onError={(code) => setError(`World ID could not complete: ${code}`)}
        />
      ) : null}
      {unavailable ? (
        <p className="mt-4 text-[12px] leading-relaxed text-[var(--lp-text-sub)]">
          World verification is not configured for this environment right now. Retry when the credential service is available; the deal remains protected until the selected party verifies.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-[12px] text-[#b03d3a]">{error}</p> : null}
    </section>
  );
}
