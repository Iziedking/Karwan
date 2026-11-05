'use client';

import { useCallback, useRef, useState, type ReactElement } from 'react';
import { IDKitSessionWidget, CredentialRequest, any, type IDKitResultSession } from '@worldcoin/idkit';
import { ApiError, type WorldSessionRequest } from '@/core/api';
import type { AgentJobsCopy } from '@/shared/i18n/messages/agentJobs';

export type SessionPhase = 'idle' | 'preparing' | 'open' | 'checking';

/// One World ID session check for the person behind an outside agent: no
/// Karwan account, only the link they were sent. The first check saves their
/// session; each release proves the same one, so only they can answer.
export function usePersonSession(input: {
  copy: AgentJobsCopy['errors'];
  request: () => Promise<{ request: WorldSessionRequest }>;
  verify: (result: Record<string, unknown>) => Promise<void>;
}): { phase: SessionPhase; error: string | null; begin: () => Promise<void>; widget: ReactElement | null } {
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<WorldSessionRequest | null>(null);
  const latest = useRef(input);
  latest.current = input;

  const failure = useCallback((err: unknown) => {
    const c = latest.current.copy;
    const code = err instanceof ApiError ? err.code : undefined;
    if (code === 'WRONG_PERSON' || code === 'WORLD_ID_SESSION_MISMATCH') return c.wrongPerson;
    if (code === 'TOKEN_USED' || (err instanceof ApiError && err.status === 410)) return c.used;
    if (code === 'WORLD_ID_UNAVAILABLE' || (err instanceof ApiError && err.status === 503)) return c.unavailable;
    return c.failed;
  }, []);

  const begin = useCallback(async () => {
    setError(null);
    setPhase('preparing');
    try {
      setPending((await latest.current.request()).request);
      setPhase('open');
    } catch (err) {
      setPhase('idle');
      setError(failure(err));
    }
  }, [failure]);

  const handleVerify = useCallback(
    async (result: IDKitResultSession) => {
      setPhase('checking');
      try {
        await latest.current.verify(result as unknown as Record<string, unknown>);
      } catch (err) {
        setError(failure(err));
        setPending(null);
        setPhase('idle');
        throw err;
      }
    },
    [failure],
  );

  const widget = pending ? (
    <IDKitSessionWidget
      key={pending.nonce}
      open={phase === 'open' || phase === 'checking'}
      onOpenChange={(open) => {
        if (!open && phase === 'open') {
          setPending(null);
          setPhase('idle');
        }
      }}
      app_id={pending.appId as `app_${string}`}
      rp_context={{ rp_id: pending.rpId, nonce: pending.nonce, created_at: pending.created_at, expires_at: pending.expires_at, signature: pending.sig }}
      environment={pending.environment}
      existing_session_id={pending.sessionId as `session_${string}` | undefined}
      require_user_presence={true}
      constraints={any(CredentialRequest('selfie'))}
      handleVerify={handleVerify}
      onSuccess={() => {
        setPending(null);
        setPhase('idle');
      }}
      onError={() => {
        setPending(null);
        setPhase('idle');
        setError((current) => current ?? latest.current.copy.failed);
      }}
    />
  ) : null;

  return { phase, error, begin, widget };
}
