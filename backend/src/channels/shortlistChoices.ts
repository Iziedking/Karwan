import { bus, type KarwanEvent } from '../events.js';
import { logger } from '../logger.js';
import { rememberChoices } from './chatHistory.js';
import type { ChatChoices } from './numberReply.js';

/// When a shortlist goes to the buyer's chat (the same updates the notifier
/// sends), the numbered list is kept on their chat account, so replying with a
/// number chooses that offer rather than whatever else is waiting.

type Entry = { rank: number; seller: string; name: string; tag?: string | null; priceUsdc: number; state?: string };

export function choicesFromShortlist(jobId: string, entries: readonly Entry[], now: number): ChatChoices | null {
  const options = entries
    .filter((e) => e.state !== 'unavailable')
    .map((e) => ({ n: e.rank, seller: e.seller, name: e.tag ? `${e.name} @${e.tag}` : e.name, priceUsdc: e.priceUsdc }));
  return options.length ? { kind: 'shortlist', jobId, at: now, options } : null;
}

export function startShortlistChoices(): () => void {
  return bus.subscribe((e: KarwanEvent) => {
    if (e.type !== 'request.shortlist' || !e.jobId || e.payload?.notify !== true) return;
    const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
    const choices = choicesFromShortlist(e.jobId, (e.payload?.entries as Entry[] | undefined) ?? [], Date.now());
    if (!buyer || !choices) return;
    void rememberChoices(buyer, choices).catch((err: Error) => logger.warn({ err: err.message, jobId: e.jobId }, 'shortlist choices not kept'));
  });
}
