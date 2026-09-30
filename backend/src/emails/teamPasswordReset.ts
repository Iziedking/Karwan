// The password reset email. Deliberately shorter than the invitation: the
// person reading this already knows what Karwan is and why they have an
// account, and every extra sentence is one more thing between them and the
// button they came for.
import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, emailButton, emailHeading, emailNote, emailText, emailUrlFallback, LOGO_BUFFER, LOGO_CID } from './brand.js';

export interface TeamPasswordResetEmailInput {
  to: string;
  name: string;
  /// Absolute URL of the page that sets the new password.
  resetUrl: string;
  expiresLabel: string;
}

export interface SendResult {
  delivered: boolean;
  reason?: string;
}

function inner(input: TeamPasswordResetEmailInput): string {
  return (
    emailHeading({ kicker: 'Team access', title: 'Reset your Karwan password' }) +
    emailText(`${input.name}, someone asked to reset the password on your Karwan team account.`) +
    emailButton('Choose a new password', input.resetUrl) +
    emailNote(`${input.expiresLabel}, and it works once. Didn't ask for this? Ignore it. Your current password still works.`) +
    emailUrlFallback(input.resetUrl)
  );
}

/// Exported so the preview harness renders exactly what gets sent.
export function teamPasswordResetPreviewHtml(input: TeamPasswordResetEmailInput): string {
  return brandedEmailHtml({
    title: 'Reset your Karwan password',
    inner: inner(input),
    footerNote: 'You are getting this because a reset was requested for your team account.',
  });
}

export async function sendTeamPasswordResetEmail(
  input: TeamPasswordResetEmailInput,
): Promise<SendResult> {
  const client = resendClient();
  if (!client) {
    logger.warn({ to: input.to }, 'team reset email skipped: RESEND_API_KEY unset');
    return { delivered: false, reason: 'email is not configured' };
  }

  const text =
    `${input.name}, somebody asked to reset the password on your Karwan team account.\n\n` +
    `Choose a new password: ${input.resetUrl}\n\n` +
    `${input.expiresLabel}, and it can only be used once.\n` +
    `If you did not ask for this, ignore it. Your current password still works.`;

  try {
    const { data, error } = await client.emails.send({
      from: config.RESEND_FROM,
      replyTo: 'support@karwan.site',
      to: input.to,
      subject: 'Reset your Karwan password',
      html: teamPasswordResetPreviewHtml(input),
      text,
      ...(LOGO_BUFFER
        ? { attachments: [{ filename: 'karwan-logo.png', content: LOGO_BUFFER, contentId: LOGO_CID }] }
        : {}),
    });

    if (error) {
      logger.warn({ err: error.message, to: input.to }, 'resend rejected team reset');
      return { delivered: false, reason: error.message };
    }
    logger.info({ to: input.to, id: data?.id }, 'team reset email sent');
    return { delivered: true };
  } catch (err) {
    const message = (err as Error).message ?? 'unknown';
    logger.warn({ err: message, to: input.to }, 'team reset email failed');
    return { delivered: false, reason: message };
  }
}
