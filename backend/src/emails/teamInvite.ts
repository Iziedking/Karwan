// The invitation email. Most of the team is not technical, so this is one
// sentence about why they are getting it and one button. Everything else they
// need is on the page the button leads to.
import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, LOGO_BUFFER, LOGO_CID, escapeHtml } from './brand.js';

export interface TeamInviteEmailInput {
  to: string;
  name: string;
  role: 'dev' | 'marketing';
  /// Absolute URL of the page that sets their password.
  inviteUrl: string;
  expiresLabel: string;
}

export interface SendResult {
  delivered: boolean;
  reason?: string;
}

function inner(input: TeamInviteEmailInput): string {
  return `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#0E0E0E;">
      ${escapeHtml(input.name)}, you have been given access to Karwan's canon:
      what we have shipped, how we write, and the brand rules.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#0E0E0E;">
      Set a password and you can connect it to the Claude app, ChatGPT, or
      whatever you already use, so it writes from what is actually true about
      the product instead of guessing.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="border-radius:10px;background:#0E0E0E;">
        <a href="${escapeHtml(input.inviteUrl)}"
           style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:700;
                  color:#F4F4F1;text-decoration:none;">Set up my account</a>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6B6B6B;">
      ${escapeHtml(input.expiresLabel)}. You are joining as
      <strong>${escapeHtml(input.role)}</strong>, which decides what the canon
      shows you.
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#6B6B6B;">
      If the button does not work, paste this into your browser:<br>
      <span style="word-break:break-all;">${escapeHtml(input.inviteUrl)}</span>
    </p>`;
}

export async function sendTeamInviteEmail(input: TeamInviteEmailInput): Promise<SendResult> {
  const client = resendClient();
  if (!client) {
    // Not a failure worth blocking the invitation over. The admin still has the
    // link and can send it themselves, which is exactly what happened before
    // this email existed.
    logger.warn({ to: input.to }, 'team invite email skipped: RESEND_API_KEY unset');
    return { delivered: false, reason: 'email is not configured' };
  }

  const text =
    `${input.name}, you have been given access to Karwan's canon.\n\n` +
    `Set your password: ${input.inviteUrl}\n\n` +
    `${input.expiresLabel}. You are joining as ${input.role}.\n` +
    `If you were not expecting this, ignore it and tell whoever sent it.`;

  try {
    const { data, error } = await client.emails.send({
      from: config.RESEND_FROM,
      replyTo: 'support@karwan.site',
      to: input.to,
      subject: 'Your Karwan team access',
      html: brandedEmailHtml({
        eyebrow: 'TEAM ACCESS',
        title: 'Your Karwan team access',
        inner: inner(input),
        footerNote: 'You are getting this because somebody at Karwan invited you.',
      }),
      text,
      ...(LOGO_BUFFER
        ? { attachments: [{ filename: 'karwan-logo.png', content: LOGO_BUFFER, contentId: LOGO_CID }] }
        : {}),
    });

    if (error) {
      logger.warn({ err: error.message, to: input.to }, 'resend rejected team invite');
      return { delivered: false, reason: error.message };
    }
    logger.info({ to: input.to, id: data?.id }, 'team invite email sent');
    return { delivered: true };
  } catch (err) {
    const message = (err as Error).message ?? 'unknown';
    logger.warn({ err: message, to: input.to }, 'team invite email failed');
    return { delivered: false, reason: message };
  }
}
