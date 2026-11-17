/// Every page a person can open, and every part of a page Aman can point at
/// (view 57, 17 Nov: Aman is the only guide). The guide text the model reads is
/// built from this list, and guidePages.test.ts fails when a page, a navigate
/// destination or a `data-guide` mark is missing from it.

export interface GuidePage {
  path: string;
  purpose: string;
  can: string[];
  /// Point id (the page's `data-guide` value) to what that part is.
  points: Record<string, string>;
}

export const GUIDE_PAGES: GuidePage[] = [
  // Signed-in home and money.
  {
    path: '/app', purpose: 'Home: the balance, the next step to set up, and the deals that need you.',
    can: ['add money, send, request a payment or withdraw', 'follow the next setup step', 'open a deal that needs you'],
    points: {
      'home-money': 'Your balance with Add money, Send, Request payment and Withdraw under it.',
      'home-start': 'The next step to finish setting up your account.',
      'home-deals': 'Deals that need you and the ones on their way.',
      'home-faucet': 'Free test USDC to try Karwan on testnet.',
    },
  },
  {
    path: '/account', purpose: 'Money: your balance, where it sits, and your agent’s money and weekly limit.',
    can: ['add money, send or withdraw', 'see what is held in your deals', 'top up your agent or change its limit'], points: {},
  },
  { path: '/account/agent', purpose: 'Your agent’s money: top up, withdraw and its weekly limit for checks.', can: ['top up', 'withdraw to your wallet', 'change the weekly limit'], points: {} },
  { path: '/account/guarantee', purpose: 'Opens your savings pocket from the money page.', can: ['add to the pocket', 'take money out'], points: {} },
  { path: '/add', purpose: 'Add money from a wallet, an exchange or another network.', can: ['pick where the money comes from', 'add it in one step'], points: {} },
  { path: '/send', purpose: 'Send money to a Karwan tag.', can: ['send to a tag', 'add a note'], points: {} },
  { path: '/request', purpose: 'Ask for money with a payment link.', can: ['make a payment link', 'see links you made'], points: {} },
  { path: '/withdraw', purpose: 'Withdraw money to an outside wallet or cash out.', can: ['withdraw to a wallet', 'cash out'], points: {} },
  {
    path: '/bridge', purpose: 'Move USDC between networks and see your deposit addresses.',
    can: ['bring USDC in from another network', 'send USDC out to another network', 'see past moves'],
    points: {
      'bridge-rails': 'The ways to move money: pick one to start.',
      'bridge-source': 'Where the money comes from.',
      'bridge-amount': 'How much to move.',
      'bridge-submit': 'The button that starts the move once you check it.',
      'bridge-out': 'Send USDC from Karwan to another network.',
      'bridge-gateway': 'Your Transfer balance, ready to move to Arc in one step.',
      'bridge-address': 'Your own address to send USDC to from an exchange or a wallet.',
      'bridge-history': 'Your past moves between networks.',
    },
  },
  {
    path: '/pocket', purpose: 'Your savings pocket: money set aside that earns and can back a deal.',
    can: ['add to the pocket', 'take money out after the waiting period'],
    points: {
      guarantee: 'Your savings pocket and what it earns.',
      'guarantee-facts': 'How much is in the pocket, backing deals and free.',
      'guarantee-actions': 'Add to pocket and Take out.',
    },
  },
  { path: '/cashout/[jobId]', purpose: 'Cash out what a deal paid you.', can: ['cash out a deal'], points: {} },
  { path: '/deposit/request/[token]', purpose: 'Pay a payment link someone sent you.', can: ['pay the link'], points: {} },
  {
    path: '/activity', purpose: 'Everything that happened on your account, with receipts.',
    can: ['see money moves and deal events', 'open a receipt'],
    points: {
      'activity-stats': 'Totals for your account.',
      'activity-money': 'Money in and out.',
      'activity-register': 'Your record of finished deals.',
      'activity-stream': 'Everything that happened, newest first.',
    },
  },
  { path: '/legacy', purpose: 'Earlier deals from the previous escrow, to finish or withdraw.', can: ['take a step on an earlier deal'], points: {} },

  // The market and deals.
  {
    path: '/market', purpose: 'The open market: offers to buy from and requests to sell to.',
    can: ['search offers', 'switch between buying and selling', 'post what you sell'],
    points: {
      'market-switch': 'Switch between Buy and Sell.',
      'market-search': 'Search for what you need.',
      'market-categories': 'Pick a kind of work or goods.',
      'market-new': 'The newest offers on Karwan.',
      'market-sell': 'List what you sell.',
    },
  },
  { path: '/listings/[id]', purpose: 'One offer: photos, price, the seller and Review order.', can: ['order it', 'message the seller'], points: {} },
  { path: '/order/[listingId]', purpose: 'Review your order and pay into escrow.', can: ['check the price and fee', 'pay'], points: {} },
  {
    path: '/jobs/[id]', purpose: 'One request and every offer on it.',
    can: ['see offers', 'pick an offer'],
    points: {
      'job-bids': 'Every offer on this request.',
      'job-shortlist': 'The sellers your agent picked, best first.',
    },
  },
  {
    path: '/buyer', purpose: 'Post what you need, or start a deal with someone you know.',
    can: ['post a request', 'start a direct deal'],
    points: {
      'buyer-brief': 'Say what you need.',
      'buyer-budget': 'The most you will pay.',
      'buyer-deadline': 'When you need it.',
      'buyer-tolerance': 'How far your agent may go above the price.',
      'buyer-submit': 'Post the request once it reads right.',
    },
  },
  {
    path: '/seller', purpose: 'List what you sell so buyers and their agents find you.',
    can: ['post an offer', 'see your offers on requests'],
    points: {
      'seller-listing': 'What you sell, in your words.',
      'seller-price': 'Your price.',
      'seller-floor': 'The lowest price your agent may accept.',
      'seller-window': 'How long the offer stays up.',
      'seller-submit': 'Post the offer.',
    },
  },
  { path: '/deals', purpose: 'Your deals: needs you, active and ended.', can: ['open a deal'], points: {} },
  { path: '/deals/[id]', purpose: 'One deal: where it stands, the money in escrow and your next move.', can: ['take the next step', 'message the other side', 'open a dispute'], points: {} },
  { path: '/work/[id]', purpose: 'One piece of hourly work and its hours.', can: ['log or approve hours'], points: {} },
  { path: '/work/new', purpose: 'Start hourly work with someone.', can: ['set the rate and hours'], points: {} },
  { path: '/work/requests/new', purpose: 'Post a request for hourly work.', can: ['post it'], points: {} },
  { path: '/work/requests/[id]', purpose: 'One hourly work request and its offers.', can: ['pick an offer'], points: {} },
  { path: '/contests/new', purpose: 'Start a contest with the prize held by Karwan.', can: ['set the brief and prize'], points: {} },
  { path: '/contests/[id]', purpose: 'One contest: the brief, the prize and the entries.', can: ['enter', 'pick a winner'], points: {} },
  { path: '/find/[id]', purpose: 'People your agent found for a need.', can: ['pick who to talk to'], points: {} },
  { path: '/find/pitch/[id]', purpose: 'A pitch an agent sent you about a need.', can: ['answer the pitch'], points: {} },
  { path: '/agent-jobs', purpose: 'Jobs your agent is working on.', can: ['see what it is doing'], points: {} },
  { path: '/agent-jobs/[ref]', purpose: 'One job your agent is working on.', can: ['follow it', 'stop it'], points: {} },
  { path: '/agent-jobs/release/[token]', purpose: 'Approve paying for a job your agent did, from a link.', can: ['release the payment'], points: {} },
  { path: '/messages', purpose: 'Your messages with other people.', can: ['open a conversation'], points: {} },
  { path: '/messages/[tag]', purpose: 'Your messages with one person.', can: ['write to them'], points: {} },
  {
    path: '/financier', purpose: 'The financier desk: fund deals early and see what you are owed.',
    can: ['offer finance on a deal', 'see your positions'],
    points: {
      'financier-filters': 'Narrow the deals you can finance.',
      'financier-deal': 'A deal you can finance.',
      'financier-offer': 'Make your finance offer.',
      'financier-passport': 'The seller’s trade record.',
      'financier-positions': 'What you financed and are still owed.',
    },
  },
  { path: '/financier/factoring/[offerId]', purpose: 'One early payment offer on an invoice.', can: ['accept or decline'], points: {} },
  { path: '/financier/po/[lineId]', purpose: 'One purchase finance line.', can: ['see its terms'], points: {} },
  { path: '/credit-passport/[address]', purpose: 'A business’s trade record.', can: ['read the record'], points: {} },
  { path: '/attested/[id]', purpose: 'A deal recorded with proof on Arc.', can: ['check the proof'], points: {} },

  // Profile, settings and help.
  {
    path: '/profile', purpose: 'Your profile: who you are, your wallets and your record.',
    can: ['edit your details', 'see your wallets', 'get test USDC'],
    points: {
      'profile-identity': 'Your name, tag and photo.',
      'profile-wallets': 'Your wallets and your agents’ wallets.',
      'profile-faucet': 'Free test USDC on testnet.',
      'profile-preferences': 'How you like to deal.',
      'profile-business-verification': 'Check your business.',
    },
  },
  { path: '/profile/edit', purpose: 'Change your name, bio and photo.', can: ['edit and save'], points: {} },
  { path: '/profile/setup', purpose: 'What your agent does for you and how far it may go.', can: ['tell your agent about your work', 'set what it may do alone'], points: {} },
  { path: '/profile/sources', purpose: 'Where your reputation comes from.', can: ['add a source'], points: { 'profile-reputation': 'The places your record comes from.' } },
  { path: '/profile/wallets', purpose: 'Your wallets and the money in each.', can: ['see each wallet'], points: {} },
  { path: '/profile/contact', purpose: 'How Karwan reaches you: email or Telegram.', can: ['connect Telegram', 'change your email'], points: {} },
  { path: '/profile/security', purpose: 'Sign-in and security.', can: ['manage passkeys and devices'], points: {} },
  { path: '/profile/ways', purpose: 'The way you deal: prices, payment and delivery.', can: ['change your usual terms'], points: {} },
  { path: '/profile/business', purpose: 'Your business profile.', can: ['edit business details'], points: {} },
  { path: '/profile/business/setup', purpose: 'Set up your business on Karwan.', can: ['add the business'], points: {} },
  { path: '/profile/help', purpose: 'Help: ask a person on the Karwan team.', can: ['open a case', 'see your cases'], points: {} },
  { path: '/profile/help/[ref]', purpose: 'One help case and its replies.', can: ['reply'], points: {} },
  { path: '/business/verification', purpose: 'Check your business with a document.', can: ['send the document'], points: {} },
  { path: '/verify/person', purpose: 'Prove you are a real person with World ID.', can: ['check with World ID'], points: {} },
  { path: '/settings', purpose: 'Settings: language, theme, sounds, alerts, your agent and what Karwan remembers.', can: ['change a setting'], points: {} },
  { path: '/setup', purpose: 'The questions about you that set up your agents.', can: ['answer or change an answer'], points: {} },
  { path: '/start', purpose: 'Sign up or sign in.', can: ['make an account', 'sign in'], points: {} },
  { path: '/connect/telegram', purpose: 'Connect your Karwan assistant on Telegram.', can: ['link Telegram'], points: {} },
  { path: '/pair/[token]', purpose: 'Link a device or app to your account from a code.', can: ['approve the link'], points: {} },
  { path: '/invite/[token]', purpose: 'An invitation to Karwan or to a deal.', can: ['accept it'], points: {} },
  { path: '/recover/cancel', purpose: 'Stop an account recovery you did not ask for.', can: ['cancel it'], points: {} },
  { path: '/assistant', purpose: 'Talk to Aman, your assistant.', can: ['ask anything', 'confirm a card'], points: {} },
  { path: '/feedback', purpose: 'Send the team your feedback.', can: ['write and send'], points: {} },
  { path: '/r/[tag]', purpose: 'A person’s public record by their tag.', can: ['read their record'], points: {} },

  // Public pages.
  { path: '/', purpose: 'Karwan’s front page.', can: ['learn what Karwan is', 'sign up'], points: {} },
  { path: '/how-it-works', purpose: 'How a protected deal works.', can: ['read it'], points: {} },
  { path: '/docs', purpose: 'Karwan’s guides.', can: ['open a guide'], points: {} },
  { path: '/docs/agents', purpose: 'How your agent works.', can: ['read it'], points: {} },
  { path: '/docs/bridge', purpose: 'How moving money between networks works.', can: ['read it'], points: {} },
  { path: '/docs/deals', purpose: 'How deals work.', can: ['read it'], points: {} },
  { path: '/docs/disputes', purpose: 'How disputes work.', can: ['read it'], points: {} },
  { path: '/docs/escrow', purpose: 'How escrow holds the money.', can: ['read it'], points: {} },
  { path: '/docs/faq', purpose: 'Questions people ask.', can: ['read it'], points: {} },
  { path: '/docs/numbers', purpose: 'Karwan’s numbers on chain.', can: ['read them'], points: {} },
  { path: '/docs/reputation', purpose: 'How reputation is worked out.', can: ['read it'], points: {} },
  { path: '/docs/roadmap', purpose: 'What comes next, in order.', can: ['read it'], points: {} },
  { path: '/developers', purpose: 'For developers: building on Karwan.', can: ['read the articles'], points: {} },
  { path: '/developers/[slug]', purpose: 'One developer article.', can: ['read it'], points: {} },
  { path: '/x402', purpose: 'The paid record API for agents.', can: ['read how it works'], points: {} },
  { path: '/newsletter', purpose: 'Karwan’s newsletter.', can: ['read an issue'], points: {} },
  { path: '/newsletter/[slug]', purpose: 'One newsletter issue.', can: ['read it'], points: {} },
  { path: '/research', purpose: 'A five question survey on trust online.', can: ['answer it'], points: {} },
  { path: '/waitlist', purpose: 'Join the mainnet waitlist.', can: ['join'], points: {} },
  { path: '/privacy', purpose: 'Privacy notice.', can: ['read it'], points: {} },
  { path: '/terms', purpose: 'Terms of use.', can: ['read them'], points: {} },
  { path: '/terms/chat', purpose: 'Terms for the chat assistant.', can: ['read them'], points: {} },
];

/// Pages a person can reach that Aman does not guide, each with why.
export const NOT_GUIDED: Record<string, string> = {
  '/activity/all-time': 'Redirects to Activity.',
  '/guarantee': 'Redirects to the savings pocket.',
  '/stake': 'Redirects to the savings pocket.',
  '/profile/agent-funds': 'Redirects to the agent money page.',
  '/profile/devices': 'Redirects to security.',
  '/profile/open-deals': 'Redirects to Deals.',
  '/profile/theme': 'Redirects to Settings.',
  '/brand': 'The brand kit for press, not part of using Karwan.',
};

/// `data-guide` marks in components no page renders today, so they are not points.
export const UNMOUNTED_MARKS: Record<string, string> = {
  'biz-book': 'BusinessHome.tsx is not rendered by any page.',
  'biz-desk': 'BusinessHome.tsx is not rendered by any page.',
  'biz-verify': 'BusinessHome.tsx is not rendered by any page.',
  'home-activity': 'OnChainProofBand.tsx only renders inside BusinessHome.tsx, which no page renders.',
};

export function pageOfPoint(id: string): string | null {
  return GUIDE_PAGES.find((p) => id in p.points)?.path ?? null;
}

/// Whether a link opens the page `pattern` names (`[x]` is one path segment).
export function pathMatches(pattern: string, href: string): boolean {
  const path = href.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';
  const want = pattern.split('/');
  const got = path.split('/');
  return want.length === got.length && want.every((part, i) => /^\[.+\]$/.test(part) ? got[i]!.length > 0 : part === got[i]);
}

export function guidePagesText(): string {
  return GUIDE_PAGES.map((p) => {
    const points = Object.entries(p.points).map(([id, what]) => `${id} (${what})`).join('; ');
    return `- ${p.path}: ${p.purpose} You can ${p.can.join(', ')}.${points ? ` Points: ${points}` : ''}`;
  }).join('\n');
}
