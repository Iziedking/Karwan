export type Role = 'buyer' | 'seller' | 'financier';

// Events worth bubbling into the bell. Split into agent-deal (route to
// /jobs/[id]) and direct-deal (route to /deals/[id]). same data model after
// match approval, but the URL differs before that.
export const MANAGED_TYPES = new Set([
  'deal.matched',
  'deal.match.approved',
  'deal.match.declined',
  'deal.match.raised',
  'negotiation.near-miss',
  'job.expired',
  'listing.matched',
  'agent.declined',
]);

export const DIRECT_TYPES = new Set([
  'deal.direct.created',
  'deal.invite.claimed',
  'deal.seller-approved',
  'deal.accepted',
  'deal.delivered',
  'deal.delivery.flagged',
  'deal.delivery.cleared',
  'deal.fund.insufficient',
  'escrow.milestone.released',
  'deal.review.started',
  'deal.review.heartbeat',
  'deal.deadline.passed',
  'deal.auto_released',
  'escrow.settled',
  'deal.disputed',
  // An arbiter splitting the escrow is the single most consequential thing that
  // can happen to a deal without either party doing it. It notified nobody.
  'escrow.resolved',
  'deal.cancelled',
  'deal.cancel.proposed',
  'deal.cancel.declined',
  // Seller cashes out after settlement; the banner lives on the deal page.
  'cashout.arc.completed',
]);

// Wallet-level events carry no jobId. They route to the owner address in the
// payload and surface on the profile (where balances live).
export const WALLET_TYPES = new Set(['wallet.credited', 'wallet.debited']);

// Invoice-factoring and PO-financing events. These DO carry a jobId, but the
// financier is not a party to the underlying deal, so the deal-role machinery
// can never resolve a role for them. Route by the addresses the payload names,
// exactly like the wallet events, and keep the jobId so the bell still links
// to the deal. Mirrors FINANCE_RECIPIENTS in the email + Telegram notifiers.
export const FINANCE_RECIPIENT_KEYS: Record<string, ReadonlyArray<'seller' | 'financier'>> = {
  'factoring.requested': ['financier'],
  'factoring.offered': ['seller'],
  'factoring.accepted': ['financier'],
  'factoring.settled': ['seller', 'financier'],
  'factoring.defaulted': ['seller', 'financier'],
  'po.funded': ['seller'],
  'po.released': ['seller', 'financier'],
  'po.repaid': ['seller', 'financier'],
  'po.defaulted': ['seller', 'financier'],
};
export const FINANCE_TYPES = new Set(Object.keys(FINANCE_RECIPIENT_KEYS));

// Money-movement events that carry no jobId. Each one names the owner under
// a different payload key depending on the surface that emitted it. The map
// keeps the routing local to one place.
export const MONEY_DIRECT_OWNER_KEY: Record<string, 'address' | 'user'> = {
  'vault.deposit': 'address',
  'vault.withdraw.requested': 'address',
  'vault.withdraw.cancelled': 'address',
  'vault.claimed': 'address',
  'vault.cooldown.completed': 'address',
  'agent.funded': 'user',
  'agent.withdrawal': 'user',
  'yield.claimed': 'address',
  // Yield ARRIVING, from the daily distribution. It used to land silently: the
  // number on /stake had grown and nothing said so.
  'yield.credited': 'address',
  // Unified-balance moves: deposits in, agent funding out, cash-outs off Arc.
  'gateway.deposited': 'address',
  'gateway.agent.funded': 'address',
  'gateway.cashed.out': 'address',
  // Reputation tier-up routes to the subject address, same shape as vault.
  'reputation.tier-up': 'address',
};
export const MONEY_DIRECT_TYPES = new Set(Object.keys(MONEY_DIRECT_OWNER_KEY));

// Events whose target is the deal action card. Tapping them should land on
// /deals/[id]#action so the user scrolls straight to Mark Delivered / Release /
// Accept rather than the top of the page.
export const ACTION_TYPES = new Set([
  'deal.match.approved',
  'deal.direct.created',
  'deal.seller-approved',
  'deal.delivered',
  'deal.delivery.flagged',
  'deal.delivery.cleared',
  'deal.review.started',
  'deal.fund.insufficient',
  'deal.deadline.passed',
]);

/// A cross-chain transfer that finished. It names no deal, and not every path
/// names an owner key, so it routes by the owner or the mint recipient.
export const BRIDGE_TYPES = new Set(['bridge.minted']);

export const NOTIFY_TYPES = new Set([
  ...MANAGED_TYPES,
  ...DIRECT_TYPES,
  ...WALLET_TYPES,
  ...MONEY_DIRECT_TYPES,
  ...FINANCE_TYPES,
  ...BRIDGE_TYPES,
  // Trend nudge: no jobId, routed to the seller-user like the wallet events.
  'trend.match',
]);

// High-signal events that should also trigger a toast. Cooldown finishing is
// the rare actionable money event, so it earns a toast; the rest of the vault
// and agent events sit quietly in the bell.
export const TOAST_TYPES = new Set([
  'deal.matched',
  'deal.match.approved',
  'deal.seller-approved',
  'deal.cancel.proposed',
  'deal.fund.insufficient',
  'negotiation.near-miss',
  'job.expired',
  'deal.deadline.passed',
  'deal.match.raised',
  'wallet.credited',
  'wallet.debited',
  'vault.cooldown.completed',
  'reputation.tier-up',
  // Money offered, money moved early, or money that failed to move. All three
  // want a decision or a look; the rest of the financing lifecycle can sit
  // quietly in the bell.
  'factoring.offered',
  'factoring.defaulted',
  'po.released',
  'po.defaulted',
]);

// Which party should receive each event. This is the fix for notifications
// landing at the wrong party: a deal event is no longer shown to whoever is a
// party, it is shown only to the role the message is written for. 'both' shows
// to either side with role-aware copy. cancel.proposed / cancel.declined route
// by the proposer in the payload (handled in shouldNotify).
export const RECIPIENT: Record<string, Role | 'both'> = {
  // Managed (agent) flow.
  'deal.matched': 'both',
  'deal.match.approved': 'both',
  'deal.match.declined': 'both',
  'deal.match.raised': 'buyer', // seller raised; the buyer now approves or declines
  'job.expired': 'buyer',
  'listing.matched': 'seller',
  'trend.match': 'seller', // rising-demand nudge, addressed to the matching seller
  'agent.declined': 'buyer',
  // Direct flow.
  'deal.direct.created': 'seller', // buyer just created it; the seller must act
  'deal.invite.claimed': 'seller', // the claimer is the seller; surface "deal is yours" in their bell post-claim
  'deal.seller-approved': 'buyer', // seller agreed; buyer now reviews and funds
  'deal.accepted': 'both', // escrow is now funded and active
  'deal.delivered': 'buyer', // the buyer verifies and releases
  'deal.delivery.flagged': 'both', // seller fixes the link, buyer learns release is paused
  'deal.delivery.cleared': 'both', // both learn the hold lifted
  'deal.fund.insufficient': 'buyer',
  'escrow.milestone.released': 'both',
  'deal.review.started': 'buyer',
  'deal.deadline.passed': 'buyer', // the seller missed it; the buyer can reclaim
  'deal.review.heartbeat': 'seller', // the buyer extended; the seller cares
  'deal.auto_released': 'both',
  'escrow.settled': 'both',
  'deal.disputed': 'both',
  'escrow.resolved': 'both',
  'deal.cancelled': 'both',
  'deal.cancel.proposed': 'both', // special-cased to the counterparty below
  'deal.cancel.declined': 'both', // special-cased to the proposer below
  // The seller pulls funds out after settlement; banner lives on the deal page.
  'cashout.arc.completed': 'seller',
};
