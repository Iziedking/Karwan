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
import { bus, type KarwanEvent } from '../events.js';
import { config } from '../config.js';
import { getDeal } from '../db/deals.js';
import { getProfile } from '../db/profiles.js';
import { resendClient } from './resend.js';
import { sendDealEventEmail } from './dealEventEmail.js';
import { logger } from '../logger.js';

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

// High-signal events only. Keep this list short on purpose.
const EMAIL_RELEVANT = new Set([
  'deal.matched',
  'deal.match.approved',
  'listing.matched',
  'deal.direct.created',
  'deal.accepted',
  'deal.delivered',
  'escrow.settled',
  'deal.disputed',
  'deal.cancel.proposed',
  'deal.fund.insufficient',
  'deal.deadline.passed',
  'deal.match.raised',
  'factoring.offered',
  'factoring.accepted',
  'factoring.settled',
  'factoring.defaulted',
  'po.funded',
  'po.released',
  'po.repaid',
  'po.defaulted',
  'reputation.tier-up',
]);

/// Financing events name their parties directly (seller, financier) and the
/// financier is never a party to the underlying deal, so the jobId-based
/// recipient fallback below cannot route them. Each entry lists which payload
/// addresses should hear about it.
const FINANCE_RECIPIENTS: Record<string, ReadonlyArray<'seller' | 'financier'>> = {
  'factoring.offered': ['seller'],
  'factoring.accepted': ['financier'],
  'factoring.settled': ['seller', 'financier'],
  'factoring.defaulted': ['seller', 'financier'],
  'po.funded': ['seller'],
  'po.released': ['seller', 'financier'],
  'po.repaid': ['seller', 'financier'],
  'po.defaulted': ['seller', 'financier'],
};

interface Recipient {
  address: string;
  role: 'buyer' | 'seller' | 'self';
}

async function recipientsFor(e: KarwanEvent): Promise<Recipient[]> {
  if (e.type === 'reputation.tier-up') {
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
  if (e.type === 'deal.deadline.passed') {
    // Only the buyer needs this: their funds are reclaimable now.
    const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
    return buyer ? [{ address: buyer, role: 'buyer' }] : [];
  }
  if (e.type === 'deal.match.raised') {
    // Only the buyer: the approval gate flipped to them after the seller raised.
    const buyer = (e.payload?.buyer as string | undefined)?.toLowerCase();
    return buyer ? [{ address: buyer, role: 'buyer' }] : [];
  }
  // Remaining events carry a jobId and notify both parties.
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

interface EmailContent {
  eyebrow: string;
  subject: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

function contentFor(e: KarwanEvent, role: Recipient['role']): EmailContent | null {
  const amount = (e.payload?.dealAmountUsdc as string | undefined) ?? '';
  const amountSuffix = amount ? ` (${amount} USDC)` : '';

  switch (e.type) {
    case 'deal.matched': {
      const price = (e.payload?.agreedPriceUsdc as string | undefined) ?? '';
      const priceSuffix = price ? ` at ${price} USDC` : '';
      return role === 'seller'
        ? {
            eyebrow: 'DEAL MATCHED',
            subject: `Karwan matched your bid with a buyer${priceSuffix}`,
            heading: 'You have a match',
            body: `Karwan matched your bid with a buyer${priceSuffix}. Accept to fund escrow and start the deal.`,
            ctaLabel: 'Review the match',
            ctaUrl: jobUrl(e.jobId),
          }
        : {
            eyebrow: 'DEAL MATCHED',
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
        eyebrow: 'SELLER RAISED',
        subject: `The seller raised the price${suffix}`,
        heading: 'The seller wants a higher price',
        body: `The seller is not taking the price your agent agreed and raised it${suffix}. Open the match to approve the new price or decline it. Nothing funds until you approve.`,
        ctaLabel: 'Review the raised price',
        ctaUrl: jobUrl(e.jobId),
      };
    }
    case 'deal.match.approved':
      return {
        eyebrow: 'ESCROW FUNDED',
        subject: `Your Karwan match is live${amountSuffix}`,
        heading: 'Match accepted, escrow funded',
        body:
          role === 'seller'
            ? `Escrow is funded${amountSuffix}. Deliver in Karwan when the work is ready.`
            : `The seller accepted and escrow is funded${amountSuffix}. Standby for delivery.`,
        ctaLabel: 'Open the deal',
        ctaUrl: dealUrl(e.jobId),
      };
    case 'listing.matched': {
      const price = (e.payload?.askingPriceUsdc as number | string | undefined) ?? '';
      const priceSuffix = price ? ` at ${price} USDC` : '';
      return {
        eyebrow: 'OFFER MATCHED',
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
            eyebrow: 'NEW DEAL',
            subject: `A buyer opened a deal with you${amountSuffix}`,
            heading: 'A buyer opened a deal with you',
            body: `A buyer opened a deal with you${amountSuffix}. Accept and your agent funds escrow.`,
            ctaLabel: 'Review the deal',
            ctaUrl: dealUrl(e.jobId),
          }
        : null; // buyer initiated it; no email to self
    case 'deal.accepted':
      return {
        eyebrow: 'DEAL ACCEPTED',
        subject: `Deal accepted, escrow funded${amountSuffix}`,
        heading: 'Deal accepted',
        body: 'The escrow is funded and the seller can begin the work.',
        ctaLabel: 'Open the deal',
        ctaUrl: dealUrl(e.jobId),
      };
    case 'deal.delivered':
      return role === 'buyer'
        ? {
            eyebrow: 'DELIVERED',
            subject: 'Your seller marked the work delivered',
            heading: 'Work delivered',
            body: 'The seller marked the work delivered. Open the deal to verify and release escrow.',
            ctaLabel: 'Verify and release',
            ctaUrl: dealUrl(e.jobId),
          }
        : null; // seller already knows they delivered
    case 'escrow.settled':
      return {
        eyebrow: 'SETTLED',
        subject: 'Your Karwan deal settled in full',
        heading: 'Deal settled',
        body: 'The deal settled in full and reputation was recorded on chain.',
        ctaLabel: 'View the deal',
        ctaUrl: dealUrl(e.jobId),
      };
    case 'deal.disputed':
      return {
        eyebrow: 'DISPUTE',
        subject: 'A Karwan deal moved to dispute',
        heading: 'Deal moved to dispute',
        body: 'This deal is now in dispute. Either party can still propose a mutual cancel for a full refund.',
        ctaLabel: 'Open the deal',
        ctaUrl: dealUrl(e.jobId),
      };
    case 'deal.deadline.passed':
      return role === 'buyer'
        ? {
            eyebrow: 'DEADLINE PASSED',
            subject: 'Your deadline passed. You can reclaim your funds',
            heading: 'Deadline passed without delivery',
            body: 'The delivery deadline passed and the seller has not delivered. You can reclaim your escrowed funds now, or grant an extension if you want to wait. If you do nothing and the seller still does not deliver, Karwan reclaims the funds to you automatically.',
            ctaLabel: 'Reclaim or extend',
            ctaUrl: dealUrl(e.jobId),
          }
        : null; // the seller missed their own deadline; no email to them
    case 'deal.cancel.proposed': {
      const proposedBy = (e.payload?.proposedBy as 'buyer' | 'seller' | undefined) ?? null;
      if (proposedBy && proposedBy === role) return null; // don't email the proposer
      return {
        eyebrow: 'CANCEL PROPOSED',
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
            eyebrow: 'ACTION NEEDED',
            subject: 'Top up to fund your Karwan escrow',
            heading: 'Your agent is underfunded',
            body: "Your buyer agent doesn't have enough USDC on Arc to fund this escrow. Top it up so the seller can accept.",
            ctaLabel: 'Top up your agent',
            ctaUrl: dealUrl(e.jobId),
          }
        : null;
    case 'factoring.offered': {
      const advanceRaw = (e.payload?.advance as string | undefined) ?? '';
      const advance = advanceRaw ? `${advanceRaw} USDC now` : 'early payout';
      const bps = e.payload?.discountBps;
      const discount =
        typeof bps === 'number'
          ? ` at a ${(bps / 100).toFixed(1).replace(/\.0$/, '')}% discount`
          : '';
      return {
        eyebrow: 'EARLY PAYOUT',
        subject: 'A financier offered early payout on your invoice',
        heading: 'Early payout offered',
        body: `A financier offered you ${advance}${discount}. Open the deal to accept or pass.`,
        ctaLabel: 'Review the offer',
        ctaUrl: dealUrl(e.jobId),
      };
    }
    case 'factoring.accepted':
      return {
        eyebrow: 'EARLY PAYOUT',
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
            eyebrow: 'EARLY PAYOUT',
            subject: 'Your factoring advance has been repaid',
            heading: 'Factoring settled',
            body: `The escrow settled and${suffix} went to the financier. Nothing further is owed on this invoice.`,
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          }
        : {
            eyebrow: 'EARLY PAYOUT',
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
            eyebrow: 'ACTION NEEDED',
            subject: 'Your factoring repayment could not be collected',
            heading: 'Repayment failed',
            body: 'The escrow settled but the repayment to your financier did not go through. Fund your wallet and contact them before this reaches your reputation.',
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          }
        : {
            eyebrow: 'ACTION NEEDED',
            subject: 'A factored invoice defaulted',
            heading: 'Repayment failed',
            body: 'The escrow settled but the seller\'s repayment did not go through after several attempts. Open the deal to pursue it.',
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          };
    case 'po.funded':
      return {
        eyebrow: 'PO FINANCING',
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
            eyebrow: 'PO FINANCING',
            subject: 'Your PO financing has been released',
            heading: 'Funds released',
            body: `Proof of delivery was accepted and${suffix} was released to you, ahead of the buyer's settlement.`,
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          }
        : {
            eyebrow: 'PO FINANCING',
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
            eyebrow: 'PO FINANCING',
            subject: 'Your PO line has been repaid',
            heading: 'Line closed',
            body: `The escrow settled and${suffix} went to the financier. This line is closed.`,
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          }
        : {
            eyebrow: 'PO FINANCING',
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
            eyebrow: 'ACTION NEEDED',
            subject: 'Your PO line repayment could not be collected',
            heading: 'Repayment failed',
            body: 'The escrow settled but the repayment to your financier did not go through. Fund your wallet and contact them before this reaches your reputation.',
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          }
        : {
            eyebrow: 'ACTION NEEDED',
            subject: 'A PO line defaulted',
            heading: 'Repayment failed',
            body: 'The escrow settled but the seller\'s repayment did not go through after several attempts. Open the deal to pursue it.',
            ctaLabel: 'View the deal',
            ctaUrl: dealUrl(e.jobId),
          };
    case 'reputation.tier-up': {
      const toTier = (e.payload?.toTier as string | undefined) ?? '';
      const addr = e.payload?.address as string | undefined;
      return {
        eyebrow: 'TIER UP',
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

export function startEmailNotifier(): () => void {
  // No Resend key means no transactional email at all; skip subscribing.
  if (!resendClient()) return () => {};
  return bus.subscribe(async (e) => {
    if (!EMAIL_RELEVANT.has(e.type)) return;
    try {
      const recipients = await recipientsFor(e);
      for (const r of recipients) {
        const profile = await getProfile(r.address);
        // Only verified contact emails, and respect the mute toggle.
        if (!profile?.email || !profile.emailVerified) continue;
        if (profile.settings?.notificationsMuted) continue;
        const content = contentFor(e, r.role);
        if (!content) continue;
        await sendDealEventEmail({ to: profile.email, ...content });
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message, type: e.type }, 'email notifier error');
    }
  });
}
