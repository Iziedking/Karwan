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
  <tr>
    <td class="k-body" style="padding:28px 32px 10px 32px;text-align:left;">
      <h1 class="k-ink" style="margin:0 0 14px 0;font-size:26px;line-height:1.18;letter-spacing:-0.02em;color:#0a0a0b;">
        You're on the list<span class="k-lime" style="color:#afc95b;">.</span>
      </h1>
      <p class="k-sub" style="margin:0 0 12px 0;font-size:15px;line-height:1.65;color:#343436;">
        We'll send useful product updates and new trade corridors when they're ready.
      </p>
      <p class="k-muted" style="margin:0;font-size:13px;line-height:1.6;color:#747477;">
        No noise. You can unsubscribe from any update.
      </p>
    </td>
  </tr>
  <tr>
    <td class="k-body" style="padding:14px 32px 8px 32px;text-align:left;">
      <a href="https://karwan.site" style="display:inline-block;padding:13px 18px;background:#afc95b;color:#0a0a0b;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;border-radius:8px;">Visit Karwan&nbsp;&rarr;</a>
    </td>
  </tr>
`;

export async function sendNewsletterWelcome(email: string): Promise<void> {
  const client = resendClient();
  if (!client) return; // no key configured: subscribe still succeeds, just no email
  const html = brandedEmailHtml({
    eyebrow: 'NEWSLETTER',
    title: "You're on the list",
    inner: INNER,
    footerNote: 'You subscribed at karwan.site.',
  });
  const text =
    "You're on the Karwan list.\n\n" +
    "We'll send useful product updates and new trade corridors when they're ready.\n\n" +
    'No noise. You can unsubscribe from any update.\n\n' +
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
