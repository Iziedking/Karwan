import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, emailHeading, emailText } from './brand.js';

/// Money health alerts for the team (view 67). Goes to SUPPORT_TEAM_EMAIL, or
/// SUPPORT_EMAIL when that is unset.
export async function sendMoneyHealthEmail(lines: string[]): Promise<{ delivered: boolean }> {
  const client = resendClient();
  if (!client || lines.length === 0) return { delivered: false };
  const to = config.SUPPORT_TEAM_EMAIL ?? config.SUPPORT_EMAIL;
  const cleared = lines.every((l) => l.startsWith('Money health: cleared.'));
  const subject = cleared ? 'Money health: cleared' : 'Money health: something needs a look';
  const html = brandedEmailHtml({
    title: subject,
    inner:
      emailHeading({ kicker: 'Money health', title: cleared ? 'It cleared' : 'Something needs a look' }) +
      emailText(...lines, 'Open admin health for the references.'),
    footerNote: 'Sent by the scheduled money check every time a line opens or clears, and once a day while one stays open.',
  });
  try {
    const { error } = await client.emails.send({
      from: config.RESEND_FROM,
      to,
      subject,
      html,
      text: `${lines.join('\n')}\n\nOpen admin health for the references.`,
    });
    if (error) {
      logger.warn({ err: error.message }, 'resend rejected money health alert');
      return { delivered: false };
    }
    return { delivered: true };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'resend threw on money health alert');
    return { delivered: false };
  }
}
