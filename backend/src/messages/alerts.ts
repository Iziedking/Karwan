import type { DealEventEmailInput } from '../emails/dealEventEmail.js';

/// Tells someone a message by tag arrived: on Telegram and by email, unless
/// they muted alerts. Sent directly rather than as a bus event, because bus
/// events are kept far longer than the 14 days a message is.

export interface AlertInput {
  from: string;
  to: string;
  fromTag: string | null;
  preview: string;
  warning: string | null;
}

export interface AlertDeps {
  countryOf: (address: string) => Promise<string | null>;
  contact: (address: string) => Promise<{ muted: boolean; email: string | null; telegramChatId: number | null }>;
  telegram: (chatId: number, text: string, button: { text: string; url: string } | null) => Promise<void>;
  remember: (address: string, text: string) => Promise<void>;
  email: (to: string, content: Omit<DealEventEmailInput, 'to'>) => Promise<void>;
  baseUrl: string | null;
}

const PREVIEW_MAX = 200;
const REGION = new Intl.DisplayNames(['en'], { type: 'region' });

function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return REGION.of(code) ?? null;
  } catch {
    return null;
  }
}

function who(a: AlertInput & { fromCountry: string | null }): string {
  const tag = a.fromTag ? `@${a.fromTag}` : 'A Karwan member';
  const country = countryName(a.fromCountry);
  return country ? `${tag} (${country})` : tag;
}

const cut = (t: string) => (t.length > PREVIEW_MAX ? `${t.slice(0, PREVIEW_MAX - 1)}…` : t);

export function directAlertText(a: AlertInput & { fromCountry: string | null }): string {
  return [`Message from ${who(a)}: ${cut(a.preview)}`, ...(a.warning ? [a.warning] : [])].join('\n');
}

export function directAlertEmail(a: AlertInput & { fromCountry: string | null }, baseUrl: string | null): Omit<DealEventEmailInput, 'to'> {
  const tag = a.fromTag ? `@${a.fromTag}` : 'a Karwan member';
  return {
    kicker: 'New message',
    subject: `Message from ${tag}`,
    heading: `Message from ${who(a)}`,
    body: [cut(a.preview), ...(a.warning ? [a.warning] : []), 'Reply in Karwan or ask your agent on Telegram.'].join('\n\n'),
    ...(baseUrl && a.fromTag ? { ctaLabel: 'Open in Karwan', ctaUrl: `${baseUrl}/messages/${a.fromTag}` } : {}),
  };
}

export async function deliverDirectAlert(a: AlertInput, deps: AlertDeps): Promise<void> {
  const contact = await deps.contact(a.to);
  if (contact.muted) return;
  const full = { ...a, fromCountry: await deps.countryOf(a.from) };
  const text = directAlertText(full);
  if (contact.telegramChatId !== null) {
    const button = deps.baseUrl && a.fromTag ? { text: 'Open in Karwan', url: `${deps.baseUrl}/messages/${a.fromTag}` } : null;
    await deps.telegram(contact.telegramChatId, `${text}\nReply here and I'll pass it on.`, button);
    // Only a marker, never the sender's words: the agent reads the message
    // through read_my_messages, and nothing outlives the 14-day retention.
    await deps.remember(a.to, `A message from ${who(full)} arrived. Read it with read_my_messages before answering.`);
  }
  if (contact.email) await deps.email(contact.email, directAlertEmail(full, deps.baseUrl));
}
