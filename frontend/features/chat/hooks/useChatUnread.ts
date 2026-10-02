'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/core/api';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';

const seenKey = (jobId: string) => `karwan:chat-seen:${jobId.toLowerCase()}`;

function readSeen(jobId: string): number {
  try {
    return Number(window.localStorage.getItem(seenKey(jobId))) || 0;
  } catch {
    return 0;
  }
}

/// Whether the other party has written since this browser last opened the
/// deal's messages. The newest message time is kept per deal, so a message that
/// arrived while the page was closed still lights the dot.
export function useChatUnread(jobId: string, caller: string | null): { unread: boolean; markSeen: () => void } {
  const [latest, setLatest] = useState(0);
  const [seen, setSeen] = useState(0);
  const me = caller?.toLowerCase();

  useEffect(() => {
    setSeen(readSeen(jobId));
  }, [jobId]);

  useEffect(() => {
    if (!caller) return;
    let cancelled = false;
    api
      .listMessages(jobId, caller)
      .then((r) => {
        if (cancelled) return;
        const theirs = r.messages.filter((m) => m.kind !== 'system' && m.sender.toLowerCase() !== me);
        setLatest(theirs.reduce((max, m) => Math.max(max, m.ts), 0));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [jobId, caller, me]);

  useEffect(() => {
    if (!caller) return;
    return subscribeLiveEvents((e) => {
      if (e.type !== 'chat.message' || e.jobId !== jobId) return;
      const payload = e.payload as { sender?: string; channel?: string } | undefined;
      if (payload?.channel && payload.channel !== 'trade') return;
      if (!payload?.sender || payload.sender.toLowerCase() === me) return;
      setLatest((t) => Math.max(t, e.ts));
    });
  }, [jobId, caller, me]);

  const markSeen = useCallback(() => {
    setLatest((t) => {
      const now = Math.max(t, Date.now());
      setSeen(now);
      try {
        window.localStorage.setItem(seenKey(jobId), String(now));
      } catch {}
      return t;
    });
  }, [jobId]);

  return { unread: latest > seen, markSeen };
}
