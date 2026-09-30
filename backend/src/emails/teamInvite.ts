// The invitation email. Most of the team is not technical, so this is one
// sentence about why they are getting it and one button. Everything else they
// need is on the page the button leads to.
import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, emailButton, emailFacts, emailHeading, emailNote, emailText, emailUrlFallback, LOGO_BUFFER, LOGO_CID } from './brand.js';

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
  return (
    emailHeading({ kicker: 'Team access', title: `${input.name}, you have access to the Karwan canon` }) +
    emailText(
      'It holds what we have shipped, what we have not, how we write, and the brand rules.',
      'Set a password, then connect it to the Claude app, ChatGPT, or whatever you already use. It will write from what is true about the product instead of guessing.',
    ) +
    emailFacts([['Role', input.role === 'dev' ? 'Developer' : 'Marketing']]) +
    emailButton('Set up my account', input.inviteUrl) +
    emailNote(`${input.expiresLabel}. Your role decides what the canon shows you.`) +
    emailUrlFallback(input.inviteUrl)
  );
}

/// The rendered email. Exported so the preview harness renders the SAME thing
/// that gets sent, rather than a second copy of the shell config that drifts
/// the first time either is edited.
export function teamInvitePreviewHtml(input: TeamInviteEmailInput): string {
  return brandedEmailHtml({
    title: 'Your Karwan team access',
    inner: inner(input),
    footerNote: 'You are getting this because somebody at Karwan invited you.',
  });
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
      html: teamInvitePreviewHtml(input),
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
