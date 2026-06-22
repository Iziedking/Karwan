// Emails a closed support conversation as the durable archive. The operator
// inbox (SUPPORT_EMAIL) always gets a copy; the user gets one too when their
// email is known. Keeping the record in an inbox is what lets the store stay
// flat-file + short-retention instead of growing a Postgres table.
import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, LOGO_BUFFER, LOGO_CID, escapeHtml } from './brand.js';
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
        eyebrow: 'KARWAN SUPPORT',
        title: `Ticket ${convo.id}`,
        inner: `
          <tr><td style="padding:28px;">
            <div style="font-size:15px;line-height:1.6;color:#0e0e0e;white-space:pre-wrap;">${escapeHtml(text)}</div>
          </td></tr>`,
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
  const rows = convo.messages
    .map((m) => {
      const who = ROLE_LABEL[m.role] ?? m.role;
      const bg = m.role === 'operator' ? '#eef4ec' : m.role === 'user' ? '#f6f3ea' : '#ffffff';
      return `
          <tr>
            <td style="padding:10px 14px;background:${bg};border:1px solid #e6e2d8;border-radius:10px;">
              <div style="font-size:10px;letter-spacing:0.16em;color:#8a8478;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;margin-bottom:5px;">${escapeHtml(who)} &middot; ${escapeHtml(fmtTime(m.ts))}</div>
              <div style="font-size:14px;line-height:1.5;color:#0e0e0e;white-space:pre-wrap;">${escapeHtml(stripMd(m.text))}</div>
            </td>
          </tr>
          <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
    })
    .join('');
  return `
          <tr>
            <td style="padding:28px 28px 8px 28px;">
              <div style="font-size:12px;letter-spacing:0.18em;color:#8a8478;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;margin-bottom:6px;">Conversation ${escapeHtml(convo.id)}</div>
              <p style="margin:0 0 18px 0;font-size:13px;line-height:1.55;color:#7a7466;">
                ${convo.address ? `Wallet <strong style="color:#0e0e0e;">${escapeHtml(convo.address)}</strong>. ` : ''}Opened ${escapeHtml(fmtTime(convo.createdAt))}.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${rows}
              </table>
            </td>
          </tr>`;
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
    eyebrow: 'NEW SUPPORT TICKET',
    title: `Ticket ${convo.id}`,
    inner: `
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 12px 0;font-size:14px;color:#3a352c;">A user opened live support. Pick it up in the admin page, Telegram, or by replying to the close-out email.</p>
              <p style="margin:0 0 6px 0;font-size:13px;color:#7a7466;">From: ${escapeHtml(who)}</p>
              ${firstAsk ? `<p style="margin:8px 0 0 0;font-size:14px;color:#0e0e0e;white-space:pre-wrap;">${escapeHtml(firstAsk.slice(0, 400))}</p>` : ''}
            </td>
          </tr>`,
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
  const html = brandedEmailHtml({
    eyebrow: 'SUPPORT TRANSCRIPT',
    title: 'Support conversation closed',
    inner: transcriptInnerHtml(convo),
    footerNote: 'Reply to this email to continue the conversation by mail.',
  });
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
