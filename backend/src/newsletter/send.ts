import { resendClient } from '../emails/resend.js';
import { sendTelegramMessage } from '../telegram/bot.js';
import { getIssue, markSent, slugFor, type NewsletterIssue } from '../db/newsletter.js';
import { renderIssue } from './render.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// The only code in this system that reaches a real inbox.
///
/// Everything it can refuse, it refuses. An issue that is not approved, an
/// issue already sent, a missing unsubscribe link, no audience configured, the
/// kill switch: all of them stop here rather than being worked around. The cost
/// of a false negative is an issue that goes out an hour later. The cost of a
/// false positive is mail somebody did not approve, sitting in a few hundred
/// inboxes, unrecallable.
///
/// The order is deliberate. Resend first, and only mark the issue sent once it
/// has accepted the broadcast. The archive and the Telegram announcement come
/// after and are allowed to fail: an issue that went out and was not announced
/// is a smaller problem than an issue announced that never went out.

export class SendRefused extends Error {}

export interface SendResult {
  /// False for a dry run: everything was checked and rendered, nothing left.
  sent: boolean;
  issue: NewsletterIssue;
  broadcastId?: string;
  archiveUrl: string;
  announced: boolean;
  /// Things that did not stop the send but somebody should know about.
  warnings: string[];
}

/// The merge tag Resend replaces with a working unsubscribe link. Verified
/// against the Resend broadcast docs, 2026-07-28. Without it in the HTML, the
/// mail goes out with no way off the list, which is both a compliance problem
/// and the fastest way to earn spam complaints.
const UNSUBSCRIBE_TAG = '{{{RESEND_UNSUBSCRIBE_URL}}}';

export function archiveUrl(issue: NewsletterIssue, at = new Date()): string {
  const slug = issue.slug ?? slugFor(issue.subject, at);
  return `${config.NEWSLETTER_ARCHIVE_BASE.replace(/\/$/, '')}/${slug}`;
}

/// The footer Resend needs, and the browser link a long issue wants.
function footer(url: string): { html: string; text: string } {
  return {
    html: `
        <hr style="border:0;border-top:1px solid rgba(0,0,0,0.08);margin:28px 0 16px 0;" />
        <p style="margin:0;font-size:12px;line-height:1.6;color:#9A9A9A;">
          <a href="${url}" style="color:#9A9A9A;">Read this in your browser</a>
          &nbsp;·&nbsp;
          <a href="${UNSUBSCRIBE_TAG}" style="color:#9A9A9A;">Unsubscribe</a>
        </p>`,
    text: `\nRead this in your browser: ${url}\nUnsubscribe: ${UNSUBSCRIBE_TAG}\n`,
  };
}

export interface SendOptions {
  /// Render, check and report without calling Resend. The default, because the
  /// safe thing should be the thing you get by not thinking.
  dryRun?: boolean;
}

export async function sendIssue(id: string, opts: SendOptions = {}): Promise<SendResult> {
  const dryRun = opts.dryRun ?? true;

  if (!config.NEWSLETTER_ENABLED) {
    throw new SendRefused('the newsletter is switched off');
  }

  const issue = await getIssue(id);
  if (!issue) throw new SendRefused('unknown issue');
  if (issue.status === 'sent') {
    // Not an error worth throwing a stack over, but absolutely not a resend.
    throw new SendRefused('this issue has already gone out');
  }
  if (issue.status !== 'approved') {
    throw new SendRefused(`this issue is ${issue.status}, and only an approved issue can be sent`);
  }

  const segmentId = config.RESEND_SEGMENT_ID ?? config.RESEND_AUDIENCE_ID ?? null;
  const resend = resendClient();
  const warnings: string[] = [];

  const url = archiveUrl(issue);
  const rendered = renderIssue(issue);
  const parts = footer(url);
  const html = rendered.html.replace('</body>', `${parts.html}</body>`);
  const text = `${rendered.text}${parts.text}`;

  // Checked on the rendered output rather than trusted from the template,
  // because the template is the thing most likely to be edited by somebody who
  // does not know this rule exists.
  if (!html.includes(UNSUBSCRIBE_TAG)) {
    throw new SendRefused('the rendered issue has no unsubscribe link, so it will not be sent');
  }

  if (dryRun) {
    if (!resend) warnings.push('RESEND_API_KEY is unset, so a real send would fail.');
    if (!segmentId) warnings.push('No Resend segment or audience configured.');
    if (!config.ANNOUNCE_TELEGRAM_CHAT_ID) warnings.push('No Telegram chat configured to announce to.');
    return { sent: false, issue, archiveUrl: url, announced: false, warnings };
  }

  if (!resend) throw new SendRefused('RESEND_API_KEY is not set');
  if (!segmentId) {
    throw new SendRefused('no Resend segment or audience is configured, so there is nobody to send to');
  }

  // `audienceId` is deprecated in the installed SDK in favour of `segmentId`,
  // but the subscribe box writes to an audience, so accept either and prefer
  // the current field.
  const target = config.RESEND_SEGMENT_ID
    ? { segmentId: config.RESEND_SEGMENT_ID }
    : { audienceId: segmentId };

  const created = await resend.broadcasts.create({
    ...target,
    from: config.NEWSLETTER_FROM ?? config.RESEND_FROM,
    subject: issue.subject,
    previewText: issue.preheader,
    name: issue.slug ?? slugFor(issue.subject, new Date()),
    html,
    text,
  });

  if (created.error || !created.data?.id) {
    throw new Error(`Resend refused the broadcast: ${created.error?.message ?? 'no id returned'}`);
  }

  const sendResult = await resend.broadcasts.send(created.data.id);
  if (sendResult.error) {
    throw new Error(`Resend accepted the draft but refused to send it: ${sendResult.error.message}`);
  }

  // Only now. If this throws, an issue went out and is not recorded, which is
  // recoverable by hand. Marking first and failing to send would leave an issue
  // recorded as delivered that nobody received, which is not.
  const sent = await markSent(id);
  if (!sent) throw new Error('the issue vanished between sending and recording it');

  logger.info({ issueId: id, broadcastId: created.data.id, slug: sent.slug }, 'newsletter sent');

  const announced = await announce(sent, archiveUrl(sent));
  if (!announced && config.ANNOUNCE_TELEGRAM_CHAT_ID) {
    warnings.push('The issue went out but the Telegram announcement failed.');
  }

  return {
    sent: true,
    issue: sent,
    broadcastId: created.data.id,
    archiveUrl: archiveUrl(sent),
    announced,
    warnings,
  };
}

/// Announce it. Never throws: the mail has already gone, and a failed
/// announcement must not look like a failed send.
export async function announce(issue: NewsletterIssue, url: string): Promise<boolean> {
  const chatId = config.ANNOUNCE_TELEGRAM_CHAT_ID;
  if (!chatId) return false;

  try {
    await sendTelegramMessage(
      chatId,
      `*${issue.subject}*\n\n${issue.preheader}\n\n[Read it](${url})`,
    );
    return true;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, issueId: issue.id },
      'newsletter announcement failed after a successful send',
    );
    return false;
  }
}
