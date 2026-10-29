import { routeTitlesCopy, type RouteTitleKey } from '@/shared/i18n/messages/routeTitles';

export const SITE_TITLE = 'Karwan · one reputation, starting with an open market';

/// Pages whose title is set on the server, with the record or offer it shows.
export const SERVER_TITLED = [/^\/r\/[^/]+$/, /^\/credit-passport\/[^/]+$/, /^\/attested\/[^/]+$/, /^\/feedback$/];

export const EXACT: Record<string, RouteTitleKey> = {
  '/connect/telegram': 'connectTelegram',
  '/account': 'account',
  '/activity': 'activity',
  '/assistant': 'assistant',
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
  '/profile': 'profile',
  '/profile/agent-funds': 'agentFunds',
  '/profile/business': 'business',
  '/profile/business/setup': 'businessSetup',
  '/profile/contact': 'contact',
  '/profile/edit': 'editProfile',
  '/profile/open-deals': 'openDeals',
  '/profile/setup': 'profileSetup',
  '/profile/wallets': 'wallets',
  '/profile/ways': 'ways',
  '/recover/cancel': 'cancelRecovery',
  '/request': 'requestMoney',
  '/research': 'research',
  '/seller': 'seller',
  '/send': 'send',
  '/settings': 'settings',
  '/setup': 'setUp',
  '/guarantee': 'guarantee',
  '/stake': 'guarantee',
  '/start': 'signIn',
  '/terms': 'terms',
  '/privacy': 'privacy',
  '/terms/chat': 'chatTerms',
  '/verify/person': 'personCheck',
  '/waitlist': 'waitlist',
  '/x402': 'dataApi',
  '/developers': 'developers',
  '/financier': 'finance',
};

export const PATTERNS: [RegExp, RouteTitleKey][] = [
  [/^\/cashout\/[^/]+$/, 'cashout'],
  [/^\/developers\/[^/]+$/, 'developers'],
  [/^\/deals\/[^/]+$/, 'deal'],
  [/^\/deposit\/request\/[^/]+$/, 'paymentRequest'],
  [/^\/financier\/factoring\/[^/]+$/, 'financingOffer'],
  [/^\/financier\/po\/[^/]+$/, 'poFinancing'],
  [/^\/invite\/[^/]+$/, 'invite'],
  [/^\/jobs\/[^/]+$/, 'request'],
  [/^\/listings\/[^/]+$/, 'offer'],
  [/^\/messages(\/[^/]+)?$/, 'messages'],
  [/^\/newsletter\/[^/]+$/, 'newsletter'],
];

/// The title a page carries in the tab: a route title, 'server' when the page
/// sets its own, or null for the site title (the landing page, the console).
export function routeTitleKey(pathname: string, search = ''): RouteTitleKey | 'server' | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (SERVER_TITLED.some((re) => re.test(path))) return 'server';
  if (path === '/start' && new URLSearchParams(search).get('mode') === 'signup') return 'signUp';
  if (path === '/start' && new URLSearchParams(search).get('step') === 'about') return 'setUp';
  return EXACT[path] ?? PATTERNS.find(([re]) => re.test(path))?.[1] ?? null;
}

export function documentTitle(title: string): string {
  return `${title} · Karwan`;
}

/// Runs before the page draws, so the tab never shows the site name while a
/// page loads: the same route list and titles, in the reader's language from
/// the karwan-locale cookie. RouteTitle takes over after hydration.
export function titlePrepaintScript(): string {
  const data = {
    s: SERVER_TITLED.map((re) => re.source),
    e: EXACT,
    p: PATTERNS.map(([re, key]) => [re.source, key]),
    t: routeTitlesCopy,
  };
  return `(function(){try{var d=${JSON.stringify(data).replace(/</g, '\\u003c')};var p=location.pathname;if(p.length>1)p=p.replace(/\\/+$/,'');for(var i=0;i<d.s.length;i++)if(new RegExp(d.s[i]).test(p))return;var k=p==='/start'&&/[?&]mode=signup(&|$)/.test(location.search)?'signUp':d.e[p];for(var j=0;!k&&j<d.p.length;j++)if(new RegExp(d.p[j][0]).test(p))k=d.p[j][1];if(!k)return;var m=document.cookie.match(/(?:^|; )karwan-locale=([^;]+)/);var l=m?decodeURIComponent(m[1]):'en';var t=(d.t[l]||d.t.en)[k];if(t)document.title=t+' · Karwan';}catch(e){}})();`;
}
