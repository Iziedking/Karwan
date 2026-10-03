/// One list of Updates cards for every network. A server with
/// UPDATES_SOURCE_URL set (testnet, pointing at the mainnet API) shows the
/// cards published there; its own list is the fallback when that server cannot
/// be reached, so home never goes blank.

import { z } from 'zod';
import { logger } from '../logger.js';
import { updateInputSchema, type UpdateCard } from './model.js';

const publicCard = updateInputSchema.omit({ active: true, startsAt: true, endsAt: true }).extend({
  id: z.string().max(40),
  order: z.number().int(),
});
const sourceResponse = z.object({ cards: z.array(publicCard).max(50) });

export type PublicCard = Omit<UpdateCard, 'active' | 'startsAt' | 'endsAt' | 'createdAt' | 'updatedAt'>;

const TTL_MS = 60_000;
let cached: { at: number; url: string; cards: PublicCard[] } | null = null;

/// The source's live cards, or null when there is no source or it failed. The
/// response is validated with the same rules as a local card, so a source can
/// never hand this server a link it would refuse to publish itself.
export async function sourcedCards(url: string | undefined, fetcher: typeof fetch = fetch): Promise<PublicCard[] | null> {
  if (!url) return null;
  if (cached && cached.url === url && Date.now() - cached.at < TTL_MS) return cached.cards;
  try {
    const res = await fetcher(`${url.replace(/\/$/, '')}/api/updates`, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const parsed = sourceResponse.safeParse(await res.json());
    if (!parsed.success) throw new Error('unexpected shape');
    cached = { at: Date.now(), url, cards: parsed.data.cards };
    return parsed.data.cards;
  } catch (err) {
    logger.warn({ err: (err as Error).message, url }, 'updates: source unreachable, using this server\'s own cards');
    return null;
  }
}

export function __resetSourceCacheForTests(): void {
  cached = null;
}
