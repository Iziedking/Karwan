import { bus, type KarwanEvent } from '../events.js';
import { config } from '../config.js';
import { getDeal } from '../db/deals.js';
import { getProfile, type UserLocale } from '../db/profiles.js';
import { getTelegramLink } from '../db/telegramLinks.js';
import { sendTelegramMessage, telegramEnabled } from './bot.js';
import { logger } from '../logger.js';
import { tg } from '../i18n/telegram.js';

function dealUrl(jobId: string | undefined): string | null {
  if (!jobId || !config.FRONTEND_BASE_URL) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/deals/${jobId}`;
}

function jobUrl(jobId: string | undefined): string | null {
  if (!jobId || !config.FRONTEND_BASE_URL) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/jobs/${jobId}`;
}

interface NotifySummary {
  text: string;
  url: string | null;
}

/// Pairs the summary body with the tappable URL. The URL is rendered as a
/// Telegram inline_keyboard button alongside the message, not embedded as
/// inline markdown. Inline links are sometimes stripped or rendered as plain
/// text by Telegram clients (especially mobile). Buttons always render.
function withLink(text: string, url: string | null): NotifySummary {
  return { text, url };
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
  'escrow.milestone.released',
  'escrow.settled',
  'deal.disputed',
  'deal.cancelled',
  'deal.cancel.proposed',
  'deal.cancel.declined',
  'deal.fund.insufficient',
  'bid.accepted',
  'reputation.recorded',
  'listing.matched',
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
  // listing.matched fires the moment a seller agent bids via a matched
  // listing. The on-chain deal row may not exist yet (acceptance is pending),
  // so we route purely from the payload. Only the seller is notified here;
  // the buyer hears about it through the downstream deal.matched event.
  if (e.type === 'listing.matched') {
    const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
    return seller ? [{ address: seller, role: 'self' }] : [];
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

function summaryFor(e: KarwanEvent, role: string, locale: UserLocale = 'en'): NotifySummary | null {
  const short = (a: unknown) => {
    const s = typeof a === 'string' ? a : '';
    return s ? `\`${s.slice(0, 6)}…${s.slice(-4)}\`` : '';
  };
  const amount = (e.payload?.dealAmountUsdc as string | undefined) ?? '';
  const url = dealUrl(e.jobId);

  switch (e.type) {
    case 'listing.matched': {
      const price = (e.payload?.askingPriceUsdc as number | string | undefined) ?? '';
      const link = jobUrl(e.jobId);
      return withLink(
        `*Karwan matched your offer to an open request*${price ? ` at ${price} USDC` : ''}. Tap to review and accept the deal.`,
        link,
      );
    }
    case 'deal.matched': {
      const price = (e.payload?.agreedPriceUsdc as string | undefined) ?? '';
      const link = jobUrl(e.jobId);
      return withLink(
        role === 'seller'
          ? `*Karwan matched your bid with a buyer*${price ? ` at ${price} USDC` : ''}. Tap to accept; escrow funds the moment you do.`
          : `*Your agent found you a match*${price ? ` at ${price} USDC` : ''}. Waiting on the seller to accept. Escrow funds automatically once they do.`,
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
      return withLink(
        role === 'seller'
          ? '*You declined the matched proposal.*'
          : '*The seller declined this match.* Post a fresh request to re-run the auction.',
        null,
      );
    case 'deal.direct.created':
      return withLink(
        role === 'seller'
          ? `*A buyer opened a deal with you*${amount ? ` at ${amount} USDC` : ''}. Tap to accept; your agent funds escrow on accept.`
          : `*Deal opened* with ${short(e.payload?.seller)}${amount ? ` at ${amount} USDC` : ''}. Waiting for them to accept.`,
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
        '*Deal moved to dispute*. Either party can still propose a mutual cancel for a full refund.',
        url,
      );
    case 'deal.cancelled':
      return withLink(tg('dealCancelled', locale), url);
    case 'deal.cancel.proposed': {
      const proposedBy = (e.payload?.proposedBy as 'buyer' | 'seller' | undefined) ?? null;
      const kind = (e.payload?.kind as string | undefined) ?? 'mutual';
      const reason = (e.payload?.reason as string | undefined) ?? '';
      const reasonLine = reason ? `\n${reason}` : '';
      const proposerSelf = proposedBy && proposedBy === role;
      if (proposerSelf) {
        return withLink(
          `${tg('cancelProposedFromSelf', locale)}${reasonLine}`,
          url,
        );
      }
      const key =
        kind === 'platform-attributed'
          ? 'cancelProposedFromOther.platform'
          : 'cancelProposedFromOther.mutual';
      const roleLabel = proposedBy === 'buyer' ? 'buyer' : 'seller';
      return withLink(
        `${tg(key, locale, { role: roleLabel })}${reasonLine}`,
        url,
      );
    }
    case 'deal.cancel.declined': {
      const proposedBy = (e.payload?.proposedBy as 'buyer' | 'seller' | undefined) ?? null;
      const proposerSelf = proposedBy && proposedBy === role;
      return withLink(
        proposerSelf
          ? tg('cancelDeclinedToProposer', locale)
          : tg('cancelDeclinedBySelf', locale),
        url,
      );
    }
    case 'escrow.milestone.released': {
      const idx = e.payload?.milestoneIndex as number | undefined;
      const which: 'first' | 'final' = idx === 0 ? 'first' : 'final';
      const key =
        role === 'seller'
          ? (`milestoneReleasedToSeller.${which}` as const)
          : (`milestoneReleasedToBuyer.${which}` as const);
      return withLink(tg(key, locale), url);
    }
    case 'bid.accepted': {
      const price = (e.payload?.agreedPriceUsdc as string | undefined) ?? '';
      const priceSuffix = price ? ` (${price} USDC)` : '';
      return withLink(
        (role === 'seller'
          ? tg('bidAcceptedToSeller', locale)
          : tg('bidAcceptedToBuyer', locale)) + priceSuffix,
        url,
      );
    }
    case 'reputation.recorded': {
      const outcome = (e.payload?.outcome as string | undefined) ?? '';
      if (outcome === 'Success') {
        return withLink(
          role === 'seller'
            ? tg('reputationRecordedSuccessSeller', locale)
            : tg('reputationRecordedSuccessBuyer', locale),
          url,
        );
      }
      const friendly =
        outcome === 'DisputeResolved'
          ? 'a resolved dispute'
          : outcome === 'Failed'
            ? 'a failed deal'
            : 'an outcome';
      return withLink(
        role === 'seller'
          ? `*Reputation updated on chain* for ${friendly}. View your passport for the new score.`
          : `*Reputation recorded on chain* for ${friendly}.`,
        url,
      );
    }
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
      return withLink('*Bridge complete*. USDC minted on Arc.', null);
    case 'bridge.error':
      return withLink('*Bridge failed*. Check the activity feed.', null);
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
        // Respect the user's notification mute toggle from Settings. The link
        // existing means they connected Telegram; the mute is a soft pause.
        const profile = await getProfile(r.address);
        if (profile?.settings?.notificationsMuted) continue;
        const locale = (profile?.settings?.locale ?? 'en') as UserLocale;
        const summary = summaryFor(e, r.role, locale);
        if (!summary) continue;
        const buttons = summary.url
          ? [{ text: tg('openInKarwan', locale), url: summary.url }]
          : undefined;
        await sendTelegramMessage(link.chatId, summary.text, buttons);
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message, type: e.type }, 'telegram notifier error');
    }
  });
}
