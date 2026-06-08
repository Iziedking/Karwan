// Branded email telling a pending-invite recipient that the buyer adjusted
// the deal terms before they accepted. Same look as the original invite so
// the recipient sees a continuation, not a fresh pitch. Falls back to a
// log-only no-op when RESEND_API_KEY isn't set.
import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, LOGO_BUFFER, LOGO_CID, escapeHtml } from './brand.js';

export interface DealUpdateEmailInput {
  /// Lower-cased recipient email address.
  to: string;
  /// Absolute URL of the claim page so the recipient can re-open it and see
  /// the updated terms in context.
  claimUrl: string;
  /// USDC amount the deal is now set to (post-edit). Pre-formatted.
  dealAmountUsdc: string;
  /// Buyer wallet shortened, same masking convention as the invite email.
  inviterMasked: string;
  /// Short list of human-readable fields that changed. Bullet-rendered so
  /// the recipient knows at a glance what to re-check. Values come from
  /// the route, not the LLM, so the words are predictable.
  changedLabels: string[];
  /// Acceptance window post-edit ("1 hour", "24 hours", "Open-ended"). Same
  /// format the invite email uses.
  acceptanceLabel?: string;
  /// Delivery window post-edit. Same format.
  deliveryLabel?: string;
}

export interface SendResult {
  delivered: boolean;
  reason?: string;
}

function updateInnerHtml(input: DealUpdateEmailInput): string {
  const changes = input.changedLabels.length
    ? `
          <tr>
            <td style="padding:0 28px 8px 28px;">
              <div style="padding:14px 16px;background:#f6f3ea;border:1px solid #e6e2d8;border-radius:10px 10px 10px 4px;">
                <div style="font-size:10px;letter-spacing:0.18em;color:#8a8478;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;margin-bottom:8px;">What changed</div>
                <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:#3a352c;">
                  ${input.changedLabels.map((c) => `<li>${escapeHtml(c)}</li>`).join('\n')}
                </ul>
              </div>
            </td>
          </tr>`
    : '';

  const deadlineBlock =
    input.acceptanceLabel || input.deliveryLabel
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

  return `
          <tr>
            <td style="padding:36px 28px 8px 28px;text-align:center;">
              <div style="font-size:12px;letter-spacing:0.18em;color:#8a8478;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;margin-bottom:14px;">Deal updated</div>
              <p style="margin:0 0 22px 0;font-size:15px;line-height:1.55;color:#3a352c;">
                <strong style="color:#0e0e0e;">${escapeHtml(input.inviterMasked)}</strong>
                adjusted the deal you were invited to. It is now
                <strong style="color:#0e0e0e;">${escapeHtml(input.dealAmountUsdc)} USDC</strong>.
              </p>
              <a href="${escapeHtml(input.claimUrl)}" style="display:inline-block;padding:14px 28px;background:#0e0e0e;color:#ffffff;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:13px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;text-decoration:none;border-radius:12px 12px 12px 4px;">Review updated terms</a>
              <p style="margin:18px 0 0 0;font-size:13px;line-height:1.55;color:#7a7466;">
                Funds are not moved until you accept. The link still works.
              </p>
            </td>
          </tr>
          ${changes}
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

export async function sendDealUpdateEmail(
  input: DealUpdateEmailInput,
): Promise<SendResult> {
  const client = resendClient();
  if (!client) {
    logger.info(
      { to: input.to, claimUrl: input.claimUrl },
      '[invite-update] no RESEND_API_KEY, log-only',
    );
    return { delivered: false };
  }
  const html = brandedEmailHtml({
    eyebrow: 'DEAL UPDATED',
    title: 'The deal you were invited to was updated',
    inner: updateInnerHtml(input),
    footerNote:
      'You can ignore this email if you no longer want the deal. The original link binds nothing until you sign in and accept.',
  });
  const subject = `Karwan deal updated (${input.dealAmountUsdc} USDC)`;
  const lines = [
    `${input.inviterMasked} adjusted the deal you were invited to. It is now ${input.dealAmountUsdc} USDC.`,
    '',
    `Review updated terms: ${input.claimUrl}`,
    '',
  ];
  if (input.changedLabels.length) {
    lines.push('What changed:');
    for (const c of input.changedLabels) lines.push(`  - ${c}`);
    lines.push('');
  }
  if (input.acceptanceLabel || input.deliveryLabel) {
    lines.push(`Accept by: ${input.acceptanceLabel ?? '—'}`);
    lines.push(`Deliver by: ${input.deliveryLabel ?? 'Open-ended'}`);
    lines.push('');
  }
  lines.push('Funds are not moved until you accept. The link still works.');
  const text = lines.join('\n');
  try {
    const { data, error } = await client.emails.send({
      from: config.RESEND_FROM,
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
        'resend rejected deal update send',
      );
      return { delivered: false, reason: error.message };
    }
    logger.info({ to: input.to, id: data?.id }, 'deal update email sent');
    return { delivered: true };
  } catch (err) {
    const message = (err as Error).message ?? 'unknown';
    logger.warn({ err: message, to: input.to }, 'resend threw on deal update');
    return { delivered: false, reason: message };
  }
}
