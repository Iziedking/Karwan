import { config } from '../config.js';
import { logger } from '../logger.js';
import { brandedEmailHtml, LOGO_BUFFER, LOGO_CID } from './brand.js';
import { resendClient } from './resend.js';

/// Sent when an admin approves someone on the mainnet waitlist.
export const MAINNET_SIGNUP_URL = 'https://karwan.site/start?mode=signup';

export function mainnetAccessEmail(): { subject: string; html: string; text: string } {
  const inner = `
          <tr>
            <td style="padding:8px 32px 8px 32px;">
              <p style="margin:0;font-size:15px;line-height:1.6;color:#3a352c;">
                Your place on the Karwan waitlist has come up. You can now create your account on Arc mainnet.
              </p>
              <p style="margin:14px 0 0 0;font-size:15px;line-height:1.6;color:#3a352c;">
                Use this same email address when you sign up.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px 30px 32px;">
              <a href="${MAINNET_SIGNUP_URL}" style="display:inline-block;padding:14px 26px;background:#AFC95B;color:#10171D;font-weight:700;font-size:15px;text-decoration:none;border-radius:12px;">Create your account</a>
            </td>
          </tr>
  `;
  return {
    subject: "You're in. Create your Karwan account",
    html: brandedEmailHtml({ eyebrow: 'YOU ARE IN', title: "You're off the waitlist", inner }),
    text:
      "Your place on the Karwan waitlist has come up. You can now create your account on Arc mainnet.\n\n" +
      `Create your account: ${MAINNET_SIGNUP_URL}\n\n` +
      'Use this same email address when you sign up.',
  };
}

export async function sendMainnetAccessEmail(to: string): Promise<{ delivered: boolean; reason?: string }> {
  const client = resendClient();
  if (!client) {
    logger.info({ to }, '[mainnet-access] no RESEND_API_KEY, not sent');
    return { delivered: false, reason: 'email is not configured' };
  }
  const { subject, html, text } = mainnetAccessEmail();
  try {
    const { data, error } = await client.emails.send({
      from: config.RESEND_FROM,
      replyTo: 'support@karwan.site',
      to,
      subject,
      html,
      text,
      ...(LOGO_BUFFER
        ? { attachments: [{ filename: 'karwan-logo.png', content: LOGO_BUFFER, contentId: LOGO_CID }] }
        : {}),
    });
    if (error) {
      logger.warn({ err: error.message, to }, 'resend rejected mainnet access email');
      return { delivered: false, reason: error.message };
    }
    logger.info({ to, id: data?.id }, 'mainnet access email sent');
    return { delivered: true };
  } catch (err) {
    logger.warn({ err: (err as Error).message, to }, 'mainnet access email threw');
    return { delivered: false, reason: 'send failed' };
  }
}
