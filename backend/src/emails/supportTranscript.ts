// Emails a closed support conversation as the durable archive. The operator
// inbox (SUPPORT_EMAIL) always gets a copy; the user gets one too when their
// email is known. Keeping the record in an inbox is what lets the store stay
// flat-file + short-retention instead of growing a Postgres table.
import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, emailFacts, emailHeading, emailQuote, emailText, emailThread, LOGO_BUFFER, LOGO_CID } from './brand.js';
import type { SupportConversation, SupportRole } from '../support/store.js';

/// Reply-To for outbound support mail. When the inbound subdomain is set,
/// replies thread back to the webhook (and into the same ticket); otherwise
/// they land in the support inbox.
function replyToAddress(): string {
  return config.SUPPORT_REPLY_TO ?? config.SUPPORT_EMAIL;
}

/// Email an operator's reply back to an email-origin ticket's sender. The
/// Ticket id in the subject lets the inbound webhook re-thread their reply.
export async function emailOperatorReply(
  convo: SupportConversation,
  text: string,
): Promise<{ delivered: boolean }> {
  const client = resendClient();
  if (!client || !convo.email) return { delivered: false };
  const base = convo.subject?.replace(/^re:\s*/i, '') ?? 'your Karwan support request';
  try {
    const { error } = await client.emails.send({
      from: config.RESEND_FROM,
      replyTo: replyToAddress(),
      to: convo.email,
      subject: `Re: ${base} (Ticket ${convo.id})`,
      html: brandedEmailHtml({
        title: `Ticket ${convo.id}`,
        inner: emailHeading({ kicker: `Karwan support · Ticket ${convo.id}`, title: 'A reply to your support request' }) + emailQuote(text),
        preheader: text.slice(0, 120),
        footerNote: `Reply to this email to continue. Ticket ${convo.id}.`,
      }),
      text: `${text}\n\nReply to this email to continue. Ticket ${convo.id}.`,
    });
    if (error) {
      logger.warn({ err: error.message, id: convo.id }, 'resend rejected operator reply email');
      return { delivered: false };
    }
    return { delivered: true };
  } catch (err) {
    logger.warn({ err: (err as Error).message, id: convo.id }, 'resend threw on operator reply');
    return { delivered: false };
  }
}

/// Flatten the assistant's markdown to plain text. Email and the admin panel
/// render raw text, so **bold** and [label](url) would otherwise show their
/// literal syntax.
function stripMd(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|\s)\*(\S.*?\S)\*(?=\s|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
}

const ROLE_LABEL: Record<SupportRole, string> = {
  user: 'User',
  assistant: 'Assistant',
  operator: 'Support',
  system: 'System',
};

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  } catch {
    return String(ts);
  }
}

function transcriptInnerHtml(convo: SupportConversation): string {
  const facts: Array<[string, string]> = [['Opened', fmtTime(convo.createdAt)]];
  if (convo.address) facts.push(['Account', convo.address]);
  return (
    emailHeading({ kicker: `Conversation ${convo.id}`, title: 'Your support conversation' }) +
    emailFacts(facts) +
    emailThread(convo.messages.map((m) => ({ who: ROLE_LABEL[m.role] ?? m.role, when: fmtTime(m.ts), text: stripMd(m.text) })))
  );
}

function transcriptText(convo: SupportConversation): string {
  const head = `Karwan support conversation ${convo.id}\n` +
    (convo.address ? `Wallet: ${convo.address}\n` : '') +
    `Opened: ${fmtTime(convo.createdAt)}\n\n`;
  const body = convo.messages
    .map((m) => `[${fmtTime(m.ts)}] ${ROLE_LABEL[m.role] ?? m.role}: ${stripMd(m.text)}`)
    .join('\n\n');
  return head + body;
}

/// Fires the moment a live chat opens so the team can pick up the ticket. Goes
/// to SUPPORT_TEAM_EMAIL (a Google Group fans it to everyone) or SUPPORT_EMAIL.
/// Short by design; the full transcript is emailed on close.
export async function sendSupportAlertEmail(
  convo: SupportConversation,
): Promise<{ delivered: boolean }> {
  const client = resendClient();
  if (!client) return { delivered: false };
  const to = config.SUPPORT_TEAM_EMAIL ?? config.SUPPORT_EMAIL;
  const who = convo.address ? convo.address : 'a guest';
  const firstAsk = convo.messages.filter((m) => m.role === 'user').slice(-1)[0]?.text ?? '';
  const html = brandedEmailHtml({
    title: `Ticket ${convo.id}`,
    inner:
      emailHeading({ kicker: `New support ticket · ${convo.id}`, title: 'Someone opened live support' }) +
      emailText('Pick it up in the admin page, Telegram, or by replying to the close-out email.') +
      emailFacts([['From', who]]) +
      (firstAsk ? emailQuote(firstAsk.slice(0, 400)) : ''),
    footerNote: `Ticket ${convo.id}. Reply lands when the operator answers in the admin page or Telegram.`,
  });
  try {
    const { error } = await client.emails.send({
      from: config.RESEND_FROM,
      replyTo: replyToAddress(),
      to,
      subject: `New support ticket ${convo.id}`,
      html,
      text: `New support ticket ${convo.id} from ${who}.\n\n${firstAsk}`.trim(),
    });
    if (error) {
      logger.warn({ err: error.message, id: convo.id }, 'resend rejected support alert');
      return { delivered: false };
    }
    return { delivered: true };
  } catch (err) {
    logger.warn({ err: (err as Error).message, id: convo.id }, 'resend threw on support alert');
    return { delivered: false };
  }
}

/// The rendered transcript, shared by the sender and the preview script.
export function supportTranscriptHtml(convo: SupportConversation): string {
  return brandedEmailHtml({
    title: 'Your support conversation',
    inner: transcriptInnerHtml(convo),
    footerNote: 'Reply to this email to continue the conversation by mail.',
  });
}

export async function sendSupportTranscriptEmail(
  convo: SupportConversation,
): Promise<{ delivered: boolean }> {
  const client = resendClient();
  if (!client) {
    logger.info({ id: convo.id }, '[support] no RESEND_API_KEY, transcript log-only');
    return { delivered: false };
  }
  const recipients = [config.SUPPORT_EMAIL];
  if (convo.email && convo.email !== config.SUPPORT_EMAIL) recipients.push(convo.email);
  const html = supportTranscriptHtml(convo);
  try {
    const { data, error } = await client.emails.send({
      from: config.RESEND_FROM,
      replyTo: replyToAddress(),
      to: recipients,
      subject: `Karwan support transcript (${convo.id})`,
      html,
      text: transcriptText(convo),
      ...(LOGO_BUFFER
        ? { attachments: [{ filename: 'karwan-logo.png', content: LOGO_BUFFER, contentId: LOGO_CID }] }
        : {}),
    });
    if (error) {
      logger.warn({ err: error.message, id: convo.id }, 'resend rejected support transcript');
      return { delivered: false };
    }
    logger.info({ id: convo.id, mailId: data?.id }, 'support transcript emailed');
    return { delivered: true };
  } catch (err) {
    logger.warn({ err: (err as Error).message, id: convo.id }, 'resend threw on support transcript');
    return { delivered: false };
  }
}
