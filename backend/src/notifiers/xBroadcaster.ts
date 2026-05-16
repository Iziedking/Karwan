import { bus, type KarwanEvent } from '../events.js';
import { config } from '../config.js';
import { getDeal } from '../db/deals.js';
import { getProfile } from '../db/profiles.js';
import { logger } from '../logger.js';

// Public-facing milestones that Karwan's X account would broadcast on a user's
// behalf when their handle is bound. Kept tight on purpose — only "deal
// landed" and "deal settled" carry enough value to share publicly. Cancels
// and disputes stay internal.
const X_BROADCAST_EVENTS = new Set([
  'deal.match.approved',
  'deal.direct.created',
  'escrow.settled',
]);

function frontendBase(): string | null {
  if (!config.FRONTEND_BASE_URL) return null;
  return config.FRONTEND_BASE_URL.replace(/\/$/, '');
}

interface QueuedPost {
  jobId: string;
  recipientAddress: string;
  handle: string;
  text: string;
}

async function summaryFor(e: KarwanEvent, handle: string): Promise<string | null> {
  const at = handle.startsWith('@') ? handle : `@${handle}`;
  if (e.type === 'deal.match.approved') {
    const price = e.payload?.agreedPriceUsdc as string | undefined;
    return `${at} just landed a ${price ?? ''} USDC deal on Karwan. Agentic settlement on Arc.`.trim();
  }
  if (e.type === 'deal.direct.created') {
    const amount = e.payload?.dealAmountUsdc as string | undefined;
    return `${at} just opened a ${amount ?? ''} USDC direct deal on Karwan.`.trim();
  }
  if (e.type === 'escrow.settled') {
    return `${at} just settled a deal on Karwan. Escrow released cleanly.`;
  }
  return null;
}

async function postsFor(e: KarwanEvent): Promise<QueuedPost[]> {
  if (!e.jobId) return [];
  const deal = await getDeal(e.jobId);
  if (!deal) return [];
  const parties = [deal.buyer, deal.seller];
  const out: QueuedPost[] = [];
  for (const addr of parties) {
    const profile = await getProfile(addr);
    if (!profile?.xHandle) continue;
    const text = await summaryFor(e, profile.xHandle);
    if (!text) continue;
    out.push({ jobId: e.jobId, recipientAddress: addr, handle: profile.xHandle, text });
  }
  return out;
}

/// Subscribes to the bus and queues an X broadcast for every party whose
/// handle is bound. The actual API call happens in a follow-up — for now this
/// emits a `notify.x.queued` event and logs the intent, so the broadcast
/// surface is fully wired even without the X API credentials in env.
export function startXBroadcaster(): () => void {
  return bus.subscribe(async (e) => {
    if (!X_BROADCAST_EVENTS.has(e.type)) return;
    try {
      const posts = await postsFor(e);
      for (const p of posts) {
        const base = frontendBase();
        const url = base ? `${base}/deals/${p.jobId}` : null;
        const fullText = url ? `${p.text} ${url}` : p.text;
        bus.emitEvent({
          type: 'agent.skipped',
          jobId: p.jobId,
          actor: 'platform',
          payload: {
            scope: 'x.broadcast.queued',
            handle: p.handle,
            recipient: p.recipientAddress,
            text: fullText,
            sourceType: e.type,
          },
        });
        logger.info(
          { jobId: p.jobId, handle: p.handle, type: e.type },
          'x broadcast queued (api integration pending)',
        );
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message, type: e.type }, 'x broadcaster error');
    }
  });
}
