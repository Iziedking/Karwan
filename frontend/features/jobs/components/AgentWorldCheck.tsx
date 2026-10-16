'use client';
import { useEffect, useRef, useState } from 'react';
import { IDKitSessionWidget, CredentialRequest, any, type IDKitResultSession } from '@worldcoin/idkit';
import { api, type WorldCheckReason, type WorldSessionRequest } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { fill } from '@/features/deals/workspace/presentation';

/// The World ID step on an agent deal, for the buyer in the choose sheet or the
/// seller on their desk. The same selfie session check as a direct deal. On
/// testnet it can be skipped so a missing World ID never blocks trying a deal.
export function AgentWorldCheck({
  jobId,
  caller,
  role,
  reason,
  skipAllowed,
  onDone,
}: {
  jobId: string;
  caller: string;
  role: 'buyer' | 'seller';
  reason: WorldCheckReason | null;
  skipAllowed: boolean;
  onDone: (result: { funded: boolean }) => void;
}) {
  const copy = useTranslations().worldCheck;
  const world = useTranslations().agentNudges.world;
  const [request, setRequest] = useState<WorldSessionRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  async function begin() {
    if (request && request.expires_at * 1000 > Date.now()) {
      setError(null);
      setOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.agentWorldCheckRequest(jobId, caller);
      if (!live.current) return;
      setRequest(r.request);
      setOpen(true);
    } catch {
      if (live.current) setError(copy.error);
    } finally {
      if (live.current) setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.agentWorldCheckSkip(jobId, caller);
      if (live.current) onDone({ funded: r.funded });
    } catch {
      if (live.current) setError(copy.error);
    } finally {
      if (live.current) setBusy(false);
    }
  }

  async function handleVerify(result: IDKitResultSession) {
    try {
      const r = await api.agentWorldCheckVerify(jobId, caller, result as unknown as Record<string, unknown>);
      if (live.current) onDone({ funded: r.funded });
    } catch (err) {
      if (live.current) {
        setError(copy.error);
        setRequest(null);
        setOpen(false);
      }
      throw err;
    }
  }

  return (
    <div className="rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-4">
      <p className="text-[15px] font-semibold text-[var(--lp-dark)]">{copy[role]}</p>
      {reason ? (
        <p className="mt-1 text-[14px] font-medium text-[var(--ink-secondary)]">{fill(world.why, { reason: world.reasons[reason] })}</p>
      ) : null}
      <p className="mt-1 text-[14px] font-medium text-[var(--ink-secondary)]">{copy.limit}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void begin()}
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-full bg-[var(--action)] px-5 text-[14px] font-semibold text-[var(--on-action)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {busy ? copy.preparing : request ? copy.resume : copy.start}
        </button>
        {skipAllowed ? (
          <button
            type="button"
            onClick={() => void skip()}
            disabled={busy}
            className="ms-auto inline-flex min-h-11 items-center rounded-full px-3 text-[14px] font-semibold text-[var(--ink-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] disabled:opacity-60"
          >
            {copy.skip}
          </button>
        ) : null}
      </div>
      {request ? (
        <IDKitSessionWidget
          key={request.nonce}
          open={open}
          onOpenChange={setOpen}
          app_id={request.appId as `app_${string}`}
          rp_context={{
            rp_id: request.rpId,
            nonce: request.nonce,
            created_at: request.created_at,
            expires_at: request.expires_at,
            signature: request.sig,
          }}
          environment={request.environment}
          existing_session_id={request.sessionId as `session_${string}` | undefined}
          require_user_presence={true}
          constraints={any(CredentialRequest('selfie'))}
          handleVerify={handleVerify}
          onSuccess={() => {
            if (!live.current) return;
            setOpen(false);
            setRequest(null);
          }}
          onError={() => setError(copy.error)}
        />
      ) : null}
      {error ? <p role="alert" className="mt-3 text-[14px] font-medium text-[var(--lp-dark)]">{error}</p> : null}
    </div>
  );
}
