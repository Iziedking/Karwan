// Branded email asking a recipient to claim a deal invite. Wraps the shared
// brand shell so the look matches the auth flow. Logs and returns delivered:
// false when RESEND_API_KEY is unset.
import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, LOGO_BUFFER, LOGO_CID, escapeHtml } from './brand.js';

export interface DealInviteEmailInput {
  /// Lower-cased recipient email address. Same address the invite is keyed to.
  to: string;
  /// Absolute URL of the claim page.
  claimUrl: string;
  /// USDC amount, pre-formatted as a string ("100", "100.5").
  dealAmountUsdc: string;
  /// Buyer wallet shortened to "0xab12…cdef". A typoed invite should not
  /// reveal the full buyer address to the wrong recipient.
  inviterMasked: string;
  /// Pre-formatted relative or absolute expiry string ("Expires in 7 days").
  expiresLabel: string;
}

export interface SendResult {
  delivered: boolean;
  reason?: string;
}

function inviteInnerHtml(input: DealInviteEmailInput): string {
  return `
          <tr>
            <td style="padding:36px 28px 8px 28px;text-align:center;">
              <div style="font-size:12px;letter-spacing:0.18em;color:#8a8478;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;margin-bottom:14px;">Deal invite</div>
              <p style="margin:0 0 22px 0;font-size:15px;line-height:1.55;color:#3a352c;">
                <strong style="color:#0e0e0e;">${escapeHtml(input.inviterMasked)}</strong>
                opened a Karwan deal with you for
                <strong style="color:#0e0e0e;">${escapeHtml(input.dealAmountUsdc)} USDC</strong>.
              </p>
              <a href="${escapeHtml(input.claimUrl)}" style="display:inline-block;padding:14px 28px;background:#0e0e0e;color:#ffffff;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:13px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;text-decoration:none;border-radius:12px 12px 12px 4px;">Review and claim</a>
              <p style="margin:18px 0 0 0;font-size:13px;line-height:1.55;color:#7a7466;">
                ${escapeHtml(input.expiresLabel)}. Funds are not moved until you accept.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 28px 12px 28px;">
              <div style="margin-top:10px;padding:14px 16px;background:#f6f3ea;border:1px solid #e6e2d8;border-radius:10px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:11px;line-height:1.5;word-break:break-all;color:#3a352c;">
                ${escapeHtml(input.claimUrl)}
              </div>
            </td>
          </tr>
  `;
}

export async function sendDealInviteEmail(
  input: DealInviteEmailInput,
): Promise<SendResult> {
  const client = resendClient();
  if (!client) {
    logger.info(
      { to: input.to, claimUrl: input.claimUrl },
      '[invite] no RESEND_API_KEY, log-only',
    );
    return { delivered: false };
  }
  const html = brandedEmailHtml({
    eyebrow: 'DEAL INVITE',
    title: 'You have a Karwan deal to review',
    inner: inviteInnerHtml(input),
    footerNote:
      "If you weren't expecting this invite, ignore the email. The link binds nothing until you sign in and accept.",
  });
  const subject = `You have a Karwan deal to review (${input.dealAmountUsdc} USDC)`;
  const text =
    `${input.inviterMasked} opened a Karwan deal with you for ${input.dealAmountUsdc} USDC.\n\n` +
    `Review and claim: ${input.claimUrl}\n\n` +
    `${input.expiresLabel}. Funds are not moved until you accept.\n` +
    `If you weren't expecting this invite, ignore the email.`;
  try {
    const { data, error } = await client.emails.send({
      from: config.RESEND_FROM,
      /// Match the OTP route — replies land in the human-monitored inbox
      /// so an invitee with a question about the deal reaches a person
      /// instead of bouncing off the no-reply sender.
      replyTo: 'support@karwan.site',
      to: input.to,
      subject,
      html,
      text,
      ...(LOGO_BUFFER
        ? {
            attachments: [
              {
                filename: 'karwan-logo.png',
                content: LOGO_BUFFER,
                contentId: LOGO_CID,
              },
            ],
          }
        : {}),
    });
    if (error) {
      logger.warn(
        { err: error.message, errName: error.name, to: input.to, from: config.RESEND_FROM },
        'resend rejected deal invite send',
      );
      return { delivered: false, reason: error.message };
    }
    logger.info({ to: input.to, id: data?.id }, 'deal invite email sent');
    return { delivered: true };
  } catch (err) {
    const message = (err as Error).message ?? 'unknown';
    logger.warn({ err: message, to: input.to }, 'resend threw on deal invite');
    return { delivered: false, reason: message };
  }
}

/// Render "Expires in N days" or "Expires in N hours" from an epoch-ms input.
export function formatExpiresLabel(expiresAtMs: number): string {
  const deltaMs = expiresAtMs - Date.now();
  if (deltaMs <= 0) return 'Already expired';
  const days = Math.floor(deltaMs / 86_400_000);
  if (days >= 2) return `Expires in ${days} days`;
  if (days === 1) return 'Expires in 1 day';
  const hours = Math.max(1, Math.floor(deltaMs / 3_600_000));
  return `Expires in ${hours} hour${hours === 1 ? '' : 's'}`;
}
