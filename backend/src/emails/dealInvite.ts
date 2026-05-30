/// Outbound email telling a recipient that someone has opened a Karwan deal
/// with them and asking them to claim the link. Wraps the shared brand shell
/// from emails/brand.ts so the invite reads as the same Karwan as the auth
/// flow. Falls back to a log line when RESEND_API_KEY isn't set so dev still
/// works without provider config.
import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, LOGO_BUFFER, LOGO_CID, escapeHtml } from './brand.js';

export interface DealInviteEmailInput {
  /// Lower-cased recipient address — the same address the invite is keyed to.
  to: string;
  /// Absolute URL of the claim page, e.g. https://karwan.site/invite/<token>.
  claimUrl: string;
  /// USDC amount as a string ("100" or "100.5"), already formatted to the
  /// decimals the rest of the app surfaces.
  dealAmountUsdc: string;
  /// Wallet that opened the deal, masked to "0xab12…cdef" for the email body.
  /// The recipient sees this enough to recognise it; we don't reveal the full
  /// address so a typo-ed invite doesn't dox the buyer.
  inviterMasked: string;
  /// Time the invite link expires, expressed as a short human label like
  /// "Expires in 7 days" or "Expires Mon, Jun 6". Pre-formatted by the caller
  /// so we don't carry a date library into the email module.
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

/// Cheap human label for "expires in N days" / "expires in N hours". Falls
/// back to a date string when the window is too long for a relative tag.
export function formatExpiresLabel(expiresAtMs: number): string {
  const deltaMs = expiresAtMs - Date.now();
  if (deltaMs <= 0) return 'Already expired';
  const days = Math.floor(deltaMs / 86_400_000);
  if (days >= 2) return `Expires in ${days} days`;
  if (days === 1) return 'Expires in 1 day';
  const hours = Math.max(1, Math.floor(deltaMs / 3_600_000));
  return `Expires in ${hours} hour${hours === 1 ? '' : 's'}`;
}
