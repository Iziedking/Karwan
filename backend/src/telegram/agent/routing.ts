import type { TgUpdate } from './parse.js';

export type StartPayload = { kind: 'link'; token: string } | { kind: 'clientConfirm'; requestId: string };

const CLIENT_CONFIRM = 'cw_';

/// `/start <payload>` carries either a one-time wallet link token from the
/// profile page or a past-client confirmation request forwarded by a seller.
export function startPayload(text: string): StartPayload | null {
  if (!text.startsWith('/start ')) return null;
  const payload = text.slice('/start '.length).trim();
  if (!payload) return null;
  if (payload.startsWith(CLIENT_CONFIRM)) return { kind: 'clientConfirm', requestId: payload.slice(CLIENT_CONFIRM.length) };
  return { kind: 'link', token: payload };
}

/// Text the bot's own commands did not claim. A linked user with an open
/// support ticket is talking to a person, so the agent stays out of it.
export function textGoesToAgent(input: { chatType: string; ticketOpen: boolean }): boolean {
  return input.chatType === 'private' && !input.ticketOpen;
}

/// Button taps and files the bot itself never reads. Text is not here: it
/// goes through the bot's commands and the support relay first.
export function isAgentUpdate(update: TgUpdate): boolean {
  if (update.callback_query) return update.callback_query.message?.chat.type === 'private';
  const m = update.message;
  if (!m || m.chat.type !== 'private' || typeof m.text === 'string') return false;
  return !m.new_chat_members;
}
