import type { TourStep } from './GuideProvider';

/// First-run welcome. Outcome-first, plain language, no jargon. This is the
/// "start here" a newcomer asked for, and the moment a web3-native can hit
/// "skip all tips" to turn the tours off everywhere.
export const WELCOME_ID = 'welcome-v1';
export const WELCOME_STEPS: TourStep[] = [
  {
    title: 'Welcome to Karwan',
    body: 'Get paid for cross-border work without the bank wait. You and the other side agree a price, the money is locked safely, and it is released as the work gets delivered.',
  },
  {
    title: 'Two ways to start',
    body: 'Already know who you are trading with? Open a direct deal and name their wallet. Need to find someone? Post a request and your assistant finds and negotiates a match for you.',
  },
  {
    title: 'Where things live',
    body: 'Open Trades from the top menu to hire or to offer work, Market to browse what others have posted, and Activity to follow the network. Your money stays in your own wallet until you fund a deal.',
  },
  {
    title: 'Two buttons, always there',
    body: 'Nothing moves without your approval. Need a hand on any page? Tap Tour, bottom-left, for a quick walkthrough of that page. Spot a bug or have an idea? Tap Feedback, bottom-right. That is it. Go build.',
  },
];

/// Home (/app) tour. The desk a signed-in user lands on. Walks the money view,
/// where to start, the three doors, and the deal book, every tool on the page.
export const HOME_TOUR_ID = 'home-v1';
export const HOME_STEPS: TourStep[] = [
  {
    title: 'Start a deal',
    body: 'Post a request to hire someone, or an offer to take work. Your assistant runs the bidding and negotiation from there and brings you terms to approve.',
    target: 'home-start',
  },
  {
    title: 'Your money, at a glance',
    body: 'What you can spend, what is locked safely in deals, and what you have earned. Held in USDC (digital dollars) in escrow on Arc. Locked money is released only as work is delivered.',
    target: 'home-money',
  },
  {
    title: 'Three ways in',
    body: 'Hire someone, offer your work, or open a deal directly with a counterparty you already know. Same escrow and reputation underneath, three entry points.',
    target: 'home-doors',
  },
  {
    title: 'The network, live',
    body: 'A 30-day pulse of the whole network and the totals beneath it: deals funded and settled, any disputes, plus volume, milestones released, reputation records, and yield. Every number reads straight from the contracts on Arc, so it is proof the rails are working, not a mockup.',
    target: 'home-activity',
  },
  {
    title: 'Your book',
    body: 'Every deal you are part of, with its live stage. Tap any one to act on it: accept, deliver, release a milestone, or settle.',
    target: 'home-deals',
  },
];

/// Business trade-desk tour (/app for a verified-business account). The desk is
/// a different surface from the individual home: a company funds invoices and
/// purchase orders, gets a verified badge, and watches its own book, so it gets
/// its own walkthrough rather than the buyer/seller framing.
export const BIZ_HOME_TOUR_ID = 'biz-home-v1';
export const BIZ_HOME_STEPS: TourStep[] = [
  {
    title: 'Your trade desk',
    body: 'Open the financier desk to fund supplier invoices and purchase orders, or start a new trade. Your agents handle the matching and the settlement; you approve the terms.',
    target: 'biz-desk',
  },
  {
    title: 'Your verified status',
    body: 'This shows whether your business is verified. Register your company and anchor a registration or tax document to unlock SME trade-finance deals; Karwan reviews it and grants the badge.',
    target: 'biz-verify',
  },
  {
    title: 'Your book',
    body: 'Every deal your company runs, with how many are active, how many have settled, and your total volume charted over time.',
    target: 'biz-book',
  },
  {
    title: 'You stay in control',
    body: 'Agents negotiate and match, but nothing funds until you approve it, and money sits safely in escrow until the work lands. Tap Help any time for a refresher.',
  },
];

/// Buyer desk tour. Spotlight steps point at elements tagged with the matching
/// `data-guide` value on /buyer.
export const BUYER_TOUR_ID = 'buyer-v1';
export const BUYER_STEPS: TourStep[] = [
  {
    title: 'Post a request',
    body: 'Describe the work you need in plain words. Your assistant reads it and finds suppliers whose skills match.',
    target: 'buyer-brief',
  },
  {
    title: 'Set your budget',
    body: 'What you are willing to pay, in USDC (digital dollars, about 1 USDC to 1 US dollar). Add a little flexibility and your assistant can negotiate within it.',
    target: 'buyer-budget',
  },
  {
    title: 'Set a deadline',
    body: 'How long the work has. Give enough time for the back-and-forth plus the delivery, so a tight clock does not cut a negotiation short.',
    target: 'buyer-deadline',
  },
  {
    title: 'How far the agent can go',
    body: 'Tolerance is how much above your budget your assistant may accept on a counter. 0 keeps it strict at your budget; a little room lets it close a fair deal without overpaying.',
    target: 'buyer-tolerance',
  },
  {
    title: 'Let it run',
    body: 'Post the request and your assistant takes over: it collects offers, negotiates, and brings you a match to approve. No money moves until you say yes.',
    target: 'buyer-submit',
  },
];

/// Seller desk tour (post a listing).
export const SELLER_TOUR_ID = 'seller-v1';
export const SELLER_STEPS: TourStep[] = [
  {
    title: 'Offer your work',
    body: 'Describe what you do in plain words. Your assistant matches it to buyers who need it and bids on your behalf.',
    target: 'seller-listing',
  },
  {
    title: 'Set your asking price',
    body: 'What you want for the work, in USDC (digital dollars, about 1 USDC to 1 US dollar). Your assistant negotiates up from a buyer offer toward this.',
    target: 'seller-price',
  },
  {
    title: 'Your floor',
    body: 'Accept decrease is how far below your asking the assistant may settle. 0 holds firm at your price; a little room helps it close. It never goes below this.',
    target: 'seller-floor',
  },
  {
    title: 'How long it stays live',
    body: 'The window is how long the offer is open before it auto-expires. Set it long enough to catch matching requests; you can always post a fresh one.',
    target: 'seller-window',
  },
  {
    title: 'Publish it',
    body: 'Post the offer and your assistant watches for matching requests, negotiates, and brings you a deal to accept. You approve before anything is binding.',
    target: 'seller-submit',
  },
];

/// Stake tour.
export const STAKE_TOUR_ID = 'stake-v1';
export const STAKE_STEPS: TourStep[] = [
  {
    title: 'What staking does',
    body: 'Lock USDC to build your reputation. A higher tier makes your assistant negotiate better deals, and the same stake accrues yield through tokenized US Treasuries.',
    target: 'stake-total',
  },
  {
    title: 'Add to your stake',
    body: 'Enter an amount and deposit. Your USDC stays yours; it is locked, not spent.',
    target: 'stake-deposit',
  },
  {
    title: 'Taking it back',
    body: 'Withdrawing starts a 3-day cool-down. After that you claim it back to your wallet. Cancel any time during the wait to keep earning.',
    target: 'stake-withdraw',
  },
];

/// Top up / Withdraw tour (add funds to Arc).
export const BRIDGE_TOUR_ID = 'bridge-v1';
export const BRIDGE_STEPS: TourStep[] = [
  {
    title: 'Where your USDC is now',
    body: 'Pick the chain your USDC sits on today. Karwan tops it up onto Arc, where every deal settles.',
    target: 'bridge-source',
  },
  {
    title: 'How much to move',
    body: 'Enter the amount. It is burned on the source chain and minted fresh on Arc. No wrapped tokens, no third party holding it.',
    target: 'bridge-amount',
  },
  {
    title: 'Top it up',
    body: 'Start the transfer. It usually lands on Arc in 10 to 19 minutes; you can leave the page and come back.',
    target: 'bridge-submit',
  },
];

/// Live request page tour (/jobs/[id]), the auction + negotiation surface a
/// buyer watches after posting a request, before escrow funds.
export const JOBS_TOUR_ID = 'jobs-v1';
export const JOBS_STEPS: TourStep[] = [
  {
    title: 'The deal at a glance',
    body: 'Your budget, how many offers are in, the deadline, and the terms hash. The terms hash is the fingerprint of what you posted, written to Arc.',
    target: 'job-stats',
  },
  {
    title: 'The request you posted',
    body: 'Your brief in your own words, with the keywords your assistant pulled from it to find matching sellers.',
    target: 'job-brief',
  },
  {
    title: 'Where this request stands',
    body: 'The flow shows each stage from posted to funded: collecting offers, negotiating, then your approval. No money has moved yet.',
    target: 'job-flow',
  },
  {
    title: 'Watch the agents negotiate',
    body: 'Your assistant and the sellers haggle here in real time. The card shows the price moving toward a deal; tap it to expand the round-by-round.',
    target: 'job-negotiation',
  },
  {
    title: 'The offers on the table',
    body: 'Every offer your assistant is weighing, scored on price and reputation. The strongest rises to the top.',
    target: 'job-bids',
  },
  {
    title: 'You have the final say',
    body: 'When the agents agree, a match appears at the top for you to approve. Nothing funds and no escrow locks until you say yes.',
  },
];

/// Deal page tour (/deals/[id]).
export const DEAL_TOUR_ID = 'deal-v1';
export const DEAL_STEPS: TourStep[] = [
  {
    title: 'The money and who is in it',
    body: 'Who you are dealing with, what you funded, what the seller nets after the platform fee, and how the payout splits between delivery and final release. It sits in escrow on Arc until each milestone is met.',
    target: 'deal-money',
  },
  {
    title: 'Where your deal stands',
    body: 'This tracker shows each stage from accepted to settled. Your money sits safely in escrow and is released as milestones are met.',
    target: 'deal-flow',
  },
  {
    title: 'Your next move',
    body: 'The seller marks the work delivered; the buyer reviews and releases each milestone. Either side can propose a cancel for a full refund.',
    target: 'deal-actions',
  },
  {
    title: 'Talk it through',
    body: 'Message your counterparty right on this page and keep delivery links and notes together, so the whole deal lives in one place.',
  },
];

/// Profile tour. Spotlights each part of the profile, and the bridge step is
/// role-aware because funding works differently for Circle vs web3 wallets.
export const PROFILE_TOUR_ID = 'profile-v1';
export function buildProfileSteps(isCircle: boolean): TourStep[] {
  return [
    {
      target: 'profile-nav',
      title: 'Your profile, in parts',
      body: 'These tabs jump to each part: identity, wallets, agents, stake, and preferences.',
    },
    {
      target: 'profile-identity',
      title: 'Identity and agents',
      body: 'Your name, and the buyer and seller wallets that sign your deals on chain. Activate here if you have not yet.',
    },
    {
      target: 'profile-wallets',
      title: 'Bring USDC to Arc',
      body: isCircle
        ? 'Deals settle in USDC on Arc. To add funds, send USDC to the source-chain wallet shown in the bridge and Karwan moves it to Arc for you. Its address and balance are right there.'
        : 'Deals settle in USDC on Arc. The bridge moves your USDC from Base or Ethereum: you approve and burn it from your own wallet, and it mints on Arc. No wrapped tokens.',
    },
    {
      target: 'profile-agents',
      title: 'Fund or withdraw your agent',
      body: isCircle
        ? 'Top up the wallet that signs your deals so it can fund escrow. Sweep it back to yourself any time. Circle handles the signing for you.'
        : 'Top up the wallet that signs your deals so it can fund escrow, and sweep it back to your own wallet any time.',
    },
    {
      target: 'profile-stake',
      title: 'Build your reputation',
      body: 'Stake USDC to lift your tier. A higher tier gets you better deals, and the same stake accrues yield through tokenized US Treasuries.',
    },
    {
      target: 'profile-preferences',
      title: 'How Karwan reaches you',
      body: 'Connect email, Telegram, or X so your agent can ping you the moment a deal needs you. You only ever hear about your own deals.',
    },
  ];
}

/// Activity stream tour. The general feed is a privacy pulse now: it shows that
/// the network is alive without revealing any deal's parties or amounts.
export const ACTIVITY_TOUR_ID = 'activity-v2';
export const ACTIVITY_STEPS: TourStep[] = [
  {
    title: 'The live network pulse',
    body: 'A heartbeat of activity across Karwan: posts, bids, settlements as they happen. By design it shows only that something happened, never who or how much.',
    target: 'activity-stream',
  },
  {
    title: 'Your deals stay private',
    body: 'Everyone’s deals are private to the two sides. The full detail of your own deals lives on each deal page, visible only to you and your counterparty.',
  },
];

/// Settings tour.
export const SETTINGS_TOUR_ID = 'settings-v1';
export const SETTINGS_STEPS: TourStep[] = [
  {
    title: 'Make it yours',
    body: 'Set your language, timezone, and theme so the app reads and feels the way you want.',
  },
  {
    title: 'Stay in the loop',
    body: 'Choose how you get notified. Connect Telegram or email to hear about your deals the moment they move.',
  },
  {
    title: 'Privacy and account',
    body: 'Control what shows on your public profile and manage your account from here.',
  },
];

/// Marketplace tour. The market is sectioned by rail, so the walkthrough
/// branches: an individual learns the P2P market plus the "businesses hiring"
/// bridge and the view-only B2B strip; a business learns its B2B market.
/// Distinct ids per variant so the "seen" set never suppresses the wrong one.
export const MARKET_TOUR_ID = 'market-person-v1';
export const MARKET_BIZ_TOUR_ID = 'market-biz-v1';
export function buildMarketSteps(accountKind: 'person' | 'business'): TourStep[] {
  if (accountKind === 'business') {
    return [
      {
        title: 'Your B2B market',
        body: 'Open trade-finance deals you can fund or fulfil, grouped into their own section.',
        target: 'market-b2b',
      },
      {
        title: 'Companies hiring individuals',
        body: 'Businesses sourcing individual services sit here. Open any card to act on it; your agents handle the matching and you approve the terms.',
        target: 'market-hiring',
      },
    ];
  }
  return [
    {
      title: 'The marketplace',
      body: 'Open requests and offers from people, in their own section. Browse for what you need and your assistant negotiates from there.',
      target: 'market-p2p',
    },
    {
      title: 'Businesses hiring you',
      body: 'Companies sometimes need an individual for a job. Those sit in their own section, and you bid on them like any request.',
      target: 'market-hiring',
    },
    {
      title: 'Business deals are view-only',
      body: 'You can see B2B trade activity for transparency, but acting on those needs a business account. Counterparties stay private.',
      target: 'market-b2b',
    },
  ];
}

/// Financier application tour (/financier, before approval). Explains the
/// capability and the eligibility bar. Centered cards, no spotlight targets.
export const FINANCIER_APPLY_TOUR_ID = 'financier-apply-v1';
export const FINANCIER_APPLY_STEPS: TourStep[] = [
  {
    title: 'Become a financier',
    body: 'Financiers advance against accepted invoices and fund purchase orders, then collect repayment when the trade settles on chain. Anyone can apply.',
  },
  {
    title: 'Clear the bar',
    body: 'Three checks: time on Karwan, a stake in the vault, and at least the COLD reputation tier. Each shows live, with a link to fix what is missing.',
  },
  {
    title: 'Apply and you are in',
    body: 'Once all three pass, apply and your desk unlocks right away. Funding stays gated until then so capital and counterparties are protected.',
  },
];

/// Financier desk tour (/financier, after approval).
export const FINANCIER_DESK_TOUR_ID = 'financier-desk-v1';
export const FINANCIER_DESK_STEPS: TourStep[] = [
  {
    title: 'Two desks',
    body: 'Switch between invoices open to factoring and purchase orders open to funding. Each lists the trade you can put capital behind.',
    target: 'financier-tabs',
  },
  {
    title: 'Filter to your lane',
    body: 'Narrow by sector and region to find the deals you understand and want to back.',
    target: 'financier-filters',
  },
  {
    title: 'Read each deal',
    body: 'Every card shows the face value, the seller reputation tier, and the settlement window, so you can size the risk before you commit.',
    target: 'financier-deal',
  },
  {
    title: 'Make an offer',
    body: 'Set your discount or principal and post it. When the seller accepts, your advance goes out; repayment returns automatically when the deal settles.',
    target: 'financier-offer',
  },
  {
    title: 'Every counterparty has a passport',
    body: 'Each card links to the seller’s on-chain credit passport: tier, settled-deal history, and repayment behaviour, so you underwrite with real signals.',
    target: 'financier-passport',
  },
];
