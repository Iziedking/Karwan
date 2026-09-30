import { config } from '../config.js';
import { logger } from '../logger.js';
import { brandedEmailHtml, emailButton, emailHeading, emailText, LOGO_BUFFER, LOGO_CID } from './brand.js';
import { resendClient } from './resend.js';

/// Sent once, when someone first joins the mainnet waitlist, so they know it
/// worked and have something to do while they wait.
export const TESTNET_SIGNUP_URL = 'https://testnet.karwan.site/start?mode=signup';

export function waitlistJoinedEmail(position: number | null): { subject: string; html: string; text: string } {
  const place = position ? `You're number ${position.toLocaleString('en-US')} on the list.` : "You're on the list.";
  const inner =
    emailHeading({ kicker: 'Waitlist', title: "You're on the Karwan waitlist" }) +
    emailText(`${place} We'll email you when your spot on Arc mainnet opens.`, "You don't have to wait to see how it works. Karwan runs in full on testnet, with test money.") +
    emailButton('Try Karwan on testnet', TESTNET_SIGNUP_URL);
  return {
    subject: "You're on the Karwan waitlist",
    html: brandedEmailHtml({ title: "You're on the waitlist", inner, footerNote: 'You joined the Karwan waitlist with this address. Not you? Ignore this email.' }),
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
