'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';

/// Per-wallet localStorage dismissal set. Lets users hide terminal-state rows
/// (cancelled / settled jobs they no longer want surfaced) without touching
/// server state. Scoped by namespace so different lists don't trample.
///
/// Returns the current dismissed set and a dismiss(id) action. The set is
/// keyed by `karwan.dismiss.<namespace>.<addrLower>`, so a given wallet's
/// dismissals follow them around the device.
export function useDismissed(namespace: string): {
  dismissed: Set<string>;
  dismiss: (id: string) => void;
} {
  const { address } = useAuth();
  const key = address
    ? `karwan.dismiss.${namespace}.${address.toLowerCase()}`
    : null;
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!key) {
      setDismissed(new Set());
      return;
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        setDismissed(new Set());
        return;
      }
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) {
        setDismissed(new Set(arr.filter((x): x is string => typeof x === 'string')));
      }
    } catch {
      setDismissed(new Set());
    }
  }, [key]);

  const dismiss = useCallback(
    (id: string) => {
      setDismissed((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        if (key) {
          try {
            window.localStorage.setItem(key, JSON.stringify([...next]));
          } catch {
            /* quota errors are non-fatal; the dismissal lives in memory */
          }
        }
        return next;
      });
    },
    [key],
  );

  return { dismissed, dismiss };
}
