'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { confirmOutcomes, type Turn } from './AssistantThread';
import { savedAction } from './savedAction';
import { attachForOffer } from '@/features/listings/photos';

/// One conversation with the assistant: the turns, sending the next question
/// and the reply's actions. The help panel and the assistant page share it;
/// the page also saves it to the account (`persist`).
export function useAssistantChat(opts: { onNeedsHuman?: (transcript: Turn[]) => void; persist?: boolean; mode?: 'help' | 'assistant' } = {}) {
  const copy = useTranslations();
  const t = copy.assistant;
  const m = copy.assistantMode;
  /// Live turns (where a request or deal made here stands) are read from the
  /// server and replaced on each read; they are never saved with the rest.
  const [messages, setMessages] = useState<Array<Turn & { live?: boolean }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const { onNeedsHuman, persist = false, mode } = opts;
  // An exchange is saved when the next one starts or the page is left, so its
  // cards are saved with their outcome. Mirrors of the latest state for saving outside a render.
  const live = useRef({ messages, conversationId, savedUpTo: 0 });
  live.current.messages = messages;
  live.current.conversationId = conversationId;

  /// Saves the turns not yet saved. Returns the conversation id. `savedUpTo`
  /// counts the conversation's own turns; live ones are never saved.
  const flush = useCallback(async (): Promise<string | null> => {
    const { conversationId: id, savedUpTo } = live.current;
    const all = live.current.messages.filter((m) => !m.live);
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

  /// Asks the assistant with `history` and puts its reply after `shown`.
  const answer = useCallback(
    async (history: Array<{ role: 'user' | 'assistant'; content: string }>, shown: Turn[]) => {
      try {
        const { reply, actions } = await api.assistantChat(history, mode, live.current.conversationId);
        // The assistant appends [[HUMAN]] when the person asked for one or it
        // cannot do it. Strip the marker and bring a person in.
        const needsHuman = /\[\[HUMAN\]\]/i.test(reply);
        const clean = reply.replace(/\[\[HUMAN\]\]/gi, '').trim();
        const answered = [...shown, { role: 'assistant' as const, content: clean, actions }];
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
        if (cannot) onNeedsHuman?.(shown);
      }
    },
    [onNeedsHuman, t.error, m, mode],
  );

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
        await answer(next.map((m) => ({ role: m.role, content: m.content })), next);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, flush, answer],
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
      const turns = conversation.messages.map((m) => ({ role: m.role, content: m.content, actions: m.actions, ...(m.live ? { live: true } : {}) }));
      live.current = { messages: turns, conversationId: conversation.id, savedUpTo: turns.filter((m) => !m.live).length };
      setConversationId(conversation.id);
      reset(turns);
    },
    [flush, reset],
  );

  /// A photo or PDF sent in chat, with the words typed beside it, as one
  /// message that shows the picture. `offer` keeps a photo for the person's
  /// next offer (view 28); otherwise it is read as an invoice, like one sent on
  /// Telegram. The words are then answered with the file in view.
  const attach = useCallback(
    async (file: File, purpose: 'offer' | 'invoice' = 'invoice', words = '') => {
      if (busy) return;
      void flush();
      const text = words.trim();
      const label = m.attached.replace('{name}', file.name);
      const picture = file.type.startsWith('image/') ? { image: URL.createObjectURL(file), imageOnly: !text } : {};
      const next: Turn[] = [...messages, { role: 'user', content: text || label, ...picture }];
      setMessages(next);
      setError(null);
      setBusy(true);
      try {
        const { reply } = purpose === 'offer' ? await attachForOffer(file) : await api.assistantAttach(file);
        // An offer photo sent with words needs no "photo added" note: the
        // answer to the words says what happens with it.
        const shown: Turn[] = purpose === 'offer' && text ? next : [...next, { role: 'assistant', content: reply }];
        setMessages(shown);
        if (text) {
          const before = messages.map((x) => ({ role: x.role, content: x.content }));
          await answer([...before, { role: 'user', content: label }, { role: 'assistant', content: reply }, { role: 'user', content: text }], shown);
        }
      } catch (e) {
        const status = e instanceof ApiError ? e.status : 0;
        setError(status === 415 ? m.attachWrongType : status === 413 ? m.attachTooBig : status === 429 ? m.attachTooMany : m.errSnag);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, flush, m, answer],
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

  /// Reads where the requests and deals made in this conversation stand now
  /// and puts that at the end, replacing the previous read (view 30).
  const refreshLive = useCallback(async () => {
    const id = live.current.conversationId;
    if (!id || !persist) return;
    try {
      const { turns } = await api.assistantLiveTurns(id);
      if (live.current.conversationId !== id) return;
      setMessages((prev) => {
        const next = [...prev.filter((m) => !m.live), ...turns.map((t) => ({ role: t.role, content: t.content, actions: t.actions, live: true }))];
        live.current.messages = next;
        return next;
      });
    } catch {
      /* the next read tries again */
    }
  }, [persist]);

  return { messages, send, attach, busy, error, setError, reset, conversationId, open, startNew, flush, remove, refreshLive };
}
