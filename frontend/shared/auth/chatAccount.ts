/// Accounts opened in a chat (Telegram, WhatsApp) carry a placeholder email on
/// a reserved `.invalid` domain, the same list as backend/src/emails/chatRecipients.ts.
/// They are complete without a web profile: the agent knows who they are.
const CHAT_DOMAINS = ['whatsapp.invalid', 'telegram.invalid'];

export function isChatAccountEmail(email: string | null | undefined): boolean {
  const e = (email ?? '').trim().toLowerCase();
  return CHAT_DOMAINS.some((domain) => e.endsWith(`@${domain}`));
}
