/// Confirmation email fired when someone subscribes via the footer box. This is
/// a single transactional send (not a broadcast) so the subscriber gets an
/// immediate "you're on the list" in their inbox, separate from the Resend
/// audience add. No-ops cleanly when RESEND_API_KEY is unset, so the subscribe
/// route still succeeds without email configured.
import { config } from '../config.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, LOGO_BUFFER, LOGO_CID } from './brand.js';
import { logger } from '../logger.js';

const INNER = `
  <p class="k-sub" style="margin:0 0 16px 0;font-size:15px;line-height:24px;">
    Thanks for subscribing. You're on the Karwan list.
  </p>
  <p class="k-sub" style="margin:0 0 16px 0;font-size:15px;line-height:24px;">
    You'll get product updates and new trade corridors, one topic at a time so
    nothing gets buried. No spam, and every send has a one-click unsubscribe.
  </p>
  <p class="k-muted" style="margin:0;font-size:13px;line-height:21px;">
    Karwan settles cross-border SME trade in USDC, milestone-escrowed on Arc.
    First up: how your agent pays for its own market research.
  </p>
`;

export async function sendNewsletterWelcome(email: string): Promise<void> {
  const client = resendClient();
  if (!client) return; // no key configured: subscribe still succeeds, just no email
  const html = brandedEmailHtml({
    eyebrow: 'NEWSLETTER',
    title: "You're on the list",
    inner: INNER,
    footerNote:
      'You subscribed at karwan.site. Every update carries a one-click unsubscribe.',
  });
  const text =
    "Thanks for subscribing. You're on the Karwan list.\n\n" +
    "You'll get product updates and new trade corridors, one topic at a time. " +
    'No spam, and every send has a one-click unsubscribe.\n\n' +
    'Karwan settles cross-border SME trade in USDC, milestone-escrowed on Arc.\n' +
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
