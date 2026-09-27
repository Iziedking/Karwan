import { config } from '../config.js';
import { logger } from '../logger.js';
import { brandedEmailHtml, LOGO_BUFFER, LOGO_CID } from './brand.js';
import { resendClient } from './resend.js';

/// Sent once, when someone first joins the mainnet waitlist, so they know it
/// worked and have something to do while they wait.
export const TESTNET_SIGNUP_URL = 'https://testnet.karwan.site/start?mode=signup';

export function waitlistJoinedEmail(position: number | null): { subject: string; html: string; text: string } {
  const place = position ? `You're number ${position.toLocaleString('en-US')} on the list.` : "You're on the list.";
  const inner = `
          <tr>
            <td style="padding:8px 32px 8px 32px;">
              <p style="margin:0;font-size:15px;line-height:1.6;color:#3a352c;">
                ${place} We'll email you when your spot on Arc mainnet opens.
              </p>
              <p style="margin:14px 0 0 0;font-size:15px;line-height:1.6;color:#3a352c;">
                You don't have to wait to see how it works. Karwan runs in full on testnet, with test money.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px 30px 32px;">
              <a href="${TESTNET_SIGNUP_URL}" style="display:inline-block;padding:14px 26px;background:#AFC95B;color:#10171D;font-weight:700;font-size:15px;text-decoration:none;border-radius:12px;">Try Karwan on testnet</a>
            </td>
          </tr>
  `;
  return {
    subject: "You're on the Karwan waitlist",
    html: brandedEmailHtml({ eyebrow: 'WAITLIST', title: "You're on the waitlist", inner }),
    text:
      `${place} We'll email you when your spot on Arc mainnet opens.\n\n` +
      "You don't have to wait to see how it works. Karwan runs in full on testnet, with test money.\n\n" +
      `Try Karwan on testnet: ${TESTNET_SIGNUP_URL}`,
  };
}

export async function sendWaitlistJoinedEmail(to: string, position: number | null): Promise<{ delivered: boolean }> {
  const client = resendClient();
  if (!client) {
    logger.info({ to }, '[waitlist-joined] no RESEND_API_KEY, not sent');
    return { delivered: false };
  }
  const { subject, html, text } = waitlistJoinedEmail(position);
  try {
    const { error } = await client.emails.send({
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
      logger.warn({ err: error.message, to }, 'resend rejected waitlist joined email');
      return { delivered: false };
    }
    return { delivered: true };
  } catch (err) {
    logger.warn({ err: (err as Error).message, to }, 'waitlist joined email threw');
    return { delivered: false };
  }
}
