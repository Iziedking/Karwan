'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type ChainEvent, type ChatMessage } from '@/core/api';
import { sfx } from '@/shared/utils/sfx';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';

export interface UseChatResult {
  messages: ChatMessage[];
  fetchState: 'idle' | 'loading' | 'ready' | 'error';
  /// The server's own reason for refusing, when it gave one.
  fetchError: string | null;
  send: (body: string) => Promise<void>;
  sending: boolean;
  unreadCount: number;
  markRead: () => void;
  writable: boolean;
  closedReason?: string;
}

/// Per-deal chat: fetches the initial transcript, subscribes to live
/// chat.message events, plays a sound when a message arrives from the other
/// party, and tracks an unread count for the bell badge.
export function useChat({
  jobId,
  caller,
}: {
  jobId: string;
  caller?: string;
}): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  /// Why the load failed, when the server said why. A generic "could not load
  /// chat history" on a 403 tells the reader nothing: they were being refused,
  /// not failing to reach the server.
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [writable, setWritable] = useState(true);
  const [closedReason, setClosedReason] = useState<string | undefined>();
  const me = caller?.toLowerCase();
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  // Initial load.
  useEffect(() => {
    if (!jobId || !caller) return;
    let cancelled = false;
    setFetchState('loading');
    api
      .listMessages(jobId, caller)
      .then((r) => {
        if (cancelled) return;
        setMessages(r.messages);
        setWritable(r.writable);
        setClosedReason(r.closedReason);
        setFetchError(null);
        setFetchState('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetchError(err instanceof ApiError ? err.message : null);
        setFetchState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, caller]);

  // Live updates.
  useEffect(() => {
    if (!jobId || !caller) return;
    return subscribeLiveEvents((e) => {
      if (e.type !== 'chat.message' || e.jobId !== jobId) return;
      const payload = e.payload as
        | { messageId?: string; sender?: string; body?: string; channel?: string; channelKey?: string }
        | undefined;
      if (payload?.channel && payload.channel !== 'trade') return;
      if (payload?.channelKey && payload.channelKey !== jobId) return;
      if (!payload?.messageId || !payload.sender || typeof payload.body !== 'string') return;
      const next: ChatMessage = {
        id: payload.messageId,
        jobId,
        sender: payload.sender,
        body: payload.body,
        ts: e.ts,
      };
      setMessages((list) => {
        if (list.some((m) => m.id === next.id)) return list;
        return [...list, next];
      });
      if (payload.sender !== me) {
        setUnreadCount((n) => n + 1);
        sfx.tap();
      }
    });
  }, [jobId, caller, me]);

  const send = useCallback(
    async (body: string) => {
      if (!caller) return;
      const trimmed = body.trim();
      if (!trimmed) return;
      setSending(true);
      try {
        const r = await api.sendMessage(jobId, caller, trimmed);
        setMessages((list) => {
          if (list.some((m) => m.id === r.message.id)) return list;
          return [...list, r.message];
        });
        sfx.send();
      } finally {
        setSending(false);
      }
    },
    [jobId, caller],
  );

  const markRead = useCallback(() => setUnreadCount(0), []);

  return { messages, fetchState, fetchError, send, sending, unreadCount, markRead, writable, closedReason };
}
