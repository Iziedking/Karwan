import { bus, type KarwanEvent } from '../events.js';
import { config } from '../config.js';
import { getDeal } from '../db/deals.js';
import { getTelegramLink } from '../db/telegramLinks.js';
import { sendTelegramMessage, telegramEnabled } from './bot.js';
import { logger } from '../logger.js';

function dealUrl(jobId: string | undefined): string | null {
  if (!jobId || !config.FRONTEND_BASE_URL) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/deals/${jobId}`;
}

function jobUrl(jobId: string | undefined): string | null {
  if (!jobId || !config.FRONTEND_BASE_URL) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/jobs/${jobId}`;
}

function withLink(text: string, url: string | null): string {
  return url ? `${text}\n[Open in Karwan](${url})` : text;
}

// Maps deal/bridge/chat events to friendly Telegram messages, then routes each
// to the linked Telegram chats for the relevant parties. The notifier
// subscribes on boot and is a no-op when the bot isn't configured.

const RELEVANT = new Set([
  'deal.matched',
  'deal.match.approved',
  'deal.match.declined',
  'deal.direct.created',
  'deal.accepted',
  'deal.delivered',
  'deal.review.started',
  'deal.auto_released',
  'escrow.settled',
  'deal.disputed',
  'deal.cancelled',
  'deal.fund.insufficient',
  'chat.message',
  'bridge.minted',
  'bridge.error',
]);

interface Recipient {
  address: string;
  /// 'buyer' | 'seller' | 'self' (for non-deal events, just the linked party)
  role: string;
}

async function recipientsFor(e: KarwanEvent): Promise<Recipient[]> {
  // Bridge events fan out only to the address that owns the burn/relay; we
  // surface them via the mintRecipient in the payload when present.
  if (e.type.startsWith('bridge.')) {
    const r = (e.payload?.mintRecipient as string | undefined)?.toLowerCase();
    return r ? [{ address: r, role: 'self' }] : [];
  }
  // Match-proposal events fire before any deal row exists, so resolve recipients
  // straight from the payload (the agent already resolved both user addresses).
  if (
    e.type === 'deal.matched' ||
    e.type === 'deal.match.approved' ||
    e.type === 'deal.match.declined'
  ) {
    const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
    const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
    const out: Recipient[] = [];
    if (buyer) out.push({ address: buyer, role: 'buyer' });
    if (seller) out.push({ address: seller, role: 'seller' });
    return out;
  }
  if (e.type === 'chat.message') {
    const jobId = e.jobId;
    if (!jobId) return [];
    const deal = await getDeal(jobId);
    if (!deal) return [];
    const sender = (e.payload?.sender as string | undefined)?.toLowerCase();
    // Echo to both parties so the sender sees their own message in TG too —
    // useful as a sent-confirmation when away from the app. The role helps
    // the summary phrase it from each side's perspective.
    const out: Recipient[] = [];
    out.push({ address: deal.buyer, role: deal.buyer === sender ? 'self' : 'buyer' });
    out.push({ address: deal.seller, role: deal.seller === sender ? 'self' : 'seller' });
    return out;
  }
  // Deal lifecycle events: notify both parties.
  if (e.jobId) {
    const deal = await getDeal(e.jobId);
    if (!deal) return [];
    return [
      { address: deal.buyer, role: 'buyer' },
      { address: deal.seller, role: 'seller' },
    ];
  }
  return [];
}

function summaryFor(e: KarwanEvent, role: string): string | null {
  const short = (a: unknown) => {
    const s = typeof a === 'string' ? a : '';
    return s ? `\`${s.slice(0, 6)}…${s.slice(-4)}\`` : '';
  };
  const amount = (e.payload?.dealAmountUsdc as string | undefined) ?? '';
  const url = dealUrl(e.jobId);

  switch (e.type) {
    case 'deal.matched': {
      const price = (e.payload?.agreedPriceUsdc as string | undefined) ?? '';
      const link = jobUrl(e.jobId);
      return withLink(
        role === 'seller'
          ? `*A buyer's agent matched with you*${price ? ` at ${price} USDC` : ''}. Open Karwan to accept — escrow funds automatically once you do.`
          : `*Your agent found a match*${price ? ` at ${price} USDC` : ''}. Awaiting the seller's acceptance. Escrow funds automatically when they accept — no action needed from you.`,
        link,
      );
    }
    case 'deal.match.approved': {
      const price = (e.payload?.agreedPriceUsdc as string | undefined) ?? '';
      return withLink(
        role === 'seller'
          ? `*Match accepted.* Escrow is funded${price ? ` (${price} USDC)` : ''}. Deliver in Karwan when ready.`
          : `*Your match is live.* The seller accepted and escrow funded${price ? ` (${price} USDC)` : ''}. Standby for delivery.`,
        url,
      );
    }
    case 'deal.match.declined':
      return role === 'seller'
        ? '*You declined the matched proposal.*'
        : '*The seller declined this match.* Post a fresh brief to re-run the auction.';
    case 'deal.direct.created':
      return withLink(
        role === 'seller'
          ? `*New deal* offered to you. ${amount && `Amount: ${amount} USDC. `}Review it in Karwan to accept or decline.`
          : `*Deal opened*. Waiting for ${short(e.payload?.seller)} to accept.`,
        url,
      );
    case 'deal.accepted':
      return withLink('*Deal accepted*. The escrow is funded and the seller can start.', url);
    case 'deal.delivered':
      return withLink(
        role === 'buyer'
          ? '*Seller marked the work delivered*. Open the deal to verify and release.'
          : '*You marked the deal delivered*. The buyer review window is open.',
        url,
      );
    case 'deal.review.started':
      return withLink(
        role === 'seller'
          ? '*Review window opened*. Auto-releases the remainder if the buyer takes no action.'
          : '*Review window opened* on your side. Release the final milestone when ready.',
        url,
      );
    case 'deal.auto_released':
      return withLink('*Auto-released* the remaining milestone. Deal settled.', url);
    case 'escrow.settled':
      return withLink('*Deal settled* in full. Reputation recorded on chain.', url);
    case 'deal.disputed':
      return withLink(
        '*Deal moved to dispute*. Resolution is handled off-platform for now.',
        url,
      );
    case 'deal.cancelled':
      return withLink('*Deal cancelled*.', url);
    case 'deal.fund.insufficient':
      return withLink(
        role === 'buyer'
          ? "*Buyer agent doesn't have enough USDC* on Arc to fund this escrow. Top it up from your profile so the seller can accept."
          : '*Buyer agent is underfunded*. They have been notified.',
        url,
      );
    case 'chat.message': {
      const body = (e.payload?.body as string | undefined) ?? '';
      const sender = short(e.payload?.sender);
      const trimmed = body.length > 200 ? `${body.slice(0, 197)}…` : body;
      const header = role === 'self' ? '*You sent*' : `*Message* from ${sender}`;
      return withLink(`${header}\n${trimmed}`, url);
    }
    case 'bridge.minted':
      return '*Bridge complete*. USDC minted on Arc.';
    case 'bridge.error':
      return '*Bridge failed*. Check the activity feed.';
    default:
      return null;
  }
}

export function startTelegramNotifier(): () => void {
  if (!telegramEnabled()) return () => {};
  return bus.subscribe(async (e) => {
    if (!RELEVANT.has(e.type)) return;
    try {
      const recipients = await recipientsFor(e);
      for (const r of recipients) {
        const link = await getTelegramLink(r.address);
        if (!link) continue;
        const text = summaryFor(e, r.role);
        if (!text) continue;
        await sendTelegramMessage(link.chatId, text);
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message, type: e.type }, 'telegram notifier error');
    }
  });
}
