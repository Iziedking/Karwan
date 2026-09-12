/** Reviewed repository behaviour, not a claim that this build is deployed.
 * Update with the source feature, and keep operational/account truth in tools.
 */
export const GUIDE_REVIEWED_AT = '2026-09-12';
export const PLATFORM_GUIDE = [
  {
    id: 'market', title: 'Buy, sell and find a counterparty', status: 'testnet', route: '/p2p',
    keywords: 'karwan platform market buy sell services goods supply clients customers discover',
    summary: 'Karwan is an open market for people and businesses. Bring a known counterparty or ask an agent to find offers inside Karwan. Current settlement uses test USDC on Arc Testnet, not real-value mainnet money or local bank payments.',
    sources: ['README.md', 'frontend/app/p2p/page.tsx'],
  },
  {
    id: 'direct', title: 'Trade with someone you know', status: 'testnet', route: '/buyer?mode=direct',
    keywords: 'direct deal create form invite email terms milestones budget deadline',
    summary: 'Fill in the counterparty, work or goods, amount, deadline and payment terms, then review the agreement. Creating the deal does not fund it. After seller agreement, the buyer reviews the current fee and exact total before funding. Selected identity or security-reserve requirements still apply.',
    sources: ['frontend/features/deals/components/DirectDealForm.tsx', 'backend/src/routes/deals.ts'],
  },
  {
    id: 'matching', title: 'Ask an agent to find a match', status: 'testnet', route: '/buyer',
    keywords: 'agent matching request offer seller buyer negotiate budget tolerance approval brief form',
    summary: 'The structured request records what you need, budget, deadline and allowed flexibility. Posting pre-authorises matching within your settings: seller acceptance can trigger buyer-agent funding without another buyer funding click. Price exceptions need buyer approval. Review the spending limit before posting. Seller offers are managed at /seller. A request is not a promise of a match.',
    sources: ['frontend/features/buyer/components/PostJobForm.tsx', 'backend/src/agents/buyer.ts'],
  },
  {
    id: 'business', title: 'Business setup and verification', status: 'testnet', route: '/profile/business',
    keywords: 'business company workspace registration verification setup owner',
    summary: 'Adding a business name starts setup; it is not business verification. Complete the business details and submit registration or tax evidence for review. Business and personal verification are separate. Current business workspaces are owner-only; team permissions are planned. Read get_my_workspaces for this account, not a generic eligibility guess.',
    sources: ['backend/src/db/workspaces.ts', 'frontend/app/profile/business/page.tsx'],
  },
  {
    id: 'world', title: 'World ID checks', status: 'gated', route: '/profile',
    keywords: 'world worldid identity human selfie verification bot scam agentkit agentbook',
    summary: 'High-signal deals can require a selected party to verify with World ID before accepting or funding. Current deal verification uses agreement-bound World ID session/presence checks with a Selfie credential and replay protection. Required checks are not bypassed when unconfigured. This does not prove honesty, business registration, delivery or payment authorization. Staging is not production identity verification. AgentKit/AgentBook eligibility is a separate integration; never infer registration from a deal proof.',
    sources: ['backend/src/routes/worldId.ts', 'backend/src/worldid/sessionProof.ts', 'backend/src/deals/highSignalVerification.ts'],
  },
  {
    id: 'cre', title: 'Delivery evidence with Chainlink CRE', status: 'gated', route: '/how-it-works',
    keywords: 'chainlink cre evidence delivery github commit pull request receipt oracle',
    summary: 'CRE checks supported delivery evidence against an agreement; the current focused flow uses GitHub pull requests and commits. Evidence must match the current terms and delivery revision and remain valid. A request or stored receipt alone is not a verified release decision. Missing, stale or unreadable required evidence blocks release. CRE does not judge every kind of work or prove a person is trustworthy.',
    sources: ['backend/src/db/deals.ts', 'frontend/features/deals/evidenceReceipt.ts', 'backend/src/routes/deals.ts'],
  },
  {
    id: 'recovery', title: 'Delivery, disputes and recovery', status: 'testnet', route: '/docs/disputes',
    keywords: 'silent stuck seller buyer reclaim refund dispute cancellation deadline release recovery',
    summary: 'Recovery depends on whether funding, delivery, a release or a dispute has occurred and on the deployed contract and current timers. Read the specific deal and open its Next step view. Do not promise an immediate refund, a universal grace period, or recovery without the seller in every disputed state. Never advise paying again or releasing money to unlock a refund. Escalate unavailable or conflicting records to human support.',
    sources: ['backend/src/agents/dealWatcher.ts', 'backend/src/deals/deadlineRecovery.ts', 'frontend/app/docs/disputes/page.tsx'],
  },
  {
    id: 'money', title: 'Balances, deposit and withdrawal', status: 'testnet', route: '/profile/agent-funds',
    keywords: 'wallet balance agent funds funding deposit withdraw bridge cash usdc gateway pool faucet',
    summary: 'Read the sign-in wallet, buyer agent and seller agent separately. Agent transfers and cross-chain transfers are different operations. Available sources and signing steps depend on account type and current configuration. Use live balance/source tools before proposing a move. /bridge handles supported transfers; bank/card and local-currency payout are not live. Pending or a transaction hash alone does not prove completion.',
    sources: ['frontend/app/profile/agent-funds/page.tsx', 'backend/src/assistant/bridgeInventory.ts', 'backend/src/assistant/bridgeStanding.ts'],
  },
  {
    id: 'records', title: 'Activity and receipts', status: 'testnet', route: '/activity',
    keywords: 'activity history receipt reference transaction payment settled records pending',
    summary: 'Transaction history records requested, pending and completed money movements. Use the recorded state and available reference to trace a payment. A submitted request is not settlement. Missing data is not zero money or proof nothing happened. Account reads are snapshots; explain when chain reconciliation or support is needed.',
    sources: ['backend/src/db/activityLog.ts', 'backend/src/assistant/bridgeStanding.ts'],
  },
  {
    id: 'reputation', title: 'Reputation, skills and security reserve', status: 'testnet', route: '/profile',
    keywords: 'reputation score tier stake staking yield skills certificate research credit passport',
    summary: 'Reputation reflects recorded activity and has completion and concentration limits. Declared skills are not verified skills. Read the score and eligibility tools before explaining a specific account. Staking, research and paid checks have their own requirements and risks; no guaranteed yield or invented price. Human verification is not a scam-free guarantee.',
    sources: ['backend/src/reputation/engine.ts', 'backend/src/verification/skillSummary.ts'],
  },
  {
    id: 'finance', title: 'Optional trade finance', status: 'gated', route: '/financier',
    keywords: 'finance financing invoice factoring purchase order financier credit loan advance',
    summary: 'The build includes invoice factoring, purchase-order financing and a financier desk. Access depends on deployment configuration, eligible businesses and the particular Karwan-originated trade. Financing is opt-in, not a guaranteed loan or support for arbitrary external invoices. Read current positions and quote terms; do not invent rates or promise approval.',
    sources: ['backend/src/routes/factoring.ts', 'backend/src/db/poFinancing.ts', 'frontend/app/financier/page.tsx'],
  },
  {
    id: 'support', title: 'Settings and human help', status: 'testnet', route: '/feedback',
    keywords: 'help support ticket feedback settings language notifications theme profile email',
    summary: 'Use /settings for preferences and /profile for account details. Feedback and Talk to a human connect users to support. The assistant cannot read private support-ticket status, alter verification or act as an administrator. Do not invent a ticket, reply or response time. Never request a seed phrase, private key or one-time sign-in code.',
    sources: ['frontend/shared/components/AssistantWidget.tsx', 'frontend/app/settings/page.tsx'],
  },
  {
    id: 'roadmap', title: 'Wider-web discovery', status: 'planned', route: '/how-it-works',
    keywords: 'roadmap future webmcp web mcp browser external internet customers clients mainnet bank',
    summary: 'The wider vision is user-authorised agents finding counterparties across supported external services and bringing agreed trades into Karwan. Broad WebMCP scanning, autonomous external outreach, browser companion, mainnet settlement and local bank payout corridors are not live capabilities of this assistant. Do not claim to have searched websites, contacted people or booked a deal without a supported tool and verified result.',
    sources: ['README.md', 'frontend/app/how-it-works/page.tsx'],
  },
] as const;

export function lookupPlatformGuide(q = '', liveOnly = false) {
  const terms = q.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((term) => term.length > 2) ?? [];
  const ranked = PLATFORM_GUIDE.filter((entry) => !liveOnly || entry.status === 'testnet')
    .map((entry) => ({ entry, score: terms.filter((term) => `${entry.title} ${entry.keywords}`.toLowerCase().includes(term)).length }))
    .filter(({ score }) => !terms.length || score > 0)
    .sort((a, b) => b.score - a.score);
  return { reviewedAt: GUIDE_REVIEWED_AT, facts: ranked.slice(0, 6).map(({ entry }) => entry),
    note: 'Repository guidance, not live deployment or account evidence. Gated features need current checks. No match means unknown, not proof the feature is absent. Use short English topic keywords for retrieval; answer in the user’s language.' };
}
