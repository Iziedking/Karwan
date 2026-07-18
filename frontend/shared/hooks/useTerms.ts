'use client';
import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSignMessage } from 'wagmi';
import { api } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { useAuth } from './useAuth';

/// The exact text a web3 user signs to accept the terms. MUST byte-for-byte
/// match the backend builder in routes/terms.ts termsAcceptanceMessage, or the
/// signature won't verify. Address lowercased so both sides build one string.
function termsAcceptanceMessage(address: string, version: number): string {
  return `Karwan Terms of Use\n\nI accept version ${version}.\n\nWallet: ${address.toLowerCase()}`;
}

interface TermsState {
  loading: boolean;
  currentVersion: number | null;
  acceptedVersion: number | null;
  /// True when the user is signed in AND has not accepted the current version.
  /// Drives the first-signin modal gate.
  needsAcceptance: boolean;
  refresh: () => Promise<void>;
  accept: () => Promise<void>;
  /// Last accept call error, if any. Cleared on retry.
  error: string | null;
}

/// Reads /api/terms/status on auth change and exposes a one-shot `accept()`.
/// Skipped for unauthenticated viewers so the public surface (landing, docs,
/// /terms itself) is not gated by an API call the backend would refuse.
export function useTerms(): TermsState {
  const auth = useAuth();
  const qc = useQueryClient();
  const { signMessageAsync } = useSignMessage();
  const enabled = auth.isAuthenticated && !!auth.address;
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: qk.terms(auth.address),
    queryFn: () => api.termsStatus(auth.address!),
    enabled,
    staleTime: 5 * 60_000,
  });

  const currentVersion = query.data?.currentVersion ?? null;
  const acceptedVersion = query.data?.acceptedVersion ?? null;
  const loading = enabled && query.isPending;

  const refresh = useCallback(async () => {
    if (!enabled) return;
    await qc.invalidateQueries({ queryKey: qk.terms(auth.address) });
  }, [enabled, qc, auth.address]);

  const accept = useCallback(async () => {
    if (currentVersion == null) return;
    setError(null);
    try {
      // Web3 users sign the canonical acceptance message with their wallet — the
      // same signer they SIWE'd with — and the backend verifies it. Circle
      // (passkey/OTP) users have no EOA to sign, so their authenticated click is
      // the consent and no signature is sent. The backend enforces this split by
      // session method, so a web3 session can't accept without a valid signature.
      let signature: string | undefined;
      if (auth.method === 'web3' && auth.address) {
        signature = await signMessageAsync({
          message: termsAcceptanceMessage(auth.address, currentVersion),
        });
      }
      await api.acceptTerms(currentVersion, signature);
      qc.setQueryData(qk.terms(auth.address), {
        currentVersion,
        acceptedVersion: currentVersion,
      });
    } catch (err) {
      const message =
        (err as { detail?: unknown }).detail
          ? String((err as { detail?: unknown }).detail)
          : (err as Error).message;
      setError(message);
      throw err;
    }
  }, [currentVersion, qc, auth.address, auth.method, signMessageAsync]);

  const needsAcceptance =
    auth.isAuthenticated &&
    currentVersion != null &&
    acceptedVersion !== currentVersion &&
    !loading;

  return {
    loading,
    currentVersion,
    acceptedVersion,
    needsAcceptance,
    refresh,
    accept,
    error,
  };
}
