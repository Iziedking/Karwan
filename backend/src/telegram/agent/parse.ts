import type { InboundMessage } from '../../channels/types.js';

interface TgUser {
  id: number;
  is_bot?: boolean;
}
interface TgChat {
  id: number;
  type: string;
  username?: string;
}
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  caption?: string;
  reply_to_message?: { text?: string };
  new_chat_members?: Array<{ id: number; is_bot?: boolean; first_name?: string; username?: string }>;
  photo?: Array<{ file_id: string; file_size?: number; width?: number; height?: number }>;
  document?: { file_id: string; mime_type?: string; file_size?: number };
  [other: string]: unknown;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; from: TgUser; message?: TgMessage; data?: string };
}

export interface ParsedUpdate {
  inbound: InboundMessage;
  /// The private chat replies go to.
  chatId: number;
  /// Set on a button tap, which Telegram expects to be acknowledged.
  callbackId?: string;
}

const area = (p: { file_size?: number; width?: number; height?: number }) => p.file_size ?? (p.width ?? 0) * (p.height ?? 0);

/// One Telegram update, reduced to what the agent reads. Only private chats
/// with people reach the agent; commands are the bot's own and are handled
/// before this.
export function parseUpdate(update: TgUpdate): ParsedUpdate | null {
  const base = { id: `tg-${update.update_id}` };

  const tap = update.callback_query;
  if (tap) {
    const chat = tap.message?.chat;
    if (!chat || chat.type !== 'private' || tap.from.is_bot || !tap.data) return null;
    return {
      chatId: chat.id,
      callbackId: tap.id,
      inbound: { ...base, from: `tg:${tap.from.id}`, timestamp: Date.now(), kind: 'button', replyId: tap.data },
    };
  }

  const m = update.message;
  if (!m || m.chat.type !== 'private' || !m.from || m.from.is_bot) return null;
  const inbound: Omit<InboundMessage, 'kind'> = { ...base, from: `tg:${m.from.id}`, timestamp: m.date * 1000 };

  if (typeof m.text === 'string') {
    if (m.text.startsWith('/')) return null;
    return { chatId: m.chat.id, inbound: { ...inbound, kind: 'text', text: m.text } };
  }
  const caption = m.caption ? { text: m.caption } : {};
  if (m.photo?.length) {
    const largest = [...m.photo].sort((a, b) => area(b) - area(a))[0]!;
    return { chatId: m.chat.id, inbound: { ...inbound, kind: 'media', mediaId: largest.file_id, mimeType: 'image/jpeg', ...caption } };
  }
  if (m.document) {
    return {
      chatId: m.chat.id,
      inbound: { ...inbound, kind: 'media', mediaId: m.document.file_id, mimeType: m.document.mime_type ?? 'application/octet-stream', ...caption },
    };
  }
  return { chatId: m.chat.id, inbound: { ...inbound, kind: 'other' } };
}
