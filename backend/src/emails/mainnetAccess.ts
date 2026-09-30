import { config } from '../config.js';
import { logger } from '../logger.js';
import { brandedEmailHtml, emailButton, emailHeading, emailText, LOGO_BUFFER, LOGO_CID } from './brand.js';
import { resendClient } from './resend.js';

/// Sent when an admin approves someone on the mainnet waitlist.
export const MAINNET_SIGNUP_URL = 'https://karwan.site/start?mode=signup';

export function mainnetAccessEmail(): { subject: string; html: string; text: string } {
  const inner =
    emailHeading({ kicker: 'Mainnet access', title: 'Your place on Karwan has opened' }) +
    emailText('You can now create your account on Arc mainnet. Use this same email address when you sign up.') +
    emailButton('Create your account', MAINNET_SIGNUP_URL);
  return {
    subject: "You're in. Create your Karwan account",
    html: brandedEmailHtml({ title: 'Your place on Karwan has opened', inner, footerNote: 'You joined the Karwan waitlist with this address. Not you? Ignore this email.' }),
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
