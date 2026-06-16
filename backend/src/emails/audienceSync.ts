/// Newsletter opt-in. Karwan keeps two separate lists on purpose:
///   1. Verified contact emails (in our own DB) — used for deal alerts. A user
///      proves they own the address; it is NOT a marketing subscription.
///   2. Newsletter subscribers (a Resend Audience) — an explicit opt-in via the
///      footer subscribe box. Only people who actively subscribe land here.
///
/// Keeping them apart means a newsletter unsubscribe (handled by Resend's hosted
/// unsubscribe link in every broadcast) only flips the audience contact and can
/// never remove someone's verified contact email. The product-update sends
/// themselves are composed and fired from the Resend dashboard against this
/// audience, ideally from a sending subdomain separate from transactional OTP
/// mail so a marketing spam complaint cannot poison verification-code delivery.
///
/// No-op cleanly when RESEND_API_KEY or RESEND_AUDIENCE_ID is unset, so the
/// subscribe route degrades to a friendly "noted" without a configured audience.
import { config } from '../config.js';
import { resendClient } from './resend.js';
import { logger } from '../logger.js';

export interface SubscribeResult {
  ok: boolean;
  configured: boolean;
}

/// Adds (or re-subscribes) an email to the newsletter audience. Idempotent:
/// Resend upserts on email within an audience, and unsubscribed:false flips a
/// previously-unsubscribed contact back on if they opt in again. Returns
/// configured:false when no audience is wired, so the caller can still thank
/// the user without leaking that nothing was stored.
export async function subscribeToNewsletter(email: string): Promise<SubscribeResult> {
  const resend = resendClient();
  const aud = config.RESEND_AUDIENCE_ID ?? null;
  if (!resend || !aud) return { ok: true, configured: false };
  try {
    await resend.contacts.create({ email, audienceId: aud, unsubscribed: false });
    return { ok: true, configured: true };
  } catch (err) {
    logger.warn({ err: (err as Error).message, email }, 'newsletter: subscribe failed');
    return { ok: false, configured: true };
  }
}
