/** What Karwan does, where it lives and how to do it, checked against source.
 * Every page, endpoint and tool named here is verified by platformGuide.test.ts,
 * so the assistant cannot cite a screen or API that does not exist. Status is
 * repository behaviour per network; live account truth still comes from tools.
 */
export const GUIDE_REVIEWED_AT = '2026-10-03';

export type GuideStatus = 'testnet' | 'gated' | 'planned';
/// invite: accounts and wallets by invitation. off: built but not enabled on
/// mainnet. planned: not built for mainnet yet.
export type MainnetStatus = 'invite' | 'off' | 'planned';

export interface GuideEntry {
  id: string;
  title: string;
  status: GuideStatus;
  mainnet: MainnetStatus;
  /// Primary screen.
  route: string;
  /// Other screens for this job.
  pages: readonly string[];
  /// `METHOD /path` endpoints the feature runs on.
  api: readonly string[];
  /// Assistant tools that read or act on it.
  tools: readonly string[];
  keywords: string;
  summary: string;
  /// How a person does it in the app, in order.
  steps: readonly string[];
  sources: readonly string[];
}

export const PLATFORM_GUIDE: readonly GuideEntry[] = [
  {
    id: 'signup', title: 'Sign up, Karwan tag and sign in', status: 'testnet', mainnet: 'invite', route: '/start',
    pages: ['/start', '/onboarding', '/waitlist', '/recover/cancel'],
    api: ['GET /api/signup/tag', 'POST /api/signup', 'POST /api/signup/tag', 'POST /api/auth/lookup', 'POST /api/auth/otp/request', 'POST /api/auth/otp/verify'],
    tools: ['get_my_profile'],
    keywords: 'sign up signup register account create join login sign in tag handle username passkey email wallet connect waitlist invite',
    summary: 'One account per person. At sign up you choose a Karwan tag (@handle), then sign in with email (6-digit code), a passkey, or by connecting a wallet. Tags are 3 to 20 characters: lowercase letters, numbers and underscores, starting with a letter. On mainnet, access is by invitation through the waitlist.',
    steps: ['Open /start and choose Sign up.', 'Pick a Karwan tag; availability shows as you type.', 'Continue with email (enter the 6-digit code) or connect a wallet. On mainnet, email accounts also create a passkey.', 'Choose a personal account and accept the terms, then Create account.', 'Accounts made before tags existed are asked once to choose a tag.'],
    sources: ['backend/src/routes/signup.ts', 'backend/src/profile/karwanTag.ts', 'frontend/app/start/page.tsx'],
  },
  {
    id: 'account', title: 'Your wallet home', status: 'testnet', mainnet: 'invite', route: '/account',
    pages: ['/account', '/app', '/profile/wallets', '/profile/agent-funds'],
    api: ['GET /api/balances', 'GET /api/activation/status', 'GET /api/activation/wallets'],
    tools: ['get_my_balance', 'list_bridge_sources'],
    keywords: 'wallet home account balance money usdc agent funds buyer seller agent gas where is my money',
    summary: 'The product shows one wallet and one USDC balance. Behind it are distinct ledgers: the sign-in (identity) wallet, the buyer agent wallet that funds purchases, and the seller agent wallet that receives proceeds. Never add them together without reading them. /account is the money home; /app is the trading home on testnet.',
    steps: ['Open /account to see the balance and the Add money, Send and Request buttons.', 'Agent balances are under /profile/agent-funds.', 'Ask the assistant for a live balance read before moving money.'],
    sources: ['frontend/app/account/page.tsx', 'frontend/app/profile/agent-funds/page.tsx'],
  },
  {
    id: 'deposit', title: 'Add money from any chain', status: 'testnet', mainnet: 'off', route: '/bridge?direction=in',
    pages: ['/bridge', '/account'],
    api: ['GET /api/deposit/address', 'POST /api/bridge/circle-bridge', 'POST /api/bridge/circle-bridge-app-kit', 'POST /api/gateway/deposit', 'GET /api/gateway/balance'],
    tools: ['get_my_deposit_addresses', 'check_top_up_sources', 'propose_top_up', 'list_bridge_sources'],
    keywords: 'deposit add money top up fund receive usdc from ethereum base arbitrum polygon solana exchange other chain bridge cctp gateway address',
    summary: 'Email and passkey accounts on testnet get their own deposit addresses: one address for Ethereum, Base, Arbitrum and Polygon, and a separate Solana address. USDC sent there is moved to the Karwan balance on Arc automatically. Wallet accounts bridge from the wallet they already hold at /bridge. Only USDC is supported. Card and bank top up are not live. On mainnet, deposit addresses are not enabled yet.',
    steps: ['Email or passkey account: open /bridge?direction=in&rail=direct (or Add money on /account) and copy the address for the chain the money is on.', 'Send USDC only, on that chain, to that address. Solana uses its own address.', 'The balance updates when the transfer lands; the record appears in /activity.', 'Wallet account: open /bridge?direction=in, pick the source chain, sign the transfer in your wallet.', 'The assistant can read your addresses (get_my_deposit_addresses) or prepare a top up from a chain where Karwan already holds your USDC.'],
    sources: ['backend/src/money/depositAddresses.ts', 'backend/src/routes/deposit.ts', 'frontend/app/bridge/page.tsx'],
  },
  {
    id: 'send', title: 'Send USDC to a Karwan tag', status: 'testnet', mainnet: 'invite', route: '/send',
    pages: ['/send', '/account'],
    api: ['GET /api/tags/:tag', 'POST /api/cashout/arc-send'],
    tools: ['find_karwan_tag', 'propose_send_to_tag'],
    keywords: 'send pay transfer tag handle @ username friend person another user tip pay someone',
    summary: 'Send USDC on Arc to another person by their Karwan tag (@handle) or an Arc address. The send screen shows the recipient’s name and tag, then pays the address the tag resolves to at the moment you confirm. You cannot send to your own tag. Sends are final once confirmed.',
    steps: ['Open /send, or /send?to=@tag&amount=10 to prefill.', 'Check the name shown for the tag before you confirm.', 'Confirm with your sign-in method (wallet signature or email/passkey account).', 'The send appears in /activity.', 'The assistant can look a tag up and open the send screen filled in; it never sends without your confirmation.'],
    sources: ['backend/src/routes/tags.ts', 'backend/src/profile/tagRecipient.ts', 'frontend/app/send/page.tsx'],
  },
  {
    id: 'paylink', title: 'Payment links (request money)', status: 'testnet', mainnet: 'invite', route: '/request',
    pages: ['/request', '/deposit/request/[token]'],
    api: ['POST /api/deposit/requests', 'GET /api/deposit/requests', 'GET /api/deposit/requests/:token', 'POST /api/deposit/requests/:token/paid', 'POST /api/deposit/requests/:token/cancel'],
    tools: ['create_payment_link', 'list_my_payment_links', 'cancel_payment_link'],
    keywords: 'payment link pay link request money invoice get paid collect charge customer client qr share link receive',
    summary: 'A payment link asks someone to pay you USDC. Amount is optional, a note up to 120 characters is optional, and the link expires after 60 minutes by default (up to 7 days). Anyone with the link can pay: a Karwan user from their balance, a wallet holder from their wallet, or someone without a wallet by sending USDC from an exchange to the address shown. The link is marked paid only when a matching USDC transfer to you is confirmed on Arc. Creating a link moves no money.',
    steps: ['Open /request, enter an amount and a note, and create the link. Or ask the assistant to make one.', 'Share the link or its QR code.', 'The payer opens it and pays; the page shows Paid once the transfer is confirmed.', 'Your links and their status are listed by the assistant (list_my_payment_links); an open link can be cancelled.'],
    sources: ['backend/src/money/depositRequests.ts', 'backend/src/routes/deposit.ts', 'frontend/features/payLink/CreatePayLink.tsx', 'frontend/features/payLink/PayRequestView.tsx'],
  },
  {
    id: 'withdraw', title: 'Withdraw and cash out', status: 'testnet', mainnet: 'invite', route: '/bridge?direction=out',
    pages: ['/bridge', '/cashout/[jobId]', '/profile/agent-funds'],
    api: ['POST /api/bridge/circle-bridge-out', 'POST /api/bridge/web3-bridge-out/quote', 'POST /api/bridge/web3-bridge-out', 'POST /api/cashout/arc-withdraw', 'POST /api/gateway/cash-out'],
    tools: ['propose_cash_out', 'propose_withdraw', 'propose_bridge'],
    keywords: 'withdraw cash out send out move to another chain ethereum base arbitrum optimism polygon solana proceeds payout bank',
    summary: 'Move USDC from Karwan to an address on Ethereum, Base, Arbitrum, Optimism, Polygon or Solana, or move seller proceeds from the seller agent to your wallet. Local bank payout is not live. A submitted transfer is not complete until it lands.',
    steps: ['Open /bridge?direction=out, choose the chain and paste the destination address.', 'Review the amount and fee, then confirm.', 'Seller proceeds: withdraw from the seller agent to your wallet first (/profile/agent-funds) or ask the assistant.', 'Track it in /activity; do not resend while a transfer is pending.'],
    sources: ['backend/src/routes/cashout.ts', 'backend/src/routes/bridge.ts', 'frontend/app/bridge/page.tsx'],
  },
  {
    id: 'market', title: 'Buy, sell and find a counterparty', status: 'testnet', mainnet: 'off', route: '/p2p',
    pages: ['/p2p', '/market', '/listings', '/listings/[id]', '/partners', '/b2b'],
    api: ['GET /api/listings', 'GET /api/jobs/marketplace', 'GET /api/deals/feed'],
    tools: ['search_market', 'get_my_market_activity'],
    keywords: 'karwan platform market buy sell services goods supply clients customers discover find browse search listings offers requests partners sellers suppliers freelancers',
    summary: 'Karwan is an open market for people and businesses. Browse offers at /market, bring a known counterparty, or post a request and let your agent find sellers. Today the market covers services and digital work; trade in physical goods and business trade are coming soon. Deals settle in test USDC on Arc Testnet; deals are not enabled on mainnet yet.',
    steps: ['Browse /market for offers; open one to see the seller and price.', 'To be found by customers, post an offer at /seller.', 'To find a seller, post a request at /buyer; agents bid on it.', 'Business partners are listed at /partners.', 'The assistant can search open offers and requests and open the best matches.'],
    sources: ['README.md', 'frontend/app/p2p/page.tsx', 'frontend/app/market/page.tsx'],
  },
  {
    id: 'sell', title: 'Get customers: post an offer', status: 'testnet', mainnet: 'off', route: '/seller',
    pages: ['/seller', '/supply', '/listings/[id]', '/profile/open-deals'],
    api: ['POST /api/listings', 'GET /api/listings/mine', 'POST /api/listings/:id/edit', 'POST /api/listings/:id/cancel', 'GET /api/agents/seller'],
    tools: ['propose_post_offer', 'propose_take_down', 'get_my_market_activity', 'get_my_skills'],
    keywords: 'get customers find clients sell offer listing advertise service seller agent bid supply grow business more buyers',
    summary: 'Customers find you through your offers and your seller agent. An offer is a public listing with a title, description and asking price in USDC. Your seller agent also reads new requests and bids for you when the work matches your skills; you approve the deal it brings. A completed deal adds to your reputation, which ranks you in later matches. There is no guarantee of orders.',
    steps: ['Post an offer at /seller (businesses: /supply), or ask the assistant to draft one.', 'Add your skills on your profile so your seller agent bids on the right requests.', 'Share your offer link with people you already know.', 'Watch bids and matches at /seller; approve or decline what the agent brings.'],
    sources: ['frontend/app/seller/page.tsx', 'frontend/app/supply/page.tsx', 'backend/src/agents/seller.ts'],
  },
  {
    id: 'direct', title: 'Trade with someone you know', status: 'testnet', mainnet: 'off', route: '/buyer?mode=direct',
    pages: ['/buyer', '/deals/[id]', '/invite/[token]'],
    api: ['POST /api/deals/direct', 'GET /api/deals/direct/:jobId', 'POST /api/deals/direct/:jobId/accept', 'POST /api/deals/direct/:jobId/fund', 'GET /api/deals/invite/:token'],
    tools: ['list_my_deals', 'get_deal_status', 'propose_accept_deal', 'propose_direct_deal'],
    keywords: 'direct deal create form invite email tag terms milestones budget deadline counterparty known',
    summary: 'Fill in the counterparty (Karwan tag, email or address), the work, amount, deadline and payment stages, then review the agreement. Creating the deal does not fund it. After seller agreement, the buyer reviews the current fee and exact total before funding. Selected identity or security-reserve requirements still apply.',
    steps: ['Open /buyer?mode=direct and fill in the deal.', 'Send it; an invited person gets a link to join.', 'The seller agrees or counters.', 'The buyer reviews the exact total and funds the escrow.', 'Work happens on /deals/[id].'],
    sources: ['frontend/features/deals/components/DirectDealForm.tsx', 'backend/src/routes/deals.ts'],
  },
  {
    id: 'matching', title: 'Ask an agent to find a match', status: 'testnet', mainnet: 'off', route: '/buyer',
    pages: ['/buyer', '/jobs/[id]'],
    api: ['POST /api/jobs', 'GET /api/jobs/:jobId/match', 'POST /api/jobs/:jobId/approve-match', 'POST /api/jobs/:jobId/decline-match', 'POST /api/jobs/:jobId/cancel'],
    tools: ['propose_post_request', 'propose_match_decision', 'whats_pending', 'propose_fund_agent'],
    keywords: 'agent matching request offer seller buyer negotiate budget tolerance approval brief form post request auction',
    summary: 'The structured request records what you need, budget, deadline and allowed flexibility. Posting pre-authorises matching within your settings: seller acceptance can trigger buyer-agent funding without another buyer funding click. Price exceptions need buyer approval. Review the spending limit before posting. A request is not a promise of a match.',
    steps: ['Fund your buyer agent first (it pays for matched deals).', 'Post the request at /buyer.', 'Seller agents bid and negotiate within your limits.', 'Approve or decline matches that need you; the deal then opens on /deals/[id].'],
    sources: ['frontend/features/buyer/components/PostJobForm.tsx', 'backend/src/agents/buyer.ts'],
  },
  {
    id: 'delivery', title: 'Delivery, review and payment release', status: 'testnet', mainnet: 'off', route: '/deals/[id]',
    pages: ['/deals/[id]', '/cashout/[jobId]'],
    api: ['POST /api/deals/direct/:jobId/delivered', 'POST /api/deals/direct/:jobId/release', 'POST /api/deals/direct/:jobId/claim', 'POST /api/deals/direct/:jobId/extension/request'],
    tools: ['propose_mark_delivered', 'propose_release', 'get_deal_status'],
    keywords: 'deliver delivery mark delivered review release pay milestone approve work done tracking carrier proceeds',
    summary: 'The seller marks each milestone delivered with a link. Karwan checks every delivered link for safety and against the agreed request; a delivery that may not match pauses the payment while the money stays held, and the seller can send the right link. A passed check does not guarantee quality. The buyer reviews within the window in the terms and releases payment. If more time is needed, the seller can ask for more time to deliver and the buyer can extend the review window, up to the limit in the terms. If a review window ends with no action, the seller may be able to claim the milestone. Proceeds go to the seller agent.',
    steps: ['Seller: open the deal and mark the milestone delivered with the evidence.', 'Buyer: review and release, or ask for an extension or open a dispute.', 'Seller: withdraw proceeds from /cashout/[jobId] or the seller agent.'],
    sources: ['backend/src/routes/deals.ts', 'frontend/app/deals/[id]/page.tsx'],
  },
  {
    id: 'recovery', title: 'Disputes and recovery', status: 'testnet', mainnet: 'off', route: '/docs/disputes',
    pages: ['/docs/disputes', '/deals/[id]', '/legacy'],
    api: ['POST /api/deals/direct/:jobId/dispute/escalate', 'POST /api/deals/direct/:jobId/cancel/propose', 'POST /api/deals/direct/:jobId/appeal'],
    tools: ['get_deal_status', 'whats_pending'],
    keywords: 'silent stuck seller buyer reclaim refund dispute cancellation deadline release recovery legacy old contract',
    summary: 'Recovery depends on whether funding, delivery, a release or a dispute has occurred and on the deployed contract and current timers. Read the specific deal and open its Next step view. If the parties cannot agree a split, each side gives its account within 48 hours by answering three questions on the deal page. The judge reads both accounts, the delivery check on the submitted work and the deal chat, and proposes a split. A reviewer confirms every ruling before any money moves; the judge never moves money itself. A side that gives no account loses. Do not promise an immediate refund, a universal grace period, or recovery without the seller in every disputed state. Never advise paying again or releasing money to unlock a refund. Funds in retired contracts are recovered at /legacy.',
    steps: ['Open the deal; the Next step panel shows what is possible now.', 'Mutual cancel, deadline reclaim and disputes each have their own conditions.', 'Unclear or conflicting records go to human support.'],
    sources: ['backend/src/agents/dealWatcher.ts', 'backend/src/deals/deadlineRecovery.ts', 'frontend/app/docs/disputes/page.tsx'],
  },
  {
    id: 'business', title: 'Business setup and verification', status: 'testnet', mainnet: 'off', route: '/profile/business',
    pages: ['/profile/business', '/profile/business/setup', '/business/verification'],
    api: ['GET /api/workspaces', 'POST /api/workspaces/business', 'POST /api/business/register'],
    tools: ['get_my_workspaces'],
    keywords: 'business company workspace registration verification setup owner',
    summary: 'Adding a business name starts setup; it is not business verification. Complete the business details and submit registration or tax evidence for review. Business and personal verification are separate. Current business workspaces are owner-only; team permissions are planned. Business accounts are not open on mainnet. Business trade is coming soon.',
    steps: ['Open /profile/business/setup and fill in the details.', 'Submit evidence at /business/verification.', 'Read get_my_workspaces for the review status.'],
    sources: ['backend/src/db/workspaces.ts', 'frontend/app/profile/business/page.tsx'],
  },
  {
    id: 'world', title: 'World ID checks', status: 'gated', mainnet: 'off', route: '/profile',
    pages: ['/profile'],
    api: ['GET /api/world-id/status', 'POST /api/world-id/verify'],
    tools: ['get_deal_status'],
    keywords: 'world worldid identity human selfie verification bot scam agentkit agentbook',
    summary: 'High-signal deals can require a selected party to verify with World ID before accepting or funding. Current deal verification uses agreement-bound World ID session/presence checks with a Selfie credential and replay protection. Required checks are not bypassed when unconfigured. This does not prove honesty, business registration, delivery or payment authorization. AgentKit/AgentBook eligibility is a separate integration; never infer registration from a deal proof.',
    steps: ['When a deal requires it, the deal page asks the named party to verify.', 'Verification is bound to that agreement version.'],
    sources: ['backend/src/routes/worldId.ts', 'backend/src/worldid/sessionProof.ts', 'backend/src/deals/highSignalVerification.ts'],
  },
  {
    id: 'cre', title: 'Delivery evidence with Chainlink CRE', status: 'gated', mainnet: 'off', route: '/how-it-works',
    pages: ['/how-it-works', '/deals/[id]'],
    api: ['POST /api/deals/direct/:jobId/evidence/manual-review'],
    tools: ['get_deal_status'],
    keywords: 'chainlink cre evidence delivery github commit pull request receipt oracle delivery check',
    summary: 'CRE checks supported delivery evidence against an agreement; the current focused flow uses GitHub pull requests and commits. Evidence must match the current terms and delivery revision. A request or stored receipt alone is not a verified release decision. If the check stalls, the buyer can choose to review the delivery personally.',
    steps: ['The deal page shows the delivery check on the progress line.', 'If it stalls, the buyer sees Review it myself.'],
    sources: ['backend/src/db/deals.ts', 'frontend/features/deals/evidenceReceipt.ts', 'backend/src/routes/deals.ts'],
  },
  {
    id: 'records', title: 'Activity and receipts', status: 'testnet', mainnet: 'invite', route: '/activity',
    pages: ['/activity', '/activity/all-time'],
    api: ['GET /api/activity/me', 'GET /api/bridge/list'],
    tools: ['recall_activity', 'find_transaction'],
    keywords: 'activity history receipt reference transaction payment settled records pending where did my money go',
    summary: 'Transaction history records requested, pending and completed money movements. A submitted request is not settlement. Missing data is not zero money or proof nothing happened. Account reads are snapshots; explain when chain reconciliation or support is needed.',
    steps: ['Open /activity and find the movement by date or amount.', 'Open it for the reference and status.'],
    sources: ['backend/src/db/activityLog.ts', 'backend/src/assistant/bridgeStanding.ts'],
  },
  {
    id: 'reputation', title: 'Reputation, skills and stake', status: 'testnet', mainnet: 'off', route: '/profile',
    pages: ['/profile', '/stake', '/credit-passport/[address]'],
    api: ['GET /api/reputation', 'GET /api/vault/positions', 'GET /api/yield/me', 'POST /api/yield/claim'],
    tools: ['get_my_reputation', 'get_my_stake', 'get_my_skills', 'propose_stake', 'propose_claim_yield'],
    keywords: 'reputation score tier stake staking yield skills certificate research credit passport',
    summary: 'Reputation reflects completed Karwan deals and has completion and concentration limits. Declared skills are not verified skills. Staking USDC backs your reputation as a security reserve. Any yield distributed to you shows on /stake and can be claimed there; yield is never guaranteed. Reputation is not proof of identity or honesty.',
    steps: ['See your score on /profile; share your public record at /credit-passport/[address].', 'Stake at /stake; claim yield there when available.'],
    sources: ['backend/src/reputation/engine.ts', 'backend/src/verification/skillSummary.ts', 'frontend/app/stake/page.tsx'],
  },
  {
    id: 'finance', title: 'Optional trade finance', status: 'gated', mainnet: 'off', route: '/financier',
    pages: ['/financier', '/financier/factoring/[offerId]', '/financier/po/[lineId]'],
    api: ['GET /api/factoring/mine', 'POST /api/factoring/request', 'GET /api/po-financing/mine', 'GET /api/financier/eligibility'],
    tools: ['get_my_financing'],
    keywords: 'finance financing invoice factoring purchase order financier credit loan advance',
    summary: 'The build includes invoice factoring, purchase-order financing and a financier desk. Access depends on configuration, eligible businesses and the particular Karwan-originated trade. Financing is opt-in, not a guaranteed loan or support for arbitrary external invoices. Do not invent rates or promise approval.',
    steps: ['Eligible accepted invoices show an early-payment option on the deal.', 'Financiers apply and bid at /financier.'],
    sources: ['backend/src/routes/factoring.ts', 'backend/src/db/poFinancing.ts', 'frontend/app/financier/page.tsx'],
  },
  {
    id: 'support', title: 'Settings, notifications and human help', status: 'testnet', mainnet: 'invite', route: '/feedback',
    pages: ['/feedback', '/settings', '/profile', '/profile/contact'],
    api: ['GET /api/settings', 'POST /api/settings', 'GET /api/telegram/status', 'POST /api/telegram/link/start', 'POST /api/support/start'],
    tools: ['get_my_profile'],
    keywords: 'help support ticket feedback settings language notifications telegram theme profile email human',
    summary: 'Use /settings for preferences and language, and /profile for account details and for linking Telegram, which sends deal notifications. Feedback and Talk to a human connect users to support. The assistant cannot read private support tickets, alter verification or act as an administrator. Never request a seed phrase, private key or one-time sign-in code.',
    steps: ['Settings: /settings.', 'Human help: the Talk to a human button in the assistant, or /feedback.'],
    sources: ['frontend/shared/components/AssistantWidget.tsx', 'frontend/app/settings/page.tsx', 'backend/src/routes/telegram.ts'],
  },
  {
    id: 'network', title: 'Testnet and mainnet', status: 'testnet', mainnet: 'invite', route: '/docs/roadmap',
    pages: ['/docs/roadmap', '/waitlist', '/docs/numbers'],
    api: ['GET /api/network/contracts'],
    tools: [],
    keywords: 'mainnet testnet real money test usdc faucet network live invite waitlist when launch',
    summary: 'Testnet is open for trading with test USDC (get some free from the faucet on /profile). Arc mainnet (karwan.site) is live with account and wallet access by invitation through the waitlist: the wallet is open there (balance, send to a tag, payment links) and uses real USDC, and the reputation and business registries are deployed. Mainnet escrow and trading are not enabled yet, so deal pages open on testnet.karwan.site. Test money has no value.',
    steps: ['Testnet: sign up and get test USDC on /profile.', 'Mainnet: join the waitlist at /waitlist.'],
    sources: ['frontend/shared/i18n/messages/docsProduct.ts', 'frontend/app/docs/roadmap/page.tsx'],
  },
  {
    id: 'direction', title: 'Unified reputation, the direction', status: 'planned', mainnet: 'planned', route: '/how-it-works',
    pages: ['/how-it-works', '/docs/reputation'],
    api: [], tools: [],
    keywords: 'what is karwan about mission vision direction unified reputation portable profile other platforms import aggregate talent vetting',
    summary: 'Karwan is building one reputation that travels with a person across platforms, so they do not vet themselves from zero on every new market, job board or region. It starts with Karwan’s market: completed deals are protected in escrow and recorded, and that record is the first input. Agents will work with data the person already owns, only with consent; nothing is leaked, sold or scraped. Partner platforms join once the working model is designed with them, and none is named until an agreement exists. Being built, not live: today reputation comes only from completed Karwan deals.',
    steps: [],
    sources: ['README.md', 'docs/architecture/08-reputation.md', 'docs/reputation-model.md'],
  },
  {
    id: 'roadmap', title: 'Roadmap', status: 'planned', mainnet: 'planned', route: '/docs/roadmap',
    pages: ['/docs/roadmap'],
    api: [], tools: [],
    keywords: 'roadmap future next plan coming soon whatsapp telegram x twitter instagram bot mcp claude codex anywhere mobile app bank payout audit arbiter',
    summary: 'In order, no dates: now, mainnet by invitation through the waitlist; next, deals on mainnet (escrow, deal board and stake contracts); then an arbiter for silent counterparties and an external audit of the money contracts; after that, trade from anywhere: start a protected deal and use your Karwan assistant from the place the trade began (starting with X, then chat apps, and AI tools through an MCP server), plus recurring deals; later, cash out to a local bank account, one country at a time. Also planned: mobile app after mainnet, paid data through x402, file delivery inside a deal, more languages. None of these is live today; Telegram currently sends deal notifications only.',
    steps: [],
    sources: ['frontend/shared/i18n/messages/docsProduct.ts', 'frontend/app/docs/roadmap/page.tsx'],
  },
];

export function lookupPlatformGuide(q = '', liveOnly = false) {
  const terms = q.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((term) => term.length > 2) ?? [];
  const ranked = PLATFORM_GUIDE.filter((entry) => !liveOnly || entry.status === 'testnet')
    .map((entry) => ({ entry, score: terms.filter((term) => `${entry.title} ${entry.keywords}`.toLowerCase().includes(term)).length }))
    .filter(({ score }) => !terms.length || score > 0)
    .sort((a, b) => b.score - a.score);
  return { reviewedAt: GUIDE_REVIEWED_AT, facts: ranked.slice(0, 6).map(({ entry }) => entry),
    note: 'Checked repository guidance, not live deployment or account evidence. Follow these steps and pages exactly; do not add screens, buttons or endpoints that are not listed. No match means unknown, not proof the feature is absent. Use short English topic keywords for retrieval; answer in the user’s language.' };
}
