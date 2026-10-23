'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { confirmOutcomes, type Turn } from './AssistantThread';
import { savedAction } from './savedAction';

/// One conversation with the assistant: the turns, sending the next question
/// and the reply's actions. The help panel and the assistant page share it;
/// the page also saves it to the account (`persist`).
export function useAssistantChat(opts: { onNeedsHuman?: (transcript: Turn[]) => void; persist?: boolean; mode?: 'help' | 'assistant' } = {}) {
  const copy = useTranslations();
  const t = copy.assistant;
  const m = copy.assistantMode;
  const [messages, setMessages] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const { onNeedsHuman, persist = false, mode } = opts;
  // An exchange is saved when the next one starts or the page is left, so its
  // cards are saved with their outcome. Mirrors of the latest state for saving outside a render.
  const live = useRef({ messages, conversationId, savedUpTo: 0 });
  live.current.messages = messages;
  live.current.conversationId = conversationId;

  /// Saves the turns not yet saved. Returns the conversation id.
  const flush = useCallback(async (): Promise<string | null> => {
    const { messages: all, conversationId: id, savedUpTo } = live.current;
    if (!persist || savedUpTo >= all.length) return id;
    const fresh = all.slice(savedUpTo).map((m) => {
      const actions = (m.actions ?? []).map((a) => savedAction(a, (id) => confirmOutcomes.get(id))).filter((a): a is Record<string, unknown> => a !== null);
      return { role: m.role, content: m.content, ...(actions.length ? { actions } : {}) };
    });
    live.current.savedUpTo = all.length;
    try {
      const { conversation } = await api.saveAssistantMessages(id, fresh);
      live.current.conversationId = conversation.id;
      setConversationId(conversation.id);
      return conversation.id;
    } catch {
      // Not saved this time; the next exchange tries again with these turns.
      live.current.savedUpTo = savedUpTo;
      return id;
    }
  }, [persist]);

  // Leaving the page or the tab saves what is on screen.
  useEffect(() => {
    if (!persist) return;
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, [persist, flush]);

  const send = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || busy) return;
      void flush();
      const next = [...messages, { role: 'user' as const, content: text }];
      setMessages(next);
      setError(null);
      setBusy(true);
      try {
        const { reply, actions } = await api.assistantChat(next.map((m) => ({ role: m.role, content: m.content })), mode, live.current.conversationId);
        // The assistant appends [[HUMAN]] when the person asked for one or it
        // cannot do it. Strip the marker and bring a person in.
        const needsHuman = /\[\[HUMAN\]\]/i.test(reply);
        const clean = reply.replace(/\[\[HUMAN\]\]/gi, '').trim();
        const answered = [...next, { role: 'assistant' as const, content: clean, actions }];
        setMessages(answered);
        if (needsHuman) onNeedsHuman?.(answered);
      } catch (e) {
        // Map the backend's error codes to a human line instead of showing the
        // raw "assistant-error" string.
        const code = e instanceof ApiError ? e.message : '';
        const reason = e instanceof ApiError ? e.code : undefined;
        // A slow or failed reply is worth trying again. When the assistant is
        // offline or cannot read the account, it cannot do it: a person joins.
        const cannot = reason === 'assistant_state_unavailable' || code === 'assistant-unavailable';
        setError(
          reason === 'assistant_state_unavailable'
            ? m.errNoAccount
            : code === 'assistant-timeout'
              ? m.errSlow
              : code === 'assistant-unavailable'
                ? m.errOffline
                : code === 'assistant-error'
                  ? m.errSnag
                  : t.error,
        );
        if (cannot) onNeedsHuman?.(next);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, onNeedsHuman, t.error, m, flush, mode],
  );

  const reset = useCallback((to: Turn[] = []) => {
    setMessages(to);
    setError(null);
  }, []);

  /// Saves the current conversation, then starts an empty one.
  const startNew = useCallback(async () => {
    await flush();
    live.current = { messages: [], conversationId: null, savedUpTo: 0 };
    setConversationId(null);
    reset();
  }, [flush, reset]);

  /// Saves the current conversation, then opens a saved one.
  const open = useCallback(
    async (id: string) => {
      await flush();
      const { conversation } = await api.assistantConversation(id);
      const turns: Turn[] = conversation.messages.map((m) => ({ role: m.role, content: m.content, actions: m.actions }));
      live.current = { messages: turns, conversationId: conversation.id, savedUpTo: turns.length };
      setConversationId(conversation.id);
      reset(turns);
    },
    [flush, reset],
  );

  /// A photo or PDF, read like one sent to the agent on Telegram: an invoice
  /// for your own work. It shows as your message, and the reply as the agent's.
  const attach = useCallback(
    async (file: File) => {
      if (busy) return;
      void flush();
      const next = [...messages, { role: 'user' as const, content: m.attached.replace('{name}', file.name) }];
      setMessages(next);
      setError(null);
      setBusy(true);
      try {
        const { reply } = await api.assistantAttach(file);
        setMessages([...next, { role: 'assistant', content: reply }]);
      } catch (e) {
        const status = e instanceof ApiError ? e.status : 0;
        setError(status === 415 ? m.attachWrongType : status === 413 ? m.attachTooBig : status === 429 ? m.attachTooMany : m.errSnag);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, flush, m],
  );

  /// Deletes the open conversation from the account and starts an empty one.
  /// Nothing on screen is saved first: that would bring it back.
  const remove = useCallback(async () => {
    const id = live.current.conversationId;
    if (id) await api.deleteAssistantConversation(id);
    live.current = { messages: [], conversationId: null, savedUpTo: 0 };
    setConversationId(null);
    reset();
  }, [reset]);

  return { messages, send, attach, busy, error, setError, reset, conversationId, open, startNew, flush, remove };
}
