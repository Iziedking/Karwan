'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/core/api';
import { useAuth } from './useAuth';

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
/// /terms itself) is not gated by an API call that the backend would refuse.
export function useTerms(): TermsState {
  const auth = useAuth();
  const [loading, setLoading] = useState(true);
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [acceptedVersion, setAcceptedVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!auth.isAuthenticated || !auth.address) {
      setLoading(false);
      setCurrentVersion(null);
      setAcceptedVersion(null);
      return;
    }
    setLoading(true);
    try {
      const r = await api.termsStatus(auth.address);
      setCurrentVersion(r.currentVersion);
      setAcceptedVersion(r.acceptedVersion);
    } catch {
      // Soft-fail: leave loading false, treat as no-acceptance-needed. We
      // don't want a backend hiccup to block the entire signed-in surface.
      setCurrentVersion(null);
      setAcceptedVersion(null);
    } finally {
      setLoading(false);
    }
  }, [auth.isAuthenticated, auth.address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const accept = useCallback(async () => {
    if (currentVersion == null) return;
    setError(null);
    try {
      await api.acceptTerms(currentVersion);
      setAcceptedVersion(currentVersion);
    } catch (err) {
      const message =
        (err as { detail?: unknown }).detail
          ? String((err as { detail?: unknown }).detail)
          : (err as Error).message;
      setError(message);
      throw err;
    }
  }, [currentVersion]);

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
