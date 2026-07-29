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
  const url = escapeHtml(input.inviteUrl);

  // `inner` is injected directly inside the card's own <table>, so it MUST be
  // a sequence of <tr> rows. Returning a <table> here is invalid nesting: every
  // client hoists it out, and the body renders outside the white card, full
  // bleed, running off the edge of a phone. The 28px horizontal padding matches
  // the shell's other rows so the text lines up with the wordmark above it.
  //
  // The invite URL is ~130 characters with no spaces, and an unbreakable string
  // like that widens a table past its own max-width. `word-break` on the cell
  // that holds it is what contains it; the same rule on an inline span is
  // widely ignored.
  return `
          <tr>
            <td style="padding:6px 28px 16px 28px;font-size:15px;line-height:1.65;color:#0e0e0e;">
              ${escapeHtml(input.name)}, you now have access to Karwan's canon:
              what we have shipped, what we have not, how we write, and the
              brand rules.
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 24px 28px;font-size:15px;line-height:1.65;color:#0e0e0e;">
              Set a password, then connect it to the Claude app, ChatGPT, or
              whatever you already use. It will write from what is actually true
              about the product instead of guessing.
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 20px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:10px;background:#0e0e0e;">
                    <a href="${url}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#f4f4f1;text-decoration:none;">Set up my account</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 20px 28px;font-size:13px;line-height:1.6;color:#8a8478;">
              ${escapeHtml(input.expiresLabel)}. You are joining as
              <strong style="color:#0e0e0e;">${escapeHtml(input.role)}</strong>,
              which decides what the canon shows you.
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

/// The rendered email. Exported so the preview harness renders the SAME thing
/// that gets sent, rather than a second copy of the shell config that drifts
/// the first time either is edited.
export function teamInvitePreviewHtml(input: TeamInviteEmailInput): string {
  return brandedEmailHtml({
    eyebrow: 'TEAM ACCESS',
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
