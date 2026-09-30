/// Confirmation email fired when someone subscribes via the footer box. This is
/// a single transactional send (not a broadcast) so the subscriber gets an
/// immediate "you're on the list" in their inbox, separate from the Resend
/// audience add. No-ops cleanly when RESEND_API_KEY is unset, so the subscribe
/// route still succeeds without email configured.
import { config } from '../config.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, emailButton, emailHeading, emailNote, emailText, LOGO_BUFFER, LOGO_CID } from './brand.js';
import { logger } from '../logger.js';

const INNER =
  emailHeading({ kicker: 'Newsletter', title: "You're on the Karwan list" }) +
  emailText("We'll send product updates and new trade corridors when they're ready.") +
  emailButton('Visit Karwan', 'https://karwan.site') +
  emailNote('You can unsubscribe from any update.');

/// The rendered email, shared by the sender and the preview script.
export function newsletterWelcomeHtml(): string {
  return brandedEmailHtml({
    title: "You're on the Karwan list",
    inner: INNER,
    footerNote: 'You subscribed at karwan.site. Not you? Ignore this email.',
  });
}

export async function sendNewsletterWelcome(email: string): Promise<void> {
  const client = resendClient();
  if (!client) return; // no key configured: subscribe still succeeds, just no email
  const html = newsletterWelcomeHtml();
  const text =
    "You're on the Karwan list.\n\n" +
    "We'll send product updates and new trade corridors when they're ready.\n\n" +
    'You can unsubscribe from any update.\n\n' +
    'Visit Karwan: https://karwan.site\n\n' +
    'You subscribed at karwan.site.';
  try {
    const { error } = await client.emails.send({
      from: config.RESEND_FROM,
      replyTo: 'support@karwan.site',
      to: email,
      subject: "You're on the Karwan list",
      html,
      text,
      ...(LOGO_BUFFER
        ? {
            attachments: [
              { filename: 'karwan-logo.png', content: LOGO_BUFFER, contentId: LOGO_CID },
            ],
          }
        : {}),
    });
    if (error) {
      logger.warn({ err: error.message, to: email }, 'newsletter welcome send rejected');
    } else {
      logger.info({ to: email }, 'newsletter welcome sent');
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, to: email }, 'newsletter welcome threw');
  }
}
