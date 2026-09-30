// Branded email asking a recipient to claim a deal invite. Wraps the shared
// brand shell so the look matches the auth flow. Logs and returns delivered:
// false when RESEND_API_KEY is unset.
import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import {
  brandedEmailHtml,
  emailAmount,
  emailButton,
  emailFacts,
  emailHeading,
  emailNote,
  emailPanel,
  emailStrong,
  emailText,
  emailUrlFallback,
  LOGO_BUFFER,
  LOGO_CID,
} from './brand.js';

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
  /// deals (no deadline). The block renders an "Open-ended" pill instead.
  deliveryLabel?: string;
  /// Set when this email already belongs to an account, masked as
  /// "0xab12…cdef". There is no claim link in that case: the deal already names
  /// their wallet, and `claimUrl` points at the deal itself. Naming the wallet
  /// matters because this is exactly the person who would otherwise sign up with
  /// their email, land on a second identity, and wonder where the deal went.
  signInWallet?: string;
  /// How they prove that identity: 'wallet' means connect it, 'login' means the
  /// email sign-in they already use. Only read when `signInWallet` is set.
  signInVia?: 'login' | 'wallet';
}

export interface SendResult {
  delivered: boolean;
  reason?: string;
}

function inviteInnerHtml(input: DealInviteEmailInput): string {
  const hasTwoDeadlines = !!input.acceptanceLabel || !!input.deliveryLabel;
  const facts: Array<[string, string]> = [['From', input.inviterMasked]];
  if (hasTwoDeadlines) {
    facts.push(['Agree within', input.acceptanceLabel ?? 'Not set'], ['Deliver within', input.deliveryLabel ?? 'Open-ended']);
  }
  if (!input.signInWallet) facts.push(['Invite link', input.expiresLabel]);
  /// The line that stops a second account being created. Their email is already
  /// attached to an identity, so it says which one to use rather than inviting
  /// them to make another.
  const wallet = input.signInWallet
    ? emailPanel(
        input.signInVia === 'login'
          ? `Sign in with this email as usual. The deal is already addressed to your account ${emailStrong(input.signInWallet)}.`
          : `Sign in with your wallet ${emailStrong(input.signInWallet)}, the one you verified this email with. The deal is already addressed to it, so there is nothing to claim and no new account to create.`,
      )
    : '';
  const url = input.claimUrl;
  return (
    emailHeading({
      kicker: input.signInWallet ? 'Deal waiting' : 'Deal to review',
      title: 'Someone opened a deal with you on Karwan',
    }) +
    emailAmount(input.dealAmountUsdc) +
    emailText('Agreeing does not move any money. After you agree, the buyer puts the money into escrow before work starts.') +
    wallet +
    emailFacts(facts) +
    emailButton(input.signInWallet ? 'Open the deal' : 'Review the deal', url) +
    emailNote('Nothing is agreed until you accept. You can decline from the same page.') +
    emailUrlFallback(url)
  );
}

/// Human-friendly window label for the acceptance / delivery blocks.
/// Hours under a day stay in hours; days roll up cleanly. Empty input
/// returns 'Open-ended' so the email block always has something to render.
export function formatWindowLabel(opts: { days?: number; hours?: number }): string {
  const totalMinutes = Math.max(
    0,
    Math.round((opts.days ?? 0) * 24 * 60 + (opts.hours ?? 0) * 60),
  );
  if (totalMinutes <= 0) return 'Open-ended';
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    if (remainingMinutes === 0) return `${totalHours} hour${totalHours === 1 ? '' : 's'}`;
    return `${totalHours}h ${remainingMinutes}m`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (hours === 0 && remainingMinutes === 0) {
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${days}d ${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}m` : ''}`;
}

/// The rendered email, shared by the sender and the preview script.
export function dealInviteHtml(input: DealInviteEmailInput): string {
  return brandedEmailHtml({
    title: 'You have a Karwan deal to review',
    preheader: `${input.inviterMasked} opened a ${input.dealAmountUsdc} USDC deal with you.`,
    inner: inviteInnerHtml(input),
    footerNote:
      "Not expecting this invite? Ignore the email. Nothing is agreed until you sign in and accept.",
  });
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
  const html = dealInviteHtml(input);
  const subject = `You have a Karwan deal to review (${input.dealAmountUsdc} USDC)`;
  const signInLine = input.signInWallet
    ? input.signInVia === 'login'
      ? `Sign in with this email as usual. The deal is already addressed to your account ${input.signInWallet}.\n\n`
      : `Sign in with your wallet ${input.signInWallet}, the one you verified this email against. The deal is already addressed to it, so there is nothing to claim and no new account to create.\n\n`
    : '';
  const deadlineLines =
    input.acceptanceLabel || input.deliveryLabel
      ? `Agree within: ${input.acceptanceLabel ?? 'Not set'}\nDeliver within: ${input.deliveryLabel ?? 'Open-ended'}\n\n`
      : '';
  const text =
    `${input.inviterMasked} opened a Karwan deal with you for ${input.dealAmountUsdc} USDC.\n\n` +
    `${input.signInWallet ? 'Open the deal' : 'Review the deal'}: ${input.claimUrl}\n\n` +
    signInLine +
    deadlineLines +
    (input.signInWallet ? '' : `${input.expiresLabel}. `) +
    'Agreeing does not move any money. After you agree, the buyer puts the money into escrow before work starts.\n\n' +
    `Not expecting this? Ignore the email.`;
  try {
    const { data, error } = await client.emails.send({
      from: config.RESEND_FROM,
      /// Match the OTP route, replies land in the human-monitored inbox
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
