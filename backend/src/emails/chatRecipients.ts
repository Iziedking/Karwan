/// WhatsApp accounts have no email, but the user store is keyed by one. They
/// get a placeholder on the reserved `.invalid` domain (RFC 2606), which can
/// never be delivered, and every send drops it before it reaches Resend.
const CHAT_DOMAIN = 'whatsapp.invalid';

export function chatAccountEmail(numberHash: string): string {
  return `wa-${numberHash.slice(0, 24)}@${CHAT_DOMAIN}`;
}

export function isChatAccountEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${CHAT_DOMAIN}`);
}

export function deliverableRecipients(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to]).filter((e) => !isChatAccountEmail(e));
}
