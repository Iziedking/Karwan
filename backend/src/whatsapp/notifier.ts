import { logger } from '../logger.js';
import type { OutMessage } from './render.js';

interface EventLike {
  type: string;
  jobId?: string;
}

export interface WhatsappNotifierDeps<E extends EventLike> {
  subscribe: (handler: (e: E) => Promise<void>) => () => void;
  relevant: ReadonlySet<string>;
  recipients: (e: E) => Promise<{ address: string; role: string }[]>;
  summary: (e: E, role: string) => { text: string; url?: string | null } | null;
  muted: (address: string) => Promise<boolean>;
  /// False when the address has no WhatsApp account.
  tell: (address: string, m: OutMessage) => Promise<boolean>;
}

/// Deal updates for people who live in chat: the same events, recipients and
/// wording as the Telegram notifier, sent to their WhatsApp. Outside the
/// 24-hour window the outbox holds the update and sends a template instead.
export function createWhatsappNotifier<E extends EventLike>(deps: WhatsappNotifierDeps<E>): () => void {
  return deps.subscribe(async (e) => {
    if (!deps.relevant.has(e.type)) return;
    try {
      for (const r of await deps.recipients(e)) {
        if (await deps.muted(r.address)) continue;
        const summary = deps.summary(e, r.role);
        if (!summary) continue;
        const text = summary.text.replace(/`/g, '');
        await deps.tell(r.address, { kind: 'text', body: summary.url ? `${text}\n\n${summary.url}` : text });
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message, type: e.type }, 'whatsapp notifier error');
    }
  });
}
