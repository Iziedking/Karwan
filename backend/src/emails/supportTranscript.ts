// Emails a closed support conversation as the durable archive. The operator
// inbox (SUPPORT_EMAIL) always gets a copy; the user gets one too when their
// email is known. Keeping the record in an inbox is what lets the store stay
// flat-file + short-retention instead of growing a Postgres table.
import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, LOGO_BUFFER, LOGO_CID, escapeHtml } from './brand.js';
import type { SupportConversation, SupportRole } from '../support/store.js';

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
              <div style="font-size:14px;line-height:1.5;color:#0e0e0e;white-space:pre-wrap;">${escapeHtml(m.text)}</div>
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
    .map((m) => `[${fmtTime(m.ts)}] ${ROLE_LABEL[m.role] ?? m.role}: ${m.text}`)
    .join('\n\n');
  return head + body;
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
      replyTo: config.SUPPORT_EMAIL,
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
