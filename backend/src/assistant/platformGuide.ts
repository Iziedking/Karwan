/** What Karwan does, where it lives and how to do it, checked against source.
 * Every page, endpoint and tool named here is verified by platformGuide.test.ts,
 * so the assistant cannot cite a screen or API that does not exist. Status is
 * repository behaviour per network; live account truth still comes from tools.
 */
export const GUIDE_REVIEWED_AT = '2026-10-18';

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
    summary: 'One account per person. At sign up you choose a Karwan tag (@handle), then sign in with email (6-digit code), a passkey, or by connecting a wallet. Tags are 3 to 20 characters: lowercase letters, numbers and underscores, starting with a letter. On mainnet, access is by invitation through the waitlist, which emails a 6-digit code; one email gets at most 4 codes in 15 minutes, and after too many tries the page asks you to wait a few minutes.',
    steps: ['Open /start and choose Sign up.', 'Pick a Karwan tag; availability shows as you type.', 'Continue with email (enter the 6-digit code) or connect a wallet. On mainnet, email accounts also create a passkey.', 'Choose a personal account and accept the terms, then Create account.', 'Accounts made before tags existed are asked once to choose a tag.', 'Signing in where a passkey cannot be reached (another device, an embedded browser): on testnet choose Use an email code instead on the passkey screen; on mainnet the passkey holds the wallet, so use account recovery.'],
    sources: ['backend/src/routes/signup.ts', 'backend/src/profile/karwanTag.ts', 'frontend/app/start/page.tsx'],
  },
  {
    id: 'account', title: 'Your wallet home', status: 'testnet', mainnet: 'invite', route: '/account',
    pages: ['/account', '/app', '/setup', '/profile/wallets', '/profile/agent-funds'],
    api: ['GET /api/balances', 'GET /api/money/balance', 'POST /api/setup/preview', 'POST /api/setup/save', 'GET /api/activation/status', 'GET /api/activation/wallets'],
    tools: ['get_my_balance', 'list_bridge_sources', 'get_first_trade_steps', 'set_up_my_agents'],
    keywords: 'wallet home account balance money usdc agent funds buyer seller agent gas where is my money get started first trade first deal what next how do i start',
    summary: 'The product shows one wallet and one USDC balance. Behind it are distinct ledgers: the sign-in (identity) wallet, the buyer agent wallet that funds purchases, and the seller agent wallet that receives proceeds. Never add them together without reading them. /account is the money home: the total balance, then where it sits (in your wallet on Arc, on other chains, with your agents for buying and for selling), and any stake below it, locked and not part of the total. Picking a wallet there shows its own actions as buttons: your wallet adds money, withdraws, sends to someone and makes a payment request; the buying agent tops up from your wallet or moves money back; the selling agent moves earnings to your wallet or tops up. get_my_balance returns the same figures. /app is the trading home on testnet. Until their first deal finishes, Home shows Your first trade: agent wallets active, add USDC (on testnet this opens the faucet for free test USDC first, with adding from another wallet beside it), connect Telegram, start a deal (I want to buy, I want to sell, I already have a buyer or seller), finish it; each step ticks itself, and get_first_trade_steps returns the same list. After agent wallets activate, Set up my Karwan (/setup) asks what they want Karwan to do (get paid for work, sell products, buy or hire, run business deals, build a record) and only the questions those need: what they do, usual price and speed, what they buy, business name, where they work, whether they have clients or want Karwan to find them, whether the agent offers on its own or asks first, how to reach them, where they are. The answers become the settings their agents use after they confirm the summary (Here is your Karwan). set_up_my_agents does the same from a conversation, and changes one answer at a time.',
    steps: ['Open /account to see the balance and the Add money, Send and Request buttons.', 'Agent balances are under /profile/agent-funds.', 'Ask the assistant for a live balance read before moving money.'],
    sources: ['frontend/app/account/page.tsx', 'frontend/app/profile/agent-funds/page.tsx'],
  },
  {
    id: 'deposit', title: 'Add money from any chain', status: 'testnet', mainnet: 'off', route: '/bridge?direction=in',
    pages: ['/bridge', '/account'],
    api: ['GET /api/deposit/address', 'POST /api/bridge/circle-bridge', 'POST /api/bridge/circle-bridge-app-kit', 'POST /api/gateway/deposit', 'GET /api/gateway/balance'],
    tools: ['get_my_deposit_addresses', 'check_top_up_sources', 'propose_top_up', 'list_bridge_sources'],
    keywords: 'deposit add money top up fund receive usdc from ethereum base arbitrum polygon solana exchange other chain bridge cctp gateway address',
    summary: 'Add money opens with one question, How do you want to add money?: an email account picks free test USDC (testnet) or sending from an app or exchange to its Karwan address; a wallet account picks moving USDC from its wallet, sending from an exchange to its wallet address on Arc, or free test USDC. Card or bank shows as coming soon. Email and passkey accounts on testnet get their own deposit addresses: one address for Ethereum, Base, Arbitrum and Polygon, and a separate Solana address. USDC sent there is moved to the Karwan balance on Arc automatically. Wallet accounts bridge from the wallet they already hold at /bridge. Only USDC is supported. Card and bank top up are not live. On mainnet, deposit addresses are not enabled yet.',
    steps: ['Email or passkey account: open /bridge?direction=in&rail=direct (or Add money on /account) and copy the address for the chain the money is on.', 'Send USDC only, on that chain, to that address. Solana uses its own address.', 'The balance updates when the transfer lands; the record appears in /activity.', 'Wallet account: open /bridge?direction=in, pick the source chain, sign the transfer in your wallet.', 'The assistant can read your addresses (get_my_deposit_addresses) or prepare a top up from a chain where Karwan already holds your USDC.'],
    sources: ['backend/src/money/depositAddresses.ts', 'backend/src/routes/deposit.ts', 'frontend/app/bridge/page.tsx'],
  },
  {
    id: 'send', title: 'Send USDC to a Karwan tag', status: 'testnet', mainnet: 'invite', route: '/send',
    pages: ['/send', '/account'],
    api: ['GET /api/tags/:tag', 'POST /api/cashout/arc-send'],
    tools: ['find_karwan_tag', 'propose_send_to_tag'],
    keywords: 'send pay transfer tag handle @ username friend person another user tip pay someone',
    summary: 'Send USDC on Arc to another person by their Karwan tag (@handle) or an Arc address. The send screen shows the recipient’s name and tag, then pays the address the tag resolves to at the moment you confirm. You cannot send to your own tag. A web3 wallet account can also send USDC it pooled from other networks: when its wallet alone is short, the missing amount first moves from its own pool into the wallet, which it confirms in its wallet, then the send goes out. Email and passkey accounts send from their wallet; money they add from other networks arrives there. Sends are final once confirmed.',
    steps: ['Open /send, or /send?to=@tag&amount=10 to prefill.', 'Check the name shown for the tag before you confirm.', 'Confirm with your sign-in method (wallet signature or email/passkey account).', 'The send appears in /activity.', 'The assistant can look a tag up and open the send screen filled in; it never sends without your confirmation.'],
    sources: ['backend/src/routes/tags.ts', 'backend/src/profile/tagRecipient.ts', 'frontend/app/send/page.tsx'],
  },
  {
    id: 'paylink', title: 'Payment links (request money)', status: 'testnet', mainnet: 'invite', route: '/request',
    pages: ['/request', '/deposit/request/[token]'],
    api: ['POST /api/deposit/requests', 'GET /api/deposit/requests', 'GET /api/deposit/requests/:token', 'POST /api/deposit/requests/:token/paid', 'POST /api/deposit/requests/:token/receive', 'POST /api/deposit/requests/:token/cancel'],
    tools: ['create_payment_link', 'list_my_payment_links', 'cancel_payment_link'],
    keywords: 'payment link pay link request money invoice get paid collect charge customer client qr share link receive',
    summary: 'A payment link asks someone to pay you USDC. Amount is optional, a note up to 120 characters is optional, and links made on /request or by the assistant last 7 days. Anyone with the link can pay, with or without a Karwan account: from their Karwan balance, from a connected wallet (Arc first, or Ethereum, Base, Arbitrum, Polygon and more), or with Send from any chain, which shows the request\'s own address for EVM chains and for Solana so they can pay from an exchange or any wallet. Money sent that way is moved to your own address on Arc automatically, whether you signed up with email or with your own wallet. Sending less counts as part payment and the page shows what is left; sending more marks the link paid and the extra is yours, there is no automatic refund. Card, bank and USSD payments are not offered. After paying, a payer with an account goes to their home and a new payer is offered to create one. Creating a link moves no money.',
    steps: ['Open /request, enter an amount and a note, and create the link. Or ask the assistant to make one.', 'Share the link or its QR code.', 'The payer opens it and picks how to pay: their balance, a wallet, or Send from any chain (copy the address, send the exact amount); the page follows the money and shows Paid when it reaches you on Arc.', 'Your links and their status are listed by the assistant (list_my_payment_links); an open link can be cancelled.'],
    sources: ['backend/src/money/depositRequests.ts', 'backend/src/routes/deposit.ts', 'frontend/features/payLink/CreatePayLink.tsx', 'frontend/features/payLink/PayRequestView.tsx', 'backend/src/money/requestReceiving.ts', 'frontend/features/payLink/AnyChainPay.tsx'],
  },
  {
    id: 'withdraw', title: 'Withdraw and cash out', status: 'testnet', mainnet: 'invite', route: '/bridge?direction=out',
    pages: ['/bridge', '/cashout/[jobId]', '/profile/agent-funds'],
    api: ['POST /api/bridge/circle-bridge-out', 'POST /api/bridge/web3-bridge-out/quote', 'POST /api/bridge/web3-bridge-out', 'POST /api/cashout/arc-withdraw', 'POST /api/gateway/cash-out'],
    tools: ['propose_cash_out', 'propose_withdraw', 'propose_bridge'],
    keywords: 'withdraw cash out send out move to another chain ethereum base arbitrum optimism polygon solana proceeds payout bank',
    summary: 'Withdraw opens with one question, Where should the money go?: to a wallet you own (or your connected wallet), to someone on Karwan, or a bank account, which shows as coming soon. Move USDC from Karwan to an address on Ethereum, Base, Arbitrum, Optimism, Polygon or Solana, or cash out the earnings of a deal on its Cash out page: it starts from the seller agent wallet the escrow paid, and you can switch to the buyer agent or your main wallet, then move the money to your Karwan balance or send it to another wallet or chain. Local bank payout is not live. A submitted transfer is not complete until it lands.',
    steps: ['Open /bridge?direction=out, choose the chain and paste the destination address.', 'Review the amount and fee, then confirm.', 'Seller proceeds: withdraw from the seller agent to your wallet first (/profile/agent-funds) or ask the assistant.', 'Track it in /activity; do not resend while a transfer is pending.'],
    sources: ['backend/src/routes/cashout.ts', 'backend/src/routes/bridge.ts', 'frontend/app/bridge/page.tsx'],
  },
  {
    id: 'market', title: 'Buy, sell and find a counterparty', status: 'testnet', mainnet: 'off', route: '/market',
    pages: ['/market', '/listings/[id]'],
    api: ['GET /api/listings', 'GET /api/jobs/marketplace', 'GET /api/deals/feed'],
    tools: ['search_market', 'get_my_market_activity'],
    keywords: 'karwan platform market buy sell services goods supply clients customers discover find browse search listings offers requests partners sellers suppliers freelancers',
    summary: 'Karwan is one open market for people and businesses. /market holds Start a trade, Your trades (your requests and offers, when signed in) and Find. The first visit asks once whether you trade for yourself or for a business; you can change it in Settings. Business offers carry a Business label and a Businesses filter (/market?scope=business). Find lists offers newest first, or by price when chosen; search and filters only narrow the list, and no one pays to appear higher. You can also bring a known counterparty, or post a request and let your agent find sellers. Today the market covers services and digital work; trade in physical goods and business trade are coming soon. Deals settle in test USDC on Arc Testnet; deals are not enabled on mainnet yet.',
    steps: ['Browse /market for offers; open one to see the seller and price.', 'To be found by customers, post an offer at /seller.', 'To find a seller, post a request at /buyer; agents bid on it.', 'Your own requests and offers are under Your trades at /market?view=yours.', 'Business offers are under the Businesses filter at /market?scope=business.', 'The assistant can search open offers and requests and open the best matches.'],
    sources: ['README.md', 'frontend/app/market/page.tsx', 'docs/architecture/17-one-market.md'],
  },
  {
    id: 'sell', title: 'Get customers: post an offer', status: 'testnet', mainnet: 'off', route: '/seller',
    pages: ['/seller', '/listings/[id]', '/profile/open-deals', '/profile/ways'],
    api: ['POST /api/listings', 'GET /api/listings/mine', 'POST /api/listings/:id/edit', 'POST /api/listings/:id/cancel', 'GET /api/agents/seller', 'POST /api/setup/ways'],
    tools: ['propose_post_offer', 'propose_take_down', 'get_my_market_activity', 'get_my_skills', 'set_way_i_deal'],
    keywords: 'get customers find clients sell offer listing advertise service seller agent bid supply grow business more buyers',
    summary: 'Customers find you through your offers and your seller agent. An offer is a public listing with a title, description and asking price in USDC. Your seller agent also reads new requests and bids for you when the work matches your skills; you approve the deal it brings. Two setup answers change this: with "Ask me first" the agent does not bid, it tells you about a request that fits (in the bell, by email and on Telegram) and you make the offer yourself on the request page; with "I have clients" only, your agent stays off the market and does not read new requests. Change either with set_up_my_agents or at /setup. Each person also has the ways they deal, for selling and for buying, one per kind of deal: one-time, milestones (paid in stages), goods with delivery (review starts on arrival) and refundable deposit; the other kinds of the escrow family are added as they go live. Each way keeps its own price and time: a goods way also says where they ship and how long it takes to arrive, a deposit way the deposit and the period. The selling agent offers on a request inside the way of its kind, and for a request of a kind they do not offer it does not offer on its own: it tells them and they decide. Ways are shown under Your agents on Profile and changed at /profile/ways, or with set_way_i_deal, which shows a card and saves nothing until they confirm. A completed deal adds to your reputation, which ranks you in later matches. There is no guarantee of orders.',
    steps: ['Post an offer at /seller, for yourself or your business, or ask the assistant to draft one.', 'Add your skills on your profile so your seller agent bids on the right requests.', 'Share your offer link with people you already know.', 'Watch bids and matches at /seller; approve or decline what the agent brings.'],
    sources: ['frontend/app/seller/page.tsx', 'backend/src/agents/seller.ts'],
  },
  {
    id: 'direct', title: 'Trade with someone you know', status: 'testnet', mainnet: 'off', route: '/buyer?mode=direct',
    pages: ['/buyer', '/deals/[id]', '/invite/[token]'],
    api: ['POST /api/deals/direct', 'GET /api/deals/direct/:jobId', 'POST /api/deals/direct/:jobId/accept', 'POST /api/deals/direct/:jobId/fund', 'GET /api/deals/invite/:token', 'POST /api/deals/direct/:jobId/decline'],
    tools: ['list_my_deals', 'get_deal_status', 'propose_accept_deal', 'start_protected_deal', 'pay_into_escrow', 'propose_decline_deal', 'list_people_i_traded_with'],
    keywords: 'direct deal create form invite email tag terms milestones budget deadline counterparty known buy again same seller traded with before',
    summary: 'Fill in the counterparty (Karwan tag, email or address), the work, amount, deadline and payment stages, then review the agreement. Creating the deal does not fund it. After seller agreement, the buyer reviews the current fee and exact total before funding. Selected identity or security-reserve requirements still apply. The assistant can build the whole deal from conversation, on the website and in chat: it asks only what is missing (what, how much, when), states the usual terms in one line, and shows one card with every term, goods terms included. Sending the deal moves no money. After the seller accepts, the payment card appears in the same conversation, and money moves only when the buyer confirms it. To trade again with someone from an earlier deal, the assistant lists the people you finished deals with (name, tag, what you traded, the amount) and builds the deal with them.',
    steps: ['Open /buyer?mode=direct and fill in the deal.', 'Send it; an invited person gets a link to join.', 'The seller agrees or counters.', 'The buyer reviews the exact total and funds the escrow.', 'Work happens on /deals/[id].'],
    sources: ['frontend/features/deals/components/DirectDealForm.tsx', 'backend/src/routes/deals.ts', 'backend/src/assistant/directDealTools.ts', 'backend/src/assistant/dealDraft.ts'],
  },
  {
    id: 'research-credit', title: 'Market research for your agents', status: 'testnet', mainnet: 'off', route: '/profile/agent-funds',
    pages: ['/profile/agent-funds'],
    api: ['GET /api/research/status', 'POST /api/research/activate'],
    tools: [],
    keywords: 'research credit market research report paid research x402 agent funds add credit free reports',
    summary: 'On testnet, agents can read paid market research for a request, paid through x402 and settled through Circle Gateway. Each day starts with some free reports; after those, reports are paid from the account\'s research credit. Adding credit takes a fixed amount from the buying agent, or the selling agent if the buying agent cannot cover it, and the amount is shown on the button before it is pressed. The credit balance and the free reports left are on /profile/agent-funds. Not open on mainnet.',
    steps: ['Open /profile/agent-funds.', 'See the research credit and the free reports left today.', 'Press Add to top up the credit from an agent wallet.'],
    sources: ['backend/src/routes/research.ts', 'backend/src/evidence/researchCredit.ts', 'backend/src/evidence/researchAllowance.ts', 'frontend/app/profile/agent-funds/page.tsx'],
  },
  {
    id: 'matching', title: 'Ask an agent to find a match', status: 'testnet', mainnet: 'off', route: '/buyer',
    pages: ['/buyer', '/jobs/[id]'],
    api: ['POST /api/jobs', 'GET /api/jobs/:jobId/match', 'POST /api/jobs/:jobId/approve-match', 'POST /api/jobs/:jobId/decline-match', 'POST /api/jobs/:jobId/cancel', 'POST /api/jobs/:jobId/choose-offer', 'POST /api/jobs/:jobId/edit', 'POST /api/jobs/:jobId/raise-offer'],
    tools: ['propose_post_request', 'propose_match_decision', 'whats_pending', 'propose_fund_agent', 'list_offers_on_request', 'propose_choose_offer', 'propose_edit_request', 'propose_raise_offer'],
    keywords: 'agent matching request offer seller buyer negotiate budget tolerance approval brief form post request auction',
    summary: 'The structured request records what you need, budget, deadline and allowed flexibility. Posting pre-authorises matching within your settings: seller acceptance can trigger buyer-agent funding without another buyer funding click. Price exceptions need buyer approval. Review the spending limit before posting. While a match waits for the seller to accept, the buyer can cancel it: nothing is funded, and the request reopens with its other offers so they can choose another or cancel the request. The buyer can see the offers on their request and choose one, which funds escrow from the buyer agent. Before a match, the description and how far above budget the agent may go can change; budget and due date cannot. At approval, the seller can ask for a higher price and the buyer approves or declines it. A request is not a promise of a match.',
    steps: ['Fund your buyer agent first (it pays for matched deals).', 'Post the request at /buyer.', 'Seller agents bid and negotiate within your limits.', 'Approve or decline matches that need you; the deal then opens on /deals/[id].'],
    sources: ['frontend/features/buyer/components/PostJobForm.tsx', 'backend/src/agents/buyer.ts'],
  },
  {
    id: 'delivery', title: 'Delivery, review and payment release', status: 'testnet', mainnet: 'off', route: '/deals/[id]',
    pages: ['/deals/[id]', '/cashout/[jobId]'],
    api: ['POST /api/deals/direct/:jobId/delivered', 'POST /api/deals/direct/:jobId/release', 'POST /api/deals/direct/:jobId/claim', 'POST /api/deals/direct/:jobId/extension/request', 'POST /api/deals/direct/:jobId/extension/respond'],
    tools: ['propose_mark_delivered', 'propose_release', 'get_deal_status', 'propose_extension'],
    keywords: 'deliver delivery mark delivered review release pay milestone approve work done tracking carrier proceeds flagged unsafe link blocked wrongly flagged safe link support check',
    summary: 'The seller marks each milestone delivered with a link. Karwan checks every delivered link for safety and against the agreed request; a delivery that may not match pauses the payment while the money stays held, and the seller can send the right link. When the safety check flags a link, the buyer cannot open it and the seller sees two buttons on the deal: Send a new delivery link, and My link is safe. Ask a person to check, which opens a support chat with the deal attached. A person at Karwan opens the link safely and either clears it (the buyer can then open it, marked Checked by Karwan support, the seller\'s record is not marked down for it, and payment follows the usual steps) or keeps it blocked, and the seller is told to send a new link. A link the check rated malicious needs both a support reviewer and an administrator at Karwan to clear it. A new delivery is checked again from the start. A passed check does not guarantee quality. The buyer reviews within the window in the terms and releases payment. If more time is needed, the seller can ask for more time to deliver and the buyer can extend the review window, up to the limit in the terms. If a review window ends with no action, the seller may be able to claim the milestone. Proceeds go to the seller agent.',
    steps: ['Seller: open the deal and mark the milestone delivered with the evidence.', 'Buyer: review and release, or ask for an extension or open a dispute.', 'Seller: withdraw proceeds from /cashout/[jobId] or the seller agent.'],
    sources: ['backend/src/routes/deals.ts', 'frontend/app/deals/[id]/page.tsx'],
  },
  {
    id: 'recovery', title: 'Disputes and recovery', status: 'testnet', mainnet: 'off', route: '/docs/disputes',
    pages: ['/docs/disputes', '/deals/[id]', '/legacy'],
    api: ['POST /api/deals/direct/:jobId/dispute/escalate', 'POST /api/deals/direct/:jobId/cancel/propose', 'POST /api/deals/direct/:jobId/cancel/accept', 'POST /api/deals/direct/:jobId/cancel/decline', 'POST /api/deals/direct/:jobId/dispute/statement', 'POST /api/deals/direct/:jobId/appeal'],
    tools: ['get_deal_status', 'whats_pending', 'propose_cancel_deal', 'propose_dispute_statement', 'propose_escalate_dispute'],
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
    pages: ['/profile', '/seller'],
    api: ['GET /api/world-id/status', 'POST /api/world-id/verify', 'POST /api/jobs/:jobId/world-check/request', 'POST /api/jobs/:jobId/world-check/verify', 'POST /api/jobs/:jobId/world-check/skip'],
    tools: ['get_deal_status'],
    keywords: 'world worldid identity human selfie verification bot scam agentkit agentbook',
    summary: 'High-signal deals can require a selected party to verify with World ID before accepting or funding. Current deal verification uses agreement-bound World ID session/presence checks with a Selfie credential and replay protection. Required checks are not bypassed when unconfigured. This does not prove honesty, business registration, delivery or payment authorization. AgentKit/AgentBook eligibility is a separate integration; never infer registration from a deal proof. On an agent deal, Karwan\'s trust rules ask for World ID only on a first deal, a deal of 1,000 USDC or more, many deals from a new account in one day, or after a link the person sent was judged malicious. The buyer confirms when choosing an offer, and the seller confirms before escrow funds: the seller hears on the seller desk, by email and in chat, and escrow funds as soon as they pass. A person who already passed World ID is not asked again for a first deal. A price far from the market, a low score or a suspicious (not malicious) link never asks. On testnet the check can be skipped so testing is never blocked.',
    steps: ['When a deal requires it, the deal page asks the named party to verify.', 'Verification is bound to that agreement version.', 'On an agent deal, the buyer confirms in the choose sheet and the seller confirms at the top of /seller.'],
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
    id: 'verification', title: 'Getting verified and found by agents', status: 'gated', mainnet: 'off', route: '/verify/person',
    pages: ['/verify/person', '/r/[tag]'],
    api: ['POST /api/verification/person', 'GET /api/verification/me', 'POST /api/verification/cac', 'GET /api/r/:tag', 'GET /api/r/:tag/credential'],
    tools: ['my_verification', 'open_verification_step', 'ask_past_client_to_confirm', 'submit_business_registration', 'find_verified_people', 'ask_their_agent', 'check_person', 'set_location', 'answer_delivery'],
    keywords: 'verify verified verification ladder level person work id cac invoice client confirm found discover discoverable record credential world id',
    summary: 'A deterministic ladder: Registered, Person verified (a person check plus an owned account or a CAC match), Work verified (independent proof of work: a verified past client confirms, with or without an invoice, public GitHub work, or a settled Karwan deal), ID verified (needed for deals of 100 USDC and above). With the shortlist on, agents list verified and unverified sellers, labelled, and only a verified seller is recommended; otherwise only work-verified sellers are offered. Self-reported claims count for nothing. A language model never decides a level. Each person has a public record at /r/<tag> and a signed copy anyone can check against Karwan\'s published key and Arc. Once records are sealed, visitors see the verification level, tier and reasons there, and only the owner sees their score and counts. People tell their agent where they are (set_location) and where they deliver (answer_delivery); only the country is ever shown, and city, area and delivery answers are used by matching alone. Anyone can ask the agent to check a person by Karwan tag or Telegram username (only people who allowed it are found by Telegram name): the answer is the public record and one line of advice, never a number.',
    steps: ['Ask my_verification for the level and what is missing.', 'Send the person check or X sign-in link with open_verification_step.', 'Ask a past client to confirm a job, send an invoice photo, or a CAC number.', 'To check someone before a deal, call check_person with their tag or Telegram name.'],
    sources: ['backend/src/verification/ladder.ts', 'backend/src/lookup/checkPerson.ts', 'backend/src/verification/evidence.ts', 'backend/src/routes/personVerification.ts', 'backend/src/routes/record.ts'],
  },
  {
    id: 'shortlist', title: 'The shortlist and record checks', status: 'testnet', mainnet: 'off', route: '/profile',
    pages: ['/profile', '/r/[tag]', '/developers'],
    api: ['GET /api/jobs/:jobId/shortlist', 'POST /api/jobs/:jobId/choose-offer', 'GET /api/x402/record/:subject', 'GET /api/me/reputation-sources', 'PUT /api/me/reputation-sources'],
    tools: ['list_offers_on_request', 'propose_choose_offer', 'ask_their_agent'],
    keywords: 'shortlist recommended recommendation choose pick verified unverified not verified score record check read agents pay consent who read my record reads balance record checks balance',
    summary: 'After a request, agents bring the buyer a shortlist of up to five sellers: each shows Verified or Not verified, a 0 to 100 score, completed deals, on-time rate, disputes lost and the price. The agent negotiates with the one it recommends, always a seller within budget who is verified (on testnet, a seller with settled Karwan deals and no lost dispute can be recommended too, still shown as not verified); with no recommendation the list stays open for the buyer to choose until the request closes, and the buyer chooses anyone on the list; choosing someone unverified asks once more. Agents pay 0.01 USDC to read a full record, only when that person turned on Let agents check my record in Profile. Details are deleted after 24 hours; the person sees who read their record. A seller\'s agent does the same on the buyer before it bids: it passes on a buyer who lost more disputes than they completed, flags a new buyer on a large request for the seller to look at, and the seller desk shows what was paid and what it learned. A buyer who posts and leaves gets an email when the shortlist is ready. Other platforms joining as record sources is planned.',
    steps: ['Call list_offers_on_request for the ranked list.', 'Name the recommended seller and why.', 'Prepare the choice with propose_choose_offer; the person confirms.'],
    sources: ['backend/src/agents/shortlist.ts', 'backend/src/routes/jobs.ts', 'backend/src/routes/x402.ts', 'backend/src/reputation/consent.ts'],
  },
  {
    id: 'chat', title: 'The Karwan agent on Telegram', status: 'gated', mainnet: 'off', route: '/terms/chat',
    pages: ['/terms/chat', '/verify/person', '/messages/[tag]'],
    api: ['GET /api/channels/open', 'POST /api/telegram/link/start', 'GET /api/messages', 'GET /api/messages/:tag', 'POST /api/messages/:tag'],
    tools: ['start_protected_deal', 'pay_into_escrow', 'ask_past_client_to_confirm', 'open_verification_step', 'add_my_link', 'set_chat_alerts', 'check_person', 'message_person', 'read_my_messages'],
    keywords: 'telegram whatsapp chat agent bot beta direct deal protected escrow known person link confirm client sign in sign up email code wallet connect tag workspace lookup check telegram name mute alerts message dm contact talk before a deal inbox reply',
    summary: 'A free beta on Karwan’s Telegram bot, one bot per network, switched on per network. /start asks whether the person has a Karwan account or is new. Either way they sign in with an email and a 6-digit code, and the email is the account: the same one the website signs in. Someone who signs in to Karwan with a wallet signs in on the website and taps Connect Telegram, which opens their own chat and links it. A new person accepts the chat terms, picks a Karwan tag (their Telegram username is offered when it fits the rules), and answers three plain questions that post their first offer or request. Their Telegram username is saved on the account, and people can find them by it only if they allow it. Anyone can ask the agent to check a person by tag or Telegram name and gets the public record with one line of advice. During setup the agent also asks which country they are in; only the country is shown, and city and area are used to match them with people near them. When it finds buyers in a new country it asks whether they deliver there before offering the work. Anyone can ask their agent to message someone by Karwan tag before any deal (message_person); the person gets it in their Karwan chat with an alert on Telegram and by email, sees the sender’s tag, country and tier, and answers with their agent’s help (read_my_messages). On the website the conversation (/messages/<tag>) shows the other person’s photo, name, tag, country and tier, with Start a protected deal, which opens a direct deal with them. Someone whose first messages to five people in a day all go unanswered is paused from writing to anyone new for a day, and three messages in a row with no answer wait for a reply. Only someone with a Karwan tag can message, and a message with a link Karwan flags is not sent. A message with a phone number, an email or a link before any deal between the two carries the warning to keep payment in Karwan escrow. Messages are kept 14 days. When they agree, either agent starts the protected deal; money never moves from a message. Links they send are added to their record as self-added, which never raises the score. Alerts come through the same bot and can be muted by asking. People get verified, find verified sellers or customers and agree deals in chat. Agreements, delivery and disputes are confirmed with chat buttons; every step that moves money opens a one-time Karwan link and is confirmed on that page. Karwan holds the wallets of chat accounts; a web account that linked Telegram talks to the agent as itself. A past client confirms a job from a link the person forwards, and it counts once that client is person verified. The WhatsApp agent is paused. Escrow on Arc mainnet is a beta, up to 1,000 USDC per deal and not audited; deals of 100 USDC and above are not open in the beta.',
    steps: ['The person sends /start to the Karwan bot and signs in with an email code or a wallet.', 'A new person accepts the chat terms, picks a tag and answers three questions that post a first offer or request.', 'Money steps open a one-time Karwan link to confirm.'],
    sources: ['backend/src/telegram/agent/live.ts', 'backend/src/channels/dispatch.ts', 'backend/src/channels/onboarding.ts', 'backend/src/channels/moneySteps.ts', 'backend/src/assistant/directDealTools.ts', 'backend/src/messages/directService.ts'],
  },
  {
    id: 'money-out', title: 'Where money can leave a chat account', status: 'gated', mainnet: 'off', route: '/account',
    pages: ['/account', '/verify/person'],
    api: ['GET /api/money-out/status', 'POST /api/money-out/session/request', 'POST /api/money-out/session/verify', 'DELETE /api/money-out/addresses/:id', 'POST /api/money-out/pause'],
    tools: [],
    keywords: 'saved address new address withdraw limit daily limit pause paused resume world id selfie stolen phone sim swap recycled number came back',
    summary: 'For an account Karwan holds the keys of, money leaves only to an address the person added with their World ID, linked with a Selfie Check at the person check. A new address can receive money 24 hours after it is added, and the chat says so with a Remove button. Up to 500 USDC leaves in any 24 hours, payments into escrow included. After more than 60 quiet days, the next money step needs the World ID check again. Every payment out is announced in chat with a Pause button; resuming needs World ID. A web account’s agent wallets pay out only to the person’s own wallet. On by switch: mainnet, or testnet with the verified network on.',
    steps: ['Link World ID at the person check.', 'The first payment to a new address offers to add it with World ID.', 'The address can receive money 24 hours later; the money page lists it, the limit left and Pause.'],
    sources: ['backend/src/moneyOut/rules.ts', 'backend/src/moneyOut/guard.ts', 'backend/src/routes/moneyOut.ts', 'frontend/features/moneyOut/SavedAddresses.tsx'],
  },
  {
    id: 'account-deletion', title: 'Deleting a chat account', status: 'gated', mainnet: 'off', route: '/terms/chat',
    pages: ['/terms/chat', '/settings'],
    api: [],
    tools: [],
    keywords: 'delete account remove my account erase my data close account forget me privacy data protection cancel deletion',
    summary: 'A chat account is deleted by sending /delete to the agent on Telegram; the agent cannot do it from a request in words. It is refused while a deal is open, offers or requests are live, the seller agent is still bidding, or any wallet holds 0.01 USDC or more. It runs 7 days after the person confirms, and they can cancel in chat until then. It removes the profile and tag, the chat history, verified facts (revoked on Arc too), saved addresses, activity, support conversations, feedback, and offers and requests that never became a deal. Deals, payments and deal messages stay, and the World ID hash is kept 12 months, then deleted. A web account is deleted in Settings; a chat account cannot be deleted there.',
    steps: ['Send the delete command to the Karwan agent on Telegram.','Read what goes and what stays, and tap Delete my account.', 'It runs 7 days later; tap Keep my account to cancel before then.'],
    sources: ['backend/src/accountDeletion/rules.ts', 'backend/src/accountDeletion/service.ts', 'backend/src/accountDeletion/live.ts', 'frontend/shared/i18n/messages/chatTerms.ts'],
  },
  {
    id: 'records', title: 'Activity and receipts', status: 'testnet', mainnet: 'invite', route: '/activity',
    pages: ['/activity', '/activity/all-time'],
    api: ['GET /api/activity/me', 'GET /api/bridge/list'],
    tools: ['recall_activity', 'find_transaction'],
    keywords: 'activity history receipt reference transaction payment settled records pending where did my money go',
    summary: 'Transaction history records requested, pending and completed money movements. On a deal paid early by a financier, the seller sees the advance as money in, each deal payment as what actually reached them, and the part the escrow paid the financier as Repaid to your financier, without a sign, so the list adds up to what reached the wallet. A submitted request is not settlement. Missing data is not zero money or proof nothing happened. Account reads are snapshots; explain when chain reconciliation or support is needed.',
    steps: ['Open /activity; movements sit under their day, newest first. Filter Money in or Money out to narrow it.', 'Open the row for the full sentence, reference and status.'],
    sources: ['backend/src/db/activityLog.ts', 'backend/src/assistant/bridgeStanding.ts'],
  },
  {
    id: 'reputation', title: 'Reputation, skills and stake', status: 'testnet', mainnet: 'off', route: '/profile',
    pages: ['/profile', '/stake', '/credit-passport/[address]', '/attested/[id]'],
    api: ['GET /api/reputation', 'GET /api/vault/positions', 'GET /api/yield/me', 'POST /api/yield/claim', 'GET /api/deals/:id/rating', 'POST /api/deals/:id/rating'],
    tools: ['get_my_reputation', 'get_my_stake', 'get_my_skills', 'propose_stake', 'propose_claim_yield', 'rate_deal', 'my_ratings_to_give'],
    keywords: 'reputation score tier stake staking yield skills certificate research credit passport rating ratings rate stars feedback review',
    summary: 'After a deal settles, both people are asked to rate each other from 1 to 5 with an optional note, within 3 days of settling; the ask links straight to the rating on the deal page (rate_deal; my_ratings_to_give lists what is waiting). A rating shows as soon as it is given, with one reminder after 3 days for anyone who has not rated. Each person’s public rating is the mean with its count, for example 4.8 from 23 deals; under 3 ratings it shows New. Ratings from disputed deals are counted beside the number, for example 3.7 from 3 deals, 2 disputed, and rating closes 14 days after the deal settles. A note with a phone number, an email or a link is kept private. The rating is separate from the reputation score, which it does not change. Reputation reflects completed Karwan deals and has completion and concentration limits. Posting a request or an offer lets the agents of people on that request check your record with a paid, logged read; agents outside Karwan can only if you allow it in Profile. Other people see your tier and reasons, never your numbers. Each deal that settles from the day it was switched on leaves a signed, attested statement for each side (role, date, amount range, never the other person); earlier deals only on request. Turn it off or use Remove my published deals in Settings. Declared skills are not verified skills. Staking USDC backs your reputation as a security reserve. Any yield distributed to you shows on /stake and can be claimed there; yield is never guaranteed. Reputation is not proof of identity or honesty.',
    steps: ['See your score on /profile; share your public record at /credit-passport/[address].', 'Each settled deal Karwan attested opens as a readable statement at /attested/[id], with the signed credential one link further for machines.', 'Stake at /stake; claim yield there when available.'],
    sources: ['backend/src/reputation/engine.ts', 'backend/src/verification/skillSummary.ts', 'frontend/app/stake/page.tsx'],
  },
  {
    id: 'finance', title: 'Optional trade finance', status: 'gated', mainnet: 'off', route: '/financier',
    pages: ['/financier', '/financier/factoring/[offerId]', '/financier/po/[lineId]', '/profile/open-deals'],
    api: ['GET /api/factoring/mine', 'POST /api/factoring/request', 'GET /api/factoring/funding', 'GET /api/po-financing/mine', 'GET /api/financier/eligibility'],
    tools: ['get_my_financing'],
    keywords: 'finance financing invoice factoring purchase order financier credit loan advance',
    summary: 'The build includes invoice factoring, purchase-order financing and a financier desk. Access depends on configuration, eligible businesses and the particular Karwan-originated trade. Financing is opt-in, not a guaranteed loan or support for arbitrary external invoices. A financier can send an offer only when their wallet holds the advance; the desk says how much to add first. The seller sees offers ranked by the financier\'s reputation, then by price, with the best one marked Recommended; an offer whose financier has not added the money yet says so and is never recommended, and accepting it is refused before anything moves while the financier is told. Do not invent rates or promise approval.',
    steps: ['Early payment is for goods or mixed orders between two verified businesses.', 'Once the seller marks the order delivered with its shipment tracking number, the deal page shows Get paid now: the seller asks for early payment, reviews financiers’ offers and accepts one there.', 'The seller is paid at once; when the buyer releases, the escrow repays the financier first and pays the seller the rest, which the seller cashes out from the deal page like any deal.', 'Financiers apply and make offers at /financier. A deal’s own buyer or seller never sees or finances it.', 'A financier follows each deal they financed: Profile, Open deals lists it under Deals you financed with what went out, what comes back and how the deal is going, and they are told by bell, email and Telegram when it is delivered, a payment is released, it goes to dispute, it is refunded or it misses its deadline. They never act on the deal itself.'],
    sources: ['backend/src/routes/factoring.ts', 'backend/src/db/poFinancing.ts', 'backend/src/financial/dealFinanciers.ts', 'frontend/app/financier/page.tsx', 'frontend/features/notifications/financedDeal.ts'],
  },
  {
    id: 'support', title: 'Settings, notifications and human help', status: 'testnet', mainnet: 'invite', route: '/feedback',
    pages: ['/feedback', '/settings', '/profile', '/profile/contact'],
    api: ['GET /api/settings', 'POST /api/settings', 'GET /api/telegram/status', 'POST /api/telegram/link/start', 'POST /api/support/start'],
    tools: ['get_my_profile'],
    keywords: 'help support ticket feedback settings language notifications telegram theme profile email human',
    summary: 'Use /settings for preferences and language, and /profile for account details and for linking Telegram, which sends deal notifications and lets the Karwan agent on Telegram act as that account. How we reach you (in /settings, and asked during setup) sends alerts by Telegram, by email, or both; Telegram without a linked chat falls back to email. Help (the ? Help button on every signed-in page) answers from the account first. A person from the team joins the same conversation when the user asks for one, or when the assistant cannot do it; there is no button to press first. Without a live support channel, /feedback reaches the team. The assistant cannot read private support tickets, alter verification or act as an administrator. Never request a seed phrase, private key or one-time sign-in code.',
    steps: ['Settings: /settings.', 'A person: ask for one in Help, or write at /feedback.'],
    sources: ['frontend/shared/components/AssistantWidget.tsx', 'frontend/app/settings/page.tsx', 'backend/src/routes/telegram.ts'],
  },
  {
    id: 'assistant-mode', title: 'Assistant mode', status: 'testnet', mainnet: 'invite', route: '/assistant',
    pages: ['/assistant', '/app'],
    api: ['GET /api/assistant/conversations', 'GET /api/assistant/conversations/:id', 'POST /api/assistant/conversations', 'DELETE /api/assistant/conversations/:id', 'POST /api/assistant/attach'],
    tools: [],
    keywords: 'assistant mode use assistant switch conversation conversations history saved chat page',
    summary: 'Use assistant in the top bar, or "What do you want to do? Ask your assistant" on Home, opens /assistant: the whole account run from one conversation, with the same cards as the help panel, and nothing moves until a card is confirmed. Conversations are saved to the account, at most 50, each keeping its last 40 messages. A reopened conversation shows past cards as done, or as shown earlier with a pointer to Activity, never as something to confirm again. A saved conversation can be deleted, from its row in the conversation list or from inside it, after a confirmation; nothing confirmed in it is undone. A photo or PDF of an invoice for your own work can be added there, read the same way as one sent to the agent on Telegram: it is added to your record unconfirmed until the client confirms, and the file itself is not kept. Switching it off goes back to the page it was switched on from.',
    steps: ['Turn on Use assistant in the top bar.', 'Pick a suggestion or type what you want, then check the card that comes back.', 'Turn it off to go back to where you were.'],
    sources: ['frontend/features/assistant/AssistantMode.tsx', 'backend/src/routes/assistantConversations.ts'],
  },
  {
    id: 'memory', title: 'What the assistant remembers', status: 'testnet', mainnet: 'invite', route: '/settings',
    pages: ['/settings'],
    api: ['GET /api/assistant/memory', 'POST /api/assistant/memory/enabled', 'DELETE /api/assistant/memory/notes/:id', 'DELETE /api/assistant/memory'],
    tools: ['recall_conversations', 'remember_this', 'forget_memory'],
    keywords: 'memory remember forget what do you remember earlier conversation last time we talked continue where we left off notes privacy switch off',
    summary: 'One memory per account, shared by the website assistant, Help and the Telegram agent. After a reply, the assistant keeps short notes about what matters for next time: what the person wants to buy or sell, preferences such as budget, language or delivery place, and open threads. It reads them at the start of every conversation, and can search earlier saved conversations by topic. It never keeps passwords, codes, card, bank or phone numbers, wallet addresses or emails, nor anything said after "don\'t remember this". Balances, deals and money always come from a fresh read, never from memory. Settings, under What Karwan remembers, lists every note with its date, deletes any of them or all of them, and switches memory off; off stops reading and writing at once and keeps the notes until deleted. In chat, "remember that..." keeps a note and "forget that" removes one. Notes are private to the account and removed when the account is deleted. At most 50 notes are kept, oldest first to go.',
    steps: ['Open /settings, then What Karwan remembers.', 'Tap Notes to see or delete them, or switch Remember our conversations off.'],
    sources: ['backend/src/assistant/memoryTools.ts', 'backend/src/assistant/memoryWriter.ts', 'backend/src/assistant/memoryRules.ts', 'frontend/features/settings/components/AssistantMemoryRows.tsx'],
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
    keywords: 'what is karwan about mission vision direction future building towards unified reputation portable profile verified agent network agent to agent negotiate find people trust other platforms import aggregate talent vetting',
    summary: 'Karwan lets your reputation travel with you, and lets your agent use that reputation to find, negotiate with, and transact with the right people. The direction: a portable, verified reputation, and an agent for every person that gathers and verifies their work history with consent, then searches the network, weighs reputation, talks to other agents, negotiates price, timeline and terms, opens a protected deal and updates reputation after delivery. Humans decide; agents do the legwork. It starts with Karwan’s market: completed deals are protected in escrow and recorded, and that record is the first input. Agents will work with data the person already owns, only with consent; nothing is leaked, sold or scraped. Partner platforms join once the working model is designed with them, and none is named until an agreement exists. Being built, not live: today reputation comes only from completed Karwan deals.',
    steps: [],
    sources: ['README.md', 'docs/architecture/08-reputation.md', 'docs/reputation-model.md'],
  },
  {
    id: 'research', title: 'Research survey', status: 'testnet', mainnet: 'invite', route: '/research',
    pages: ['/research'],
    api: ['POST /api/survey/research'],
    tools: [],
    keywords: 'research survey questionnaire feedback how do you decide who to trust online study',
    summary: 'A public five-question survey at /research on how people decide who to trust online and what checks they run before a deal. Anyone can answer without signing in. Answers are kept without anything that identifies the sender unless they choose to leave a contact, bots are ignored, and the team sees totals. When too many answers come from one connection the page asks you to wait and try again. It shapes what Karwan builds next.',
    steps: ['Open /research and answer the five questions.', 'Leave a contact only if you want to hear back.'],
    sources: ['backend/src/routes/survey.ts', 'backend/src/db/researchAnswers.ts', 'frontend/app/research/page.tsx'],
  },
  {
    id: 'roadmap', title: 'Roadmap', status: 'planned', mainnet: 'planned', route: '/docs/roadmap',
    pages: ['/docs/roadmap'],
    api: [], tools: [],
    keywords: 'roadmap future next plan coming soon whatsapp telegram x twitter instagram bot mcp claude codex anywhere mobile app bank payout audit arbiter',
    summary: 'In order, no dates: now, mainnet by invitation through the waitlist; next, deals on mainnet (escrow, deal board and stake contracts); then an arbiter for silent counterparties and an external audit of the money contracts; after that, trade from anywhere: start a protected deal and use your Karwan assistant from the place the trade began (starting with X, then chat apps, and AI tools through an MCP server), plus recurring deals; later, cash out to a local bank account, one country at a time. Also planned: mobile app after mainnet, reputation lookups from connected social accounts (Telegram, X, Instagram, LinkedIn and others, optional, with the person\'s consent), file delivery inside a deal, more languages. In testing and not deployed: new escrow families for fixed-price, hourly and job or bounty work, and Chainlink CRE workflows for delivery checks and timeouts. None of these is live today. Paid record checks between agents over x402 already run on testnet (see the shortlist). The Karwan agent on Telegram is a separate free beta, switched on per network; WhatsApp is paused.',
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
