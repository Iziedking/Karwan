// Branded email telling a pending-invite recipient that the buyer adjusted
// the deal terms before they accepted. Same look as the original invite so
// the recipient sees a continuation, not a fresh pitch. Falls back to a
// log-only no-op when RESEND_API_KEY isn't set.
import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import {
  brandedEmailHtml,
  emailAmount,
  emailButton,
  emailFacts,
  emailHeading,
  emailPanel,
  emailStrong,
  emailText,
  emailUrlFallback,
  escapeHtml,
  LOGO_BUFFER,
  LOGO_CID,
} from './brand.js';

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
  const facts: Array<[string, string]> = [['From', input.inviterMasked]];
  if (input.acceptanceLabel || input.deliveryLabel) {
    facts.push(['Agree within', input.acceptanceLabel ?? 'Not set'], ['Deliver within', input.deliveryLabel ?? 'Open-ended']);
  }
  const changes = input.changedLabels.length
    ? emailPanel(`${emailStrong('What changed:')} ${input.changedLabels.map(escapeHtml).join(', ')}`)
    : '';
  return (
    emailHeading({ kicker: 'Deal updated', title: 'The buyer changed the deal you were invited to' }) +
    emailAmount(input.dealAmountUsdc) +
    emailText('Check the new terms before you agree. Agreeing does not move any money. The buyer funds escrow afterwards.') +
    changes +
    emailFacts(facts) +
    emailButton('Review the new terms', input.claimUrl) +
    emailUrlFallback(input.claimUrl)
  );
}

/// The rendered email, shared by the sender and the preview script.
export function dealUpdateHtml(input: DealUpdateEmailInput): string {
  return brandedEmailHtml({
    title: 'The buyer changed the deal you were invited to',
    preheader: `The deal is now ${input.dealAmountUsdc} USDC. Check the new terms before you agree.`,
    inner: updateInnerHtml(input),
    footerNote:
      'No longer want the deal? Ignore this email. Nothing is agreed until you sign in and accept.',
  });
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
  const html = dealUpdateHtml(input);
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
    lines.push(`Agree within: ${input.acceptanceLabel ?? 'Not set'}`);
    lines.push(`Deliver within: ${input.deliveryLabel ?? 'Open-ended'}`);
    lines.push('');
  }
  lines.push('Agreeing does not move any money. The buyer funds escrow afterwards. The link still works.');
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
