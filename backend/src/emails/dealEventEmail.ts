// Generic branded email for a deal lifecycle event, sent to a user's verified
// contact email. One sender, many events: the notifier builds the kicker,
// subject, heading, body, and CTA per event and this renders + ships it inside
// the shared brand shell. Falls back to a log-only no-op when RESEND_API_KEY
// isn't set.
import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, emailAmount, emailButton, emailHeading, emailText, LOGO_BUFFER, LOGO_CID } from './brand.js';

export interface DealEventEmailInput {
  /// Lower-cased recipient email.
  to: string;
  /// Quiet sentence-case label above the heading, e.g. "Escrow funded".
  kicker: string;
  /// Email subject line.
  subject: string;
  /// The headline.
  heading: string;
  /// One or two sentences of plain body copy.
  body: string;
  /// The USDC amount this event is about, as a plain decimal string. Shown as
  /// the largest line when present.
  amount?: string;
  /// Optional CTA button label + absolute URL. Omitted together when the
  /// event has no useful destination (e.g. a decline).
  ctaLabel?: string;
  ctaUrl?: string;
}

/// "1200.5" -> "1,200.50". Invalid input is shown as given.
export function formatEmailUsdc(amount: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : amount;
}

export function dealEventInnerHtml(input: Omit<DealEventEmailInput, 'to'>): string {
  return (
    emailHeading({ kicker: input.kicker, title: input.heading }) +
    (input.amount ? emailAmount(formatEmailUsdc(input.amount)) : '') +
    emailText(input.body) +
    (input.ctaLabel && input.ctaUrl ? emailButton(input.ctaLabel, input.ctaUrl) : '')
  );
}

/// The rendered email, shared by the sender and the preview script.
export function dealEventHtml(input: Omit<DealEventEmailInput, 'to'>): string {
  return brandedEmailHtml({
    title: input.subject,
    inner: dealEventInnerHtml(input),
    preheader: input.body,
    footerNote: 'You get deal emails because you verified this address on Karwan. You can turn them off in your profile settings.',
  });
}

export async function sendDealEventEmail(input: DealEventEmailInput): Promise<boolean> {
  const client = resendClient();
  if (!client) {
    logger.info({ to: input.to, subject: input.subject }, '[deal-email] no RESEND_API_KEY, log-only');
    return false;
  }
  const html = dealEventHtml(input);
  const textLines = [input.heading, ...(input.amount ? ['', `${formatEmailUsdc(input.amount)} USDC`] : []), '', input.body];
  if (input.ctaLabel && input.ctaUrl) {
    textLines.push('', `${input.ctaLabel}: ${input.ctaUrl}`);
  }
  try {
    const { data, error } = await client.emails.send({
      from: config.RESEND_FROM,
      replyTo: 'support@karwan.site',
      to: input.to,
      subject: input.subject,
      html,
      text: textLines.join('\n'),
      ...(LOGO_BUFFER
        ? { attachments: [{ filename: 'karwan-logo.png', content: LOGO_BUFFER, contentId: LOGO_CID }] }
        : {}),
    });
    if (error) {
      logger.warn({ err: error.message, to: input.to }, 'resend rejected deal-event send');
      return false;
    }
    logger.info({ to: input.to, id: data?.id, subject: input.subject }, 'deal-event email sent');
    return true;
  } catch (err) {
    logger.warn({ err: (err as Error).message, to: input.to }, 'resend threw on deal-event');
    return false;
  }
}
