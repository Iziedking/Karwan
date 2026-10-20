import type { RouteTitleKey } from '@/shared/i18n/messages/routeTitles';

export const SITE_TITLE = 'Karwan · one reputation, starting with an open market';

/// Pages whose title is set on the server, with the record or offer it shows.
const SERVER_TITLED = [/^\/r\/[^/]+$/, /^\/credit-passport\/[^/]+$/, /^\/attested\/[^/]+$/, /^\/feedback$/, /^\/financier$/];

const EXACT: Record<string, RouteTitleKey> = {
  '/connect/telegram': 'connectTelegram',
  '/account': 'account',
  '/activity': 'activity',
  '/activity/all-time': 'activityAllTime',
  '/app': 'app',
  '/brand': 'brand',
  '/bridge': 'bridge',
  '/business/verification': 'businessVerification',
  '/buyer': 'buyer',
  '/docs': 'docs',
  '/docs/agents': 'docsAgents',
  '/docs/bridge': 'docsBridge',
  '/docs/deals': 'docsDeals',
  '/docs/disputes': 'docsDisputes',
  '/docs/escrow': 'docsEscrow',
  '/docs/faq': 'docsFaq',
  '/docs/numbers': 'docsNumbers',
  '/docs/reputation': 'docsReputation',
  '/docs/roadmap': 'docsRoadmap',
  '/how-it-works': 'howItWorks',
  '/legacy': 'legacy',
  '/listings': 'offers',
  '/market': 'market',
  '/newsletter': 'newsletter',
  '/onboarding': 'onboarding',
  '/profile': 'profile',
  '/profile/agent-funds': 'agentFunds',
  '/profile/business': 'business',
  '/profile/business/setup': 'businessSetup',
  '/profile/contact': 'contact',
  '/profile/edit': 'editProfile',
  '/profile/open-deals': 'openDeals',
  '/profile/setup': 'profileSetup',
  '/profile/wallets': 'wallets',
  '/recover/cancel': 'cancelRecovery',
  '/request': 'requestMoney',
  '/research': 'research',
  '/seller': 'seller',
  '/send': 'send',
  '/settings': 'settings',
  '/setup': 'setUp',
  '/stake': 'stake',
  '/start': 'signIn',
  '/terms': 'terms',
  '/terms/chat': 'chatTerms',
  '/verify/person': 'personCheck',
  '/waitlist': 'waitlist',
  '/x402': 'dataApi',
  '/developers': 'developers',
};

const PATTERNS: [RegExp, RouteTitleKey][] = [
  [/^\/cashout\/[^/]+$/, 'cashout'],
  [/^\/deals\/[^/]+$/, 'deal'],
  [/^\/deposit\/request\/[^/]+$/, 'paymentRequest'],
  [/^\/financier\/factoring\/[^/]+$/, 'financingOffer'],
  [/^\/financier\/po\/[^/]+$/, 'poFinancing'],
  [/^\/invite\/[^/]+$/, 'invite'],
  [/^\/jobs\/[^/]+$/, 'request'],
  [/^\/listings\/[^/]+$/, 'offer'],
  [/^\/messages\/[^/]+$/, 'messages'],
  [/^\/newsletter\/[^/]+$/, 'newsletter'],
];

/// The title a page carries in the tab: a route title, 'server' when the page
/// sets its own, or null for the site title (the landing page, the console).
export function routeTitleKey(pathname: string): RouteTitleKey | 'server' | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (SERVER_TITLED.some((re) => re.test(path))) return 'server';
  return EXACT[path] ?? PATTERNS.find(([re]) => re.test(path))?.[1] ?? null;
}

export function documentTitle(title: string): string {
  return `${title} · Karwan`;
}
