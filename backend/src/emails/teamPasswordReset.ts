// The password reset email. Deliberately shorter than the invitation: the
// person reading this already knows what Karwan is and why they have an
// account, and every extra sentence is one more thing between them and the
// button they came for.
import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, LOGO_BUFFER, LOGO_CID, escapeHtml } from './brand.js';

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
  const url = escapeHtml(input.resetUrl);

  // Same row-only structure as the invitation email: `inner` is injected inside
  // the card's own <table>, so returning a <table> here breaks out of the card
  // in every client.
  return `
          <tr>
            <td style="padding:6px 28px 16px 28px;font-size:15px;line-height:1.65;color:#0e0e0e;">
              ${escapeHtml(input.name)}, somebody asked to reset the password on
              your Karwan team account.
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 20px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:10px;background:#0e0e0e;">
                    <a href="${url}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#f4f4f1;text-decoration:none;">Choose a new password</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 20px 28px;font-size:13px;line-height:1.6;color:#8a8478;">
              ${escapeHtml(input.expiresLabel)}, and it can only be used once.
              If you did not ask for this, ignore it: your current password still
              works and nothing has changed.
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px 28px;">
              <div style="border-top:1px solid #e6e2d8;padding-top:16px;font-size:12px;line-height:1.6;color:#8a8478;">
                Button not working? Paste this in:
              </div>
              <div style="margin-top:8px;padding:10px 12px;background:#f7f5f0;border:1px solid #e6e2d8;border-radius:8px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:11px;line-height:1.55;color:#6b6b6b;word-break:break-all;">
                <a href="${url}" style="color:#6b6b6b;text-decoration:none;">${url}</a>
              </div>
            </td>
          </tr>`;
}

/// Exported so the preview harness renders exactly what gets sent.
export function teamPasswordResetPreviewHtml(input: TeamPasswordResetEmailInput): string {
  return brandedEmailHtml({
    eyebrow: 'TEAM ACCESS',
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
