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

function listingUrl(listingId: string | undefined): string | null {
  if (!listingId || !config.FRONTEND_BASE_URL) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/listings/${listingId}`;
}

function stakeUrl(): string | null {
  if (!config.FRONTEND_BASE_URL) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/stake`;
}

function profileUrl(): string | null {
  if (!config.FRONTEND_BASE_URL) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/profile`;
}

function passportUrl(address: string | undefined): string | null {
  if (!config.FRONTEND_BASE_URL || !address) return null;
  return `${config.FRONTEND_BASE_URL.replace(/\/$/, '')}/credit-passport/${address.toLowerCase()}`;
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

const RELEVANT = new Set([
  'deal.matched',
  'deal.match.approved',
  'deal.match.declined',
  'negotiation.near-miss',
  'deal.direct.created',
  'deal.direct.edited',
  'deal.invite.claimed',
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
  // A financier offered early payout on the seller's invoice.
  'factoring.offered',
  'listing.matched',
  'listing.match.proactive',
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
  // Reputation tier-up carries the subject address. Same shape as vault events.
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
  if (e.type === 'chat.message') {
    const jobId = e.jobId;
    if (!jobId) return [];
    const deal = await getDeal(jobId);
    if (!deal) return [];
    const sender = (e.payload?.sender as string | undefined)?.toLowerCase();
    // Echo to both parties so the sender sees their own message in TG too,
    // useful as a sent-confirmation when away from the app. The role helps
    // the summary phrase it from each side's perspective.
    const out: Recipient[] = [];
    out.push({ address: deal.buyer, role: deal.buyer === sender ? 'self' : 'buyer' });
    out.push({ address: deal.seller, role: deal.seller === sender ? 'self' : 'seller' });
    return out;
  }
  // A financier's factoring offer is addressed to the seller only (it's an
  // offer to pay them early). Route from the payload, not the both-parties
  // deal lookup below.
  if (e.type === 'factoring.offered') {
    const seller = (e.payload?.seller as string | undefined)?.toLowerCase();
    return seller ? [{ address: seller, role: 'seller' }] : [];
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
          ? `*A buyer opened a deal with you*${amount ? ` at ${amount} USDC` : ''}. Tap to accept; your agent funds escrow on accept.`
          : `*Deal opened* with ${short(e.payload?.seller)}${amount ? ` at ${amount} USDC` : ''}. Waiting for them to accept.`,
        url,
      );
    case 'deal.invite.claimed':
      /// Fires after the recipient verifies their email and binds the deal.
      /// This is the seller's first Telegram cue. The original direct.created
      /// event already fired before they were on Karwan, so this ping carries
      /// the same "you have a deal" call to action.
      return withLink(
        role === 'seller'
          ? `*Deal bound to your wallet*${amount ? ` at ${amount} USDC` : ''}. Tap to accept; your agent funds escrow on accept.`
          : `*Your invited counterparty just joined*${amount ? ` (${amount} USDC deal)` : ''}. Waiting for them to accept.`,
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
    case 'wallet.credited': {
      const credited = (e.payload?.amountUsdc as string | undefined) ?? '0';
      const label = (e.payload?.walletLabel as string | undefined) ?? 'wallet';
      const credit = trimUsdcLabel(credited);
      return withLink(
        `*+${credit} USDC* landed in your ${label}.`,
        null,
      );
    }
    case 'wallet.debited': {
      const debited = (e.payload?.amountUsdc as string | undefined) ?? '0';
      const label = (e.payload?.walletLabel as string | undefined) ?? 'wallet';
      const debit = trimUsdcLabel(debited);
      return withLink(
        `*-${debit} USDC* left your ${label}.`,
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
