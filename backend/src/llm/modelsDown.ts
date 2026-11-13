import { config } from '../config.js';
import { logger } from '../logger.js';
import { shouldAlert, type LinkFailure } from './chain.js';

/// Tells the team when every model in a chain failed (view 81), at most once
/// an hour per process. Never throws: an alert must not break the caller.
let lastAlertAt: number | null = null;

export function modelsDownLines(failures: LinkFailure[]): string[] {
  return [
    `Every model in the chain failed on ${config.ARC_NETWORK}. The assistant and agents have no model until one comes back.`,
    ...failures.map((f) => `${f.provider}: ${f.error}`),
  ];
}

export function reportModelsDown(failures: LinkFailure[]): void {
  const now = Date.now();
  if (!shouldAlert(lastAlertAt, now)) return;
  lastAlertAt = now;
  const lines = modelsDownLines(failures);
  logger.error({ failures }, 'every model in the chain failed');
  void (async () => {
    const { sendTelegramMessage, supportOperatorChatId, telegramEnabled } = await import('../telegram/bot.js');
    const chat = supportOperatorChatId();
    if (telegramEnabled() && chat !== null) await sendTelegramMessage(chat, lines.join('\n'), undefined, { plain: true });
    const { sendModelsDownEmail } = await import('../emails/modelsDown.js');
    await sendModelsDownEmail(lines);
  })().catch((err) => logger.warn({ err: (err as Error).message }, 'models down alert not delivered'));
}
