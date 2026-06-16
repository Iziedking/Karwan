// Generic branded email for a deal lifecycle event, sent to a user's verified
// contact email. One sender, many events: the notifier builds the eyebrow,
// subject, heading, body, and CTA per event and this renders + ships it inside
// the shared brand shell. Falls back to a log-only no-op when RESEND_API_KEY
// isn't set.
import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, LOGO_BUFFER, LOGO_CID, escapeHtml } from './brand.js';

export interface DealEventEmailInput {
  /// Lower-cased recipient email.
  to: string;
  /// Small-caps eyebrow, e.g. "DEAL MATCHED".
  eyebrow: string;
  /// Email subject line.
  subject: string;
  /// Bold heading at the top of the card body.
  heading: string;
  /// One or two sentences of plain body copy.
  body: string;
  /// Optional CTA button label + absolute URL. Omitted together when the
  /// event has no useful destination (e.g. a decline).
  ctaLabel?: string;
  ctaUrl?: string;
}

function innerHtml(input: DealEventEmailInput): string {
  const cta =
    input.ctaLabel && input.ctaUrl
      ? `
              <a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;margin-top:22px;padding:14px 28px;background:#0e0e0e;color:#ffffff;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:13px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;text-decoration:none;border-radius:12px 12px 12px 4px;">${escapeHtml(input.ctaLabel)}</a>`
      : '';
  return `
          <tr>
            <td style="padding:34px 28px 28px 28px;text-align:center;">
              <div class="k-ink" style="font-size:19px;font-weight:800;color:#0e0e0e;line-height:1.3;">${escapeHtml(input.heading)}</div>
              <p class="k-sub" style="margin:14px 0 0 0;font-size:15px;line-height:1.55;color:#3a352c;">
                ${escapeHtml(input.body)}
              </p>
              ${cta}
            </td>
          </tr>`;
}

export async function sendDealEventEmail(input: DealEventEmailInput): Promise<boolean> {
  const client = resendClient();
  if (!client) {
    logger.info({ to: input.to, subject: input.subject }, '[deal-email] no RESEND_API_KEY, log-only');
    return false;
  }
  const html = brandedEmailHtml({
    eyebrow: input.eyebrow,
    title: input.subject,
    inner: innerHtml(input),
    footerNote:
      'You receive this because you added and verified this email on Karwan. Manage it from your profile.',
  });
  const textLines = [input.heading, '', input.body];
  if (input.ctaLabel && input.ctaUrl) {
    textLines.push('', `${input.ctaLabel}: ${input.ctaUrl}`);
  }
  try {
    const { data, error } = await client.emails.send({
      from: config.RESEND_FROM,
      replyTo: 'support@karwan.site',
      to: input.to,
      subject: input.subject,
      html,
      text: textLines.join('\n'),
      ...(LOGO_BUFFER
        ? { attachments: [{ filename: 'karwan-logo.png', content: LOGO_BUFFER, contentId: LOGO_CID }] }
        : {}),
    });
    if (error) {
      logger.warn({ err: error.message, to: input.to }, 'resend rejected deal-event send');
      return false;
    }
    logger.info({ to: input.to, id: data?.id, subject: input.subject }, 'deal-event email sent');
    return true;
  } catch (err) {
    logger.warn({ err: (err as Error).message, to: input.to }, 'resend threw on deal-event');
    return false;
  }
}
