'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type RecoveryStatus } from '@/core/api';

/// Recovery state for the signed-in passkey wallet. Null while loading or when
/// the server has no recovery route (flag off), so callers render nothing.
export function useRecoveryStatus(enabled: boolean) {
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setStatus(await api.recoveryStatus());
    } catch {
      setStatus(null);
    }
  }, [enabled]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { status, refresh };
}
