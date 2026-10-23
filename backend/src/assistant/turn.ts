/// One assistant turn for a signed-in person, independent of where the message
/// came from. The web route calls it today; a chat-app or MCP adapter calls the
/// same function once it has bound its sender to a Karwan account, so every
/// channel gets the same tools, grounding and fail-closed rules.

import { logger } from '../logger.js';
import type { AssistantAction } from './actions.js';
import { assistantAgentEnabled, runAssistantAgent, type AssistantChatMessage } from './agent.js';
import { mayAnswer, proposalReply, requiresLiveAccountState, staticFallbackMessages } from './safety.js';
import { getMemory, type AssistantMemory } from '../db/assistantMemory.js';
import { liveMemoryWriterDeps, writeMemoryNotes } from './memoryWriter.js';

export type AssistantTurnResult =
  | { ok: true; reply: string; actions?: AssistantAction[] }
  | { ok: false; status: 502 | 503; error: string; code?: 'assistant_state_unavailable' };

/// Generic-help fallback through a direct provider. Gets only the latest user
/// message, never account history.
export type FallbackReply = (messages: AssistantChatMessage[]) => Promise<{ reply: string } | { timeout: boolean }>;

const STATE_UNAVAILABLE: AssistantTurnResult = {
  ok: false,
  status: 503,
  error: 'assistant-unavailable',
  code: 'assistant_state_unavailable',
};

export async function runAssistantTurn(
  input: { address: string; method: string; messages: AssistantChatMessage[]; mode?: 'help' | 'assistant'; conversationId?: string },
  fallback: FallbackReply,
): Promise<AssistantTurnResult> {
  // Stateful prompts fail closed rather than falling through to an ungrounded
  // provider response.
  const needsLiveState = requiresLiveAccountState(input.messages);
  if (assistantAgentEnabled()) {
    try {
      const address = input.address.toLowerCase();
      // Memory is background: a failed read answers without it, never fails the turn.
      const memory = await getMemory(address).catch((err: Error): AssistantMemory | undefined => {
        logger.warn({ err: err.message }, 'assistant memory: read failed, answering without it');
        return undefined;
      });
      const ask = (forceRead: boolean) => runAssistantAgent({
        address,
        method: input.method,
        messages: input.messages,
        mode: input.mode,
        memory,
        conversationId: input.conversationId,
        forceRead,
      });
      let { text, actions, grounded, subjects } = await ask(false);
      // A reply that states account facts without reading them gets one more
      // try that must read first. A person is called only if that fails too.
      const unread = text && !proposalReply(actions) && !mayAnswer({ needsLiveState, grounded, subjects, reply: text });
      const silent = !text && !actions.length && needsLiveState;
      if (unread || silent) {
        logger.info('assistant: unread account claim, retrying with a required read');
        ({ text, actions, grounded, subjects } = await ask(true));
      }
      // Notes are written after the reply goes out, never holding it up.
      const remember = (reply: string) => {
        if (!memory?.enabled) return;
        const userText = [...input.messages].reverse().find((m) => m.role === 'user')?.content;
        if (!userText) return;
        void liveMemoryWriterDeps().then((deps) => writeMemoryNotes({ address, userText, reply }, deps));
      };
      // Confirmation cards retain their existing authorization gates. Discard
      // generated prose here so it cannot call a merely prepared action done.
      const preparedReply = proposalReply(actions);
      if (preparedReply) {
        remember(preparedReply);
        return { ok: true, reply: preparedReply, actions };
      }
      // Never let a tool-less model answer a stateful prompt. The only safe
      // response when the account read model was not consulted is an honest
      // retry message, not an optimistic status.
      if (text && mayAnswer({ needsLiveState, grounded, subjects, reply: text })) {
        remember(text);
        return { ok: true, reply: text, actions };
      }
      if (needsLiveState) {
        logger.warn('assistant: stateful answer was not grounded by a fresh account read');
        return STATE_UNAVAILABLE;
      }
      logger.warn('assistant: agent path returned empty, falling back to knowledge path');
    } catch (e) {
      logger.error({ err: (e as Error).message }, 'assistant: agent path failed, falling back to knowledge path');
      if (needsLiveState) return STATE_UNAVAILABLE;
    }
  }

  // An unconfigured tool-calling model is not a valid source of account truth.
  // Keep static help available, but fail closed for money and workflow state.
  if (needsLiveState) return STATE_UNAVAILABLE;
  const fallbackMessages = staticFallbackMessages(input.messages);
  if (!fallbackMessages) return STATE_UNAVAILABLE;
  const out = await fallback(fallbackMessages);
  if ('reply' in out) return { ok: true, reply: out.reply };
  return { ok: false, status: 502, error: out.timeout ? 'assistant-timeout' : 'assistant-error' };
}
