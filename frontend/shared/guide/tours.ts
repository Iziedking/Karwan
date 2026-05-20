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
    body: 'Use the top menu: Buyer to hire, Seller to offer work, Activity to follow everything live. Your money stays in your own wallet until you fund a deal.',
  },
  {
    title: 'You stay in control',
    body: 'Nothing moves without your approval. We will point things out as you go. Hit "Skip all tips" any time if you already know your way around.',
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
    body: 'What you want for the work, in USDC (digital dollars, about 1 USDC to 1 US dollar). Add a little flexibility so your assistant can close a deal.',
    target: 'seller-price',
  },
  {
    title: 'Publish it',
    body: 'Post the listing and your assistant watches for matching requests, negotiates, and brings you a deal to accept. You approve before anything is binding.',
    target: 'seller-submit',
  },
];

/// Stake tour.
export const STAKE_TOUR_ID = 'stake-v1';
export const STAKE_STEPS: TourStep[] = [
  {
    title: 'What staking does',
    body: 'Lock USDC to build your reputation. A higher tier makes your assistant negotiate better deals for you, and on mainnet the same stake earns yield.',
    target: 'stake-total',
  },
  {
    title: 'Add to your stake',
    body: 'Enter an amount and deposit. Your USDC stays yours; it is locked, not spent.',
    target: 'stake-deposit',
  },
  {
    title: 'Taking it back',
    body: 'Withdrawing starts a 7-day cool-down. After that you claim it back to your wallet. Cancel any time during the wait to keep earning.',
    target: 'stake-withdraw',
  },
];

/// Bridge tour (add funds to Arc).
export const BRIDGE_TOUR_ID = 'bridge-v1';
export const BRIDGE_STEPS: TourStep[] = [
  {
    title: 'Where your USDC is now',
    body: 'Pick the chain your USDC sits on today. Karwan moves it to Arc, where every deal settles.',
    target: 'bridge-source',
  },
  {
    title: 'How much to move',
    body: 'Enter the amount. It is burned on the source chain and minted fresh on Arc. No wrapped tokens, no third party holding it.',
    target: 'bridge-amount',
  },
  {
    title: 'Bring it over',
    body: 'Start the transfer. It usually lands on Arc in 10 to 19 minutes; you can leave the page and come back.',
    target: 'bridge-submit',
  },
];

/// Deal page tour (/deals/[id]).
export const DEAL_TOUR_ID = 'deal-v1';
export const DEAL_STEPS: TourStep[] = [
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

/// Profile tour.
export const PROFILE_TOUR_ID = 'profile-v1';
export const PROFILE_STEPS: TourStep[] = [
  {
    title: 'Your profile',
    body: 'Set up how you trade. Turn on a buyer side to hire, a seller side to offer work, or both.',
  },
  {
    title: 'Wallets and alerts',
    body: 'Manage your wallets, top up your agent with USDC, and connect Telegram or X to get notified the moment something happens.',
  },
  {
    title: 'Build your standing',
    body: 'Stake USDC to lift your reputation tier. A higher tier gets you better deals, and on mainnet your stake also earns yield.',
  },
];

/// Activity stream tour.
export const ACTIVITY_TOUR_ID = 'activity-v1';
export const ACTIVITY_STEPS: TourStep[] = [
  {
    title: 'Your live feed',
    body: 'Everything that happens on your deals shows here as it happens: posts, bids, escrow moves, settlements.',
    target: 'activity-stream',
  },
  {
    title: 'Verify on chain',
    body: 'Each row deep-links to the Arc explorer, so you can check any event yourself. Nothing is hidden.',
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

/// Marketplace tour.
export const MARKET_TOUR_ID = 'market-v1';
export const MARKET_STEPS: TourStep[] = [
  {
    title: 'The marketplace',
    body: 'Live offers from sellers and open requests from buyers, side by side. Browse for what you need.',
  },
  {
    title: 'Start from any card',
    body: 'Open a listing to start a deal with that seller, or pick up a request as a seller. Your assistant handles the negotiation from there.',
  },
];
