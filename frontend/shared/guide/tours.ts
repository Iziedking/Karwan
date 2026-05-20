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
