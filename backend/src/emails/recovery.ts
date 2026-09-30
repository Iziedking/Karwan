import { config } from '../config.js';
import { logger } from '../logger.js';
import { brandedEmailHtml, emailButton, emailHeading, emailNote, emailPanel, emailText, escapeHtml, LOGO_BUFFER, LOGO_CID } from './brand.js';
import { resendClient } from './resend.js';

/// Emails for passkey recovery. Every step is announced to the account's
/// email so the owner can cancel a recovery they did not start.
export type RecoveryEmailKind = 'started' | 'reminder' | 'released' | 'completed' | 'cancelled';

const when = (ms: number) => new Date(ms).toUTCString();

export function recoveryEmail(
  kind: RecoveryEmailKind,
  opts: { releasableAt?: number; cancelUrl?: string } = {},
): { subject: string; html: string; text: string } {
  const cancel = opts.cancelUrl ? `If this wasn't you, cancel it now: ${opts.cancelUrl}` : '';
  const copy: Record<RecoveryEmailKind, { subject: string; title: string; lines: string[] }> = {
    started: {
      subject: 'Someone started recovering your Karwan wallet',
      title: 'Recovery started',
      lines: [
        `A request to recover your wallet was made. It can finish after ${when(opts.releasableAt ?? Date.now())}.`,
        "If this was you, you don't need to do anything.",
        cancel,
      ],
    },
    reminder: {
      subject: 'Recovery of your Karwan wallet finishes in 1 hour',
      title: 'Recovery finishes soon',
      lines: [
        `The recovery request for your wallet can finish at ${when(opts.releasableAt ?? Date.now())}.`,
        "If this wasn't you, sign in with your passkey and cancel it, or use the link in the first email.",
      ],
    },
    released: {
      subject: 'Your recovery is ready',
      title: 'Recovery is ready',
      lines: [
        'You can now set up a new passkey for your wallet. Open karwan.site and choose "Lost your passkey?".',
        "If this wasn't you, sign in with your passkey and cancel it right away.",
      ],
    },
    completed: {
      subject: 'Your Karwan wallet has a new passkey',
      title: 'Recovery complete',
      lines: [
        'Recovery is complete. Your wallet now works with the new passkey.',
        "If this wasn't you, contact support@karwan.site right away.",
      ],
    },
    cancelled: {
      subject: 'Recovery cancelled',
      title: 'Recovery cancelled',
      lines: ['The recovery request for your wallet was cancelled. Nothing changed.'],
    },
  };
  const { subject, title, lines } = copy[kind];
  const kept = lines.filter(Boolean);
  // The HTML shows the cancel link as the one action; the text keeps it inline.
  const body = kept.filter((l) => l !== cancel);
  const warning = body.find((l) => l.startsWith("If this wasn't you"));
  const inner =
    emailHeading({ kicker: 'Wallet recovery', title }) +
    emailText(...body.filter((l) => l !== warning)) +
    (warning ? emailPanel(escapeHtml(warning), 'warning') : '') +
    (kind === 'started' && opts.cancelUrl ? emailButton('Cancel this recovery', opts.cancelUrl) + emailNote("If this was you, you don't need to do anything.") : '');
  return {
    subject,
    html: brandedEmailHtml({
      title,
      inner,
      preheader: body[0],
      footerNote: 'Karwan emails every recovery step to the address on your account, so you can stop one you did not start.',
    }),
    text: kept.join('\n\n'),
  };
}

export async function sendRecoveryEmail(
  to: string,
  kind: RecoveryEmailKind,
  opts: { releasableAt?: number; cancelUrl?: string } = {},
): Promise<{ delivered: boolean }> {
  const client = resendClient();
  if (!client) {
    logger.info({ to, kind }, '[recovery-email] no RESEND_API_KEY, not sent');
    return { delivered: false };
  }
  const { subject, html, text } = recoveryEmail(kind, opts);
  try {
    const { error } = await client.emails.send({
      from: config.RESEND_FROM,
      replyTo: 'support@karwan.site',
      to,
      subject,
      html,
      text,
      ...(LOGO_BUFFER ? { attachments: [{ filename: 'karwan-logo.png', content: LOGO_BUFFER, contentId: LOGO_CID }] } : {}),
    });
    if (error) {
      logger.warn({ err: error.message, to, kind }, 'resend rejected recovery email');
      return { delivered: false };
    }
    return { delivered: true };
  } catch (err) {
    logger.warn({ err: (err as Error).message, to, kind }, 'recovery email threw');
    return { delivered: false };
  }
}
