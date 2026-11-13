import { config } from '../config.js';
import { logger } from '../logger.js';
import { resendClient } from './resend.js';
import { brandedEmailHtml, emailHeading, emailText } from './brand.js';

/// Every model in a chain failed (view 81). Goes to SUPPORT_TEAM_EMAIL, or
/// SUPPORT_EMAIL when that is unset.
export async function sendModelsDownEmail(lines: string[]): Promise<{ delivered: boolean }> {
  const client = resendClient();
  if (!client || lines.length === 0) return { delivered: false };
  const subject = 'The assistant has no working model';
  const footer = 'Run node dist/scripts/probe-models.js in the API container to see which models answer.';
  try {
    const { error } = await client.emails.send({
      from: config.RESEND_FROM,
      to: config.SUPPORT_TEAM_EMAIL ?? config.SUPPORT_EMAIL,
      subject,
      html: brandedEmailHtml({
        title: subject,
        inner: emailHeading({ kicker: 'Models', title: 'Every model in the chain failed' }) + emailText(...lines, footer),
        footerNote: 'Sent at most once an hour while every model keeps failing.',
      }),
      text: `${lines.join('\n')}\n\n${footer}`,
    });
    if (error) {
      logger.warn({ err: error.message }, 'resend rejected the models down alert');
      return { delivered: false };
    }
    return { delivered: true };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'resend threw on the models down alert');
    return { delivered: false };
  }
}
