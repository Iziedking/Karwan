// Branded email letting a pending-invite recipient know the buyer withdrew
// the deal before they accepted. The original invite email teased a deal;
// this email closes the loop so the recipient does not return days later
// and try to claim a link that no longer leads anywhere useful. Falls back
// to log-only when RESEND_API_KEY isn't set.
import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, LOGO_BUFFER, LOGO_CID, escapeHtml } from './brand.js';

export interface DealCancelledEmailInput {
  /// Lower-cased recipient email address; the address the invite was keyed to.
  to: string;
  /// USDC amount the cancelled deal would have been, pre-formatted.
  dealAmountUsdc: string;
  /// Buyer wallet shortened, same masking convention as the invite emails.
  inviterMasked: string;
  /// Optional free-text reason the buyer set on cancellation. Trimmed inline.
  reason?: string;
}

export interface SendResult {
  delivered: boolean;
  reason?: string;
}

function cancelInnerHtml(input: DealCancelledEmailInput): string {
  const reasonLine = input.reason
    ? `
          <tr>
            <td style="padding:0 28px 18px 28px;">
              <div style="padding:14px 16px;background:#f6f3ea;border:1px solid #e6e2d8;border-radius:10px 10px 10px 4px;">
                <div style="font-size:10px;letter-spacing:0.18em;color:#8a8478;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;margin-bottom:8px;">Reason</div>
                <div style="font-size:13px;line-height:1.5;color:#3a352c;">${escapeHtml(input.reason.slice(0, 280))}</div>
              </div>
            </td>
          </tr>`
    : '';

  return `
          <tr>
            <td style="padding:36px 28px 18px 28px;text-align:center;">
              <div style="font-size:12px;letter-spacing:0.18em;color:#8a8478;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;margin-bottom:14px;">Deal cancelled</div>
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.55;color:#3a352c;">
                <strong style="color:#0e0e0e;">${escapeHtml(input.inviterMasked)}</strong>
                withdrew the
                <strong style="color:#0e0e0e;">${escapeHtml(input.dealAmountUsdc)} USDC</strong>
                deal you were invited to before you accepted it.
              </p>
              <p style="margin:0;font-size:13px;line-height:1.55;color:#7a7466;">
                No escrow was funded. There is nothing on your side to undo.
              </p>
            </td>
          </tr>
          ${reasonLine}
  `;
}

export async function sendDealCancelledEmail(
  input: DealCancelledEmailInput,
): Promise<SendResult> {
  const client = resendClient();
  if (!client) {
    logger.info(
      { to: input.to },
      '[invite-cancelled] no RESEND_API_KEY, log-only',
    );
    return { delivered: false };
  }
  const html = brandedEmailHtml({
    eyebrow: 'DEAL CANCELLED',
    title: 'The deal invite you received was cancelled',
    inner: cancelInnerHtml(input),
    footerNote:
      'You can safely ignore the earlier invite link. If you have questions, reply to this email.',
  });
  const subject = `Karwan deal cancelled (${input.dealAmountUsdc} USDC)`;
  const lines = [
    `${input.inviterMasked} withdrew the ${input.dealAmountUsdc} USDC deal you were invited to before you accepted it.`,
    '',
    'No escrow was funded. There is nothing on your side to undo.',
  ];
  if (input.reason) {
    lines.push('');
    lines.push(`Reason: ${input.reason.slice(0, 280)}`);
  }
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
        'resend rejected deal cancel send',
      );
      return { delivered: false, reason: error.message };
    }
    logger.info({ to: input.to, id: data?.id }, 'deal cancel email sent');
    return { delivered: true };
  } catch (err) {
    const message = (err as Error).message ?? 'unknown';
    logger.warn({ err: message, to: input.to }, 'resend threw on deal cancel');
    return { delivered: false, reason: message };
  }
}
