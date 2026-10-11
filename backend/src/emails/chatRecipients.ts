/// Chat accounts have no email, but the user store is keyed by one. They get
/// a placeholder on a reserved `.invalid` domain (RFC 2606), which can never be
/// delivered, and every send drops it before it reaches Resend.
const CHAT_DOMAINS = ['whatsapp.invalid', 'telegram.invalid'] as const;

export function chatAccountEmail(numberHash: string): string {
  return `wa-${numberHash.slice(0, 24)}@${CHAT_DOMAINS[0]}`;
}

export function telegramAccountEmail(userHash: string): string {
  return `tg-${userHash.slice(0, 24)}@${CHAT_DOMAINS[1]}`;
}

export function isChatAccountEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return CHAT_DOMAINS.some((domain) => e.endsWith(`@${domain}`));
}

export function deliverableRecipients(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to]).filter((e) => !isChatAccountEmail(e));
}
