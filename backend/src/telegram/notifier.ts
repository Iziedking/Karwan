import { bus, type KarwanEvent } from '../events.js';
import { config } from '../config.js';
import { channelsFor, reminderChannelsFor } from '../channels/notifyVia.js';
import { getDeal } from '../db/deals.js';
import { getProfile, type UserLocale } from '../db/profiles.js';
import { getTelegramLink } from '../db/telegramLinks.js';
import { sendTelegramMessage, telegramEnabled } from './bot.js';
import { logger } from '../logger.js';
import { shortlistText } from '../channels/shortlistText.js';
import type { ShortlistEntry } from '../agents/shortlist.js';
import { closesLabel } from '../deals/disputeJudge.js';
import { tg } from '../i18n/telegram.js';
import { FINANCIER_FOLLOWS, financierAlert, financiersOfDeal } from '../financial/dealFinanciers.js';
import { walletPlainName } from '../money/observedDeposit.js';
import { personNames, shortAddress } from '../channels/personName.js';
import { outOfRangeLine, rangeOf } from '../agents/outOfRange.js';
import { questionLine } from '../agents/agentQuestion.js';
import {
  deliverableNoun,
  startPhrase,
  tradeTypeOf,
  type TradeType,
} from '../deals/tradeVocabulary.js';

function dealUrl(jobId: string | undefined): string | null {
  if (!jobId || !config.FRONTEND_BASE_URL) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/deals/${jobId}`;
}

function jobUrl(jobId: string | undefined): string | null {
  if (!jobId || !config.FRONTEND_BASE_URL) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/jobs/${jobId}`;
}

function workUrl(workId: string | undefined): string | null {
  if (!workId || !config.FRONTEND_BASE_URL) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/work/${workId}`;
}

function listingUrl(listingId: string | undefined): string | null {
  if (!listingId || !config.FRONTEND_BASE_URL) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/listings/${listingId}`;
}

function stakeUrl(): string | null {
  if (!config.FRONTEND_BASE_URL) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/stake`;
}

function marketUrl(): string | null {
  if (!config.FRONTEND_BASE_URL) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/market`;
}

function profileUrl(): string | null {
  if (!config.FRONTEND_BASE_URL) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/profile`;
}

function passportUrl(address: string | undefined): string | null {
  if (!config.FRONTEND_BASE_URL || !address) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/credit-passport/${address.toLowerCase()}`;
}
function financierUrl(): string | null {
  if (!config.FRONTEND_BASE_URL) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/financier`;
}

const TIER_BLURB: Record<string, string> = {
  COLD: 'Your track record is taking shape.',
  ESTABLISHED: 'A solid, trusted profile.',
  STRONG: 'A preferred counterparty. agents move faster for you.',
  ELITE: 'Top tier. agents accept first-look within range, no auction.',
};

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

export const RELEVANT = new Set([
  'work.update',
  'agent.suggestion',
  'offer.request-changed',
  'deal.review.ending',
  'record.setup_needed',
  'request.shortlist',
  'request.world_check',
  'deal.extension.requested',
  'deal.extension.approved',
  'deal.extension.declined',
  'deal.dispute.statement',
  'deal.dispute.statement.due',
  'deal.matched',
  'deal.match.approved',
  'deal.match.declined',
  'negotiation.near-miss',
  'deal.direct.created',
  'deal.direct.edited',
  'deal.direct.declined',
  'deal.invite.claimed',
  'deal.seller-approved',
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
  // The delivery date: the seller before it, both sides when it passes (and the
  // financier), and the buyer while their answer holds the refund.
  'deal.deadline.soon',
  'deal.deadline.passed',
  'deal.extension.waiting',
  // Told only to the financier of the deal; buyer and seller have no copy.
  'deal.delivered.onchain',
  'deal.dispute.auto_resolved',
  'escrow.refunded',
  'escrow.reclaimed',
  'bid.accepted',
  'reputation.recorded',
  // Financing lifecycle. The financier is not a deal party, so these route
  // from the payload rather than the deal lookup.
  'factoring.requested',
  'factoring.funding_needed',
  'factoring.offered',
  'factoring.accepted',
  'factoring.awaiting_financier',
  'factoring.settled',
  'factoring.defaulted',
  'po.funded',
  'po.released',
  'po.repaid',
  'po.defaulted',
  'listing.matched',
  'listing.match.proactive',
  'trend.match',
  'chat.message',
  'bridge.minted',
  'bridge.error',
  'wallet.credited',
  'wallet.debited',
  // Money-movement events. Each one is the user's own action or, in the
  // cooldown case, a time-based transition surfaced by the watcher.
  'vault.deposit',
  'vault.withdraw.requested',
  'vault.withdraw.cancelled',
  'vault.claimed',
  'vault.cooldown.completed',
  'cashout.arc.completed',
  'agent.funded',
  'agent.withdrawal',
  // Reputation-tier celebration. Fires once per all-time-high tier.
  'reputation.tier-up',
  // Operator reply on a support ticket -> the user's Telegram.
  'support.reply',
  // Rate a settled deal: the ask, one reminder, the reveal.
  'rating.requested',
  'rating.reminder',
  'rating.revealed',
]);

interface Recipient {
  address: string;
  /// 'buyer' | 'seller' | 'self' (for non-deal events, just the linked party),
  /// or 'financier' for whoever is waiting to be repaid from the deal.
  role: string;
  /// A financier's own position page, which their alert links to.
  href?: string;
  /// The other party, for a message echoed back to the person who sent it.
  counterparty?: string;
}

/// Which payload addresses hear about each financing event. Mirrors the email
/// notifier's map; keep the two in step.
const FINANCE_RECIPIENTS: Record<string, ReadonlyArray<'seller' | 'financier'>> = {
  'factoring.requested': ['financier'],
  'factoring.funding_needed': ['financier'],
  'factoring.offered': ['seller'],
  'factoring.accepted': ['financier'],
  'factoring.awaiting_financier': ['financier'],
  'factoring.settled': ['seller', 'financier'],
  'factoring.defaulted': ['seller', 'financier'],
  'po.funded': ['seller'],
  'po.released': ['seller', 'financier'],
  'po.repaid': ['seller', 'financier'],
  'po.defaulted': ['seller', 'financier'],
};

export async function recipientsFor(e: KarwanEvent): Promise<Recipient[]> {
  // Bridge events fan out only to the address that owns the burn/relay; we
  // surface them via the mintRecipient in the payload when present.
  if (e.type.startsWith('bridge.')) {
    const r = (e.payload?.mintRecipient as string | undefined)?.toLowerCase();
    return r ? [{ address: r, role: 'self' }] : [];
  }
  // Balance changes carry the owner address in the payload so route directly.
  if (e.type === 'wallet.credited' || e.type === 'wallet.debited') {
    const owner = (e.payload?.owner as string | undefined)?.toLowerCase();
    return owner ? [{ address: owner, role: 'self' }] : [];
  }
  // Vault money events carry the position owner under `address`.
  if (e.type.startsWith('vault.')) {
    const owner = (e.payload?.address as string | undefined)?.toLowerCase();
    return owner ? [{ address: owner, role: 'self' }] : [];
  }
  // Agent fund / withdraw routes carry the identity address under `user`.
  if (e.type === 'agent.funded' || e.type === 'agent.withdrawal') {
    const owner = (e.payload?.user as string | undefined)?.toLowerCase();
    return owner ? [{ address: owner, role: 'self' }] : [];
  }
  // Support reply carries the recipient wallet in the payload.
  if (e.type === 'support.reply') {
    const owner = (e.payload?.address as string | undefined)?.toLowerCase();
    return owner ? [{ address: owner, role: 'self' }] : [];
  }
  // Reputation tier-up carries the subject address. Same shape as vault events.
  // Rating asks name the one person they are for.
  if (e.type.startsWith('rating.')) {
    const owner = (e.payload?.address as string | undefined)?.toLowerCase();
    return owner ? [{ address: owner, role: 'self' }] : [];
  }
  if (e.type === 'reputation.tier-up') {
    const owner = (e.payload?.address as string | undefined)?.toLowerCase();
    return owner ? [{ address: owner, role: 'self' }] : [];
  }
  // Cashout has a jobId and the seller is the cash-out party; fall through to
  // the deal lookup below would over-notify the buyer. Resolve the seller from
  // the deal and route only to them.
  if (e.type === 'cashout.arc.completed') {
    if (!e.jobId) return [];
    const deal = await getDeal(e.jobId);
    return deal ? [{ address: deal.seller, role: 'self' }] : [];
  }
  // The shortlist goes to the person who posted the request, and only for the
  // updates marked worth a message.
  // Only the seller, once the buyer confirmed and is waiting on the seller's check.
  // "Ask me first": only the owner of the selling agent.
  if (e.type === 'deal.review.ending') {
    // The buyer's choices before their review ends are the buyer's alone.
    const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
    return buyer ? [{ address: buyer, role: 'buyer' }] : [];
  }
  if (e.type === 'deal.deadline.soon') {
    // The seller's own delivery date.
    const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
    return seller ? [{ address: seller, role: 'seller' }] : [];
  }
  if (e.type === 'deal.deadline.passed' || e.type === 'deal.extension.waiting') {
    // Both sides at the missed date, plus whoever financed the deal; while the
    // buyer's answer holds the refund, the buyer each time and the seller once.
    const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
    const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
    const passed = e.type === 'deal.deadline.passed';
    const out: Recipient[] = [];
    if (buyer) out.push({ address: buyer, role: 'buyer' });
    if (seller && (passed || e.payload?.reminder === 1)) out.push({ address: seller, role: 'seller' });
    if (!passed || !e.jobId) return out;
    const financiers = await financiersOfDeal(e.jobId).catch(() => []);
    return [...out, ...financiers.map((f) => ({ address: f.financier, role: 'financier', href: f.href }))];
  }
  if (e.type === 'agent.suggestion' && e.payload?.buyerUser) {
    return [{ address: (e.payload.buyerUser as string).toLowerCase(), role: 'buyer' }];
  }
  if (e.type === 'agent.suggestion' || e.type === 'record.setup_needed' || e.type === 'offer.request-changed') {
    const owner = (e.payload?.sellerUser as string | undefined)?.toLowerCase();
    return owner ? [{ address: owner, role: 'seller' }] : [];
  }
  if (e.type === 'request.world_check') {
    const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
    const waiting = e.payload?.waitingOn === 'seller' && e.payload?.buyerConfirmed === true;
    return seller && waiting ? [{ address: seller, role: 'seller' }] : [];
  }
  // An update on hourly work names the one person it is for.
  if (e.type === 'work.update') {
    const owner = (e.payload?.address as string | undefined)?.toLowerCase();
    return owner ? [{ address: owner, role: 'self' }] : [];
  }
  if (e.type === 'request.shortlist') {
    const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
    return buyer && e.payload?.notify === true ? [{ address: buyer, role: 'buyer' }] : [];
  }
  if (e.type === 'deal.seller-approved') {
    const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
    return buyer ? [{ address: buyer, role: 'buyer' }] : [];
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
  // A near-miss is addressed to exactly one party (the one being asked to stretch
  // beyond their range). Route from the payload, never to both.
  if (e.type === 'negotiation.near-miss') {
    const askedSide = e.payload?.askedSide as 'buyer' | 'seller' | undefined;
    const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
    const seller = (e.payload?.sellerUser as string | undefined)?.toLowerCase();
    const target = askedSide === 'seller' ? seller : buyer;
    return target ? [{ address: target, role: askedSide ?? 'self' }] : [];
  }
  // listing.matched fires the moment a seller agent bids via a matched
  // listing. The on-chain deal row may not exist yet (acceptance is pending),
  // so we route purely from the payload. Only the seller is notified here;
  // the buyer hears about it through the downstream deal.matched event.
  if (e.type === 'listing.matched') {
    const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
    return seller ? [{ address: seller, role: 'self' }] : [];
  }
  // Proactive scan: the buyer is the target. They had no open brief, so the
  // agent surfaces an offer that overlaps their recent history.
  if (e.type === 'listing.match.proactive') {
    const buyer = (e.payload?.buyerUser as string | undefined)?.toLowerCase();
    return buyer ? [{ address: buyer, role: 'self' }] : [];
  }
  // Trend nudge: addressed to the one seller whose keywords match a riser.
  if (e.type === 'trend.match') {
    const seller = (e.payload?.sellerUser as string | undefined)?.toLowerCase();
    return seller ? [{ address: seller, role: 'self' }] : [];
  }
  if (e.type === 'chat.message') {
    if (e.payload?.channel === 'financing') {
      const sender = (e.payload?.sender as string | undefined)?.toLowerCase();
      const recipient = (e.payload?.recipient as string | undefined)?.toLowerCase();
      const out: Recipient[] = [];
      if (sender) out.push({ address: sender, role: 'self' });
      if (recipient && recipient !== sender) out.push({ address: recipient, role: 'self' });
      return out;
    }
    const jobId = e.jobId;
    if (!jobId) return [];
    const deal = await getDeal(jobId);
    if (!deal) return [];
    const sender = (e.payload?.sender as string | undefined)?.toLowerCase();
    // Echo to both parties so the sender sees their own message in TG too,
    // useful as a sent-confirmation when away from the app. The role helps
    // the summary phrase it from each side's perspective.
    const out: Recipient[] = [];
    out.push({ address: deal.buyer, role: deal.buyer === sender ? 'self' : 'buyer', counterparty: deal.seller });
    out.push({ address: deal.seller, role: deal.seller === sender ? 'self' : 'seller', counterparty: deal.buyer });
    return out;
  }
  // Financing events name their parties directly. The financier is never a
  // party to the underlying deal, so the both-parties lookup below cannot
  // reach them.
  const finance = FINANCE_RECIPIENTS[e.type];
  if (finance) {
    const out: Recipient[] = [];
    for (const key of finance) {
      const addr = (e.payload?.[key] as string | undefined)?.toLowerCase();
      if (addr) out.push({ address: addr, role: key === 'seller' ? 'seller' : 'self' });
    }
    return out;
  }
  // Deal lifecycle events: notify both parties, plus whoever financed the
  // deal for the events that change their repayment.
  if (e.jobId) {
    const deal = await getDeal(e.jobId);
    if (!deal) return [];
    const parties: Recipient[] = [
      { address: deal.buyer, role: 'buyer' },
      { address: deal.seller, role: 'seller' },
    ];
    if (!FINANCIER_FOLLOWS.has(e.type)) return parties;
    const financiers = await financiersOfDeal(e.jobId).catch(() => []);
    return [...parties, ...financiers.map((f) => ({ address: f.financier, role: 'financier', href: f.href }))];
  }
  return [];
}

/// A financier's alert about the deal under their position. Plain words with a
/// bold title, and the button opens their position.
export function financierSummaryFor(e: KarwanEvent, href: string | undefined, locale: UserLocale = 'en'): NotifySummary | null {
  const alert = financierAlert(e.type, locale);
  if (!alert) return null;
  const base = config.FRONTEND_BASE_URL ? config.FRONTEND_BASE_URL.replace(/\/$/, '') : '';
  return withLink(`*${alert.title}*\n${alert.body}`, base && href ? `${base}${href}` : financierUrl());
}

/// People are named by their Karwan tag, looked up before the summary is
/// written (`personNames`); a wallet nobody has named reads as a short address.
export interface SummaryNames {
  names?: ReadonlyMap<string, string>;
  counterparty?: string;
}

export function summaryFor(e: KarwanEvent, role: string, locale: UserLocale = 'en', { names, counterparty }: SummaryNames = {}): NotifySummary | null {
  const who = (a: unknown) => {
    const s = typeof a === 'string' ? a : '';
    return s ? names?.get(s.toLowerCase()) ?? shortAddress(s) : '';
  };
  const amount = (e.payload?.dealAmountUsdc as string | undefined) ?? '';
  const url = dealUrl(e.jobId);

  switch (e.type) {
    case 'deal.review.ending': {
      if (role !== 'buyer') return null;
      const more = e.payload?.canAskMoreTime === true;
      return withLink(
        `*Your review ends ${closesLabel(e.payload?.endsAt)}.*\nRelease the payment if the delivery is right${more ? ', ask once for more time if you need it,' : ''} or raise a problem with what is wrong. If you do nothing, the payment goes to the seller when your review ends.`,
        dealUrl(e.jobId),
      );
    }
    case 'record.setup_needed': {
      if (role !== 'seller') return null;
      if (e.payload?.reason === 'deal') {
        return withLink(
          '*The buyer paid. Set up your Karwan record.*\nThe deal was paid in before your record was set up, so it will not count on your record; your next ones will. Reply "set up my record" and confirm on Karwan.',
          dealUrl(e.jobId),
        );
      }
      return withLink(
        '*Set up your Karwan record so your agent can make offers.*\nEvery deal you take then counts on it. Reply "set up my record" and confirm on Karwan.',
        null,
      );
    }
    case 'offer.request-changed': {
      if (role !== 'seller') return null;
      const title = (e.payload?.title as string | undefined) ?? '';
      const price = (e.payload?.priceUsdc as string | undefined) ?? '';
      return withLink(
        `*The buyer changed a request you offered on.*${title ? `
${title}` : ''}${price ? `
Your offer is ${price} USDC.` : ''}
Keep it, lower it or withdraw it.`,
        jobUrl(e.payload?.jobId as string | undefined),
      );
    }
    case 'agent.suggestion': {
      const asked = questionLine(e.payload);
      if (asked) {
        if (role !== (e.payload?.buyerUser ? 'buyer' : 'seller')) return null;
        const title = (e.payload?.title as string | undefined) ?? '';
        return withLink(`*${e.payload?.reminder ? 'Reminder: your agent is waiting on you.' : 'Your agent has a question for you.'}*${title ? `
${title}` : ''}
${asked}
Nothing is sent until you answer.`, jobUrl(e.payload?.jobId as string | undefined));
      }
      if (role !== 'seller') return null;
      const title = (e.payload?.title as string | undefined) ?? '';
      const price = (e.payload?.priceUsdc as string | undefined) ?? '';
      const range = rangeOf(e.payload);
      if (range) {
        return withLink(
          `*A request fits what you sell, outside your range.*${title ? `\n${title}` : ''}\n${outOfRangeLine(range)} Your agent did not offer. Open it to make an offer, or leave it.`,
          jobUrl(e.payload?.jobId as string | undefined),
        );
      }
      return withLink(
        `*Your agent found a request that fits. Make an offer?*${title ? `\n${title}` : ''}${price ? `\nYour agent would offer ${price} USDC.` : ''}`,
        jobUrl(e.payload?.jobId as string | undefined),
      );
    }
    case 'request.world_check': {
      const price = (e.payload?.priceUsdc as string | undefined) ?? '';
      const base = config.FRONTEND_BASE_URL?.replace(/\/$/, '');
      return withLink(
        `*A buyer chose your offer${price ? ` at ${price} USDC` : ''}.* Before escrow is funded, confirm with World ID that you are a real person. Escrow funds as soon as you do.`,
        base ? `${base}/seller` : null,
      );
    }
    case 'request.shortlist': {
      const entries = (e.payload?.entries as ShortlistEntry[] | undefined) ?? [];
      return withLink(
        shortlistText(entries, config.FRONTEND_BASE_URL ?? 'https://karwan.site', {
          readsBalanceEmpty: e.payload?.readsBalanceEmpty === true,
        }),
        jobUrl(e.jobId),
      );
    }
    case 'listing.matched': {
      const price = (e.payload?.askingPriceUsdc as number | string | undefined) ?? '';
      const link = jobUrl(e.jobId);
      return withLink(
        `*Karwan matched your offer to an open request*${price ? ` at ${price} USDC` : ''}. Tap to review and accept the deal.`,
        link,
      );
    }
    case 'listing.match.proactive': {
      const title = (e.payload?.listingTitle as string | undefined) ?? '';
      const price = (e.payload?.listingAskingPriceUsdc as number | string | undefined) ?? '';
      const listingId = (e.payload?.listingId as string | undefined) ?? undefined;
      const link = listingUrl(listingId);
      const titleSnip = title ? ` "${title.slice(0, 60)}"` : '';
      return withLink(
        `*Your agent spotted an offer that fits your past activity*${titleSnip}${price ? ` at ${price} USDC` : ''}. Tap to open a deal from this offer.`,
        link,
      );
    }
    case 'trend.match': {
      const keyword = (e.payload?.keyword as string | undefined) ?? '';
      const kw = keyword ? `*${keyword}*` : 'a skill you offer';
      return withLink(
        `Requests for ${kw} are up this week on Karwan. Your offer matches. Tap to see what buyers are asking for.`,
        marketUrl(),
      );
    }
    case 'deal.matched': {
      const price = (e.payload?.agreedPriceUsdc as string | undefined) ?? '';
      const link = jobUrl(e.jobId);
      if (config.SHORTLIST_MODE) {
        return withLink(
          role === 'seller'
            ? `*You agreed${price ? ` ${price} USDC` : ' a price'} with the buyer's agent.* The buyer is choosing from a shortlist. You will hear when they pick.`
            : `*Your agent agreed${price ? ` ${price} USDC` : ' a price'} with the seller it recommends.* Choose them, or anyone else on your shortlist.`,
          link,
        );
      }
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
    case 'negotiation.near-miss': {
      const price = (e.payload?.proceedPriceUsdc as string | undefined) ?? '';
      const gap = (e.payload?.gapUsdc as string | undefined) ?? '';
      const link = jobUrl(e.jobId);
      return withLink(
        role === 'seller'
          ? `*Karwan found you a deal at ${price} USDC.* That's ${gap} USDC below your floor. Open to proceed or pass.`
          : `*Karwan found you a deal at ${price} USDC.* That's ${gap} USDC above your cap. Open to proceed or pass.`,
        link,
      );
    }
    case 'deal.direct.created':
      return withLink(
        role === 'seller'
          ? `*A buyer opened a deal with you*${amount ? ` at ${amount} USDC` : ''}. Review and agree to the terms. The buyer funds afterward.`
          : `*Deal opened* with ${who(e.payload?.seller)}${amount ? ` at ${amount} USDC` : ''}. Waiting for them to agree.`,
        url,
      );
    case 'deal.invite.claimed':
      /// Fires after the recipient verifies their email and binds the deal.
      /// This is the seller's first Telegram cue. The original direct.created
      /// event already fired before they were on Karwan, so this ping carries
      /// the same "you have a deal" call to action.
      return withLink(
        role === 'seller'
          ? `*Deal bound to your wallet*${amount ? ` at ${amount} USDC` : ''}. Review and agree to the terms. The buyer funds escrow afterward.`
          : `*Your invited counterparty just joined*${amount ? ` (${amount} USDC deal)` : ''}. Waiting for them to agree to the terms.`,
        url,
      );
    case 'deal.direct.edited': {
      /// Buyer pre-accept edit. The recipient may have read the original
      /// invite and walked away; this lands in their feed so they know to
      /// re-check before they accept. Render the change list inline so the
      /// recipient sees what moved without leaving Telegram.
      const labels = (e.payload?.changedLabels as string[] | undefined) ?? [];
      const lines =
        labels.length > 0
          ? labels.slice(0, 4).map((l) => `• ${l}`).join('\n')
          : 'Open the deal to see the updated terms.';
      return withLink(
        role === 'seller'
          ? `*Buyer updated the deal* before you accepted.\n${lines}`
          : `*You updated the deal.* The other side will see the new terms when they open it.`,
        url,
      );
    }
    case 'deal.direct.declined':
      return role === 'buyer'
        ? withLink(`*The seller turned down the terms.*
${String(e.payload?.note ?? '').replace(/[*_`[\]]/g, '').slice(0, 300)}`, url)
        : null;
    case 'deal.seller-approved':
      return withLink(
        '*Seller agreed to the terms.* Review the current fee and exact total, then fund escrow when ready.',
        url,
      );
    case 'deal.accepted': {
      // "the work" is a freelance word. A supplies trade gets its own.
      const trade = tradeTypeOf({ tradeType: e.payload?.tradeType as TradeType | undefined });
      return withLink(`*Escrow funded.* The seller can ${startPhrase(trade)}.`, url);
    }
    case 'deal.delivered': {
      const trade = tradeTypeOf({ tradeType: e.payload?.tradeType as TradeType | undefined });
      return withLink(
        role === 'buyer'
          ? `*Seller marked ${deliverableNoun(trade)} delivered*. Open the deal to verify and release.`
          : '*You marked the deal delivered*. The buyer review window is open.',
        url,
      );
    }
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
      return withLink('*Deal settled* in full. Your receipt and your record are on the deal page.', url);
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
    case 'deal.extension.requested': {
      if (role !== 'buyer') return null;
      const days = Math.max(1, Math.round(Number(e.payload?.additionalSeconds ?? 0) / 86_400));
      const reason = String(e.payload?.reason ?? '').replace(/[*_`[\]]/g, '').slice(0, 200);
      return withLink(`*The seller asked for ${days} more day${days === 1 ? '' : 's'}.*${reason ? `\n${reason}` : ''}\nApprove or decline on the deal.`, url);
    }
    case 'deal.deadline.soon':
      if (role !== 'seller') return null;
      return withLink(
        `*Your delivery is due ${closesLabel(e.payload?.dueAt)}.*\nDeliver on the deal, or ask the buyer for more time before then. If nothing is delivered by ${closesLabel(e.payload?.refundAt)}, the money goes back to the buyer.`,
        url,
      );
    case 'deal.deadline.passed': {
      const asked = e.payload?.askedForMoreTime === true;
      const days = Math.max(1, Math.round(Number(e.payload?.additionalSeconds ?? 0) / 86_400));
      const refund = closesLabel(e.payload?.refundAt);
      if (role === 'buyer') {
        return withLink(
          asked
            ? `*The delivery date passed.* The seller asked for ${days} more day${days === 1 ? '' : 's'}. Approve, or decline and your money comes back to you. It stays in the deal until you answer.`
            : `*The delivery date passed with nothing delivered.* If nothing is delivered by ${refund}, your money comes back to you automatically.`,
          url,
        );
      }
      if (role !== 'seller') return null;
      return withLink(
        asked
          ? '*The delivery date passed.* Your request for more time is with the buyer. The money stays in the deal until they answer.'
          : `*The delivery date passed.* Deliver by ${refund}, or the money goes back to the buyer. You can still ask for more time before then.`,
        url,
      );
    }
    case 'deal.extension.waiting': {
      const days = Math.max(1, Math.round(Number(e.payload?.additionalSeconds ?? 0) / 86_400));
      if (role === 'buyer') {
        return withLink(
          `*The seller is waiting for your answer.* They asked for ${days} more day${days === 1 ? '' : 's'} and the delivery date has passed. Approve, or decline and your money comes back to you.`,
          url,
        );
      }
      if (role !== 'seller') return null;
      return withLink('*The buyer has not answered your request yet.* The money stays in the deal until they answer. If they decline, it goes back to them.', url);
    }
    case 'deal.extension.approved':
    case 'deal.extension.declined':
      if (role !== 'seller') return null;
      return withLink(
        e.type === 'deal.extension.approved'
          ? '*The buyer gave you more time.* The new deadline is on the deal.'
          : '*The buyer kept the deadline.* Deliver by the current date.',
        url,
      );
    case 'deal.dispute.statement': {
      const side = e.payload?.side as 'buyer' | 'seller' | undefined;
      if (!side || role === side || (role !== 'buyer' && role !== 'seller')) return null;
      return withLink(`*The ${side} gave their account of the dispute.* Give yours on the deal before ${closesLabel(e.payload?.closesAtMs)}.`, url);
    }
    case 'deal.dispute.statement.due':
      if (!role || e.payload?.side !== role) return null;
      return withLink(`*Your dispute statement is still missing.* Give it on the deal before ${closesLabel(e.payload?.closesAtMs)}, or the dispute goes against you.`, url);
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
      const trimmed = body.length > 200 ? `${body.slice(0, 197)}…` : body;
      const header = role !== 'self'
        ? `*Message from ${who(e.payload?.sender)}*`
        : counterparty ? `*You wrote to ${who(counterparty)}*` : '*You wrote*';
      return withLink(`${header}\n${trimmed}`, url);
    }
    case 'bridge.minted':
      return withLink('*Bridge complete*. USDC minted on Arc.', null);
    case 'bridge.error':
      return withLink('*Bridge failed*. Check the activity feed.', null);
    case 'wallet.credited': {
      const credited = (e.payload?.amountUsdc as string | undefined) ?? '0';
      const label = plainWallet(e.payload?.walletRole);
      const credit = trimUsdcLabel(credited);
      return withLink(
        `*${credit} USDC* arrived in your ${label}.`,
        null,
      );
    }
    case 'wallet.debited': {
      const debited = (e.payload?.amountUsdc as string | undefined) ?? '0';
      const label = plainWallet(e.payload?.walletRole);
      const debit = trimUsdcLabel(debited);
      return withLink(
        `*${debit} USDC* left your ${label}.`,
        null,
      );
    }
    case 'vault.deposit': {
      const raw = (e.payload?.amountUsdc as string | undefined) ?? '0';
      const amount = trimUsdcLabel(raw);
      return withLink(
        `*Staked ${amount} USDC.* Your reputation tier may rise as the position matures.`,
        stakeUrl(),
      );
    }
    case 'vault.withdraw.requested': {
      const raw = (e.payload?.principalUsdc as string | undefined) ?? '';
      const amount = raw ? `${trimUsdcLabel(raw)} USDC` : 'your position';
      return withLink(
        `*Cooldown started on ${amount}.* Claimable in 3 days.`,
        stakeUrl(),
      );
    }
    case 'vault.withdraw.cancelled': {
      const raw = (e.payload?.principalUsdc as string | undefined) ?? '';
      const amount = raw ? `${trimUsdcLabel(raw)} USDC` : 'the position';
      return withLink(
        `*Cooldown cancelled.* ${amount} is back to active stake.`,
        stakeUrl(),
      );
    }
    case 'vault.claimed': {
      const raw = (e.payload?.principalUsdc as string | undefined) ?? '';
      const amount = raw ? `${trimUsdcLabel(raw)} USDC` : 'your stake';
      return withLink(
        `*Withdrew ${amount} from the vault.*`,
        stakeUrl(),
      );
    }
    case 'vault.cooldown.completed': {
      const raw = (e.payload?.principalUsdc as string | undefined) ?? '';
      const amount = raw ? `${trimUsdcLabel(raw)} USDC` : 'your position';
      return withLink(
        `*Cooldown finished.* ${amount} is ready to claim.`,
        stakeUrl(),
      );
    }
    case 'cashout.arc.completed': {
      const raw = (e.payload?.amountUsdc as string | undefined) ?? '0';
      const amount = trimUsdcLabel(raw);
      return withLink(
        `*Cashed out ${amount} USDC* to your wallet on Arc.`,
        url,
      );
    }
    case 'agent.funded': {
      const raw = (e.payload?.amountUsdc as string | undefined) ?? '0';
      const amount = trimUsdcLabel(raw);
      const which = (e.payload?.agent as string | undefined) ?? 'agent';
      const seed = e.payload?.seed === true;
      return withLink(
        seed
          ? `*Seeded ${amount} USDC* into your ${which} agent wallet.`
          : `*Funded ${amount} USDC* into your ${which} agent wallet.`,
        profileUrl(),
      );
    }
    case 'agent.withdrawal': {
      const raw = (e.payload?.amountUsdc as string | undefined) ?? '0';
      const amount = trimUsdcLabel(raw);
      const which = (e.payload?.agent as string | undefined) ?? 'agent';
      return withLink(
        `*Pulled ${amount} USDC* out of your ${which} agent wallet.`,
        profileUrl(),
      );
    }
    case 'reputation.tier-up': {
      const toTier = (e.payload?.toTier as string | undefined) ?? '';
      const addr = e.payload?.address as string | undefined;
      const blurb = TIER_BLURB[toTier] ?? '';
      const body = blurb
        ? `*Tier up. you reached ${toTier} on Karwan.*\n${blurb}`
        : `*Tier up.* You reached ${toTier} on Karwan.`;
      return withLink(body, passportUrl(addr));
    }
    case 'factoring.funding_needed': {
      const short = (e.payload?.shortfallUsdc as string | undefined) ?? '';
      return withLink(
        `*A seller tried to take your financing offer.* Your wallet does not hold the advance yet. Add ${short} USDC and they can accept it. Nothing has moved.`,
        financierUrl(),
      );
    }
    case 'factoring.requested': {
      const face = (e.payload?.faceValueUsdc as string | undefined) ?? '';
      return withLink(
        `*A seller requested early payout.* A new invoice${face ? ` worth ${trimUsdcLabel(face)} USDC` : ''} is open for offers.`,
        financierUrl(),
      );
    }
    case 'factoring.offered': {
      const advanceRaw = (e.payload?.advance as string | undefined) ?? '';
      const advance = advanceRaw ? `${trimUsdcLabel(advanceRaw)} USDC now` : 'early payout';
      const bps = e.payload?.discountBps;
      const discount =
        typeof bps === 'number'
          ? ` at a ${(bps / 100).toFixed(1).replace(/\.0$/, '')}% discount`
          : '';
      return withLink(
        `*A financier offered you early payout*: ${advance}${discount}. Open the deal to accept or pass.`,
        dealUrl(e.jobId),
      );
    }
    case 'factoring.awaiting_financier': {
      const advance = (e.payload?.advanceUsdc as string | undefined) ?? '';
      return withLink(
        `*The seller took your offer.* Pay them ${advance ? `${trimUsdcLabel(advance)} USDC ` : ''}from your wallet within 24 hours, or the offer lapses and nothing moves.`,
        financierUrl(),
      );
    }
    case 'factoring.accepted':
      return withLink(
        '*Your factoring offer was accepted.* The advance is on its way to the seller. You are repaid when the buyer releases the escrow.',
        url,
      );
    case 'factoring.settled': {
      const repay = (e.payload?.repayUsdc as string | undefined) ?? '';
      const suffix = repay ? ` ${trimUsdcLabel(repay)} USDC` : '';
      return withLink(
        role === 'seller'
          ? `*Factoring settled.* The escrow settled and${suffix} went to your financier. Nothing further is owed.`
          : `*Repaid on a factored invoice.*${suffix} landed in your wallet, principal plus spread.`,
        url,
      );
    }
    case 'factoring.defaulted':
      return withLink(
        role === 'seller'
          ? '*Repayment failed.* The escrow settled but your repayment to the financier did not go through. Fund your wallet and contact them.'
          : '*A factored invoice defaulted.* The seller\'s repayment did not go through after several attempts.',
        url,
      );
    case 'po.funded':
      return withLink(
        '*A financier funded your purchase order.* The principal releases to you once proof of delivery is accepted.',
        url,
      );
    case 'po.released': {
      const principal = (e.payload?.principalUsdc as string | undefined) ?? '';
      const suffix = principal ? ` ${trimUsdcLabel(principal)} USDC` : '';
      return withLink(
        role === 'seller'
          ? `*PO financing released.* Proof of delivery was accepted and${suffix} was released to you, ahead of the buyer's settlement.`
          : `*Your PO line released.* Proof of delivery was accepted and${suffix} moved to the seller. You are repaid when the escrow settles.`,
        url,
      );
    }
    case 'po.repaid': {
      const repay = (e.payload?.repayUsdc as string | undefined) ?? '';
      const suffix = repay ? ` ${trimUsdcLabel(repay)} USDC` : '';
      return withLink(
        role === 'seller'
          ? `*PO line closed.* The escrow settled and${suffix} went to the financier.`
          : `*Repaid on a PO line.*${suffix} landed in your wallet, principal plus spread.`,
        url,
      );
    }
    case 'po.defaulted':
      return withLink(
        role === 'seller'
          ? '*Repayment failed.* The escrow settled but your repayment to the financier did not go through. Fund your wallet and contact them.'
          : '*A PO line defaulted.* The seller\'s repayment did not go through after several attempts.',
        url,
      );
    case 'rating.requested':
    case 'rating.reminder': {
      // Straight to the rating on the deal page, not the top of an ended deal.
      const url = dealUrl(e.payload?.dealId as string | undefined);
      return withLink(String(e.payload?.text ?? ''), url ? `${url}#rate` : null);
    }
    case 'work.update': {
      // Hourly work names its own page; posted work names the request's.
      const path = e.payload?.path as string | undefined;
      const base = config.FRONTEND_BASE_URL?.replace(/\/$/, '');
      const url = path && base && /^\/work\/requests\/wr_[A-Za-z0-9_-]{1,40}$/.test(path) ? `${base}${path}` : workUrl(e.payload?.workId as string | undefined);
      return withLink(String(e.payload?.text ?? ''), url);
    }
    case 'rating.revealed':
      return withLink(String(e.payload?.text ?? ''), dealUrl(e.payload?.dealId as string | undefined));
    case 'support.reply': {
      const body = (e.payload?.text as string | undefined) ?? '';
      const ticketId = (e.payload?.ticketId as string | undefined) ?? '';
      return withLink(
        `*Karwan support*${ticketId ? ` (${ticketId})` : ''}\n${body}\n\nReply here to continue.`,
        null,
      );
    }
    default:
      return null;
  }
}

/// Trim trailing zeros and a dangling decimal point so a 30.000000 amount
/// reads as "30" rather than "30.000000" in a chat message.
function trimUsdcLabel(raw: string): string {
  if (!raw.includes('.')) return raw;
  const trimmed = raw.replace(/\.?0+$/, '');
  return trimmed.length === 0 ? '0' : trimmed;
}

export function startTelegramNotifier(): () => void {
  if (!telegramEnabled()) return () => {};
  return bus.subscribe(async (e) => {
    if (!RELEVANT.has(e.type)) return;
    try {
      const recipients = await recipientsFor(e);
      const named = [e.payload?.seller, e.payload?.buyer, e.payload?.sender, ...recipients.map((r) => r.counterparty)]
        .filter((a): a is string => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a));
      const names = named.length ? await personNames(named) : undefined;
      for (const r of recipients) {
        const link = await getTelegramLink(r.address);
        if (!link) continue;
        // Respect the user's notification mute toggle from Settings. The link
        // existing means they connected Telegram; the mute is a soft pause.
        const profile = await getProfile(r.address);
        if (profile?.settings?.notificationsMuted) continue;
        if (!channelsFor(profile?.settings, true).telegram) continue;
        // The one reminder of an agent question goes to the next channel only (view 41).
        if (e.type === 'agent.suggestion' && e.payload?.reminder === true && !reminderChannelsFor(profile?.settings, true).telegram) continue;
        const locale = (profile?.settings?.locale ?? 'en') as UserLocale;
        const summary = r.role === 'financier' ? financierSummaryFor(e, r.href, locale) : summaryFor(e, r.role, locale, { names, counterparty: r.counterparty });
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

/// The wallet by its role, the way people know it. Older events carry an
/// internal label, so the role decides.
function plainWallet(role: unknown): string {
  return role === 'identity' || role === 'buyerAgent' || role === 'sellerAgent' ? walletPlainName(role) : 'balance';
}
