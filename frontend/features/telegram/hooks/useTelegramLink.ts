'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type TelegramStatus } from '@/core/api';

export interface UseTelegramLinkResult {
  status: TelegramStatus | null;
  loading: boolean;
  linking: boolean;
  deepLink: string | null;
  startLink: () => Promise<void>;
  cancelLink: () => void;
  unlink: () => Promise<void>;
  error: string | null;
}

const POLL_INTERVAL_MS = 3_000;
const POLL_DURATION_MS = 5 * 60 * 1000;

/// Lifecycle of the Telegram pairing flow for one wallet. Generates a deep
/// link, polls the backend for the linked state until the user completes the
/// /start in Telegram, then settles. Also exposes an unlink action.
export function useTelegramLink(address?: string): UseTelegramLinkResult {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollUntil = useRef(0);

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const s = await api.telegramStatus(address);
      setStatus(s);
      if (s.linked) {
        setLinking(false);
        setDeepLink(null);
      }
    } catch {
      /* ignore. keep last known status */
    }
  }, [address]);

  // Initial load.
  useEffect(() => {
    if (!address) {
      setStatus(null);
      return;
    }
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [address, refresh]);

  // Poll while a link is in progress.
  useEffect(() => {
    if (!linking) return;
    const id = setInterval(() => {
      if (Date.now() > pollUntil.current) {
        clearInterval(id);
        setLinking(false);
        setDeepLink(null);
        setError('Link timed out. Try again.');
        return;
      }
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [linking, refresh]);

  const startLink = useCallback(async () => {
    if (!address) return;
    setError(null);
    try {
      const r = await api.telegramLinkStart(address);
      if (!r.deepLink) {
        setError('Bot username is not configured on the server.');
        return;
      }
      setDeepLink(r.deepLink);
      setLinking(true);
      pollUntil.current = Date.now() + POLL_DURATION_MS;
    } catch (err) {
      setError((err as Error).message);
    }
  }, [address]);

  const cancelLink = useCallback(() => {
    setLinking(false);
    setDeepLink(null);
  }, []);

  const unlink = useCallback(async () => {
    if (!address) return;
    try {
      await api.telegramLinkRemove(address);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [address, refresh]);

  return { status, loading, linking, deepLink, startLink, cancelLink, unlink, error };
}
