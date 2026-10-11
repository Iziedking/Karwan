import { createHash } from 'node:crypto';
import type { OutMessage } from '../../channels/render.js';

/// Telegram caps a button's callback data at 64 bytes, and card ids carry
/// addresses and amounts. A long id travels as a short hash and is matched
/// back against the cards still waiting on the account.
const CALLBACK_MAX_BYTES = 64;
const HASHED = 'h:';

export interface TelegramSend {
  text: string;
  parse_mode?: never;
  link_preview_options: { is_disabled: true };
  reply_markup?: { inline_keyboard: { text: string; callback_data: string }[][] };
}

export function tapData(buttonId: string): string {
  if (Buffer.byteLength(buttonId, 'utf8') <= CALLBACK_MAX_BYTES) return buttonId;
  const cut = buttonId.indexOf(':');
  const verb = cut > 0 ? buttonId.slice(0, cut) : 'tap';
  return `${verb}:${HASHED}${createHash('sha256').update(buttonId).digest('hex').slice(0, 24)}`;
}

/// The full button id a tap stands for, or the tap unchanged when it was never
/// hashed or its card is no longer pending.
export function resolveTap(data: string, pendingButtonIds: readonly string[]): string {
  if (!data.includes(`:${HASHED}`)) return data;
  return pendingButtonIds.find((id) => tapData(id) === data) ?? data;
}

/// Model output is sent as plain text: no parse mode, so a stray asterisk or
/// underscore can never break a message. The bold title WhatsApp shows is
/// unwrapped instead.
export function toTelegram(out: OutMessage): TelegramSend[] | null {
  const base = { link_preview_options: { is_disabled: true as const } };
  if (out.kind === 'text') return [{ ...base, text: out.body }];
  if (out.kind === 'buttons') {
    const text = out.body.replace(/^\*([^*\n]+)\*/, '$1');
    return [
      {
        ...base,
        text,
        reply_markup: { inline_keyboard: [out.buttons.map((b) => ({ text: b.title, callback_data: tapData(b.id) }))] },
      },
    ];
  }
  return null;
}
