/// Picking up where the person stopped (view 66). Read from what Karwan
/// already holds, never guessed: the last kept conversation (website, Telegram
/// or WhatsApp) and the files held for something not yet posted.

import type { AssistantConversation, StoredAction } from '../db/assistantConversations.js';

/// Quiet this long before a message counts as coming back.
export const RETURN_AFTER_MS = 6 * 3_600_000;
/// Older than this, unfinished work is not brought up.
const STALE_AFTER_MS = 14 * 24 * 3_600_000;

export interface HeldCounts {
  /// Sent with nothing to say what for, waiting on the person's answer.
  sent: number;
  offer: number;
  delivery: number;
  request: number;
  entry: number;
}

export interface PickUp {
  conversationId: string;
  title: string;
  /// Where it was started, when not on the website.
  source?: 'telegram' | 'whatsapp';
  at: number;
  /// A confirm card shown and never confirmed: its title.
  card?: string;
  /// The question the assistant asked last and got no answer to.
  question?: string;
  held: HeldCounts;
}

const NO_HELD: HeldCounts = { sent: 0, offer: 0, delivery: 0, request: 0, entry: 0 };

const isConfirmCard = (a: StoredAction) => a.kind === 'confirm' && a.status !== 'done';
const titleOf = (a: StoredAction) => {
  const title = (typeof a.title === 'string' && a.title) || (typeof a.label === 'string' && a.label) || 'A card';
  const summary = typeof a.summary === 'string' && a.summary ? `: ${a.summary}` : '';
  return `${title}${summary}`.slice(0, 160);
};

/// The last question in a message, when the message ends with one.
function trailingQuestion(content: string): string | undefined {
  const trimmed = content.trim();
  if (!trimmed.endsWith('?')) return undefined;
  const sentences = trimmed.split(/(?<=[.!?])\s+/);
  return sentences[sentences.length - 1]?.slice(0, 200);
}

/// What is unfinished, or null when nothing is. `latest` is the person's most
/// recent kept conversation.
export function unfinishedWork(latest: AssistantConversation | null, held: HeldCounts | null, now: number): PickUp | null {
  const counts = held ?? NO_HELD;
  const anyHeld = Object.values(counts).some((n) => n > 0);
  if (!latest) return null;
  if (now - latest.updatedAt > STALE_AFTER_MS) return null;
  const last = latest.messages[latest.messages.length - 1];
  const fromAssistant = last?.role === 'assistant' ? last : undefined;
  const card = fromAssistant?.actions?.filter(isConfirmCard).map(titleOf)[0];
  const question = card ? undefined : fromAssistant ? trailingQuestion(fromAssistant.content) : undefined;
  if (!card && !question && !anyHeld) return null;
  const source = latest.source;
  return {
    conversationId: latest.id,
    title: latest.title,
    ...(source ? { source } : {}),
    at: latest.updatedAt,
    ...(card ? { card } : {}),
    ...(question ? { question } : {}),
    held: counts,
  };
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/// The facts for the assistant's system prompt, when the person is back after
/// a break. The assistant writes the one line; this only says what is true.
export function pickUpPreamble(p: PickUp, now: number): string {
  const hours = Math.max(1, Math.round((now - p.at) / 3_600_000));
  const ago = hours < 48 ? `${hours} hours ago` : `${Math.round(hours / 24)} days ago`;
  const facts: string[] = [`Their last conversation, "${p.title}", ${p.source ? `on ${p.source[0]!.toUpperCase()}${p.source.slice(1)}, ` : ''}was ${ago}.`];
  if (p.card) facts.push(`It ended with a card they never confirmed: "${p.card}". Cards expire; prepare it fresh if they want it.`);
  if (p.question) facts.push(`It ended with your question, unanswered: "${p.question}"`);
  const h = p.held;
  if (h.sent) facts.push(`${plural(h.sent, 'file')} they sent with nothing yet saying what for (use_sent_photo once they say).`);
  if (h.offer) facts.push(`${plural(h.offer, 'photo')} held for their next offer.`);
  if (h.delivery) facts.push(`${plural(h.delivery, 'photo')} held for their next delivery.`);
  if (h.request) facts.push(`${plural(h.request, 'file')} held for their next request or deal.`);
  if (h.entry) facts.push(`${plural(h.entry, 'file')} held for a contest entry.`);
  return (
    'The person is back after a break, and something was left unfinished. Start your reply with ONE short line that picks it up, ' +
    'then answer what they just wrote. Say it once, and drop it if they have moved on. Facts:\n' +
    facts.map((f) => `- ${f}`).join('\n')
  );
}
