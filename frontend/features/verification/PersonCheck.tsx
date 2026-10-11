'use client';

import { useEffect, useState } from 'react';
import { CredentialRequest, IDKitRequestWidget, any, type IDKitResult } from '@worldcoin/idkit';
import { api, ApiError } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

type Status = Awaited<ReturnType<typeof api.worldIdStatus>>;
type RpSignature = Awaited<ReturnType<typeof api.worldIdRpSignature>>;
type Phase = 'idle' | 'preparing' | 'open' | 'checking' | 'done';

/// The account-level person check: one World ID proof, tied to one account.
/// A chat user arrives here signed in through the agent's one-time link.
export function PersonCheck() {
  const t = useTranslations().personCheck;
  const [status, setStatus] = useState<Status | null>(null);
  const [signature, setSignature] = useState<RpSignature | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.worldIdStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const ready = !!status?.configured && !!status.appId && !!status.action && !!status.rpId;

  async function begin() {
    if (!status?.action) return;
    setMessage(null);
    setPhase('preparing');
    try {
      setSignature(await api.worldIdRpSignature(status.action));
      setPhase('open');
    } catch {
      setPhase('idle');
      setMessage(t.error);
    }
  }

  async function handleVerify(result: IDKitResult) {
    setPhase('checking');
    try {
      await api.verifyPerson(result as unknown as Record<string, unknown>);
      setPhase('done');
    } catch (err) {
      setPhase('idle');
      const status = err instanceof ApiError ? err.status : 0;
      setMessage(status === 401 ? t.signIn : status === 409 ? t.inUse : t.error);
      throw err;
    }
  }

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-12 sm:py-16">
      <h1 className="text-[28px] font-semibold leading-tight text-[var(--lp-ink)]">{t.title}</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-[var(--lp-text-sub)]">{t.lead}</p>

      {phase === 'done' ? (
        <div className="mt-8 border-t border-[var(--lp-line)] pt-6" role="status">
          <p className="text-[18px] font-semibold text-[var(--lp-ink)]">{t.done}</p>
          <p className="mt-2 text-[15px] text-[var(--lp-text-sub)]">{t.back}</p>
        </div>
      ) : status && !ready ? (
        <p className="mt-8 text-[15px] text-[var(--lp-text-sub)]">{t.unavailable}</p>
      ) : (
        <button
          type="button"
          onClick={begin}
          disabled={!ready || phase !== 'idle'}
          aria-busy={phase !== 'idle'}
          className="mt-8 min-h-11 rounded-full px-6 py-3 text-[15px] font-semibold disabled:opacity-60"
          style={{ background: 'var(--lp-accent)', color: 'var(--accent-ink)' }}
        >
          {phase === 'preparing' ? t.preparing : phase === 'checking' ? t.checking : t.start}
        </button>
      )}

      {message ? (
        <p role="alert" className="mt-4 text-[14px] text-[var(--lp-ink)]">
          {message}
        </p>
      ) : null}

      {status?.appId && status.action && status.rpId && signature ? (
        <IDKitRequestWidget
          key={signature.nonce}
          open={phase === 'open' || phase === 'checking'}
          onOpenChange={(open) => {
            if (!open && phase === 'open') setPhase('idle');
          }}
          app_id={status.appId as `app_${string}`}
          action={status.action}
          rp_context={{
            rp_id: status.rpId,
            nonce: signature.nonce,
            created_at: signature.created_at,
            expires_at: signature.expires_at,
            signature: signature.sig,
          }}
          environment={status.environment}
          allow_legacy_proofs={false}
          constraints={any(CredentialRequest('selfie'))}
          handleVerify={handleVerify}
          onSuccess={() => setPhase('done')}
          onError={() => {
            setPhase('idle');
            setMessage((m) => m ?? t.error);
          }}
        />
      ) : null}
    </main>
  );
}
