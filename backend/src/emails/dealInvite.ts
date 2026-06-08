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
  /// Kept for backward compat; the new acceptance/delivery labels below
  /// drive the visible "two deadlines" block.
  expiresLabel: string;
  /// Acceptance window for the recipient ("Accept within 1 hour"). Mirrors
  /// the buyer's acceptanceWindowHours configured at deal creation. When
  /// omitted the email falls back to the legacy single-expiry framing.
  acceptanceLabel?: string;
  /// Delivery deadline if the seller accepts ("Deliver within 7 days").
  /// Mirrors the buyer's deadlineDays + deadlineHours. Omit for open-ended
  /// deals (no deadline) — the block renders an "Open-ended" pill instead.
  deliveryLabel?: string;
}

export interface SendResult {
  delivered: boolean;
  reason?: string;
}

function inviteInnerHtml(input: DealInviteEmailInput): string {
  /// Two-deadline block: accept-by + deliver-by. Recipients used to see
  /// only the invite-link expiry ("Expires in 6 days") which conflated two
  /// distinct windows — the time they have to ACCEPT the deal once they
  /// click, and the time the SELLER has to DELIVER once accepted. Render
  /// both side-by-side as a metric pair so the recipient understands what
  /// they're signing up for before they click claim. Falls back to the
  /// legacy single-expiry sentence when the new labels aren't provided.
  const hasTwoDeadlines = !!input.acceptanceLabel || !!input.deliveryLabel;
  const deadlineBlock = hasTwoDeadlines
    ? `
          <tr>
            <td style="padding:6px 28px 18px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="50%" style="padding:12px 14px;background:#f6f3ea;border:1px solid #e6e2d8;border-radius:10px 10px 10px 3px;vertical-align:top;">
                    <div style="font-size:10px;letter-spacing:0.18em;color:#8a8478;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;margin-bottom:6px;">Accept by</div>
                    <div style="font-size:14px;font-weight:700;color:#0e0e0e;line-height:1.3;">${escapeHtml(input.acceptanceLabel ?? '—')}</div>
                  </td>
                  <td width="12" style="font-size:0;line-height:0;">&nbsp;</td>
                  <td width="50%" style="padding:12px 14px;background:#f6f3ea;border:1px solid #e6e2d8;border-radius:10px 10px 10px 3px;vertical-align:top;">
                    <div style="font-size:10px;letter-spacing:0.18em;color:#8a8478;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;margin-bottom:6px;">Deliver by</div>
                    <div style="font-size:14px;font-weight:700;color:#0e0e0e;line-height:1.3;">${escapeHtml(input.deliveryLabel ?? 'Open-ended')}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : '';
  const trailingNote = hasTwoDeadlines
    ? `Funds are not moved until you accept. Invite link itself ${escapeHtml(input.expiresLabel.toLowerCase())}.`
    : `${escapeHtml(input.expiresLabel)}. Funds are not moved until you accept.`;
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
                ${trailingNote}
              </p>
            </td>
          </tr>
          ${deadlineBlock}
          <tr>
            <td style="padding:0 28px 12px 28px;">
              <div style="margin-top:10px;padding:14px 16px;background:#f6f3ea;border:1px solid #e6e2d8;border-radius:10px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:11px;line-height:1.5;word-break:break-all;color:#3a352c;">
                ${escapeHtml(input.claimUrl)}
              </div>
            </td>
          </tr>
  `;
}

/// Human-friendly window label for the acceptance / delivery blocks.
/// Hours under a day stay in hours; days roll up cleanly. Empty input
/// returns 'Open-ended' so the email block always has something to render.
export function formatWindowLabel(opts: { days?: number; hours?: number }): string {
  const days = Math.max(0, Math.floor(opts.days ?? 0));
  const hours = Math.max(0, Math.floor(opts.hours ?? 0));
  const totalHours = days * 24 + hours;
  if (totalHours <= 0) return 'Open-ended';
  if (days === 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  if (hours === 0) {
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${days}d ${hours}h`;
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
  const deadlineLines =
    input.acceptanceLabel || input.deliveryLabel
      ? `Accept by: ${input.acceptanceLabel ?? '—'}\nDeliver by: ${input.deliveryLabel ?? 'Open-ended'}\n\n`
      : '';
  const text =
    `${input.inviterMasked} opened a Karwan deal with you for ${input.dealAmountUsdc} USDC.\n\n` +
    `Review and claim: ${input.claimUrl}\n\n` +
    deadlineLines +
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
