// Email side of the notification fan-out. Mirrors the Telegram notifier, but
// emails are deliberately a LEAN subset: only high-signal deal lifecycle moments
// that are worth landing in someone's inbox (a match needs action, escrow
// funded, delivered, settled, dispute, a cancel proposal, an underfunded
// escrow, a financier offer, a tier-up). Chat messages, every wallet credit,
// vault ticks, and bridge steps stay on Telegram + in-app so we don't burn
// inbox goodwill (and deliverability) on low-signal noise.
//
// Each email goes to a recipient's VERIFIED contact email only, and respects
// the same notificationsMuted toggle the Telegram path honors. No-op when
// RESEND_API_KEY is unset.
import { deliveryCheckReason, type DeliveryCheckDetail } from '../deals/deliveryCheck.js';
import { FINANCIER_FOLLOWS, financierAlert, financiersOfDeal } from '../financial/dealFinanciers.js';
import { bus, type KarwanEvent } from '../events.js';
import { config } from '../config.js';
import { getDeal } from '../db/deals.js';
import {
  deliverableNoun,
  startPhrase,
  tradeTypeOf,
  type TradeType,
} from '../deals/tradeVocabulary.js';
import { getProfile } from '../db/profiles.js';
import { getTelegramLink } from '../db/telegramLinks.js';
import { channelsFor } from '../channels/notifyVia.js';
import { resendClient } from './resend.js';
import { sendDealEventEmail } from './dealEventEmail.js';
import { logger } from '../logger.js';
import { closesLabel } from '../deals/disputeJudge.js';

function base(): string | null {
  return config.FRONTEND_BASE_URL ? config.FRONTEND_BASE_URL.replace(/\/$/, '') : null;
}
function dealUrl(jobId?: string): string | undefined {
  const b = base();
  return b && jobId ? `${b}/deals/${jobId}` : undefined;
}
function jobUrl(jobId?: string): string | undefined {
  const b = base();
  return b && jobId ? `${b}/jobs/${jobId}` : undefined;
}
function passportUrl(address?: string): string | undefined {
  const b = base();
  return b && address ? `${b}/credit-passport/${address.toLowerCase()}` : undefined;
}
function financierUrl(): string | undefined {
  const b = base();
  return b ? `${b}/financier` : undefined;
}

// High-signal events only. Keep this list short on purpose.
const EMAIL_RELEVANT = new Set([
  'agent.suggestion',
  'deal.review.ending',
  'record.setup_needed',
  'deal.extension.requested',
  'deal.dispute.statement',
  'deal.dispute.statement.due',
  'deal.matched',
  'deal.match.approved',
  'listing.matched',
  'request.shortlist',
  'request.world_check',
  'deal.direct.created',
  'deal.seller-approved',
  'deal.direct.declined',
  'deal.direct.edited',
  'offer.created',
  'deal.release.blocked',
  'deal.accepted',
  'deal.delivered',
  'escrow.settled',
  'deal.disputed',
  'deal.dispute.auto_resolved',
  'deal.cancel.proposed',
  'deal.fund.insufficient',
  'deal.deadline.soon',
  'deal.deadline.passed',
  'deal.extension.waiting',
  'deal.delivered.onchain',
  'deal.match.raised',
  // Told only to the financier of the deal; buyer and seller copy is null.
  'escrow.milestone.released',
  'escrow.refunded',
  'escrow.reclaimed',
  'deal.cancelled',
  'factoring.requested',
  'factoring.funding_needed',
  'factoring.offered',
  'factoring.accepted',
  'factoring.settled',
  'factoring.defaulted',
  'po.funded',
  'po.released',
  'po.repaid',
  'po.defaulted',
  'reputation.tier-up',
  'rating.requested',
  'rating.reminder',
  'rating.revealed',
]);

/// Financing events name their parties directly (seller, financier) and the
/// financier is never a party to the underlying deal, so the jobId-based
/// recipient fallback below cannot route them. Each entry lists which payload
/// addresses should hear about it.
const FINANCE_RECIPIENTS: Record<string, ReadonlyArray<'seller' | 'financier'>> = {
  'factoring.requested': ['financier'],
  'factoring.funding_needed': ['financier'],
  'factoring.offered': ['seller'],
  'factoring.accepted': ['financier'],
  'factoring.settled': ['seller', 'financier'],
  'factoring.defaulted': ['seller', 'financier'],
  'po.funded': ['seller'],
  'po.released': ['seller', 'financier'],
  'po.repaid': ['seller', 'financier'],
  'po.defaulted': ['seller', 'financier'],
};

export interface Recipient {
  address: string;
  role: 'buyer' | 'seller' | 'self' | 'financier';
  /// A financier's own position page, which their alert links to.
  href?: string;
}

export async function recipientsFor(e: KarwanEvent): Promise<Recipient[]> {
  if (e.type === 'reputation.tier-up' || e.type.startsWith('rating.')) {
    const a = (e.payload?.address as string | undefined)?.toLowerCase();
    return a ? [{ address: a, role: 'self' }] : [];
  }
  if (e.type === 'deal.matched' || e.type === 'deal.match.approved') {
    const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
    const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
    const out: Recipient[] = [];
    if (buyer) out.push({ address: buyer, role: 'buyer' });
    if (seller) out.push({ address: seller, role: 'seller' });
    return out;
  }
  if (e.type === 'listing.matched') {
    const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
    return seller ? [{ address: seller, role: 'seller' }] : [];
  }
  if (e.type === 'request.world_check') {
    const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
    const waiting = e.payload?.waitingOn === 'seller' && e.payload?.buyerConfirmed === true;
    return seller && waiting ? [{ address: seller, role: 'seller' }] : [];
  }
  if (e.type === 'request.shortlist') {
    // Only the poster, and only for the updates marked worth a message.
    const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
    return buyer && e.payload?.notify === true ? [{ address: buyer, role: 'buyer' }] : [];
  }
  const finance = FINANCE_RECIPIENTS[e.type];
  if (finance) {
    const out: Recipient[] = [];
    for (const key of finance) {
      const addr = (e.payload?.[key] as string | undefined)?.toLowerCase();
      // The financier reads these as their own money moving, not as a deal
      // counterparty, so 'self' is the honest role for the copy.
      if (addr) out.push({ address: addr, role: key === 'seller' ? 'seller' : 'self' });
    }
    return out;
  }
  if (e.type === 'deal.delivered.onchain') {
    // Only the buyer: their review clock started without a delivery through Karwan.
    const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
    return buyer ? [{ address: buyer, role: 'buyer' }] : [];
  }
  if (e.type === 'deal.deadline.soon') {
    // The seller's own delivery date.
    const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
    return seller ? [{ address: seller, role: 'seller' }] : [];
  }
  if (e.type === 'deal.deadline.passed' || e.type === 'deal.extension.waiting') {
    // Both sides at the missed date; while the buyer's answer holds the
    // refund, the buyer each time and the seller only the first time.
    const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
    const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
    const sellerToo = e.type === 'deal.deadline.passed' || e.payload?.reminder === 1;
    const out: Recipient[] = [];
    if (buyer) out.push({ address: buyer, role: 'buyer' });
    if (seller && sellerToo) out.push({ address: seller, role: 'seller' });
    return out;
  }
  if (e.type === 'deal.review.ending') {
    // The buyer's choices before their review ends are the buyer's alone.
    const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
    return buyer ? [{ address: buyer, role: 'buyer' }] : [];
  }
  if (e.type === 'agent.suggestion' || e.type === 'record.setup_needed') {
    // "Ask me first", and the record reminder: only the seller it is about.
    const owner = (e.payload?.sellerUser as string | undefined)?.toLowerCase();
    return owner ? [{ address: owner, role: 'seller' }] : [];
  }
  if (e.type === 'offer.created') {
    // A request is not a deal yet, so the poster is named on the event.
    const buyer = (e.payload?.buyerUser as string | undefined)?.toLowerCase();
    return buyer ? [{ address: buyer, role: 'buyer' }] : [];
  }
  if (e.type === 'deal.match.raised') {
    // Only the buyer: the approval gate flipped to them after the seller raised.
    const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
    return buyer ? [{ address: buyer, role: 'buyer' }] : [];
  }
  // Remaining events carry a jobId and notify both parties, plus whoever
  // financed the deal for the events that change their repayment.
  if (e.jobId) {
    const deal = await getDeal(e.jobId);
    if (!deal) return [];
    const parties: Recipient[] = [
      { address: deal.buyer, role: 'buyer' },
      { address: deal.seller, role: 'seller' },
    ];
    if (!FINANCIER_FOLLOWS.has(e.type)) return parties;
    const financiers = await financiersOfDeal(e.jobId).catch(() => []);
    return [...parties, ...financiers.map((f) => ({ address: f.financier, role: 'financier' as const, href: f.href }))];
  }
  return [];
}

/// A financier's alert about the deal under their position, with the button
/// opening that position rather than the deal they are not a party to.
export function financierContentFor(e: KarwanEvent, href?: string): EmailContent | null {
  const alert = financierAlert(e.type);
  if (!alert) return null;
  const b = base();
  return {
    kicker: 'Deal you financed',
    subject: alert.title,
    heading: alert.title,
    body: alert.body,
    ctaLabel: alert.open,
    ctaUrl: b && href ? `${b}${href}` : financierUrl(),
  };
}

interface EmailContent {
  kicker: string;
  subject: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

/// Events whose wording depends on what was actually bought. Anything not on
/// this list never says "the work", so it never needs the lookup below.
const TRADE_AWARE = new Set(['deal.accepted', 'deal.delivered', 'deal.match.approved']);

/// The deal's trade type, from the event if it carries one and from the deal
/// otherwise. Events replayed from chain logs have no payload beyond what the
/// log held, and those are exactly the ones that would fall back to freelance
/// wording, so the read is worth it.
async function tradeTypeFor(e: KarwanEvent): Promise<TradeType> {
  if (!TRADE_AWARE.has(e.type)) return 'service';
  const fromPayload = e.payload?.tradeType;
  if (fromPayload) return tradeTypeOf({ tradeType: fromPayload as TradeType });
  if (!e.jobId) return 'service';
  return tradeTypeOf(await getDeal(e.jobId).catch(() => null));
}

export function contentFor(
  e: KarwanEvent,
  role: Recipient['role'],
  trade: TradeType,
  /// The buyer's private requirement review, read from the deal for the buyer
  /// alone. Never on the event, which both parties receive.
  buyerPrivateNote?: string,
  opts: { shortlistMode?: boolean } = {},
): EmailContent | null {
  const shortlistMode = opts.shortlistMode ?? config.SHORTLIST_MODE;
  const amount = (e.payload?.dealAmountUsdc as string | undefined) ?? '';
  const amountSuffix = amount ? ` (${amount} USDC)` : '';

  switch (e.type) {
    case 'request.world_check': {
      if (role !== 'seller' || e.payload?.waitingOn !== 'seller' || e.payload?.buyerConfirmed !== true) return null;
      const price = (e.payload?.priceUsdc as string | undefined) ?? '';
      const priceSuffix = price ? ` at ${price} USDC` : '';
      return {
        kicker: 'One step left',
        subject: `A buyer chose your offer${priceSuffix}`,
        heading: 'A buyer chose your offer',
        body: `A buyer chose your offer${priceSuffix}. Before escrow is funded, confirm with World ID that you are a real person. It takes a minute in the World App. Escrow funds as soon as you do.`,
        ctaLabel: 'Confirm with World ID',
        ctaUrl: base() ? `${base()}/seller` : undefined,
      };
    }
    case 'request.shortlist': {
      const count = Number(e.payload?.count ?? 0);
      if (e.payload?.notify !== true || count < 1) return null;
      const people = count === 1 ? '1 seller' : `${count} sellers`;
      return {
        kicker: 'Shortlist ready',
        subject: `Your agent found ${people} for your request`,
        heading: `Your agent found ${people}`,
        body: `Your agent checked their records and listed ${people} for your request, verified or not, with each one's score and numbers. Open the request to see who it recommends and choose. Nothing moves until you choose and confirm.`,
        ctaLabel: 'Choose a seller',
        ctaUrl: jobUrl(e.jobId),
      };
    }
    case 'deal.matched': {
      const price = (e.payload?.agreedPriceUsdc as string | undefined) ?? '';
      const priceSuffix = price ? ` at ${price} USDC` : '';
      if (shortlistMode) {
        return role === 'seller'
          ? {
              kicker: 'Price agreed',
              subject: `You agreed a price with a buyer's agent${priceSuffix}`,
              heading: 'You agreed a price',
              body: `You agreed a price with the buyer's agent${priceSuffix}. The buyer is choosing from a shortlist. You will hear when they pick.`,
              ctaLabel: 'View the request',
              ctaUrl: jobUrl(e.jobId),
            }
          : {
              kicker: 'Match found',
              subject: `Your agent agreed a price with the seller it recommends${priceSuffix}`,
              heading: 'Your agent recommends a seller',
              body: `Your agent agreed a price with the seller it recommends${priceSuffix}. Choose them, or anyone else on your shortlist. Nothing moves until you confirm.`,
              ctaLabel: 'Choose a seller',
              ctaUrl: jobUrl(e.jobId),
            };
      }
      return role === 'seller'
        ? {
            kicker: 'Match found',
            subject: `Karwan matched your offer with a buyer${priceSuffix}`,
            heading: 'You have a match',
            body: `Karwan matched your offer with a buyer${priceSuffix}. Accept to fund escrow and start the deal.`,
            ctaLabel: 'Review the match',
            ctaUrl: jobUrl(e.jobId),
          }
        : {
            kicker: 'Match found',
            subject: `Your agent found a match${priceSuffix}`,
            heading: 'Your agent found a match',
            body: `Your agent found you a match${priceSuffix}. Escrow funds automatically once the seller accepts.`,
            ctaLabel: 'View the match',
            ctaUrl: jobUrl(e.jobId),
          };
    }
    case 'deal.match.raised': {
      const raised = (e.payload?.raisedPriceUsdc as string | undefined) ?? '';
      const suffix = raised ? ` to ${raised} USDC` : '';
      return {
        kicker: 'Price raised',
        subject: `The seller raised the price${suffix}`,
        heading: 'The seller wants a higher price',
        body: `The seller is not taking the price your agent agreed and raised it${suffix}. Open the match to approve the new price or decline it. Nothing funds until you approve.`,
        ctaLabel: 'Review the raised price',
        ctaUrl: jobUrl(e.jobId),
      };
    }
    case 'deal.match.approved':
      return {
        kicker: 'Escrow funded',
        subject: `Your Karwan match is live${amountSuffix}`,
        heading: 'Match accepted, escrow funded',
        body:
          role === 'seller'
            ? `Escrow is funded${amountSuffix}. Deliver in Karwan when ${deliverableNoun(trade)} is ready.`
            : `The seller accepted and escrow is funded${amountSuffix}. Waiting for delivery.`,
        ctaLabel: 'Open the deal',
        ctaUrl: dealUrl(e.jobId),
      };
    case 'listing.matched': {
      const price = (e.payload?.askingPriceUsdc as number | string | undefined) ?? '';
      const priceSuffix = price ? ` at ${price} USDC` : '';
      return {
        kicker: 'Offer matched',
        subject: `Karwan matched your offer to a request${priceSuffix}`,
        heading: 'Your offer was matched',
        body: `Karwan matched your offer to an open request${priceSuffix}. Review and accept to open the deal.`,
        ctaLabel: 'Review and accept',
        ctaUrl: jobUrl(e.jobId),
      };
    }
    case 'deal.direct.created':
      return role === 'seller'
        ? {
            kicker: 'New deal',
            subject: `A buyer opened a deal with you${amountSuffix}`,
            heading: 'A buyer opened a deal with you',
            body: `A buyer opened a deal with you${amountSuffix}. Review the terms and agree if they work for you. The buyer funds only after you agree.`,
            ctaLabel: 'Review the deal',
            ctaUrl: dealUrl(e.jobId),
          }
        : null; // buyer initiated it; no email to self
    case 'deal.direct.declined':
      return role === 'buyer'
        ? {
            kicker: 'Terms turned down',
            subject: `The seller turned down your Karwan deal${amountSuffix}`,
            heading: 'The seller asked for different terms',
            body: `The seller left a note: "${String(e.payload?.note ?? '').slice(0, 600)}" Change the terms so they work for both of you. No money has moved.`,
            ctaLabel: 'Change the terms',
            ctaUrl: dealUrl(e.jobId),
          }
        : null;
    case 'deal.release.blocked': {
      if (role !== 'buyer' && role !== 'seller') return null;
      const detail = e.payload?.detail as DeliveryCheckDetail | undefined;
      const reason = detail
        ? deliveryCheckReason(detail, role)
        : e.payload?.reason === 'no-agent-wallet'
          ? 'Automatic release cannot run for this deal. Release it yourself from the deal page.'
          : 'The delivery check paused payment.';
      const note = role === 'buyer' && buyerPrivateNote ? ` What the check saw: ${buyerPrivateNote.slice(0, 400)}` : '';
      return role === 'buyer'
        ? {
            kicker: 'Payment paused',
            subject: 'The delivery check paused payment on your Karwan deal',
            heading: 'Payment is paused',
            body: `${reason}${note} Your money stays in escrow. Open the deal to review the delivery and choose what to do.`,
            ctaLabel: 'Review the delivery',
            ctaUrl: dealUrl(e.jobId),
          }
        : {
            kicker: 'Payment paused',
            subject: 'Payment on your Karwan deal is paused',
            heading: 'Payment is paused',
            body: `${reason} The money stays in escrow until this is resolved.`,
            ctaLabel: 'Open the deal',
            ctaUrl: dealUrl(e.jobId),
          };
    }
    case 'deal.review.ending': {
      if (role !== 'buyer') return null;
      const by = closesLabel(e.payload?.endsAt);
      const more = e.payload?.canAskMoreTime === true;
      return {
        kicker: 'Your deal',
        subject: `Your review ends ${by}`,
        heading: 'Check the delivery before your review ends',
        body: `Your time to check this delivery ends ${by}. Release the payment if it is right${more ? ', ask once for more time if you need it,' : ''} or raise a problem with what is wrong. If you do nothing, the payment goes to the seller when your review ends.`,
        ctaLabel: 'Open the deal',
        ctaUrl: dealUrl(e.jobId),
      };
    }
    case 'record.setup_needed': {
      if (role !== 'seller') return null;
      const b = base();
      if (e.payload?.reason === 'deal') {
        return {
          kicker: 'Your deal',
          subject: 'The buyer paid. Set up your Karwan record',
          heading: 'One step on your side',
          body: 'The buyer paid this deal in before your Karwan record was set up. Set it up and carry on: this deal will not count on your record, and your next ones will. Ask the assistant to set up your record; it takes one confirmation.',
          ctaLabel: 'Open the deal',
          ctaUrl: dealUrl(e.jobId),
        };
      }
      return {
        kicker: 'Your agent',
        subject: 'Set up your Karwan record so your agent can make offers',
        heading: 'One step before your agent offers',
        body: 'Your selling agent makes offers once your Karwan record is set up, so every deal you take counts on it. Ask the assistant to set up your record; it takes one confirmation.',
        ctaLabel: 'Open the assistant',
        ctaUrl: b ? `${b}/assistant` : undefined,
      };
    }
    case 'agent.suggestion': {
      if (role !== 'seller') return null;
      const title = (e.payload?.title as string | undefined) ?? '';
      const price = (e.payload?.priceUsdc as string | undefined) ?? '';
      return {
        kicker: 'Your agent',
        subject: 'Your agent found a request that fits. Make an offer?',
        heading: 'A request that fits',
        body: `${title ? `${title}. ` : ''}Your agent would offer${price ? ` ${price} USDC` : ''}. You asked to decide yourself, so nothing was sent. Open the request to make an offer.`,
        ctaLabel: 'Open the request',
        ctaUrl: jobUrl(e.payload?.jobId as string | undefined),
      };
    }
    case 'offer.created': {
      const price = (e.payload?.priceUsdc as string | number | undefined) ?? '';
      const priceSuffix = price !== '' ? ` at ${price} USDC` : '';
      return role === 'buyer'
        ? {
            kicker: 'New offer',
            subject: `A seller made an offer on your request${priceSuffix}`,
            heading: 'You have a new offer',
            body: `A seller offered to take your request${priceSuffix}. Review it and accept if it works for you. Nothing is paid until you accept.`,
            ctaLabel: 'Review the offer',
            ctaUrl: jobUrl(e.jobId),
          }
        : null;
    }
    case 'deal.direct.edited': {
      // Only the side that did not make the change hears about it.
      const by = e.actor === 'seller' ? 'seller' : 'buyer';
      if (role === by) return null;
      const changes = ((e.payload?.changedLabels as string[] | undefined) ?? []).map((l) => l.replace(/\.$/, ''));
      const who = by === 'buyer' ? 'The buyer' : 'The seller';
      return {
        kicker: 'New terms',
        subject: `${who} sent new terms for your Karwan deal${amountSuffix}`,
        heading: 'Review the new terms',
        body: `${who} changed the deal${changes.length ? `: ${changes.join('. ')}.` : '.'} Nothing is funded yet. Agree if the new terms work for you.`,
        ctaLabel: 'Review the new terms',
        ctaUrl: dealUrl(e.jobId),
      };
    }
    case 'deal.seller-approved':
      return role === 'buyer'
        ? {
            kicker: 'Ready to fund',
            subject: `The seller agreed to your Karwan deal${amountSuffix}`,
            heading: 'Review the final funding total',
            body: 'The seller agreed to the terms. Review the current fee and exact total before you fund escrow.',
            ctaLabel: 'Review and fund',
            ctaUrl: dealUrl(e.jobId),
          }
        : null;
    case 'deal.accepted':
      return {
        kicker: 'Deal funded',
        subject: `Deal funded${amountSuffix}`,
        heading: 'The money is held safely',
        body: `The payment is held in escrow and the seller can ${startPhrase(trade)}. It is released only when the work is accepted.`,
        ctaLabel: 'Open the deal',
        ctaUrl: dealUrl(e.jobId),
      };
    case 'deal.delivered':
      return role === 'buyer'
        ? {
            kicker: 'Delivered',
            subject: `Your seller marked ${deliverableNoun(trade)} delivered`,
            heading: trade === 'service' ? 'Work delivered' : 'Delivered',
            body: `The seller marked ${deliverableNoun(trade)} delivered. Open the deal to verify and release escrow.`,
            ctaLabel: 'Verify and release',
            ctaUrl: dealUrl(e.jobId),
          }
        : null; // seller already knows they delivered
    case 'escrow.settled':
      return {
        kicker: 'Settled',
        subject: 'Your Karwan deal settled in full',
        heading: 'Deal settled',
        body: 'The deal settled in full. Open it for your receipt and to see it on your Karwan record.',
        ctaLabel: 'View the deal',
        ctaUrl: dealUrl(e.jobId),
      };
    case 'deal.dispute.auto_resolved': {
      if (role !== 'buyer' && role !== 'seller') return null;
      const refunded = Number(e.payload?.sellerBps ?? 0) === 0;
      const cause = e.payload?.cause as string | undefined;
      const why =
        cause === 'failed-at-deadline'
          ? 'The delivery did not pass the delivery check by the deadline.'
          : cause === 'seller-silent'
            ? 'The seller did not respond to the dispute in time.'
            : 'The dispute was not settled in time.';
      if (!refunded) {
        return {
          kicker: 'Dispute closed',
          subject: 'Your Karwan dispute was closed',
          heading: 'Dispute closed',
          body: `${why} The money held in escrow was paid out.`,
          ctaLabel: 'View the deal',
          ctaUrl: dealUrl(e.jobId),
        };
      }
      return role === 'buyer'
        ? {
            kicker: 'Refunded',
            subject: `Your Karwan deal was refunded${amountSuffix}`,
            heading: 'You have been refunded',
            body: `${why} The money held in escrow went back to you in full.`,
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          }
        : {
            kicker: 'Refunded to the buyer',
            subject: 'A Karwan deal was refunded to the buyer',
            heading: 'The buyer was refunded',
            body: `${why} The money held in escrow went back to the buyer and the deal counts against your record.`,
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          };
    }
    case 'deal.disputed':
      return {
        kicker: 'Dispute',
        subject: 'A Karwan deal moved to dispute',
        heading: 'Deal moved to dispute',
        body: 'The money stays held until the dispute is settled. Add your side on the deal page. Either of you can still agree to cancel for a full refund.',
        ctaLabel: 'Open the deal',
        ctaUrl: dealUrl(e.jobId),
      };
    case 'deal.deadline.soon': {
      if (role !== 'seller') return null;
      const due = closesLabel(e.payload?.dueAt);
      return {
        kicker: 'Your deal',
        subject: `Your delivery is due ${due}`,
        heading: 'Deliver before the date',
        body: `This deal is due ${due}. Deliver on the deal, or ask the buyer for more time before then. If nothing is delivered by ${closesLabel(e.payload?.refundAt)}, the money goes back to the buyer and the deal counts against your record.`,
        ctaLabel: 'Open the deal',
        ctaUrl: dealUrl(e.jobId),
      };
    }
    case 'deal.deadline.passed': {
      const refund = closesLabel(e.payload?.refundAt);
      const asked = e.payload?.askedForMoreTime === true;
      const days = Math.max(1, Math.round(Number(e.payload?.additionalSeconds ?? 0) / 86_400));
      const more = `${days} more day${days === 1 ? '' : 's'}`;
      if (role === 'buyer') {
        return asked
          ? {
              kicker: 'Delivery date passed',
              subject: 'The delivery date passed. The seller asked for more time',
              heading: 'Answer the request for more time',
              body: `The delivery date passed and nothing is delivered. The seller asked for ${more}. Approve to give them the time, or decline and your money comes back to you. Your money stays in the deal until you answer.`,
              ctaLabel: 'Answer the request',
              ctaUrl: dealUrl(e.jobId),
            }
          : {
              kicker: 'Delivery date passed',
              subject: 'The delivery date passed with nothing delivered',
              heading: 'Nothing delivered by the date',
              body: `The delivery date passed and the seller has not delivered. If nothing is delivered by ${refund}, your money comes back to you automatically.`,
              ctaLabel: 'Open the deal',
              ctaUrl: dealUrl(e.jobId),
            };
      }
      if (role !== 'seller') return null;
      return asked
        ? {
            kicker: 'Delivery date passed',
            subject: 'The delivery date passed. Your request is with the buyer',
            heading: 'Your request is with the buyer',
            body: 'The delivery date passed. Your request for more time is with the buyer, and the money stays in the deal until they answer. If they decline, it goes back to them.',
            ctaLabel: 'Open the deal',
            ctaUrl: dealUrl(e.jobId),
          }
        : {
            kicker: 'Delivery date passed',
            subject: `The delivery date passed. Deliver by ${refund}`,
            heading: 'Deliver now, or the buyer is refunded',
            body: `The delivery date passed. Deliver by ${refund}, or the money goes back to the buyer and the deal counts against your record. You can still ask the buyer for more time before then.`,
            ctaLabel: 'Open the deal',
            ctaUrl: dealUrl(e.jobId),
          };
    }
    case 'deal.extension.waiting': {
      const days = Math.max(1, Math.round(Number(e.payload?.additionalSeconds ?? 0) / 86_400));
      if (role === 'buyer') {
        return {
          kicker: 'Waiting on you',
          subject: 'The seller is waiting for your answer',
          heading: 'Answer the request for more time',
          body: `The seller asked for ${days} more day${days === 1 ? '' : 's'} to deliver, and the delivery date has passed. Approve to give them the time, or decline and your money comes back to you. Nothing moves until you answer.`,
          ctaLabel: 'Answer the request',
          ctaUrl: dealUrl(e.jobId),
        };
      }
      if (role !== 'seller') return null;
      return {
        kicker: 'Your deal',
        subject: 'The buyer has not answered your request yet',
        heading: 'Waiting on the buyer',
        body: 'The time to deliver has run out, and the buyer has not answered your request for more time. The money stays in the deal until they answer. If they decline, it goes back to them.',
        ctaLabel: 'Open the deal',
        ctaUrl: dealUrl(e.jobId),
      };
    }
    case 'deal.delivered.onchain':
      return role === 'buyer'
        ? {
            kicker: 'Delivery marked',
            subject: 'Your seller marked delivery on the contract. Your review time has started',
            heading: 'Delivery marked on the contract',
            body: 'The seller marked this deal delivered directly on the escrow contract, not through Karwan, so no delivery check ran. Your review time has started. Check what you received. If something is wrong, open a dispute before the review time ends, or the seller can claim the payment.',
            ctaLabel: 'Review the deal',
            ctaUrl: dealUrl(e.jobId),
          }
        : null;
    case 'deal.extension.requested': {
      if (role !== 'buyer') return null;
      const days = Math.max(1, Math.round(Number(e.payload?.additionalSeconds ?? 0) / 86_400));
      const reason = String(e.payload?.reason ?? '').slice(0, 300);
      return {
        kicker: 'More time asked',
        subject: `The seller asked for ${days} more day${days === 1 ? '' : 's'}`,
        heading: 'The seller asked for more time',
        body: `The seller asked for ${days} more day${days === 1 ? '' : 's'} to deliver.${reason ? ` Their reason: "${reason}"` : ''} Approve or decline on the deal. Until you answer, the current deadline stands.`,
        ctaLabel: 'Answer the request',
        ctaUrl: dealUrl(e.jobId),
      };
    }
    case 'deal.dispute.statement': {
      const side = e.payload?.side as 'buyer' | 'seller' | undefined;
      if (!side || role === side || (role !== 'buyer' && role !== 'seller')) return null;
      return {
        kicker: 'Dispute',
        subject: `The ${side} gave their account of the dispute`,
        heading: 'Give your account',
        body: `The ${side} gave their account of the dispute. Give yours on the deal before ${closesLabel(e.payload?.closesAtMs)}. A side that gives no account loses the dispute.`,
        ctaLabel: 'Give your account',
        ctaUrl: dealUrl(e.jobId),
      };
    }
    case 'deal.dispute.statement.due': {
      if (!role || e.payload?.side !== role) return null;
      return {
        kicker: 'Dispute',
        subject: 'Your dispute statement is still missing',
        heading: 'Give your account before the window closes',
        body: `Your account of the dispute is still missing. Give it on the deal before ${closesLabel(e.payload?.closesAtMs)}. A side that gives no account loses the dispute.`,
        ctaLabel: 'Give your account',
        ctaUrl: dealUrl(e.jobId),
      };
    }
    case 'deal.cancel.proposed': {
      const proposedBy = (e.payload?.proposedBy as 'buyer' | 'seller' | undefined) ?? null;
      if (proposedBy && proposedBy === role) return null; // don't email the proposer
      return {
        kicker: 'Cancellation proposed',
        subject: 'A cancellation was proposed on your deal',
        heading: 'Cancellation proposed',
        body: 'The other party proposed cancelling this deal. Open it to accept or decline.',
        ctaLabel: 'Review the proposal',
        ctaUrl: dealUrl(e.jobId),
      };
    }
    case 'deal.fund.insufficient':
      return role === 'buyer'
        ? {
            kicker: 'Action needed',
            subject: 'Top up to fund your Karwan escrow',
            heading: 'Your agent is underfunded',
            body: "Your buyer agent doesn't have enough USDC on Arc to fund this escrow. Top it up so the seller can accept.",
            ctaLabel: 'Top up your agent',
            ctaUrl: dealUrl(e.jobId),
          }
        : null;
    case 'factoring.funding_needed': {
      const short = (e.payload?.shortfallUsdc as string | undefined) ?? '';
      return {
        kicker: 'Invoice financing',
        subject: `Add ${short} USDC so the seller can take your offer`,
        heading: 'Your offer needs its advance',
        body: `A seller tried to accept your financing offer, but your wallet does not hold the advance yet. Add ${short} USDC and they can accept it. Nothing has moved.`,
        ctaLabel: 'Open financier desk',
        ctaUrl: financierUrl(),
      };
    }
    case 'factoring.requested': {
      const face = (e.payload?.faceValueUsdc as string | undefined) ?? '';
      return {
        kicker: 'Invoice financing',
        subject: 'A seller requested early payout on Karwan',
        heading: 'A new invoice is open for financing',
        body: `A verified seller opened an invoice${face ? ` worth ${face} USDC` : ''} for early-payout offers. Review the trade and price an offer from the financier desk.`,
        ctaLabel: 'Open financier desk',
        ctaUrl: financierUrl(),
      };
    }
    case 'factoring.offered': {
      const advanceRaw = (e.payload?.advance as string | undefined) ?? '';
      const advance = advanceRaw ? `${advanceRaw} USDC now` : 'early payout';
      const bps = e.payload?.discountBps;
      const discount =
        typeof bps === 'number'
          ? ` at a ${(bps / 100).toFixed(1).replace(/\.0$/, '')}% discount`
          : '';
      return {
        kicker: 'Early payout',
        subject: 'A financier offered early payout on your invoice',
        heading: 'Early payout offered',
        body: `A financier offered you ${advance}${discount}. Open the deal to accept or pass.`,
        ctaLabel: 'Review the offer',
        ctaUrl: dealUrl(e.jobId),
      };
    }
    case 'factoring.accepted':
      return {
        kicker: 'Early payout',
        subject: 'The seller accepted your factoring offer',
        heading: 'Offer accepted',
        body: 'Your advance is on its way to the seller. You are repaid automatically when the buyer releases the escrow.',
        ctaLabel: 'View the deal',
        ctaUrl: dealUrl(e.jobId),
      };
    case 'factoring.settled': {
      const repay = (e.payload?.repayUsdc as string | undefined) ?? '';
      const suffix = repay ? ` ${repay} USDC` : '';
      return role === 'seller'
        ? {
            kicker: 'Early payout',
            subject: 'Your factoring advance has been repaid',
            heading: 'Factoring settled',
            body: `The escrow settled and${suffix} went to the financier. Nothing further is owed on this invoice.`,
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          }
        : {
            kicker: 'Early payout',
            subject: 'You have been repaid on a factored invoice',
            heading: 'Repayment received',
            body: `The buyer released the escrow and${suffix} landed in your wallet, principal plus spread.`,
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          };
    }
    case 'factoring.defaulted':
      return role === 'seller'
        ? {
            kicker: 'Action needed',
            subject: 'Your factoring repayment could not be collected',
            heading: 'Repayment failed',
            body: 'The escrow settled but the repayment to your financier did not go through. Fund your wallet and contact them before this reaches your reputation.',
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          }
        : {
            kicker: 'Action needed',
            subject: 'A factored invoice defaulted',
            heading: 'Repayment failed',
            body: 'The escrow settled but the seller\'s repayment did not go through after several attempts. Open the deal to pursue it.',
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          };
    case 'po.funded':
      return {
        kicker: 'Purchase order financing',
        subject: 'A financier funded your purchase order',
        heading: 'Working capital drawn',
        body: 'A financier funded a line against this order. The principal releases to you once proof of delivery is accepted.',
        ctaLabel: 'View the deal',
        ctaUrl: dealUrl(e.jobId),
      };
    case 'po.released': {
      const principal = (e.payload?.principalUsdc as string | undefined) ?? '';
      const suffix = principal ? ` ${principal} USDC` : '';
      return role === 'seller'
        ? {
            kicker: 'Purchase order financing',
            subject: 'Your PO financing has been released',
            heading: 'Funds released',
            body: `Proof of delivery was accepted and${suffix} was released to you, ahead of the buyer's settlement.`,
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          }
        : {
            kicker: 'Purchase order financing',
            subject: 'Your PO line released to the seller',
            heading: 'Principal released',
            body: `Proof of delivery was accepted and${suffix} moved to the seller. You are repaid when the escrow settles.`,
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          };
    }
    case 'po.repaid': {
      const repay = (e.payload?.repayUsdc as string | undefined) ?? '';
      const suffix = repay ? ` ${repay} USDC` : '';
      return role === 'seller'
        ? {
            kicker: 'Purchase order financing',
            subject: 'Your PO line has been repaid',
            heading: 'Line closed',
            body: `The escrow settled and${suffix} went to the financier. This line is closed.`,
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          }
        : {
            kicker: 'Purchase order financing',
            subject: 'You have been repaid on a PO line',
            heading: 'Repayment received',
            body: `The buyer released the escrow and${suffix} landed in your wallet, principal plus spread.`,
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          };
    }
    case 'po.defaulted':
      return role === 'seller'
        ? {
            kicker: 'Action needed',
            subject: 'Your PO line repayment could not be collected',
            heading: 'Repayment failed',
            body: 'The escrow settled but the repayment to your financier did not go through. Fund your wallet and contact them before this reaches your reputation.',
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          }
        : {
            kicker: 'Action needed',
            subject: 'A PO line defaulted',
            heading: 'Repayment failed',
            body: 'The escrow settled but the seller\'s repayment did not go through after several attempts. Open the deal to pursue it.',
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          };
    case 'rating.requested':
    case 'rating.reminder':
    case 'rating.revealed': {
      const tag = e.payload?.withTag ? `@${String(e.payload.withTag)}` : 'a Karwan member';
      const url = dealUrl(e.payload?.dealId as string | undefined);
      if (e.type === 'rating.revealed') {
        const who = e.payload?.withTag ? `@${String(e.payload.withTag)}'s` : 'Their';
        return { kicker: 'Rating', subject: `${who} rating of you is in`, heading: `${who} rating of you is in`, body: 'It now shows on your Karwan record.', ctaLabel: 'View the deal', ctaUrl: url };
      }
      const first = e.type === 'rating.requested';
      return {
        kicker: 'Rating',
        subject: first ? `How did your deal with ${tag} go?` : `Rate your deal with ${tag}`,
        heading: first ? `How did your deal with ${tag} go?` : `Rate your deal with ${tag}`,
        body: 'Rate it 1 to 5, and add a note if you like. Ratings show once you both rate, or 14 days after the deal settled.',
        ctaLabel: 'Rate the deal',
        ctaUrl: url,
      };
    }
    case 'reputation.tier-up': {
      const toTier = (e.payload?.toTier as string | undefined) ?? '';
      const addr = e.payload?.address as string | undefined;
      return {
        kicker: 'Reputation',
        subject: toTier ? `You reached ${toTier} on Karwan` : 'You moved up a tier on Karwan',
        heading: toTier ? `You reached ${toTier}` : 'You moved up a tier',
        body: 'Your reputation tier rose on Karwan. A stronger tier means agents move faster for you.',
        ctaLabel: 'View your passport',
        ctaUrl: passportUrl(addr),
      };
    }
    default:
      return null;
  }
}

/// The money each event is about, shown as the email's largest line. Only
/// payload values: an email never guesses an amount.
const AMOUNT_KEY: Record<string, string> = {
  'deal.matched': 'agreedPriceUsdc',
  'deal.match.raised': 'raisedPriceUsdc',
  'deal.match.approved': 'dealAmountUsdc',
  'listing.matched': 'askingPriceUsdc',
  'deal.direct.created': 'dealAmountUsdc',
  'deal.direct.edited': 'dealAmountUsdc',
  'offer.created': 'priceUsdc',
  'deal.seller-approved': 'dealAmountUsdc',
  'deal.accepted': 'dealAmountUsdc',
  'factoring.requested': 'faceValueUsdc',
  'factoring.offered': 'advance',
  'factoring.settled': 'repayUsdc',
  'po.released': 'principalUsdc',
  'po.repaid': 'repayUsdc',
};

export function amountFor(e: KarwanEvent): string | undefined {
  const key = AMOUNT_KEY[e.type];
  const raw = key ? e.payload?.[key] : undefined;
  if (raw === undefined || raw === null || raw === '') return undefined;
  const text = String(raw);
  return /^\d+(\.\d+)?$/.test(text) ? text : undefined;
}

/// Who a deal email is with and what the deal is for, read once from the deal.
/// People are named by name and Karwan tag, never a wallet (owner, 23 Oct).
async function dealContext(jobId: string | undefined, role: 'buyer' | 'seller') {
  if (!jobId) return null;
  const deal = await getDeal(jobId).catch(() => null);
  if (!deal) return null;
  const other = await getProfile(role === 'buyer' ? deal.seller : deal.buyer).catch(() => null);
  const facts: Array<[string, string]> = [];
  if (other?.handle) facts.push(['With', [other.displayName?.trim(), `@${other.handle}`].filter(Boolean).join(' · ')]);
  const what = (deal.terms ?? '').split('\n')[0]!.trim().slice(0, 120);
  if (what) facts.push(['For', what]);
  return { facts, amount: deal.dealAmountUsdc };
}

export function startEmailNotifier(): () => void {
  // No Resend key means no transactional email at all; skip subscribing.
  if (!resendClient()) return () => {};
  return bus.subscribe(async (e) => {
    if (!EMAIL_RELEVANT.has(e.type)) return;
    try {
      const recipients = await recipientsFor(e);
      const trade = await tradeTypeFor(e);
      for (const r of recipients) {
        const profile = await getProfile(r.address);
        // Only verified contact emails, and respect the mute toggle.
        if (!profile?.email || !profile.emailVerified) continue;
        if (profile.settings?.notificationsMuted) continue;
        // "How should we reach you": Telegram only skips email while a chat is linked.
        if (profile.settings?.notifyVia === 'telegram') {
          const linked = !!(await getTelegramLink(r.address).catch(() => null));
          if (!channelsFor(profile.settings, linked).email) continue;
        }
        const privateNote = e.type === 'deal.release.blocked' && r.role === 'buyer' && e.jobId
          ? (await getDeal(e.jobId).catch(() => null))?.deliveryMatch?.reason
          : undefined;
        const content = r.role === 'financier' ? financierContentFor(e, r.href) : contentFor(e, r.role, trade, privateNote);
        if (!content) continue;
        const context = r.role === 'buyer' || r.role === 'seller' ? await dealContext(e.jobId, r.role) : null;
        await sendDealEventEmail({
          to: profile.email,
          ...content,
          amount: amountFor(e) ?? (e.type === 'deal.disputed' ? context?.amount : undefined),
          ...(context?.facts.length ? { facts: context.facts } : {}),
        });
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message, type: e.type }, 'email notifier error');
    }
  });
}
