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
    body: 'Trade is where you post requests and offers. Market is for browsing. Activity shows deal and payment history. Profile holds wallets and agent settings.',
  },
  {
    title: 'You stay in control',
    body: 'Your approval is required before funds move. Use Tour for page guidance and Feedback to report an issue.',
  },
];

/// Home (/app) tour. The desk a signed-in user lands on. Walks the money view,
/// where to start, the three doors, and the deal book, every tool on the page.
export const HOME_TOUR_ID = 'home-v2';
export const HOME_STEPS: TourStep[] = [
  {
    title: 'Start with a request or offer',
    body: 'Post what you need or what you can supply. Your agent finds matches and brings you the terms.',
    target: 'home-start',
  },
  {
    title: 'Your money, at a glance',
    body: 'See your balance, funds held in escrow, and earnings. All values are in USDC.',
    target: 'home-money',
  },
  {
    title: 'Pick a desk',
    body: 'Buyer is for hiring. Seller is for offering work. Activity tracks progress.',
    target: 'home-doors',
  },
  {
    title: 'The network, live',
    body: 'Review live totals for funded deals, settlements, disputes, and payment volume.',
    target: 'home-activity',
  },
  {
    title: 'Your open work',
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
    title: 'Set a negotiation limit',
    body: 'Tolerance is the maximum amount above budget your agent may accept. Zero keeps the cap fixed.',
    target: 'buyer-tolerance',
  },
  {
    title: 'Post for offers',
    body: 'Your agent collects offers and returns a match for your approval. Funding never starts automatically.',
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
    title: 'Set your price',
    body: 'Enter your asking price in USDC. Your agent negotiates from buyer offers.',
    target: 'seller-price',
  },
  {
    title: 'Set your minimum',
    body: 'Choose how far your price can move. Zero keeps it at the asking price.',
    target: 'seller-floor',
  },
  {
    title: 'Set the live window',
    body: 'Choose how long the offer stays open. Post again whenever you want to renew it.',
    target: 'seller-window',
  },
  {
    title: 'Publish the offer',
    body: 'Your agent watches for matching requests and brings back a deal for you to review.',
    target: 'seller-submit',
  },
];

/// Stake tour.
export const STAKE_TOUR_ID = 'stake-v2';
export const STAKE_STEPS: TourStep[] = [
  {
    title: 'Network reserve',
    body: 'Review the vault reserve and distribution record.',
    target: 'stake-network-yield',
  },
  {
    title: 'Your yield',
    body: 'Claim available yield without changing your stake.',
    target: 'stake-your-yield',
  },
  {
    title: 'Your vault position',
    body: 'Deposit USDC to build reputation. The same position holds your withdrawable stake.',
    target: 'stake-vault',
  },
  {
    title: 'Withdrawal timing',
    body: 'Withdrawals cool down before they can be claimed. The timer shows the exact wait.',
    target: 'stake-withdraw',
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
  rail: 'direct' | 'gateway' | 'cctp' | 'onramp';
}): TourStep[] {
  const steps: TourStep[] = [
    {
      title: 'Choose a direction',
      body: 'Deposit brings USDC to Arc. Withdraw sends it out. Available routes follow your choice.',
      target: 'bridge-direction',
    },
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

/// Profile tour. Spotlights each part of the redesigned profile in page order,
/// role-aware because funding works differently for Circle vs web3 wallets.
/// Bumped to v2 for the distill redesign: the bridge moved to the hero Top up
/// card, wallets became a holdings view, and a folded multi-chain breakdown was
/// added, so returning users should see the refreshed walkthrough.
export const PROFILE_TOUR_ID = 'profile-v3';
export function buildProfileSteps(isCircle: boolean): TourStep[] {
  return [
    {
      target: 'profile-nav',
      title: 'Profile navigation',
      body: 'Use these tabs for identity, wallets, agents, and contact settings.',
    },
    {
      target: 'profile-topup',
      title: 'Bring USDC to Arc',
      body: isCircle
        ? 'Open Top up to send USDC to the wallet shown. Karwan moves it onto Arc for you.'
        : 'Open Top up to move USDC from Base or Ethereum to Arc from your own wallet.',
    },
    {
      target: 'profile-identity',
      title: 'Identity and limits',
      body: 'Review your role and the limits your agents follow. Activate agents here if they are not running.',
    },
    {
      target: 'profile-wallets',
      title: 'Wallet balances',
      body: 'See your wallet and agent balances on Arc. Addresses can be copied when needed.',
    },
    {
      target: 'profile-balances',
      title: 'Other chains',
      body: 'Expand this section to review balances held on other chains.',
    },
    {
      target: 'profile-agents',
      title: 'Agent funds',
      body: isCircle
        ? 'Fund the agent wallet used for escrow, or withdraw to your own wallet. Circle handles signing.'
        : 'Fund the agent wallet used for escrow, or withdraw to your own wallet.',
    },
    {
      target: 'profile-preferences',
      title: 'Contact preferences',
      body: 'Choose where Karwan sends deal updates.',
    },
  ];
}

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
    body: 'Open your history for amounts and receipts from your deals.',
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
    body: 'Set your language, timezone, and theme.',
  },
  {
    title: 'Notifications',
    body: 'Choose where deal updates are sent.',
  },
  {
    title: 'Account privacy',
    body: 'Manage profile visibility and account settings.',
  },
];

/// Marketplace tour. The market is sectioned by rail, so the walkthrough
/// branches: an individual learns the P2P market plus the "businesses hiring"
/// bridge and the view-only B2B strip; a business learns its B2B market.
/// Distinct ids per variant so the "seen" set never suppresses the wrong one.
export const MARKET_TOUR_ID = 'market-person-v1';
export const MARKET_BIZ_TOUR_ID = 'market-biz-v1';
/// `sections` is the list of section keys the page actually rendered. Empty
/// sections are filtered out of the market before paint, so a step pointing at
/// one spotlights nothing: on a quiet market the tour talked about rails that
/// were not there. Passing the keys in keeps the tour describing the page in
/// front of the user rather than the page as designed.
export function buildMarketSteps(
  accountKind: 'person' | 'business',
  sections?: string[],
): TourStep[] {
  const built = buildAllMarketSteps(accountKind);
  if (!sections) return built;
  const present = new Set(sections.map((key) => `market-${key}`));
  return built.filter((step) => !step.target || present.has(step.target));
}

function buildAllMarketSteps(accountKind: 'person' | 'business'): TourStep[] {
  if (accountKind === 'business') {
    return [
      {
        title: 'B2B market',
        body: 'Review trade-finance deals your business can fund or fulfil.',
        target: 'market-b2b',
      },
      {
        title: 'Companies hiring',
        body: 'Review business requests for individual services and decide whether to bid.',
        target: 'market-hiring',
      },
    ];
  }
  return [
    {
      title: 'Browse the market',
      body: 'Review open requests and offers. Open a listing to inspect the details.',
      target: 'market-p2p',
    },
    {
      title: 'Companies hiring',
      body: 'Review business requests for individual services. Open a brief to decide whether to bid.',
      target: 'market-hiring',
    },
    {
      title: 'B2B activity',
      body: 'B2B activity is view-only for personal accounts. Business accounts can act on eligible trades.',
      target: 'market-b2b',
    },
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
export const FINANCIER_DESK_TOUR_ID = 'financier-desk-v1';
export const FINANCIER_DESK_STEPS: TourStep[] = [
  {
    title: 'Choose a desk',
    body: 'Compare invoices for factoring with purchase orders for funding.',
    target: 'financier-tabs',
  },
  {
    title: 'Filter your lane',
    body: 'Filter by sector and region to focus on familiar trades.',
    target: 'financier-filters',
  },
  {
    title: 'Review a trade',
    body: 'Check face value, seller reputation, and settlement timing before committing capital.',
    target: 'financier-deal',
  },
  {
    title: 'Post an offer',
    body: 'Set your principal or discount and submit. Repayment follows settlement.',
    target: 'financier-offer',
  },
  {
    title: 'Review the passport',
    body: 'Open the seller’s credit passport for verified history and repayment signals.',
    target: 'financier-passport',
  },
];

/// Supply desk, business accounts only. Short on purpose: the desk is one job,
/// publish what the company sells, and the value a supplier without partners
/// needs to understand is that the agent works the other direction too.
export const SUPPLY_TOUR_ID = 'supply-v1';
export const SUPPLY_STEPS: TourStep[] = [
  {
    title: 'Publish your supply',
    body: 'List what your company sells, including price and terms, so buyers can find it.',
    target: 'supply-post',
  },
  {
    title: 'Let your agent match',
    body: 'Your agent watches relevant business requests and brings back matches.',
    target: 'supply-agent',
  },
  {
    title: 'Find partners',
    body: 'Browse companies by sector and region when you want to reach out directly.',
    target: 'supply-partners',
  },
];
