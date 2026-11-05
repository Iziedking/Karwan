// Branded email letting a pending-invite recipient know the buyer withdrew
// the deal before they accepted. The original invite email teased a deal;
// this email closes the loop so the recipient does not return days later
// and try to claim a link that no longer leads anywhere useful. Falls back
// to log-only when RESEND_API_KEY isn't set.
import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, emailFacts, emailHeading, emailNote, emailText, LOGO_BUFFER, LOGO_CID } from './brand.js';
import { emailPriceHero, emailPriceText } from './emailPrice.js';

export interface DealCancelledEmailInput {
  /// Lower-cased recipient email address; the address the invite was keyed to.
  to: string;
  /// USDC amount the cancelled deal would have been, pre-formatted.
  dealAmountUsdc: string;
  /// The amount in the currency the recipient reads prices in ("₦26,922"),
  /// shown before the USDC. Omitted means USDC alone.
  localAmount?: string;
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
  const facts: Array<[string, string]> = [['From', input.inviterMasked]];
  if (input.reason) facts.push(['Reason', input.reason.slice(0, 280)]);
  return (
    emailHeading({ kicker: 'Deal cancelled', title: 'The deal you were invited to was withdrawn' }) +
    emailPriceHero(input.dealAmountUsdc, input.localAmount) +
    emailText('The buyer withdrew it before you accepted. No money was put into escrow, so there is nothing for you to undo.') +
    emailFacts(facts)
  );
}

/// The rendered email, shared by the sender and the preview script.
export function dealCancelledHtml(input: DealCancelledEmailInput): string {
  return brandedEmailHtml({
    title: 'The deal you were invited to was withdrawn',
    preheader: `${emailPriceText(input.dealAmountUsdc, input.localAmount)} deal withdrawn before you accepted.`,
    inner: cancelInnerHtml(input) + (config.ARC_NETWORK === 'testnet' ? emailNote('Testnet activity uses test funds with no monetary value.') : ''),
    footerNote:
      'You can ignore the earlier invite link. Questions? Reply to this email.',
  });
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
  const html = dealCancelledHtml(input);
  const subject = `Karwan deal cancelled (${emailPriceText(input.dealAmountUsdc, input.localAmount)})`;
  const lines = [
    `${input.inviterMasked} withdrew the ${emailPriceText(input.dealAmountUsdc, input.localAmount)} deal you were invited to before you accepted it.`,
    '',
    'No money was put into escrow, so there is nothing for you to undo.',
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
      text: text + (config.ARC_NETWORK === 'testnet' ? '\n\nTestnet activity uses test funds with no monetary value.' : ''),
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
