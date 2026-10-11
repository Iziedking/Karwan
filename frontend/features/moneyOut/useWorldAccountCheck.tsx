'use client';

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { IDKitSessionWidget, CredentialRequest, any, type IDKitResultSession } from '@worldcoin/idkit';
import { api, ApiError, type MoneyOutCheck, type MoneyOutDestination, type SavedPayoutAddress, type WorldSessionRequest } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export type CheckPhase = 'idle' | 'preparing' | 'open' | 'checking';

/// One World ID session check for the signed-in account: enrol it, add a
/// payout address, clear the return check or resume payments. The proof is
/// the Selfie Check session the account saved at the person check, so only
/// the same person can pass it. Same widget and flow as the high-value deal
/// check (HighSignalVerificationCard).
export function useWorldAccountCheck(onDone: (result: { purpose: MoneyOutCheck; address?: SavedPayoutAddress }) => void): {
  phase: CheckPhase;
  error: string | null;
  begin: (purpose: MoneyOutCheck, destination?: MoneyOutDestination) => Promise<void>;
  widget: ReactElement | null;
} {
  const copy = useTranslations().moneyOut;
  const [phase, setPhase] = useState<CheckPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ request: WorldSessionRequest; purpose: MoneyOutCheck; destination?: MoneyOutDestination } | null>(null);
  const live = useRef(true);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const failure = useCallback(
    (err: unknown) => {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === 'WORLD_ID_SESSION_MISMATCH') return copy.worldMismatch;
      if (code === 'WORLD_ID_UNAVAILABLE' || (err instanceof ApiError && err.status === 503)) return copy.worldUnavailable;
      return copy.worldError;
    },
    [copy],
  );

  const begin = useCallback(
    async (purpose: MoneyOutCheck, destination?: MoneyOutDestination) => {
      setError(null);
      setPhase('preparing');
      try {
        const { request } = await api.moneyOutSessionRequest(purpose);
        if (!live.current) return;
        setPending({ request, purpose, destination });
        setPhase('open');
      } catch (err) {
        if (!live.current) return;
        setPhase('idle');
        setError(failure(err));
      }
    },
    [failure],
  );

  const handleVerify = useCallback(
    async (result: IDKitResultSession) => {
      if (!pending) throw new Error(copy.worldError);
      setPhase('checking');
      try {
        const verified = await api.moneyOutSessionVerify(pending.purpose, result as unknown as Record<string, unknown>, pending.destination);
        if (live.current) done.current({ purpose: verified.purpose, address: verified.address });
      } catch (err) {
        if (live.current) {
          setError(failure(err));
          setPending(null);
          setPhase('idle');
        }
        throw err;
      }
    },
    [pending, copy.worldError, failure],
  );

  const widget = pending ? (
    <IDKitSessionWidget
      key={pending.request.nonce}
      open={phase === 'open' || phase === 'checking'}
      onOpenChange={(open) => {
        if (!open && phase === 'open') {
          setPending(null);
          setPhase('idle');
        }
      }}
      app_id={pending.request.appId as `app_${string}`}
      rp_context={{
        rp_id: pending.request.rpId,
        nonce: pending.request.nonce,
        created_at: pending.request.created_at,
        expires_at: pending.request.expires_at,
        signature: pending.request.sig,
      }}
      environment={pending.request.environment}
      existing_session_id={pending.request.sessionId as `session_${string}` | undefined}
      require_user_presence={true}
      constraints={any(CredentialRequest('selfie'))}
      handleVerify={handleVerify}
      onSuccess={() => {
        if (!live.current) return;
        setPending(null);
        setPhase('idle');
      }}
      onError={() => {
        if (!live.current) return;
        setPending(null);
        setPhase('idle');
        setError((current) => current ?? copy.worldError);
      }}
    />
  ) : null;

  return { phase, error, begin, widget };
}
