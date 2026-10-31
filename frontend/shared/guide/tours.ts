import type { TourStep } from './GuideProvider';

/// First-run welcome. Outcome-first, plain language, no jargon. This is the
/// "start here" a newcomer asked for, and the moment a web3-native can hit
/// "skip all tips" to turn the tours off everywhere.
export const WELCOME_ID = 'welcome-v1';
export const WELCOME_STEPS: TourStep[] = [
  {
    title: 'Welcome to Karwan',
    body: 'Secure cross-border work in USDC. Agree terms, lock funds in escrow, and release payment as work is delivered.',
  },
  {
    title: 'Choose how to trade',
    body: 'Know your counterparty? Start a direct deal. Looking for a match? Post a request and your agent will bring back offers.',
  },
  {
    title: 'Find your way around',
    body: 'Trade is where you post requests and offers. Discover is for browsing. Activity shows deal and payment history. Profile opens your account details, settings, wallets and help.',
  },
  {
    title: 'You stay in control',
    body: 'Read the terms and payment review before confirming. Use Page tour beside the page navigation whenever you need guidance.',
  },
];

/// Home (/app) tour. The desk a signed-in user lands on. Walks the money view,
/// where to start, the three doors, and the deal book, every tool on the page.
export const HOME_TOUR_ID = 'home-v3';
export const HOME_STEPS: TourStep[] = [
  {
    title: 'Start trading',
    body: 'Trade now opens the trade desk: find something to buy, list what you sell, or bring a deal you already agreed.',
    target: 'home-start',
  },
  {
    title: 'Your money, at a glance',
    body: 'This shows available USDC in your account and agent wallets. Details opens the chain-by-chain view. On testnet, the drop in the top corner gets you free test USDC. Money held in a deal is not available balance.',
    target: 'home-money',
  },
  {
    title: 'Your trades',
    body: 'Open a deal to review its status or take the next available action.',
    target: 'home-deals',
  },
];

/// Business trade-desk tour (/app for a verified-business account). The desk is
/// a different surface from the individual home: a company funds invoices and
/// purchase orders, gets a verified badge, and watches its own book, so it gets
/// its own walkthrough rather than the buyer/seller framing.
export const BIZ_HOME_TOUR_ID = 'biz-home-v2';
export const BIZ_HOME_STEPS: TourStep[] = [
  {
    title: 'Open a desk',
    body: 'Buyer Desk sources work. Supply Desk lists what you sell. Direct Trade is for a known counterparty.',
    target: 'biz-desk',
  },
  {
    title: 'Business verification',
    body: 'Check your verification status. Register your company to unlock SME trade-finance features.',
    target: 'biz-verify',
  },
  {
    title: 'Your book',
    body: 'Track active and settled trades alongside total volume.',
    target: 'biz-book',
  },
  {
    title: 'Approval stays with you',
    body: 'Agents handle matching. You approve terms before funding. Escrow releases payment as work is delivered.',
  },
];

/// Buyer desk tour. Spotlight steps point at elements tagged with the matching
/// `data-guide` value on /buyer.
export const BUYER_TOUR_ID = 'buyer-v1';
export const BUYER_STEPS: TourStep[] = [
  {
    title: 'Describe the request',
    body: 'Write what you need. Your agent uses it to find relevant suppliers.',
    target: 'buyer-brief',
  },
  {
    title: 'Set a budget',
    body: 'Enter the maximum in USDC. Tolerance gives your agent room to negotiate.',
    target: 'buyer-budget',
  },
  {
    title: 'Set the deadline',
    body: 'Choose the delivery window. Leave room for negotiation and review.',
    target: 'buyer-deadline',
  },
  {
    title: 'Adjust optional settings',
    body: 'Open this section to adjust price flexibility, seller requirements or payment stages. You still review the agreed terms before payment.',
    target: 'buyer-tolerance',
  },
  {
    title: 'Review your request',
    body: 'Check the price limit and payment stages before posting. Your agent matches on Karwan and funds from your balance when the seller accepts within your authorised settings.',
    target: 'buyer-submit',
  },
];

/// Seller desk tour (post a listing).
export const SELLER_TOUR_ID = 'seller-v1';
export const SELLER_STEPS: TourStep[] = [
  {
    title: 'Describe your offer',
    body: 'Say what you provide. Your agent matches it with buyer requests.',
    target: 'seller-listing',
  },
  {
    title: 'Set the price and time',
    body: 'Next you set a fixed price, the lowest you accept and how long you need once a deal starts.',
  },
  {
    title: 'State your terms',
    body: 'Then list what you deliver and how payment is split. A buyer who starts a deal from your offer starts from these terms.',
  },
  {
    title: 'Publish the offer',
    body: 'Your agent looks for matching requests and brings back a deal for you to review.',
  },
];

/// Deal guarantee tour (view 37).
export const STAKE_TOUR_ID = 'guarantee-v1';
export const STAKE_STEPS: TourStep[] = [
  {
    title: 'Your deal guarantee',
    body: 'Money you set aside to protect your buyers. Put it up, take it out or collect it here.',
    target: 'guarantee',
  },
  {
    title: 'Your yield',
    body: 'The guarantee earns at the USYC rate, paid by Karwan on testnet. Claim it here.',
    target: 'stake-your-yield',
  },
  {
    title: 'Network reserve',
    body: 'Review the reserve and the distribution record.',
    target: 'stake-network-yield',
  },
];

/// Deposit / Withdraw tour (/bridge).
///
/// Built from the page's own state rather than fixed, because /bridge is a
/// chooser now: a direction, then one of four rails, and only the chosen rail's
/// controls are on screen. The old fixed three steps described the Transfer form
/// and were mounted INSIDE it, so the tour vanished from the page whenever the
/// user picked any other rail, and never registered at all for an email account,
/// which lands on Direct. The page owns it now and asks for the steps that match
/// what it is actually showing.
export const BRIDGE_TOUR_ID = 'bridge-v2';

export function buildBridgeSteps(view: {
  direction: 'in' | 'out';
  rail: 'direct' | 'gateway' | 'cctp';
}): TourStep[] {
  const steps: TourStep[] = [
    {
      title: 'Choose a route',
      body: 'Select the route that matches where your USDC is now. Unavailable routes are marked clearly.',
      target: 'bridge-rails',
    },
  ];

  if (view.rail === 'direct') {
    steps.push({
      title: 'Send to one address',
      body: 'Send USDC to the displayed address. Copy it or scan the code.',
      target: 'bridge-address',
    });
  }

  if (view.rail === 'gateway') {
    steps.push({
      title: 'Use a pooled balance',
      body:
        view.direction === 'in'
          ? 'Pool USDC from a supported chain, then move it to Arc once it confirms.'
          : 'Send from your pooled balance to a supported chain in one step.',
      target: 'bridge-gateway',
    });
  }

  if (view.rail === 'cctp' && view.direction === 'in') {
    steps.push(
      {
        title: 'Select the source chain',
        body: 'Choose the chain that currently holds your USDC.',
        target: 'bridge-source',
      },
      {
        title: 'Enter an amount',
        body: 'Set the amount to move to Arc.',
        target: 'bridge-amount',
      },
      {
        title: 'Start the transfer',
        body: 'Confirm the transfer. You can leave the page and return while it settles.',
        target: 'bridge-submit',
      },
    );
  }

  if (view.rail === 'cctp' && view.direction === 'out') {
    steps.push({
      title: 'Send USDC out',
      body: 'Choose a destination and amount. Arc-to-Arc is immediate; other chains may take a few minutes.',
      target: 'bridge-out',
    });
  }

  steps.push({
    title: 'Review transfers',
    body: 'Track every transfer by status and receipt. In-progress moves stay here until complete.',
    target: 'bridge-history',
  });

  return steps;
}

/// Live request page tour (/jobs/[id]), the auction + negotiation surface a
/// buyer watches after posting a request, before escrow funds.
export const JOBS_TOUR_ID = 'jobs-v1';
export const JOBS_STEPS: TourStep[] = [
  {
    title: 'Request summary',
    body: 'Review your budget, deadline, offer count, and terms fingerprint.',
    target: 'job-stats',
  },
  {
    title: 'Your brief',
    body: 'Read the request as posted, including the keywords used for matching.',
    target: 'job-brief',
  },
  {
    title: 'Request status',
    body: 'Follow the path from posted to funded. Funding waits for your approval.',
    target: 'job-flow',
  },
  {
    title: 'Negotiation',
    body: 'See the latest offer and how terms are changing. Open the card for the full history.',
    target: 'job-negotiation',
  },
  {
    title: 'Offers',
    body: 'Compare offers by price and reputation. The current lead is shown first.',
    target: 'job-bids',
  },
  {
    title: 'Approval',
    body: 'Approve the match when the terms are right. Nothing funds until you confirm.',
  },
];

/// Deal page tour (/deals/[id]).
export const DEAL_TOUR_ID = 'deal-v1';
export const DEAL_STEPS: TourStep[] = [
  {
    title: 'Deal summary',
    body: 'Review both parties, the funded amount, seller proceeds, fee, and milestone split.',
    target: 'deal-money',
  },
  {
    title: 'Deal status',
    body: 'Track the deal from acceptance to settlement. Funds release as milestones are completed.',
    target: 'deal-flow',
  },
  {
    title: 'Next action',
    body: 'Deliver, review, or release the next milestone. Cancellation and dispute options appear when available.',
    target: 'deal-actions',
  },
  {
    title: 'Deal messages',
    body: 'Keep messages, delivery links, and notes with the deal.',
  },
];

/// Activity stream tour. The general feed is a privacy pulse now: it shows that
/// the network is alive without revealing any deal's parties or amounts.
export const ACTIVITY_TOUR_ID = 'activity-v3';
export const ACTIVITY_STEPS: TourStep[] = [
  {
    title: 'Filter the network',
    body: 'Select a counter to filter the feed by event type.',
    target: 'activity-stats',
  },
  {
    title: 'Your transaction history',
    body: 'Your money by day. Filter money in or out, and open a row for its receipt.',
    target: 'activity-money',
  },
  {
    title: 'Activity feed',
    body: 'Switch between network activity and your own events, then refine the results.',
    target: 'activity-stream',
  },
];

/// Settings tour.
export const SETTINGS_TOUR_ID = 'settings-v1';
export const SETTINGS_STEPS: TourStep[] = [
  {
    title: 'Preferences',
    body: 'Language, theme and sound. Tap a row to change it.',
  },
  {
    title: 'Notifications and privacy',
    body: 'Turn notifications on or off, and choose whether you appear on the public board.',
  },
  {
    title: 'Security',
    body: 'Your passkey, and deleting your profile, which asks you to confirm first.',
  },
];

/// Marketplace tour (view 44): the Buy and Sell switch, the search, the
/// categories and the newest offers. A business sees the same shop; its own
/// id keeps the "seen" set apart from a personal account's.
export const MARKET_TOUR_ID = 'market-person-v2';
export const MARKET_BIZ_TOUR_ID = 'market-biz-v2';
export function buildMarketSteps(accountKind: 'person' | 'business'): TourStep[] {
  return [
    {
      title: 'Buy or sell',
      body: accountKind === 'business' ? 'Buy for your business, or switch to Sell to see what buyers need.' : 'Buy what you need, or switch to Sell to see what buyers need.',
      target: 'market-switch',
    },
    { title: 'Search', body: 'Type what you need. Every offer here is protected: Karwan holds the money until you confirm.', target: 'market-search' },
    { title: 'Categories', body: 'Pick a category to narrow the offers.', target: 'market-categories' },
    { title: 'New on Karwan', body: 'The newest offers, with who sells them, their rating and how fast it comes. Open one to order.', target: 'market-new' },
  ];
}

/// Financier application tour (/financier, before approval). Explains the
/// capability and the eligibility bar. Centered cards, no spotlight targets.
export const FINANCIER_APPLY_TOUR_ID = 'financier-apply-v1';
export const FINANCIER_APPLY_STEPS: TourStep[] = [
  {
    title: 'Apply as a financier',
    body: 'Finance accepted invoices and purchase orders, then collect repayment at settlement.',
  },
  {
    title: 'Check eligibility',
    body: 'Approval depends on account age, vault stake, and reputation tier. Each requirement shows its current state.',
  },
  {
    title: 'Open your desk',
    body: 'Apply once all checks pass. Your financier workspace opens after approval.',
  },
];

/// Financier desk tour (/financier, after approval).
export const FINANCIER_DESK_TOUR_ID = 'financier-desk-v2';
export const FINANCIER_DESK_STEPS: TourStep[] = [
  {
    title: 'Review a seller',
    body: 'Each invoice shows the amount, the payment terms and the seller tier.',
    target: 'financier-deal',
  },
  {
    title: 'Check the record',
    body: 'Open the seller record for verified history before you commit money.',
    target: 'financier-passport',
  },
  {
    title: 'Make an offer',
    body: 'Set your discount and see what you advance now and what comes back after the buyer approves delivery.',
    target: 'financier-offer',
  },
];
