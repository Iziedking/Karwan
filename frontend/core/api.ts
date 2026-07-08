import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/browser';

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8787';

// The signed-in user's address, mirrored here by the auth layer. Web3 users have
// no backend session cookie, so private reads pass this as a `caller` hint and
// the backend uses it when no session is present. Circle users' session always
// takes precedence server-side. Replaced by real web3 sessions (SIWE) later.
let currentCaller: string | null = null;
export function setApiCaller(addr: string | null): void {
  currentCaller = addr ? addr.toLowerCase() : null;
}
function withCaller(path: string, caller?: string | null): string {
  const c = caller ?? currentCaller;
  if (!c) return path;
  return `${path}${path.includes('?') ? '&' : '?'}caller=${c.toLowerCase()}`;
}

/// CCTP chain keys Karwan bridges with (mirrors features/bridge/config.ts and
/// backend chain/cctpChains.ts). Kept local so core/api has no feature import.
export type BridgeChainKey =
  | 'sepolia'
  | 'optimismSepolia'
  | 'arbitrumSepolia'
  | 'baseSepolia'
  | 'polygonAmoy';

/// Source chains supported via the App Kit bridge path on top of the hand-rolled
/// EVM set. Solana is App-Kit-only because the frontend has no wagmi connector
/// for it; the burn signs on a backend Circle DCW and the App Kit forwarder
/// broadcasts the Arc mint. Mirrors backend/src/circle/bridge-kit.ts.
export type AppKitBridgeChainKey = BridgeChainKey | 'solanaDevnet';

export interface ApiStatus {
  chain: { id: number; rpc: string; explorer: string };
  contracts: {
    jobBoard?: string;
    escrow?: string;
    reputation?: string;
    usdc?: string;
    identityRegistry?: string;
  };
  agents: {
    buyer: { configured: boolean; address?: string };
    seller: { configured: boolean; address?: string };
  };
}

export interface BuyerBid {
  seller: string;
  priceUsdc: string;
  deadlineUnix: number;
  score: number | null;
  suggestedCounterPrice: string | null;
  suggestedCounterDeadlineDays: number | null;
  /// Composite-engine tier of the seller at bid time. Null when the bid
  /// landed before the tier was wired (legacy bids on old jobs).
  sellerTier: 'new' | 'cold' | 'established' | 'strong' | 'elite' | null;
  /// Owner address behind the seller agent — used by the compact peek so
  /// `api.getProfile` resolves the right profile (profiles are keyed by
  /// user address, not agent). Null on legacy bids.
  sellerUserAddress: string | null;
  /// Seller's display name from their profile. Surfaced inline on the bid
  /// card. Null when unset or on legacy bids.
  sellerDisplayName: string | null;
  /// Topical-match percentage (0-100): how well the seller's profile
  /// keywords cover the brief's. The buyer agent ranks by match band
  /// FIRST, so this is what actually decides who wins — not the LLM
  /// `score`. Mirroring the same rank on the UI is the only way the
  /// "LEAD" pill stays honest.
  topicalMatch: number | null;
}

export interface BuyerJob {
  jobId: string;
  buyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  termsHash: string;
  finalized: boolean;
  escrowFunded: boolean;
  /// When the resulting deal was cancelled (epoch ms). Surfaced for a brief
  /// grace window so the user sees the terminal state before the row drops.
  cancelledAt?: number;
  /// When the brief passed its deadline without a match (epoch ms). The page
  /// renders read-only when set. the auction is over.
  expiredAt?: number;
  /// Human-readable brief text from the off-chain store. Null when the brief
  /// record was lost (eg flat-file wiped) but the on-chain job still exists.
  briefText?: string | null;
  keywords?: string[] | null;
  negotiationMaxIncreasePct?: number | null;
  /// Buyer opted into Trusted Match for this brief. The job-detail page
  /// surfaces a badge so both parties know the agent loop is weighting
  /// reputation + stake over price.
  trustedMatch?: boolean;
  bids: BuyerBid[];
  lastCounterPriceBySeller: Record<string, string>;
  counterRoundsBySeller: Record<string, number>;
  /// Privacy gate. The backend returns the full job only to the buyer who
  /// posted it (and, once matched, the matched seller). For everyone else it
  /// returns a status-only stub with `isParty: false` and no bids/amounts.
  isParty?: boolean;
  /// True when the viewer is the buyer who ran the auction. A matched seller is
  /// a party (isParty true) but gets viewerIsBuyer false, an empty `bids` array,
  /// and no negotiation internals: the bidder roster is the buyer's alone.
  /// Absent on the status-only stub (non-parties never reach the live page).
  viewerIsBuyer?: boolean;
  /// B2B trade context. 'finance' lane (a verified business trading goods/mixed)
  /// drives the business treatment on the job page; the rest describe the trade.
  /// Absent/`service` on the P2P flow.
  tradeLane?: 'service' | 'finance';
  tradeType?: 'service' | 'goods' | 'mixed' | null;
  incoterms?: 'EXW' | 'FCA' | 'FOB' | 'CIF' | 'DAP' | 'DDP' | null;
  paymentTerms?: 'immediate' | 'net30' | 'net60' | 'net90' | null;
  sourcingSector?: string | null;
  sourcingRegion?: string | null;
  /// Set on the status-only stub so the page can say "collecting bids" /
  /// "in negotiation" without leaking the auction.
  status?: 'open' | 'negotiating' | 'cancelled' | 'expired';
}

export interface BuyerAgentProfile {
  address: string;
  displayName: string;
  maxBudgetUsdc: number;
  minDeadlineDays: number;
  maxDeadlineDays: number;
  bidCollectionSeconds: number;
  maxCounterRounds: number;
  confidenceThreshold: number;
  milestonePcts: number[];
}

export interface SellerAgentProfile {
  address: string;
  displayName: string;
  skills: string[];
  bio: string;
  minBudgetUsdc: number;
  maxBudgetUsdc: number;
  minDeadlineDays: number;
  maxDeadlineDays: number;
  confidenceThreshold: number;
}

export interface SellerActiveBid {
  jobId: string;
  seller?: string;
  jobBuyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  lastBidPrice: string;
  counterRounds: number;
  finalized: boolean;
}

export type UserRole = 'buyer' | 'seller' | 'both';
export type UserLocale = 'en' | 'ar' | 'fr' | 'hi' | 'sw';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface UserSettings {
  locale?: UserLocale;
  theme?: ThemePreference;
  soundEnabled?: boolean;
  notificationsMuted?: boolean;
  publicPassport?: boolean;
}

export interface UserProfile {
  address: string;
  role: UserRole;
  displayName: string;
  createdAt: number;
  updatedAt: number;
  xHandle?: string;
  xUserId?: string;
  xProfileImageUrl?: string;
  /// Verified contact email. Email-login users get it auto-filled at sign-in;
  /// wallet (web3) users add and verify it from the profile email band. Drives
  /// deal alerts + Karwan product updates. Business accounts label it as the
  /// business email.
  email?: string;
  emailVerified?: boolean;
  emailVerifiedAt?: number;
  /// Account kind chosen at onboarding (individual vs business). Drives which
  /// profile + home surfaces show. Distinct from the verification-bound
  /// business status. Absent reads as 'person'.
  accountKind?: 'person' | 'business';
  settings?: UserSettings;
  seller?: {
    skills: string[];
    /// Goods / Services / Both, chosen on the business profile. Absent for
    /// individual sellers.
    tradeType?: 'goods' | 'services' | 'both';
    bio: string;
    minBudgetUsdc: number;
    maxBudgetUsdc: number;
    minDeadlineDays: number;
    maxDeadlineDays: number;
  };
  buyer?: {
    maxBudgetUsdc: number;
    minDeadlineDays: number;
    maxDeadlineDays: number;
    // Run by Karwan now, not chosen by users; new signups omit it.
    bidCollectionSeconds?: number;
    milestonePcts: number[];
  };
  /// SME-grade profile for B2B trade-finance flows (Phase 2 Track 2).
  /// Surfaces on the credit passport, MatchBanner, and financier
  /// dashboards. taxId is encrypted at rest and never returned over the
  /// wire — the public passport route strips it before responding.
  smeProfile?: {
    companyName?: string;
    sector?: 'agriculture' | 'textiles' | 'electronics' | 'logistics' | 'manufacturing' | 'services' | 'other';
    region?: string;
    yearFounded?: number;
    employeeBand?: 'micro' | 'small' | 'medium';
    websiteUrl?: string;
    registrationId?: string;
    primaryMarkets?: string;
    annualVolumeBand?: 'under_100k' | '100k_1m' | '1m_10m' | 'over_10m';
    minOrderValue?: string;
    leadTimeDays?: number;
    certifications?: string;
    hideFromDiscovery?: boolean;
    verifiedAt?: number;
    repaymentBehavior?: {
      windowDealCount: number;
      onTimeRate: number;
      averageDaysToSettle: number;
      defaultCount: number;
      lastSettledAt: number;
      financingsTaken?: number;
      financingsRepaid?: number;
      financingsDefaulted?: number;
      computedAt: number;
    };
  };
  /// Verification-bound business status (flips on registry approval). Distinct
  /// from accountKind (the onboarding choice). Used as a legacy fallback when
  /// deciding the rail for older profiles that predate accountKind.
  accountType?: 'person' | 'business';
  business?: {
    status: 'none' | 'submitted' | 'verified' | 'rejected';
    verifiedAt?: number;
  };
  /// Financier capability. Only an `approved` financier can fund factoring / PO
  /// lines. Anyone may apply from the SME rail once eligible.
  financier?: {
    status: 'none' | 'applied' | 'approved' | 'rejected';
    appliedAt?: number;
    approvedAt?: number;
  };
}

// KarwanEscrow.EscrowState: None=0, Funded=1, Settled=2, Disputed=3, Refunded=4.
/// USDC EIP-3009 transfer authorization, signed offchain by a web3 party
/// and submitted on chain by the platform relay when the settlement
/// condition is met. value is atomic USDC (6dp); validAfter/validBefore
/// are unix seconds.
export interface UsdcAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
  signature: string;
}

/// Invoice factoring offer (Phase 2 Track 2). Mirrors backend
/// db/factoring.ts FactoringOffer interface. Status drives the
/// state machine UI on both the financier and the seller side.
export type FactoringTier = 'new' | 'cold' | 'established' | 'strong' | 'elite';

/// The signed-in seller's factoring stake status, so the offer UI can show the
/// requirement before they accept. `requiredBps` is the bps of the advance their
/// tier must back; the per-offer requirement is advance × requiredBps / 10000.
export interface FactoringQualification {
  tier: FactoringTier;
  requiredBps: number;
  freeStakeUsdc: string | null;
}

export interface FactoringOffer {
  id: string;
  invoiceId: string;
  financier: string;
  seller: string;
  faceValueUsdc: string;
  offeredAdvanceUsdc: string;
  expectedReturnUsdc: string;
  discountBps: number;
  status: 'offered' | 'accepted' | 'rejected' | 'expired' | 'settled' | 'defaulted';
  offeredAt: number;
  expiresAt: number;
  acceptedAt?: number;
  rejectedAt?: number;
  settledAt?: number;
  setPayeeTxHash?: string;
  /// On-chain tx of the advance (financier -> seller), written at accept.
  advanceTxHash?: string;
  /// On-chain tx of the repayment (seller -> financier), written by the
  /// settlement watcher once the escrow settles.
  settleTxHash?: string;
  settleAttempts?: number;
  lastSettleError?: string;
  createdAt: number;
  updatedAt: number;
}

/// Purchase-order financing line (Phase 2 Track 2). Mirrors backend
/// db/poFinancing.ts. State machine matches the on-chain
/// KarwanPOFinancing.POState enum 1:1.
export interface POFinancingLine {
  id: string;
  invoiceId: string;
  financier: string;
  seller: string;
  buyer: string;
  principalUsdc: string;
  repayUsdc: string;
  state: 'funded' | 'released' | 'repaid' | 'reclaimed' | 'defaulted';
  fundedAt: number;
  releaseTimeoutAt: number;
  releasedAt?: number;
  repaymentTimeoutAt?: number;
  repaidAt?: number;
  podHash?: string;
  txHashes: {
    fund?: string;
    release?: string;
    repay?: string;
    reclaim?: string;
    default?: string;
  };
  createdAt: number;
  updatedAt: number;
}

export interface DirectDealOnChain {
  state: number;
  /// Milestone split as funded on chain (the source of truth for display).
  /// 2 to 5 integer parts each 1-99 summing to 100. The UI reads this for the
  /// total and per-stage amounts, paired with milestonesReleased for progress.
  milestonePcts: number[];
  milestonesReleased: number;
  dealAmountWei: string;
  sellerNetWei: string;
  feeTotalWei: string;
  releasedWei: string;
  /// v2b on-chain review clock in ms (null on v2.E / pre-cutover). The seller
  /// claim button gates on claimDeadlineMs so a click never reverts on the
  /// contract's ReviewWindowOpen from off-chain clock drift.
  deliveredAtMs?: number | null;
  claimDeadlineMs?: number | null;
}

export interface DirectDeal {
  jobId: string;
  buyer: string;
  seller: string;
  dealAmountUsdc: string;
  /// First milestone percent. On a two-milestone deal implies [firstReleasePct,
  /// 100 - firstReleasePct]; kept in sync with milestonePcts[0] when present.
  firstReleasePct: number;
  /// Full milestone split on managed (agent) deals that funded an N-part split.
  /// Absent on direct deals. Prefer deal.onChain.milestonePcts for display once
  /// the escrow is funded; this is the off-chain mirror.
  milestonePcts?: number[];
  /// Optional delivery deadline (unix seconds). When unset, the deal is
  /// open-ended: seller has no time pressure and the buyer can't unilateral
  /// cancel; only mutual cancel or appeal.
  deadlineUnix?: number;
  terms: string;
  acceptedAt?: number;
  delivered: boolean;
  deliveredAt?: number;
  deliveryProof?: string;
  /// Security Agent verdict on the delivery proof links. When 'suspicious' or
  /// 'malicious', the backend withholds deliveryProof from the buyer's view
  /// until cleared; verificationReasons explains why in plain language.
  verificationStatus?: 'clean' | 'suspicious' | 'malicious' | 'unverifiable';
  verificationReasons?: string[];
  /// Security agent's verdict on the MATCH (distinct from delivery-proof safety
  /// above). 'flag' surfaces a risk banner; 'hold' also marks the deal for
  /// review. Deterministic, non-blocking — the money is escrowed and the human
  /// is the judge. Set at match persist when the gate is enabled.
  matchRisk?: {
    decision: 'flag' | 'hold';
    flags: string[];
    reason: string;
    /// Per-flag lines, each tagged with the party it is for; the deal page shows
    /// a viewer only lines whose audience is their role or 'both'. Legacy rows
    /// hold bare strings (pre-audience); the UI treats those as 'both'.
    reasons: Array<string | { text: string; audience: 'buyer' | 'seller' | 'both' }>;
    paidConsulted: boolean;
    evaluatedAt: number;
    clearedAt?: number;
  };
  /// Security Agent verdict on whether the delivery meets the request (separate
  /// from link safety). 'partial'/'mismatch' surface a buyer review notice and
  /// pause auto-release; the proof is always shown, the buyer decides.
  deliveryMatch?: { verdict: 'aligned' | 'partial' | 'mismatch' | 'unknown'; reason: string };
  reviewWindowStartedAt?: number;
  reviewExtensionMs?: number;
  reviewExtensionCount?: number;
  firstAutoReleased?: boolean;
  disputed?: boolean;
  disputedAt?: number;
  cancelledAt?: number;
  cancelKind?:
    | 'mutual'
    | 'platform-attributed'
    | 'refund-from-dispute'
    | 'release-from-dispute'
    | 'unilateral'
    | 'pre-accept'
    /// v2b: the security-council arbiter split a post-accept dispute via
    /// resolve(). settledAt is set; the deal reads "resolved by arbiter".
    | 'resolved';
  cancelReason?: string;
  /// v2b arbiter split, seller share in basis points (0-10000). Set on a
  /// 'resolved' cancelKind so the UI can show who the ruling favoured.
  resolvedSellerBps?: number;
  /// When set, the loser of a Disputed-state resolution. 'seller' is set on a
  /// refund acceptance (seller conceded); 'buyer' is set on a release
  /// acceptance (buyer conceded). Drives the off-chain reputation penalty.
  disputeLoser?: 'buyer' | 'seller';
  cancellationProposal?: {
    proposedBy: 'buyer' | 'seller';
    kind:
      | 'mutual'
      | 'platform-attributed'
      | 'refund-from-dispute'
      | 'release-from-dispute';
    reason: string;
    proposedAt: number;
  };
  autoReleasedAt?: number;
  /// Acceptance window cutoff (unix seconds). When the seller hasn't accepted
  /// by this point, the watcher auto-cancels with cancelKind 'pre-accept' and
  /// no reputation hit. UI shows a countdown on the awaiting-acceptance stage.
  acceptanceDeadlineUnix?: number;
  /// Counterparty was invited by email and hasn't claimed the link yet. While
  /// this is set, the deal's seller (or buyer for inbound) is a sentinel and
  /// no on-chain funding has moved. The inviter sees a "share invite" CTA.
  pendingCounterparty?: {
    email: string;
    role: 'buyer' | 'seller';
    inviteToken: string;
  };
  /// Seller raised a delay appeal. If `delayAppealRespondedAt` is older, the
  /// appeal is OPEN and the buyer must respond before
  /// delayAppealRaisedAt + delayAppealResponseWindowMs or the final 50%
  /// auto-releases. Once responded, the seller can re-raise later.
  delayAppealRaisedAt?: number;
  delayAppealRespondedAt?: number;
  delayAppealResponse?: string;
  delayAppealCount?: number;
  /// Response window in ms surfaced by the backend so the UI can render the
  /// countdown without hard-coding the env value.
  delayAppealResponseWindowMs?: number;
  /// Grace ms until the seller becomes eligible to raise a delay appeal after
  /// the first milestone is released. Surfaced by the backend.
  delayAppealGraceMs?: number;
  /// Backend mirror of on-chain Settled. Set the moment the escrow settles
  /// (auto-release watcher or manual final-release handler). Authoritative
  /// even when the on-chain snapshot is missing from the response — a
  /// transient chain-read failure otherwise let `stageOf` slide a settled
  /// deal back to a "pending" stage and reappear in the pending bands.
  settledAt?: number;
  fundTxHash?: string;
  createdAt: number;
  updatedAt: number;
  reviewWindowMs?: number;
  onChain: DirectDealOnChain | null;
  /// True when the funds are still on a previous escrow contract. The deal
  /// detail page renders a banner pointing at /legacy so actions don't fail
  /// silently on the new escrow.
  legacyEscrow?: boolean;
  legacyState?: number;
  /// Buyer marked this as a trusted-match deal at create time. Surfaces stake
  /// requirement copy on the seller's accept panel. Chain-side enforcement
  /// arrives with the next escrow redeploy; flag is captured today so old
  /// deals already carry it when on-chain gating lands.
  requireStake?: boolean;
  /// Stake percentage chosen by the buyer for this deal (50..100). Only
  /// meaningful when requireStake is true.
  requireStakePct?: number;
  /// The agent's paid market read, carried from the match proposal so it stays
  /// visible on the deal page after funding. Agent-matched deals only.
  marketRead?: {
    keywords: string[];
    summary: string;
    demand: 'hot' | 'steady' | 'soft';
    priceNote: string;
    highlights: string[];
    sources: { title: string; url: string }[];
    amountUsd: number;
    txHash?: string;
    payer?: string;
    researchedAt: number;
  };
  // --- SME trade-finance fields (Phase 2 Track 2) ---------------------
  /// Trade type drives the milestone vocabulary on the deal page and the
  /// trade-context band's visibility. Absent on legacy service deals.
  tradeType?: 'service' | 'goods' | 'mixed';
  /// Match lane. 'finance' is the trade-finance (SME) lane factoring applies to;
  /// 'service' (or absent) is the P2P lane, never factorable.
  tradeLane?: 'service' | 'finance';
  /// The seller's reputation tier, stamped only on the financier's factoring
  /// available-deals feed so they can price risk. Absent elsewhere.
  sellerTier?: FactoringTier;
  incoterms?: 'EXW' | 'FCA' | 'FOB' | 'CIF' | 'DAP' | 'DDP';
  paymentTerms?: 'immediate' | 'net30' | 'net60' | 'net90';
  counterpartyCompany?: { name?: string; sector?: string; region?: string };
  documentRefs?: Array<{
    hash: string;
    kind: 'invoice' | 'po' | 'bol' | 'coo' | 'pod' | 'other';
    label?: string;
    anchoredAt?: number;
    txHash?: string;
  }>;
  factoringOfferId?: string;
  poFinancingId?: string;
  /// Pending delivery-deadline extension request from the seller. Buyer sees
  /// a banner with Approve / Decline; the request clears either way.
  extensionRequest?: {
    requestedBy: 'seller';
    requestedAt: number;
    additionalSeconds: number;
    reason?: string;
  };
  /// Settled extension activity. Each entry is a finalized request the buyer
  /// either approved (deadlineUnix bumped) or declined.
  extensionHistory?: {
    requestedBy: 'seller';
    requestedAt: number;
    additionalSeconds: number;
    reason?: string;
    decidedAt: number;
    decision: 'approved' | 'declined';
    newDeadlineUnix?: number;
  }[];
}

export interface MarketplaceBrief {
  jobId: string;
  /// Pre-masked by the backend (0xabcd…wxyz) so the marketplace surface
  /// doesn't leak full wallet addresses to anyone who hits the endpoint.
  buyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  briefText: string;
  bidsCount: number;
  postedAt: number;
  /// Match lane + poster account type. A business-account market view filters
  /// to finance-lane or business-posted cards. Absent reads as service/person.
  tradeLane?: 'service' | 'finance';
  partyKind?: 'person' | 'business';
}

export type ListingStatus = 'open' | 'matched' | 'cancelled' | 'expired';

export interface Listing {
  id: string;
  sellerUser: string;
  sellerAgent: string;
  title: string;
  description: string;
  askingPriceUsdc: number;
  negotiationMaxDecreasePct?: number;
  postedAt: number;
  /// Unix-ms when the listing window closes. Past this, listingStatus is
  /// 'expired' and the backend drops it from match scanners.
  expiresAt: number;
  matchedAt?: number;
  matchedJobId?: string;
  /// Set when the seller cancels their own listing pre-match.
  cancelledAt?: number;
  /// Match lane + seller account type. A business-account market view filters
  /// to finance-lane or business-posted cards. Absent reads as service/person.
  tradeLane?: 'service' | 'finance';
  partyKind?: 'person' | 'business';
}

export interface MatchProposal {
  jobId: string;
  buyerUser: string;
  buyerAgent: string;
  sellerUser: string;
  sellerAgent: string;
  agreedPriceUsdc: string;
  deadlineUnix: number;
  termsHash: string;
  proposedAt: number;
  approvedAt?: number;
  declinedAt?: number;
  /// Seller raise at the approval gate. When awaitingParty is 'buyer', the seller
  /// asked for more than the agent agreed: the buyer now approves at
  /// raisedPriceUsdc (funds) or declines. originalPriceUsdc is the agent-settled
  /// price for "was X" display; raiseOverCap flags a raise above the buyer's cap.
  raisedPriceUsdc?: string;
  originalPriceUsdc?: string;
  raisedAt?: number;
  raiseOverCap?: boolean;
  awaitingParty?: 'seller' | 'buyer';
  /// Deterministic risk signal computed when the proposal was created.
  /// Surfaced in MatchBanner so the human sees why the agent flagged it.
  /// 'new-buyer' is set by the seller agent's tier adjustment for NEW-tier
  /// buyers (docs/reputation-model.md §6) and trumps the buyer-side pattern.
  riskFlag?:
    | 'honey-trap'
    | 'lowball'
    | 'spammy'
    | 'new-buyer'
    | 'concentration-soft'
    | 'concentration-high';
  riskNote?: string;
  /// Balance awareness from the buyer agent at propose time. fundable=false
  /// means the agent agreed within the buyer's authorized cap but its wallet is
  /// short by topUpNeededUsdc, so the buyer must top up before the seller's
  /// accept can fund escrow. undefined on legacy proposals (treat as unknown).
  fundable?: boolean;
  agentBalanceUsdc?: string;
  fundedAmountUsdc?: string;
  topUpNeededUsdc?: string;
  /// Credit passport the buyer agent paid for over x402 at bid time. Real
  /// USDC moved (agent Gateway deposit to platform treasury); transaction
  /// is the Gateway settlement reference. Absent when paid signals were
  /// off or the pull failed.
  paidSignal?: {
    tier: string;
    score: number;
    amountUsd: number;
    transaction: string;
    paidAt: number;
  };
  /// Market read the agent paid for over x402 on Base (Exa web search,
  /// synthesised with the platform LLM). Keyed to the deal's keywords, shown to
  /// both parties with the payment as on-chain evidence.
  marketRead?: {
    keywords: string[];
    summary: string;
    demand: 'hot' | 'steady' | 'soft';
    priceNote: string;
    highlights: string[];
    sources: { title: string; url: string }[];
    amountUsd: number;
    /// On-chain settlement tx (Base) for the research payment, when echoed.
    txHash?: string;
    /// The agent's Base payer wallet. On-chain evidence even without a tx hash:
    /// its BaseScan history shows the real USDC spend.
    payer?: string;
    researchedAt: number;
  };
  /// Compact verified-business badge for the match. Present when the seller's
  /// owner is a verified business. The deal page renders a chip from this, not
  /// a full company profile.
  counterpartyBusiness?: {
    accountType: 'business';
    companyName?: string;
    sector?: string;
    region?: string;
  };
}

/// Agents found a topical match, but the best achievable price lands just
/// outside one party's range. Instead of skipping, the agent asks that party
/// to proceed at the agreed price (anchored at the other side's boundary, so a
/// single yes closes the deal). Valid until expiresAt; lapses to nothing.
export interface MarketAdvisory {
  jobId: string;
  buyer: string;
  budgetUsdc: number;
  fairPriceUsdc?: number;
  overPct: number;
  demand?: 'hot' | 'steady' | 'soft';
  note?: string;
  createdAt: number;
}

export interface WorkRecordRow {
  category: string;
  amountBand: string;
  outcome: 'clean' | 'disputed' | 'failed';
  deliveredVia: 'code' | 'design' | 'file' | 'link' | null;
  ageLabel: string;
}

export interface CounterpartyReport {
  locked: boolean;
  subject: string;
  record?: {
    rows: WorkRecordRow[];
    summary: {
      total: number;
      clean: number;
      disputed: number;
      failed: number;
      avgBand: string;
      completionRate: number | null;
      onTimeRate: number | null;
    };
    asBuyer: { funded: number; cleanRate: number | null };
  };
  /// The internal x402 receipt: what the agent paid on Arc to pull this record.
  /// Null when there was no paid pull. The per-read settlement is gasless and
  /// batched by Circle Gateway, so `txHash` is usually absent; `depositTxHash`
  /// (the Arc tx that funded the pull) and `payer` (the paying wallet) are the
  /// real on-chain proof the UI links instead.
  payment?: {
    amountUsd: number;
    txHash?: string;
    payer?: string;
    depositTxHash?: string;
  } | null;
}

export interface NearMissApproval {
  jobId: string;
  buyerUser: string;
  buyerAgent: string;
  sellerUser: string;
  sellerAgent: string;
  askedSide: 'buyer' | 'seller';
  askedUser: string;
  proceedPriceUsdc: string;
  limitUsdc: string;
  gapUsdc: string;
  buyerCeilingUsdc: string;
  sellerFloorUsdc: string;
  createdAt: number;
  expiresAt: number;
  proceededAt?: number;
  declinedAt?: number;
  buyerAsked?: boolean;
  marketDemand?: 'hot' | 'steady' | 'soft';
  marketNote?: string;
  marketFairPriceUsdc?: number;
}

export interface DirectDealFunding {
  dealAmountUsdc: string;
  fundedAmountUsdc: string;
  sellerNetUsdc: string;
  feeTotalUsdc: string;
}

export interface ActivationStatus {
  activated: boolean;
  agents?: { buyer: string; seller: string; buyerName?: string; sellerName?: string };
}

export interface NetworkOnchainDayPoint {
  ts: number;
  funded: number;
  settled: number;
  disputed: number;
  refunded: number;
}

export interface NetworkOnchainStats {
  fromBlock: string;
  toBlock: string;
  contracts: {
    escrow: string;
    vault: string;
    treasury: string;
    reputation: string;
    jobBoard: string;
    /// KarwanYieldDistributor — the per-address USDC claim contract for
    /// daily-credited staker yield. Empty string when not configured.
    yieldDistributor: string;
  };
  totals: {
    jobsPosted: number;
    escrowsFunded: number;
    escrowsSettled: number;
    escrowsDisputed: number;
    escrowsRefunded: number;
    milestoneReleases: number;
    vaultDeposits: number;
    vaultClaims: number;
    vaultSlashes: number;
    reputationRecords: number;
    yieldClaims: number;
  };
  volumes: {
    fundedUsdc: string;
    releasedUsdc: string;
    refundedUsdc: string;
    slashedUsdc: string;
    feesCollectedUsdc: string;
    vaultDepositsUsdc: string;
  };
  series: NetworkOnchainDayPoint[];
  scannedAt: number;
}

/// Optional custom names for the agent pair. Blank/omitted means the UI shows
/// the default "Buyer agent" / "Seller agent".
export interface AgentNames {
  buyerName?: string;
  sellerName?: string;
}

export interface Reputation {
  address: string;
  /// Legacy bps score (0..10000). Kept for backward-compatible badge UI.
  scoreBps: number;
  successCount: number;
  disputedCount: number;
  failedCount: number;
  totalDeals: number;
  /// New composite engine output (docs/reputation-model.md). Optional so
  /// older API responses don't break the type.
  score?: number;
  tier?: 'NEW' | 'COLD' | 'ESTABLISHED' | 'STRONG' | 'ELITE';
  /// Composite engine v2 factor breakdown (docs/reputation-model.md). All [0,1].
  terms?: {
    stake?: number;
    completion?: number;
    volume?: number;
    tenure?: number;
    activity?: number;
    referral?: number;
    base?: number;
    penalty?: number;
    decay?: number;
  };
  /// Present + within the 48h window when the user just crossed into a higher
  /// tier. Drives the profile congrats card.
  tierCelebration?: { tier: 'NEW' | 'COLD' | 'ESTABLISHED' | 'STRONG' | 'ELITE'; until: number } | null;
  modelVersion?: number;
  /// Raw inputs the engine fed into the formula. Used by the credit passport
  /// to display tenure days, the chain-vs-DB settlement gap, lifetime volume,
  /// etc. without re-fetching every source. Shape mirrors the backend's
  /// ReputationInputs interface; only the fields the UI actually consumes
  /// are listed here.
  inputs?: {
    registeredAt?: number;
    stakeUsdc?: number;
    stakeDays?: number;
    activeDays?: number;
    lifetimeVolumeUsdc?: number;
    completedDeals?: number;
  };
}

export interface BalanceRow {
  label: string;
  address: string | null;
  balanceUsdc: string | null;
  balanceWei?: string;
  error?: string;
}

export interface ChainEvent {
  type: string;
  jobId?: string;
  actor: 'buyer' | 'seller' | 'platform';
  ts: number;
  payload: Record<string, unknown>;
}

export type FeedbackCategory = 'bug' | 'improvement' | 'other' | 'praise';
export type FeedbackStatus = 'new' | 'triaged' | 'resolved';

export interface FeedbackItem {
  id: string;
  category: FeedbackCategory;
  title: string;
  message: string;
  contact: string | null;
  context: { url?: string; wallet?: string; userAgent?: string } | null;
  status: FeedbackStatus;
  createdAt: number;
  /// Absolute when PUBLIC_API_BASE_URL is set on the backend, otherwise a
  /// path relative to the API origin. The viewer prefixes with api.baseUrl.
  screenshotUrls: string[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
    public code?: string,
  ) {
    super(message);
  }
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
    // Session cookie travels on every API call so the backend can resolve
    // the current user without a token header dance. Backend CORS echoes the
    // Origin and sets Access-Control-Allow-Credentials.
    credentials: 'include',
    ...init,
  });
  if (!res.ok) {
    let parsed: unknown = res.statusText;
    try {
      parsed = await res.json();
    } catch {
      parsed = await res.text().catch(() => res.statusText);
    }
    // Extract a usable message from the response shape. The backend's various
    // routes use slightly different keys for the human line: `error`, `detail`,
    // `message`, `reason`, sometimes a `status` enum. Before this rewrite we
    // only looked at `error`, so a body like `{ status: 'relaying', detail:
    // 'a relay is already in progress' }` fell into `String(parsed)` and
    // surfaced the famous "[object Object]". Iterate the common fields in
    // priority order; fall back to JSON.stringify before resorting to a raw
    // String() coercion.
    let message: string;
    if (typeof parsed === 'string') {
      message = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const o = parsed as Record<string, unknown>;
      const candidates = [o.error, o.detail, o.message, o.reason, o.status];
      const found = candidates.find(
        (c): c is string => typeof c === 'string' && c.trim().length > 0,
      );
      if (found) {
        message = found;
      } else {
        try {
          message = JSON.stringify(parsed);
        } catch {
          message = res.statusText || `HTTP ${res.status}`;
        }
      }
    } else {
      message = res.statusText || `HTTP ${res.status}`;
    }
    const detail =
      typeof parsed === 'object' && parsed && 'detail' in parsed
        ? (parsed as { detail: unknown }).detail
        : undefined;
    const code =
      typeof parsed === 'object' && parsed && 'code' in parsed
        ? String((parsed as { code: unknown }).code)
        : undefined;
    throw new ApiError(res.status, message, detail, code);
  }
  return res.json() as Promise<T>;
}

// Operator-only admin token, held IN MEMORY ONLY — a module variable, never
// written to sessionStorage/localStorage/cookies. It survives client-side
// navigation between admin pages (the SPA keeps this module alive) but is gone
// on a hard refresh or new tab, so there is no persisted credential for an XSS
// or cookie-theft attacker to lift. Sent as the X-Admin-Token header; the
// backend fail-closes when ADMIN_API_TOKEN is unset (503) and 401s on mismatch.
let adminToken: string | null = null;

export function getAdminToken(): string | null {
  return adminToken;
}

export function setAdminToken(token: string | null): void {
  adminToken = token && token.trim() ? token.trim() : null;
}

function adminHeaders(): Record<string, string> {
  const t = getAdminToken();
  return t ? { 'x-admin-token': t } : {};
}

export interface AdminDealRow {
  jobId: string;
  buyer: string;
  seller: string;
  amountUsdc: string;
  origin: string;
  stage: string;
  createdAt: number;
  acceptedAt?: number;
  settledAt?: number;
  cancelledAt?: number;
  disputed: boolean;
  deadlineUnix?: number;
}

export interface AdminEventEntry {
  type: string;
  jobId: string;
  ts: number;
  data: {
    type: string;
    jobId?: string;
    actor: string;
    ts: number;
    payload?: Record<string, unknown>;
  };
}

export interface AdminTicketRow {
  id: string;
  address: string | null;
  email: string | null;
  messageCount: number;
  lastRole: string | null;
  lastText: string;
  createdAt: number;
  updatedAt: number;
}

export interface AdminProfileRow {
  address: string;
  displayName: string;
  role: string;
  accountType: string;
  accountKind: string;
  email: string | null;
  emailVerified: boolean;
  businessStatus: string;
  researchActive: boolean;
  researchCreditUsdc: number;
  createdAt: number;
}

/// A paid market read as the backend returns it (x402 externalClient MarketRead).
/// `paidUsd` maps to the MarketReadCard's `amountUsd` when rendering.
export interface ApiMarketRead {
  keywords: string[];
  summary: string;
  demand: 'hot' | 'steady' | 'soft';
  priceNote: string;
  fairPriceUsdc?: number;
  priceConfidence?: 'grounded' | 'rough' | 'none';
  highlights: string[];
  sources: { title: string; url: string }[];
  paidUsd: number;
  payer?: string;
  txHash?: string;
  researchedAt: number;
  cached: boolean;
}

export interface ScoutReadEntry {
  id: string;
  owner: string;
  ts: number;
  read: ApiMarketRead;
}

export const api = {
  baseUrl: BASE,
  eventsUrl: () => `${BASE}/api/events`,
  status: () => json<ApiStatus>('/api/agents/status'),
  buyer: (address?: string) =>
    json<{ profile: BuyerAgentProfile | null; jobs: BuyerJob[] }>(
      `/api/agents/buyer${address ? `?address=${address}` : ''}`,
    ),
  seller: (address?: string) =>
    json<{ profile: SellerAgentProfile | null; activeBids: SellerActiveBid[] }>(
      `/api/agents/seller${address ? `?address=${address}` : ''}`,
    ),
  /// Abandon one of the signed-in seller's own in-flight bids. Identity is the
  /// session cookie; the backend scopes to the caller's seller agent.
  abandonBid: (jobId: string) =>
    json<{ ok: boolean; abandoned: boolean }>('/api/agents/seller/bids/abandon', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    }),
  /// Natural-language deal extractor for the hybrid intake. Free text in,
  /// structured fields + per-field confidence out. The form remains the
  /// source of truth; every field returned here is editable before posting.
  /// `surface` selects which fields the model focuses on; irrelevant fields
  /// stay null and the per-surface composer maps the subset it cares about.
  extractDeal: (body: { text: string; surface: 'direct' | 'brief' | 'listing' }) =>
    json<{
      ok: true;
      extracted: {
        amountUsdc: number | null;
        deadlineDays: number | null;
        terms: string;
        title: string | null;
        tolerancePct: number | null;
        suggestedFirstMilestonePct: number | null;
        suggestedTrustedMatch: boolean | null;
        counterpartyHint: string | null;
        confidence: { amount: number; deadline: number; terms: number };
        notes: string[];
      };
    }>('/api/agents/extract-deal', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  job: (id: string, caller?: string | null) =>
    json<BuyerJob>(withCaller(`/api/jobs/${id}`, caller)),
  matchProposal: (jobId: string, caller?: string | null) =>
    json<{ proposal: MatchProposal | null }>(withCaller(`/api/jobs/${jobId}/match`, caller)),
  matchesFor: (address: string) =>
    json<{ proposals: MatchProposal[] }>(`/api/jobs/matches/for?caller=${address}`),
  approveMatch: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string; txHash: string }>(
      `/api/jobs/${jobId}/approve-match`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  declineMatch: (jobId: string, caller: string, reason?: string) =>
    json<{ accepted: boolean; jobId: string }>(
      `/api/jobs/${jobId}/decline-match`,
      { method: 'POST', body: JSON.stringify({ caller, ...(reason ? { reason } : {}) }) },
    ),
  raiseMatchOffer: (jobId: string, caller: string, priceUsdc: string) =>
    json<{ accepted: boolean; jobId: string; overCap: boolean }>(
      `/api/jobs/${jobId}/raise-offer`,
      { method: 'POST', body: JSON.stringify({ caller, priceUsdc }) },
    ),
  cancelBrief: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string }>(
      `/api/jobs/${jobId}/cancel`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  /// Pre-match edit on a buyer's request. briefText, negotiationMaxIncreasePct,
  /// and trustedMatch are all optional and at least one must change. Budget
  /// and deadline aren't editable here because they live on the JobBoard
  /// contract.
  editBrief: (
    jobId: string,
    body: {
      caller: string;
      briefText?: string;
      negotiationMaxIncreasePct?: number;
      trustedMatch?: boolean;
    },
  ) =>
    json<{
      brief: {
        jobId: string;
        briefText: string;
        postedBy: string;
        negotiationMaxIncreasePct?: number;
        trustedMatch?: boolean;
      };
    }>(`/api/jobs/${jobId}/edit`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  nearMiss: (jobId: string, caller?: string | null) =>
    json<{ nearMiss: NearMissApproval | null }>(
      withCaller(`/api/jobs/${jobId}/near-miss`, caller),
    ),
  marketAdvisory: (jobId: string, caller?: string | null) =>
    json<{ advisory: MarketAdvisory | null }>(
      withCaller(`/api/jobs/${jobId}/market-advisory`, caller),
    ),
  proceedNearMiss: (jobId: string, caller: string) =>
    json<{ proceeded: boolean; jobId: string; txHash: string }>(
      `/api/jobs/${jobId}/near-miss`,
      { method: 'POST', body: JSON.stringify({ caller, action: 'proceed' }) },
    ),
  declineNearMiss: (jobId: string, caller: string) =>
    json<{ declined: boolean; reopened: boolean; jobId: string }>(
      `/api/jobs/${jobId}/near-miss`,
      { method: 'POST', body: JSON.stringify({ caller, action: 'decline' }) },
    ),
  /// Bring back the offer the buyer passed (out-of-reach advisory). Re-raises the
  /// near-miss so the buyer can proceed; the near-miss card then renders.
  reconsiderPassed: (jobId: string, caller: string) =>
    json<{ reconsidered: boolean; jobId: string; proceedPriceUsdc: string }>(
      `/api/jobs/${jobId}/reconsider`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  listings: () => json<{ listings: Listing[] }>('/api/listings'),
  listingsForSeller: (address: string) =>
    json<{ listings: Listing[] }>(`/api/listings/mine?address=${address}`),
  getListing: (id: string, caller?: string) => {
    const q = caller ? `?caller=${caller}` : '';
    return json<{
      listing: Listing;
      floor?: number;
      viewerIsOwner?: boolean;
      status: ListingStatus;
    }>(`/api/listings/${id}${q}`);
  },
  cancelListing: (id: string, caller: string) =>
    json<{ listing: Listing }>(`/api/listings/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ caller }),
    }),
  editListing: (
    id: string,
    caller: string,
    patch: {
      title?: string;
      description?: string;
      askingPriceUsdc?: number;
      negotiationMaxDecreasePct?: number;
      ttlDays?: number;
    },
  ) =>
    json<{ listing: Listing }>(`/api/listings/${id}/edit`, {
      method: 'POST',
      body: JSON.stringify({ caller, ...patch }),
    }),
  marketplaceBriefs: () =>
    json<{ briefs: MarketplaceBrief[] }>(`/api/jobs/marketplace`),
  postListing: (body: {
    sellerUser: string;
    title: string;
    description: string;
    askingPriceUsdc: number;
    negotiationMaxDecreasePct?: number;
    ttlDays?: number;
  }) =>
    json<{ listing: Listing }>('/api/listings', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  dealsFeed: () => json<{ deals: DirectDeal[] }>('/api/deals/feed'),
  /// Aggregate network numbers only (no per-deal data). Use this for stat
  /// counters; the feed itself is settled-only and private-safe.
  dealsStats: () =>
    json<{ total: number; direct: number; agent: number; settled: number; volumeUsdc: number }>(
      '/api/deals/stats',
    ),
  /// Provable on-chain stats scanned from current contract events. Counts,
  /// USDC volumes, and a 30-day daily series of funded/settled/disputed/refunded.
  /// Accepts a RequestInit so callers can attach an AbortSignal — cold-cache
  /// builds chunk through 30 days of log history and occasionally outlive a
  /// reasonable wait.
  networkOnchain: (init?: RequestInit) =>
    json<NetworkOnchainStats>('/api/network/onchain', init),
  /// Finance-lane (business) jobIds. The /activity page strips these events to
  /// bare on the public feed: the event still shows, the amount and parties do
  /// not. Business trade is sensitive, so only the fact of activity is public.
  activityFinanceJobIds: () =>
    json<{ jobIds: string[] }>('/api/activity/finance-jobids'),
  submitFeedback: (body: {
    category: 'bug' | 'improvement' | 'other' | 'praise';
    title: string;
    message: string;
    contact?: string;
    context?: { url?: string; wallet?: string; userAgent?: string };
    screenshots?: { dataUrl: string }[];
  }) =>
    json<{ ok: true; id: string }>('/api/feedback', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listFeedback: () =>
    json<{ feedback: FeedbackItem[] }>('/api/feedback', { headers: adminHeaders() }),
  setFeedbackStatus: (id: string, status: FeedbackStatus) =>
    json<{ ok: true; status: FeedbackStatus }>(`/api/feedback/${id}/status`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ status }),
    }),

  // Admin monitoring (token-gated, in-memory token).
  adminDeals: () =>
    json<{ count: number; deals: AdminDealRow[] }>('/api/admin/deals', {
      headers: adminHeaders(),
    }),
  adminProfiles: () =>
    json<{ count: number; profiles: AdminProfileRow[] }>('/api/admin/profiles', {
      headers: adminHeaders(),
    }),
  adminExtendDeal: (jobId: string, additionalSeconds: number) =>
    json<{ ok: true; newDeadlineUnix: number }>(`/api/admin/deals/${jobId}/extend`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ additionalSeconds }),
    }),
  adminReleaseDeal: (jobId: string) =>
    json<{ ok: true; txHash: string; settled: boolean; milestoneIndex: number }>(
      `/api/admin/deals/${jobId}/release`,
      { method: 'POST', headers: adminHeaders() },
    ),
  adminSetResearch: (address: string, active: boolean, creditUsdc?: number) =>
    json<{ ok: true; active: boolean; creditUsdc: number }>(
      `/api/admin/profiles/${address}/research`,
      {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ active, ...(creditUsdc !== undefined ? { creditUsdc } : {}) }),
      },
    ),
  adminSetBusiness: (address: string, status: 'none' | 'submitted' | 'verified' | 'rejected') =>
    json<{ ok: true; status: string; accountType: string }>(
      `/api/admin/profiles/${address}/business`,
      { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ status }) },
    ),
  // The on-chain verification queue + decision. Distinct from adminSetBusiness:
  // review signs approve()/reject() on the registry via the reviewer wallet,
  // whereas adminSetBusiness is a pure off-chain override for a stuck case.
  adminBusinessPending: () =>
    json<{
      pending: Array<{
        address: string;
        docHash?: string;
        docKind?: string;
        label?: string;
        submittedAt?: number;
        submitTxHash?: string;
        company: { companyName?: string; sector?: string; region?: string } | null;
      }>;
    }>('/api/admin/business/pending', { headers: adminHeaders() }),
  adminReviewBusiness: (
    applicant: string,
    decision: 'approve' | 'reject',
    reasonHash?: string,
  ) =>
    json<{ ok: true; decision: string; txHash: string }>('/api/admin/business/review', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ applicant, decision, ...(reasonHash ? { reasonHash } : {}) }),
    }),
  adminAssistantHealth: () =>
    json<{
      configured: boolean;
      providers: Array<{
        name: string;
        model: string;
        ok: boolean;
        status?: number;
        detail?: string;
        latencyMs: number;
        sample?: string;
      }>;
    }>('/api/admin/assistant-health', { headers: adminHeaders() }),
  adminHealth: () =>
    json<{
      checkedAt: number;
      overall: 'healthy' | 'degraded';
      modelGateway: {
        primary: string;
        providers: Array<{
          name: string;
          model: string;
          ok: boolean;
          status?: number;
          detail?: string;
          latencyMs: number;
          sample?: string;
        }>;
      };
      funds: Array<{ label: string; address: string; balanceUsdc: string | null; ok: boolean; detail?: string }>;
      infrastructure: Array<{ label: string; ok: boolean; detail?: string }>;
      features: Array<{ label: string; on: boolean }>;
      watchers: Array<{
        name: string;
        label: string;
        enabled: boolean;
        status: 'healthy' | 'stalled' | 'missing' | 'dormant';
        lastRunAt: number | null;
        ageMs: number | null;
        runs: number;
      }>;
      crons: Array<{
        name: string;
        label: string;
        schedule: string;
        lastRunDate: string | null;
        status: 'fresh' | 'stale' | 'unknown';
        detail?: string;
      }>;
    }>('/api/admin/health', { headers: adminHeaders() }),
  adminAgentSeedStatus: (address: string) =>
    json<{
      address: string;
      keyConfigured: boolean;
      seedAmountUsdc: number;
      operator: { address: string; balanceUsdc: string } | null;
      agents: {
        buyer: { address: string; balanceUsdc: string | null };
        seller: { address: string; balanceUsdc: string | null };
      } | null;
    }>(`/api/admin/agent-seed/${address}`, { headers: adminHeaders() }),
  adminAgentSeedRun: (address: string) =>
    json<{
      address: string;
      buyer: { ok: boolean; txHash?: string; reason?: string };
      seller: { ok: boolean; txHash?: string; reason?: string };
    }>(`/api/admin/agent-seed/${address}`, { method: 'POST', headers: adminHeaders() }),
  adminWhoami: () =>
    json<{ role: 'admin' | 'support' | null }>('/api/admin/support/whoami', {
      headers: adminHeaders(),
    }),
  adminSupportList: () =>
    json<{ count: number; tickets: AdminTicketRow[] }>('/api/admin/support', {
      headers: adminHeaders(),
    }),
  adminSupportGet: (id: string) =>
    json<{
      id: string;
      address: string | null;
      email: string | null;
      status: 'open' | 'closed';
      messages: Array<{ role: 'user' | 'assistant' | 'operator' | 'system'; text: string; ts: number }>;
    }>(`/api/admin/support/${id}`, { headers: adminHeaders() }),
  adminSupportReply: (id: string, text: string) =>
    json<{ ok: true }>(`/api/admin/support/${id}/reply`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ text }),
    }),
  adminSupportClose: (id: string) =>
    json<{ ok: true }>(`/api/admin/support/${id}/close`, {
      method: 'POST',
      headers: adminHeaders(),
    }),
  adminWalletIntegrity: () =>
    json<{
      total: number;
      emptyBuyer: string[];
      emptySeller: string[];
      sharedAddresses: { address: string; role: 'buyer' | 'seller' | 'mixed'; users: string[] }[];
    }>('/api/admin/agent-wallets/integrity', { headers: adminHeaders() }),
  adminEvents: (params: { jobId?: string; address?: string; type?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params.jobId) qs.set('jobId', params.jobId);
    if (params.address) qs.set('address', params.address);
    if (params.type) qs.set('type', params.type);
    if (params.limit) qs.set('limit', String(params.limit));
    return json<{ count: number; events: AdminEventEntry[] }>(`/api/admin/events?${qs.toString()}`, {
      headers: adminHeaders(),
    });
  },
  postJob: (
    body: {
      posterAddress: string;
      brief: string;
      budgetUsdc: number;
      negotiationMaxIncreasePct?: number;
      trustedMatch?: boolean;
      // Per-brief milestone split stated in the request ("30% then 70%").
      // Percentages sum to 100; overrides the buyer profile default at funding.
      milestonePcts?: number[];
      // SME trade-finance fields (Phase 2 Track 2). All optional; legacy
      // service flows continue to post without them.
      tradeType?: 'service' | 'goods' | 'mixed';
      incoterms?: 'EXW' | 'FCA' | 'FOB' | 'CIF' | 'DAP' | 'DDP';
      paymentTerms?: 'immediate' | 'net30' | 'net60' | 'net90';
      counterpartyCompany?: { name?: string; sector?: string; region?: string };
      documentRefs?: Array<{
        hash: string;
        kind: 'invoice' | 'po' | 'bol' | 'coo' | 'pod' | 'other';
        label?: string;
      }>;
    } & ({ deadlineSeconds: number } | { deadlineDays: number }),
  ) =>
    json<{ jobId: string; deadlineUnix: number; txHash: string; explorerUrl: string }>(
      '/api/jobs',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  releaseMilestones: (jobId: string, totalMilestones = 2) =>
    json<{ accepted: boolean; jobId: string; totalMilestones: number }>(
      '/api/milestones/release',
      { method: 'POST', body: JSON.stringify({ jobId, totalMilestones }) },
    ),
  balances: () => json<{ wallets: BalanceRow[]; fetchedAt: number }>('/api/balances'),
  getProfile: (address: string) =>
    json<{ profile: UserProfile | null }>(`/api/profile?address=${address}`),
  saveProfile: (input: Omit<UserProfile, 'createdAt' | 'updatedAt'>) =>
    json<{ profile: UserProfile }>('/api/profile', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  setXHandle: (address: string, handle: string | null) =>
    json<{ profile: UserProfile }>('/api/profile/x-handle', {
      method: 'POST',
      body: JSON.stringify({ address, handle }),
    }),
  /// Contact email add + verify for wallet users. request sends a 6-digit code
  /// to the email; verify confirms it and persists email + emailVerified.
  /// devCode is only present in non-production when no email provider is set.
  requestEmailVerify: (address: string, email: string) =>
    json<{ sent: boolean; delivered: boolean; devCode?: string }>(
      '/api/profile/email/request',
      { method: 'POST', body: JSON.stringify({ address, email }) },
    ),
  verifyEmail: (address: string, code: string) =>
    json<{ profile: UserProfile }>('/api/profile/email/verify', {
      method: 'POST',
      body: JSON.stringify({ address, code }),
    }),
  removeEmail: (address: string) =>
    json<{ profile: UserProfile }>('/api/profile/email/remove', {
      method: 'POST',
      body: JSON.stringify({ address }),
    }),
  /// Newsletter opt-in from the footer subscribe box. Separate from a user's
  /// verified contact email: this is a marketing list (a Resend Audience) and
  /// unsubscribing never touches the verified-email list.
  subscribeNewsletter: (email: string) =>
    json<{ ok: boolean }>('/api/newsletter/subscribe', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  /// Delete the account: purges off-chain profile + Telegram link + Circle auth
  /// row. If agent wallets still hold USDC, throws ApiError with code
  /// 'agent-funds' (a confirmable warning); re-call with force=true to proceed.
  deleteAccount: (address: string, force = false) =>
    json<{ ok: boolean }>(
      `/api/profile?address=${address}${force ? '&force=true' : ''}`,
      { method: 'DELETE' },
    ),
  getSettings: (address: string) =>
    json<{ settings: UserSettings }>(`/api/settings?address=${address}`),
  saveSettings: (address: string, settings: UserSettings) =>
    json<{ settings: UserSettings }>('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ address, settings }),
    }),
  xStatus: () => json<{ configured: boolean }>('/api/x/status'),
  xOauthStart: (address: string, returnTo?: string) =>
    json<{ url: string }>('/api/x/oauth/start', {
      method: 'POST',
      body: JSON.stringify({ address, returnTo }),
    }),

  // ── Email + passkey (Circle login) ────────────────────────────────────────
  authStatus: () => json<{ configured: boolean }>('/api/auth/status'),
  authMe: () =>
    json<{
      user: {
        address: string;
        method: 'web3' | 'circle';
        email?: string;
        hasPasskey?: boolean;
      } | null;
    }>('/api/auth/me'),
  /// One round-trip session + profile, so an authed page resolves both in a
  /// single call instead of authMe -> getProfile serially. useAuth seeds the
  /// profile query cache from `profile` so useUserProfile finds it without a
  /// second request.
  bootstrap: () =>
    json<{
      user: {
        address: string;
        method: string;
        email?: string;
        hasPasskey?: boolean;
      } | null;
      profile: UserProfile | null;
    }>('/api/auth/bootstrap'),
  authLogout: () => json<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  authLookup: (email: string) =>
    json<{ exists: boolean; hasPasskey: boolean }>('/api/auth/lookup', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  authPasskeyAddOptions: () =>
    json<{ options: PublicKeyCredentialCreationOptionsJSON }>(
      '/api/auth/passkey/add/options',
      { method: 'POST', body: JSON.stringify({}) },
    ),
  authPasskeyAddVerify: (email: string, response: RegistrationResponseJSON) =>
    json<{ ok: boolean }>(
      '/api/auth/passkey/add/verify',
      { method: 'POST', body: JSON.stringify({ email, response }) },
    ),
  authRegisterOptions: (email: string) =>
    json<{ options: PublicKeyCredentialCreationOptionsJSON }>(
      '/api/auth/register/options',
      { method: 'POST', body: JSON.stringify({ email }) },
    ),
  authRegisterVerify: (email: string, response: RegistrationResponseJSON) =>
    json<{ user: { address: string; email: string; method: 'circle' } }>(
      '/api/auth/register/verify',
      { method: 'POST', body: JSON.stringify({ email, response }) },
    ),
  authLoginOptions: (email: string) =>
    json<{ options: PublicKeyCredentialRequestOptionsJSON }>(
      '/api/auth/login/options',
      { method: 'POST', body: JSON.stringify({ email }) },
    ),
  authLoginVerify: (email: string, response: AuthenticationResponseJSON) =>
    json<{ user: { address: string; email: string; method: 'circle' } }>(
      '/api/auth/login/verify',
      { method: 'POST', body: JSON.stringify({ email, response }) },
    ),
  authOtpRequest: (email: string) =>
    json<{ sent: boolean; delivered?: boolean; devCode?: string }>(
      '/api/auth/otp/request',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
    ),
  authOtpVerify: (email: string, code: string) =>
    json<{ user: { address: string; email: string; method: 'circle' } }>(
      '/api/auth/otp/verify',
      { method: 'POST', body: JSON.stringify({ email, code }) },
    ),

  // ── SIWE (Sign-In With Ethereum) for web3 wallet users ────────────────────
  siweNonce: (address: string, chainId?: number) =>
    json<{ nonce: string; message: string }>('/api/siwe/nonce', {
      method: 'POST',
      body: JSON.stringify({ address, chainId }),
    }),
  siweVerify: (address: string, signature: string) =>
    json<{ user: { address: string; method: 'web3' } }>('/api/siwe/verify', {
      method: 'POST',
      body: JSON.stringify({ address, signature }),
    }),
  activity: (limit = 100, jobId?: string, caller?: string) => {
    const q = new URLSearchParams();
    q.set('limit', String(limit));
    if (jobId) q.set('jobId', jobId);
    if (caller) q.set('caller', caller);
    return json<{ events: ChainEvent[] }>(`/api/activity?${q.toString()}`);
  },
  reputation: (address: string, fresh = false) =>
    json<Reputation>(`/api/reputation?address=${address}${fresh ? '&fresh=1' : ''}`),
  activationStatus: (address: string) =>
    json<ActivationStatus>(`/api/activation/status?address=${address}`),
  activate: (address: string, names?: AgentNames) =>
    json<ActivationStatus>('/api/activation/activate', {
      method: 'POST',
      body: JSON.stringify({ address, ...names }),
    }),
  setAgentNames: (address: string, names: AgentNames) =>
    json<ActivationStatus>('/api/activation/agent-names', {
      method: 'POST',
      body: JSON.stringify({ address, ...names }),
    }),
  withdrawFromAgent: (body: {
    address: string;
    agent: 'buyer' | 'seller';
    toAddress: string;
    amountUsdc: number;
  }) =>
    json<{ accepted: boolean; txHash: string }>('/api/activation/withdraw', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /// Circle-only: top up an agent wallet directly from the user's Circle
  /// identity DCW. The backend signs the USDC.transfer on the user's behalf,
  /// no wallet popup or chain switch needed. Web3 users use the wagmi path.
  fundAgent: (body: {
    address: string;
    agent: 'buyer' | 'seller';
    amountUsdc: number;
  }) =>
    json<{ accepted: boolean; txHash: string; agentAddress: string }>(
      '/api/activation/fund-agent',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),
  /// One call for the Wallets panel: the logged-in wallet's Arc USDC (identity
  /// hub) plus each agent's Arc USDC. `agents` is null before activation.
  walletOverview: (address: string) =>
    json<{
      identity: { address: string; usdcBalance: string | null };
      agents: {
        buyer: { address: string; usdcBalance: string | null };
        seller: { address: string; usdcBalance: string | null };
      } | null;
      bridgeWallets: Record<string, { walletId: string; address: string }>;
    }>(`/api/activation/wallets?address=${address}`),
  /// Arc-USDC faucet for one of the user's own wallets (identity hub or an
  /// agent). Testnet only.
  faucet: (address: string, target: 'identity' | 'buyer' | 'seller') =>
    json<{ ok: boolean; target: string; address: string }>('/api/activation/faucet', {
      method: 'POST',
      body: JSON.stringify({ address, target }),
    }),
  /// Auto-pool native gas + USDC from Circle's faucet to any address on a CCTP
  /// source chain. Funds a web3 user's own wallet (or any address) in-app instead
  /// of sending them to faucet.circle.com. Testnet only.
  fundSource: (address: string, chain: BridgeChainKey) =>
    json<{ ok: boolean; chain: string }>('/api/activation/fund-source', {
      method: 'POST',
      body: JSON.stringify({ address, chain }),
    }),
  /// Refuel a bridge wallet with native gas + USDC from the faucet so a CCTP
  /// bridge can pay its source-chain gas. Provisions the bridge wallet for that
  /// chain if missing. Defaults to Base Sepolia. Testnet only.
  dripBridgeGas: (address: string, chain: BridgeChainKey = 'baseSepolia') =>
    json<{ ok: boolean; address: string; blockchain: string }>(
      '/api/activation/drip-bridge',
      { method: 'POST', body: JSON.stringify({ address, chain }) },
    ),
  /// KarwanVault: list every staking position for an address with state +
  /// tenure. Used by /profile StakeCard to render the position list. Pass
  /// `fresh=true` after a web3 deposit/withdraw lands so the backend force-
  /// scans before serving; otherwise the 5-minute periodic scan cadence
  /// makes the new position invisible for several minutes.
  vaultPositions: (address: string, fresh?: boolean) =>
    json<{
      vaultAddress: string | null;
      positions: Array<{
        positionId: string;
        principalUsdc: string;
        principalWei: string;
        depositedAt: number;
        cooldownStartedAt: number;
        claimableAt: number;
        state: 'active' | 'cooling' | 'claimed';
        tenureDays: number;
      }>;
      totalActiveUsdc: string;
      totalCoolingUsdc: string;
      /// v2.D: Sum of open insurance reservations against the owner's
      /// active positions. The free side of the Free / Reserved / Cooling
      /// split shown on /profile and /stake. Absent on pre-v2.D deployments
      /// where the vault doesn't have a reservation system; treat as '0'.
      reservedUsdc?: string;
      /// v2.D: totalActiveUsdc minus reservedUsdc, floored at zero. The
      /// portion of stake that can backstop a new deal. Same back-compat
      /// fallback — treat absent as equal to totalActiveUsdc.
      freeStakeUsdc?: string;
      cooldownDays: number;
      /// False while the backend is still scanning the vault's event log for
      /// this owner — older positions may be missing from the served set
      /// until the scan reaches head. The UI should render a syncing
      /// indicator and refetch shortly. Absent on older deploys; treat as
      /// `true` for back-compat.
      synced?: boolean;
    }>(
      `/api/vault/positions?address=${address}${fresh ? '&refresh=1' : ''}`,
    ),
  /// KarwanYieldDistributor: this address's claimable + lifetime totals.
  /// Lifetime credited and claimed come from event scans (YieldCredited /
  /// YieldClaimed indexed by staker), cached 30s on the backend. Pass
  /// `fresh: true` immediately after a successful claim to bypass the
  /// cache so the UI flips instantly instead of waiting up to 30s.
  yieldMe: (address: string, opts: { fresh?: boolean } = {}) =>
    json<{
      configured: boolean;
      address: string | null;
      claimableUsdc: string;
      lifetimeCreditedUsdc: string;
      lifetimeClaimedUsdc: string;
      detail?: string;
    }>(
      `/api/yield/me?address=${address}${opts.fresh ? '&fresh=1' : ''}`,
    ),
  /// Protocol-wide yield reserves for the /stake widget.
  yieldProtocol: () =>
    json<{
      configured: boolean;
      address?: string;
      totalCreditedUsdc?: string;
      totalClaimedUsdc?: string;
      outstandingUsdc?: string;
      usdcBalance?: string;
    }>('/api/yield/protocol'),
  /// Live USYC reserves: the protocol's real USYC holdings (treasury +
  /// vault-routed stake) marked to the live Hashnote price feed, with the
  /// on-chain oracle as a conservative fallback. Drives the live USYC balance
  /// + yield readout on /stake and the home page.
  usycReserves: () =>
    json<{
      configured: boolean;
      error?: string;
      price?: {
        markUsd: number;
        source: 'live' | 'onchain';
        liveUsd: number | null;
        liveRound: string | null;
        liveUpdatedAt: number | null;
        onchainUsd: number;
        onchainUpdatedAt: number;
        onchainStale: boolean;
      };
      treasury?: {
        address: string;
        idleUsdc: number;
        usycShares: number;
        usycValueUsd: number;
        yieldUsd: number;
      };
      vault?: {
        address: string;
        usycShares: number;
        usycValueUsd: number;
        outForYieldUsdc: number;
        yieldUsd: number;
      } | null;
      combined?: {
        usycShares: number;
        usycValueUsd: number;
        yieldUsd: number;
        idleUsdc: number;
      };
    }>('/api/treasury/usyc'),
  /// Per-day distribution timeseries. Without `address`, returns the
  /// protocol's aggregate accrual curve. With `address`, returns the
  /// per-staker series. Both cached 30s on the backend.
  yieldHistory: (address?: string, opts: { fresh?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (address) params.set('address', address);
    if (opts.fresh) params.set('fresh', '1');
    const qs = params.toString();
    return json<{
      configured: boolean;
      history: Array<{
        day: string;
        dailyCreditedUsdc: string;
        cumulativeCreditedUsdc: string;
      }>;
    }>(`/api/yield/history${qs ? `?${qs}` : ''}`);
  },
  /// Circle-user claim path. Web3 users sign claim() directly from their
  /// own wallet; they do not call this endpoint.
  yieldClaim: (body: { address: string }) =>
    json<{ ok: true; txHash: string | null }>('/api/yield/claim', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /// Circle-only vault writes. Web3 users sign deposit/withdraw/claim
  /// directly from the wallet via wagmi `writeContract`.
  vaultDeposit: (body: { address: string; amountUsdc: number }) =>
    json<{ ok: true; approveTxHash: string; depositTxHash: string }>(
      '/api/vault/deposit',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  vaultRequestWithdraw: (body: { address: string; positionId: string }) =>
    json<{ ok: true; txHash: string }>('/api/vault/request-withdraw', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  vaultCancelWithdraw: (body: { address: string; positionId: string }) =>
    json<{ ok: true; txHash: string }>('/api/vault/cancel-withdraw', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  vaultClaim: (body: { address: string; positionId: string }) =>
    json<{ ok: true; txHash: string }>('/api/vault/claim', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /// 30-day legacy recovery surface. Reads the window status (open / closing-
  /// in / closed) so the home banner and /legacy page can branch off it.
  legacyWindow: () =>
    json<{
      open: boolean;
      closesAtMs: number | null;
      daysRemaining: number | null;
      hasLegacyEscrow: boolean;
      hasLegacyVault: boolean;
      legacyEscrowAddress: string | null;
      legacyVaultAddress: string | null;
    }>('/api/legacy/window'),
  legacyDeals: (address: string) =>
    json<{
      legacyEscrowAddress: string | null;
      generations: Array<{ index: 1 | 2; legacyEscrowAddress: string }>;
      deals: Array<{
        jobId: string;
        role: 'buyer' | 'seller' | 'both';
        buyer: string;
        seller: string;
        dealAmountUsdc: string;
        state: number;
        stateLabel: 'funded' | 'settled' | 'disputed' | 'refunded' | 'unknown';
        deadlineUnix: number;
        pastDeadline: boolean;
        delivered: boolean;
        hasCancellationProposal: boolean;
        cancellationProposal?: {
          proposedBy: 'buyer' | 'seller';
          kind: string;
          reason: string;
          proposedAt: number;
        };
        createdAt: number;
        releasedUsdc: string;
        generation: 1 | 2;
      }>;
    }>(`/api/legacy/deals?address=${address}`),
  legacyDealRefund: (body: { jobId: string; address: string; role: 'buyer' }) =>
    json<{ ok: true; txHash: string }>(`/api/legacy/deals/${body.jobId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ address: body.address, role: body.role }),
    }),
  legacyDealReleaseFinal: (body: { jobId: string; address: string; role: 'buyer' }) =>
    json<{ ok: true; txHash: string }>(`/api/legacy/deals/${body.jobId}/release-final`, {
      method: 'POST',
      body: JSON.stringify({ address: body.address, role: body.role }),
    }),
  legacyDealCancelPropose: (body: {
    jobId: string;
    address: string;
    role: 'buyer' | 'seller';
    reason: string;
  }) =>
    json<{ ok: true; txHash: string }>(`/api/legacy/deals/${body.jobId}/cancel-propose`, {
      method: 'POST',
      body: JSON.stringify({ address: body.address, role: body.role, reason: body.reason }),
    }),
  legacyDealCancelAccept: (body: { jobId: string; address: string; role: 'buyer' | 'seller' }) =>
    json<{ ok: true; txHash: string }>(`/api/legacy/deals/${body.jobId}/cancel-accept`, {
      method: 'POST',
      body: JSON.stringify({ address: body.address, role: body.role }),
    }),
  legacyVaultPositions: (address: string) =>
    json<{
      vaultAddress: string | null;
      positions: Array<{
        positionId: string;
        principalUsdc: string;
        depositedAt: number;
        cooldownStartedAt: number;
        claimableAt: number;
        state: 'active' | 'cooling' | 'claimed';
        generation: 1 | 2;
      }>;
      totalActiveUsdc: string;
      totalCoolingUsdc: string;
      cooldownDays: number;
      generations: Array<{
        index: 1 | 2;
        vaultAddress: string;
        cooldownDays: number;
        positionCount: number;
      }>;
    }>(`/api/legacy/vault/positions?address=${address}`),
  legacyVaultRequestWithdraw: (body: { address: string; positionId: string; generation: 1 | 2 | 3 }) =>
    json<{ ok: true; txHash: string }>('/api/legacy/vault/request-withdraw', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  legacyVaultCancelWithdraw: (body: { address: string; positionId: string; generation: 1 | 2 | 3 }) =>
    json<{ ok: true; txHash: string }>('/api/legacy/vault/cancel-withdraw', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  legacyVaultClaim: (body: { address: string; positionId: string; generation: 1 | 2 | 3 }) =>
    json<{ ok: true; txHash: string }>('/api/legacy/vault/claim', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createDirectDeal: (body: {
    buyerAddress: string;
    /// Exactly one of sellerAddress (wallet mode) or sellerEmail (share-link
    /// mode). Email mode mints a one-shot invite token, returns { invite: { url } }
    /// in the response, and leaves the deal's seller as a sentinel until claim.
    sellerAddress?: string;
    sellerEmail?: string;
    dealAmountUsdc: number;
    deadlineDays: number;
    deadlineHours?: number;
    acceptanceWindowHours?: number;
    terms: string;
    firstReleasePct: number;
    /// Trusted-match opt-in. When true, the seller's accept panel surfaces a
    /// stake requirement and they are expected to back the deal with insurance.
    /// Default false (casual deal, no stake messaging).
    requireStake?: boolean;
    /// Stake percentage when requireStake is true. 50-100 in 5% steps.
    /// Translates to on-chain reservationBps = pct * 100.
    requireStakePct?: number;
    /// SME trade-finance fields (Phase 2 Track 2). All optional; legacy
    /// service-flow deals continue to post without them.
    tradeType?: 'service' | 'goods' | 'mixed';
    incoterms?: 'EXW' | 'FCA' | 'FOB' | 'CIF' | 'DAP' | 'DDP';
    paymentTerms?: 'immediate' | 'net30' | 'net60' | 'net90';
    counterpartyCompany?: { name?: string; sector?: string; region?: string };
    documentRefs?: Array<{
      hash: string;
      kind: 'invoice' | 'po' | 'bol' | 'coo' | 'pod' | 'other';
      label?: string;
    }>;
  }) =>
    json<{
      deal: DirectDeal;
      funding: DirectDealFunding;
      invite?: { url: string; email: string };
    }>('/api/deals/direct', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getDealInvite: (token: string) =>
    json<{
      invite: {
        token: string;
        jobId: string;
        role: 'buyer' | 'seller';
        email: string;
        expiresAt: number;
      };
      deal: {
        jobId: string;
        dealAmountUsdc: string;
        firstReleasePct: number;
        terms: string;
        deadlineUnix?: number;
        acceptanceDeadlineUnix?: number;
        inviterMasked: string;
      };
    }>(`/api/deals/invite/${token}`),
  claimDealInvite: (token: string) =>
    json<{ ok: true; jobId: string; redirectTo: string }>(
      `/api/deals/invite/${token}/claim`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  termsStatus: (address?: string | null) =>
    json<{ currentVersion: number; acceptedVersion: number | null }>(
      `/api/terms/status${address ? `?address=${address}` : ''}`,
    ),
  acceptTerms: (version: number) =>
    json<{ ok: true; version: number }>(`/api/terms/accept`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    }),
  directDeals: (address: string) =>
    json<{ deals: DirectDeal[] }>(`/api/deals/direct?address=${address}`),
  directDeal: (jobId: string, caller?: string | null) =>
    json<{ deal: DirectDeal }>(withCaller(`/api/deals/direct/${jobId}`, caller)),
  counterpartyReport: (jobId: string, caller?: string | null) =>
    json<CounterpartyReport>(
      withCaller(`/api/deals/direct/${jobId}/counterparty-report`, caller),
    ),
  acceptDirectDeal: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string }>(
      `/api/deals/direct/${jobId}/accept`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  markDelivered: (jobId: string, caller: string, deliveryProof?: string) =>
    json<{ accepted: boolean; jobId: string }>(
      `/api/deals/direct/${jobId}/delivered`,
      {
        method: 'POST',
        body: JSON.stringify({ caller, ...(deliveryProof ? { deliveryProof } : {}) }),
      },
    ),
  releaseDirectDeal: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string; txHash: string; settled: boolean }>(
      `/api/deals/direct/${jobId}/release`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  /// v2b seller claim: after the buyer's review window elapses on a marked
  /// delivery, the seller forces the next milestone payout. The contract
  /// enforces the window; a too-early call returns 502 (ReviewWindowOpen) and a
  /// held delivery returns 502 (Frozen). Available on the v2 escrow only.
  claimDirectDeal: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string; milestoneIndex: number; txHash: string }>(
      `/api/deals/direct/${jobId}/claim`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  /// Seller asks the buyer for more delivery time. Off-chain handshake; stored
  /// as deal.extensionRequest until the buyer responds via respondExtension.
  requestExtension: (input: {
    jobId: string;
    caller: string;
    additionalSeconds: number;
    reason?: string;
  }) =>
    json<{ accepted: true; jobId: string; requestedAt: number }>(
      `/api/deals/direct/${input.jobId}/extension/request`,
      {
        method: 'POST',
        body: JSON.stringify({
          caller: input.caller,
          additionalSeconds: input.additionalSeconds,
          ...(input.reason ? { reason: input.reason } : {}),
        }),
      },
    ),
  /// Buyer approves or declines a pending extension request. Approve bumps
  /// deal.deadlineUnix by the requested seconds.
  respondExtension: (input: {
    jobId: string;
    caller: string;
    decision: 'approved' | 'declined';
  }) =>
    json<{
      accepted: true;
      jobId: string;
      decision: 'approved' | 'declined';
      newDeadlineUnix?: number;
    }>(`/api/deals/direct/${input.jobId}/extension/respond`, {
      method: 'POST',
      body: JSON.stringify({ caller: input.caller, decision: input.decision }),
    }),
  raiseDelayAppeal: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string; raisedAt: number; responseWindowMs: number }>(
      `/api/deals/direct/${jobId}/delay-appeal`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  respondToDelayAppeal: (jobId: string, caller: string, reason: string) =>
    json<{ accepted: boolean; jobId: string; respondedAt: number }>(
      `/api/deals/direct/${jobId}/delay-appeal-respond`,
      { method: 'POST', body: JSON.stringify({ caller, reason }) },
    ),
  /// Post-settlement cashout: read the per-deal context.
  cashoutInfo: (jobId: string) =>
    json<{
      jobId: string;
      sellerAddress: string;
      dealAmountUsdc: string;
      settledAt: number | null;
      legacyEscrow: boolean;
      accountKind: 'circle' | 'wallet';
      identityWallet: {
        address: string;
        arcBalanceUsdc: string | null;
        available: boolean;
      };
      sellerAgentWallet: {
        address: string | null;
        arcBalanceUsdc: string | null;
        available: boolean;
      };
      buyerAgentWallet: {
        address: string | null;
        arcBalanceUsdc: string | null;
        available: boolean;
      };
    }>(`/api/cashout/${jobId}`),
  /// Direct USDC.transfer on Arc from the chosen Karwan wallet (identity, the
  /// deal's seller-agent, or the user's buyer-agent). Use api.bridgeOut for
  /// non-Arc.
  cashoutArc: (input: {
    jobId: string;
    recipient: string;
    amountUsdc: number;
    walletKind: 'identity' | 'sellerAgent' | 'buyerAgent';
    /// Minted once per submission; retries of the same submission reuse it so
    /// the backend/Circle dedupe the transfer instead of paying twice.
    requestId?: string;
  }) =>
    json<{ ok: true; txHash: string; explorerUrl: string }>(
      '/api/cashout/arc-withdraw',
      { method: 'POST', body: JSON.stringify(input) },
    ),
  /// Instant same-chain Arc send: USDC.transfer from the signed-in user's
  /// Karwan identity wallet to any Arc address. No CCTP, settles in one step.
  cashoutArcSend: (input: { recipient: string; amountUsdc: number; bridgeId?: string }) =>
    json<{ ok: true; txHash: string; explorerUrl: string }>(
      '/api/cashout/arc-send',
      { method: 'POST', body: JSON.stringify(input) },
    ),
  stillReviewing: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string }>(
      `/api/deals/direct/${jobId}/still-reviewing`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  appealDeal: (jobId: string, caller: string, reason?: string) =>
    json<{ accepted: boolean; jobId: string; txHash: string }>(
      `/api/deals/direct/${jobId}/appeal`,
      { method: 'POST', body: JSON.stringify({ caller, ...(reason ? { reason } : {}) }) },
    ),
  cancelDirectDeal: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string; txHash: string }>(
      `/api/deals/direct/${jobId}/cancel`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  /// Buyer-side pre-accept edit. Backend rejects after deal.acceptedAt because
  /// the escrow is funded on chain and amount + split are locked there. Every
  /// field is optional; pass only what changed. Editing deadline or the
  /// acceptance window reanchors the clock from now.
  editDirectDeal: (
    jobId: string,
    body: {
      caller: string;
      dealAmountUsdc?: number;
      deadlineDays?: number;
      deadlineHours?: number;
      acceptanceWindowHours?: number;
      terms?: string;
      firstReleasePct?: number;
      requireStake?: boolean;
      requireStakePct?: number;
    },
  ) =>
    json<{ accepted: boolean; jobId: string; deal: DirectDeal }>(
      `/api/deals/direct/${jobId}/edit`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  proposeCancelDirectDeal: (
    jobId: string,
    caller: string,
    reason: string,
    kind:
      | 'mutual'
      | 'platform-attributed'
      | 'refund-from-dispute'
      | 'release-from-dispute' = 'mutual',
  ) =>
    json<{
      accepted: boolean;
      jobId: string;
      proposal: {
        proposedBy: 'buyer' | 'seller';
        kind:
          | 'mutual'
          | 'platform-attributed'
          | 'refund-from-dispute'
          | 'release-from-dispute';
        reason: string;
        proposedAt: number;
      };
    }>(`/api/deals/direct/${jobId}/cancel/propose`, {
      method: 'POST',
      body: JSON.stringify({ caller, reason, kind }),
    }),
  acceptCancelDirectDeal: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string; txHash?: string }>(
      `/api/deals/direct/${jobId}/cancel/accept`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  declineCancelDirectDeal: (jobId: string, caller: string) =>
    json<{ accepted: boolean; jobId: string }>(
      `/api/deals/direct/${jobId}/cancel/decline`,
      { method: 'POST', body: JSON.stringify({ caller }) },
    ),
  bridgeRelay: (input: {
    bridgeId: string;
    sourceDomain: number;
    sourceTxHash: string;
    amountUsdc: string;
    mintRecipient: string;
    /// Persisted for durable history rendering (/list). Solana burns pass
    /// 'solanaDevnet'; EVM web3 burns predate this field and omit it.
    sourceChainKey?: string;
  }) =>
    json<{
      accepted: boolean;
      bridgeId: string;
      /// 'minted' when the bridge already settled: the relay refuses to
      /// re-enter the pipeline and reports the terminal state instead.
      status?: string;
      mintTxHash?: string | null;
    }>('/api/bridge/relay', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  bridgeRecheck: (bridgeId: string) =>
    json<{ status: string; mintTxHash?: string; detail?: string; error?: string }>(
      `/api/bridge/${bridgeId}/recheck`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  /// Circle-only: backend signs the CCTP burn from the user's source-chain
  /// DCW (lazy-provisioning if missing), then queues the standard relay loop
  /// for the Arc mint. Web3 users still use the wagmi-signed path in useBridge.
  bridgeCircle: (input: {
    bridgeId: string;
    address: string;
    sourceChainKey: BridgeChainKey;
    amountUsdc: number;
    mintRecipient: string;
  }) =>
    json<{
      accepted: true;
      bridgeId: string;
      // Async source pipeline: the route returns once the bridge is queued, in
      // the 'approving' stage. The burn hash arrives later over SSE, so these
      // are no longer part of the immediate response.
      status?: string;
      approveTxHash?: string | null;
      burnTxHash?: string;
      sourceAddress: string;
      sourceDomain: number;
    }>('/api/bridge/circle-bridge', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  /// App Kit bridge path. Routes through Circle's bundled SDK
  /// (@circle-fin/app-kit) instead of the hand-rolled CCTP V2 pipeline, so
  /// Solana Devnet (and any future non-EVM source) can bridge to Arc via
  /// the same UI. The forwarder broadcasts the Arc mint, no per-destination
  /// relay DCW needed. Status events flow over the same SSE channel as the
  /// hand-rolled bridges.
  bridgeCircleAppKit: (input: {
    bridgeId: string;
    address: string;
    sourceChainKey: AppKitBridgeChainKey;
    amountUsdc: number;
    mintRecipient: string;
  }) =>
    json<{
      accepted: true;
      bridgeId: string;
      sourceAddress: string;
      sourceChainKey: AppKitBridgeChainKey;
    }>('/api/bridge/circle-bridge-app-kit', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  /// Bridge OUT (Arc -> chain) for Circle accounts. Backend burns from the
  /// identity DCW on Arc, then relays the mint on the destination chain. The
  /// burn hash + mint land later over SSE.
  bridgeOut: (input: {
    bridgeId: string;
    address: string;
    destChainKey: BridgeChainKey;
    amountUsdc: number;
    recipient: string;
    /// Source wallet on Arc that will burn. Defaults to 'identity' on the
    /// backend if absent. Cashout pages pass 'sellerAgent' + sourceJobId to
    /// burn from the deal's seller-agent wallet (where released USDC lives), or
    /// 'buyerAgent' to sweep the user's own buyer-agent wallet.
    sourceKind?: 'identity' | 'sellerAgent' | 'buyerAgent';
    sourceJobId?: string;
  }) =>
    json<{ accepted: true; bridgeId: string; status: string; direction: 'out' }>(
      '/api/bridge/circle-bridge-out',
      { method: 'POST', body: JSON.stringify(input) },
    ),
  /// Web3 bridge-out: the user's own wallet signs the Arc burn. First fetch the
  /// exact burn params (the Fast maxFee matters), sign approve + depositForBurn
  /// on Arc, then hand the burn back so the backend relays the destination mint.
  web3BridgeOutQuote: (input: {
    destChainKey: BridgeChainKey;
    amountUsdc: number;
    recipient: string;
  }) =>
    json<{
      tokenMessenger: `0x${string}`;
      usdc: `0x${string}`;
      arcDomain: number;
      destDomain: number;
      amountWei: string;
      mintRecipient: `0x${string}`;
      destinationCaller: `0x${string}`;
      maxFee: string;
      finalityThreshold: number;
    }>('/api/bridge/web3-bridge-out/quote', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  web3BridgeOut: (input: {
    bridgeId: string;
    address: string;
    destChainKey: BridgeChainKey;
    amountUsdc: number;
    recipient: string;
    sourceTxHash: string;
  }) =>
    json<{ accepted: true; bridgeId: string; status: string; direction: 'out' }>(
      '/api/bridge/web3-bridge-out',
      { method: 'POST', body: JSON.stringify(input) },
    ),
  /// Resume a Circle bridge stuck mid source-pipeline (approving/burning) or
  /// waiting on the mint relay. Idempotent. Used by retry + auto-recheck for
  /// Circle bridges, where re-POSTing circle-bridge would 409 on the existing id.
  /// Polled by the cashout page's inline bridge progress card. Returns the
  /// current status of a bridge by id.
  bridgeStatus: (bridgeId: string) =>
    json<{
      bridgeId: string;
      direction: 'in' | 'out';
      status: string;
      amountUsdc: string;
      sourceChainKey: string | null;
      destChainKey: string | null;
      sourceTxHash: string | null;
      mintTxHash: string | null;
      approveTxId: string | null;
      burnTxId: string | null;
      error: string | null;
      createdAt: number;
      updatedAt: number;
    }>(`/api/bridge/${bridgeId}`),
  bridgeCircleResume: (bridgeId: string) =>
    json<{ status: string; mintTxHash?: string | null; error?: string }>(
      `/api/bridge/circle-bridge/${bridgeId}/resume`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  /// Returns or lazy-provisions the user's source-chain DCW address so the
  /// frontend can show "send USDC here" + a faucet link for Circle users.
  /// Accepts both the hand-rolled CCTP chains and App Kit chains (Solana
  /// Devnet today). The backend provisions on read for any supported key.
  bridgeCircleSourceAddress: (address: string, sourceChainKey: AppKitBridgeChainKey) =>
    json<{ address: string; blockchain: string }>(
      `/api/bridge/circle-source-address?address=${address}&sourceChainKey=${sourceChainKey}`,
    ),
  /// Backend-persisted bridge history for the user (every Circle bridge ever
  /// started against their identity, newest first). Used by useBridges to
  /// rehydrate history that local storage may have lost (cache clear, device
  /// switch, MAX_HISTORY truncation). Web3-path bridges are not tracked
  /// server-side and never appear here; localStorage stays primary for them.
  bridgeList: (address: string) =>
    json<{
      bridges: Array<{
        bridgeId: string;
        status: 'approving' | 'burning' | 'relaying' | 'minted' | 'error';
        amountUsdc: string;
        sourceChainKey: string | null;
        destChainKey: string | null;
        direction: 'in' | 'out';
        mintRecipient: string | null;
        sourceTxHash: string | null;
        mintTxHash: string | null;
        approveTxId: string | null;
        burnTxId: string | null;
        error: string | null;
        createdAt: number;
        updatedAt: number;
      }>;
    }>(`/api/bridge/list?address=${address}`),
  /// Record a bridge that completed client-side via the App Kit Forwarding
  /// Service, so it lands in durable history + the main /activity feed. The
  /// backend keys it to the signed-in user; no funds move.
  bridgeRecord: (input: {
    bridgeId: string;
    sourceChainKey: string;
    amountUsdc: number;
    mintRecipient: string;
    burnTxHash?: string;
    mintTxHash?: string;
    direction?: 'in' | 'out';
  }) =>
    json<{ ok: boolean; alreadyRecorded?: boolean }>('/api/bridge/record', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  /// Richer than bridgeCircleSourceAddress: returns the source-chain DCW
  /// address plus its live USDC and native-gas balances so the bridge card can
  /// show a funded/empty state. usdcBalance/gasBalance are null when the
  /// on-chain balance read failed (transient RPC); the address still returns.
  bridgeWalletStatus: (address: string, sourceChainKey: BridgeChainKey) =>
    json<{
      bridgeWalletAddress: string;
      sourceChainKey: BridgeChainKey;
      usdcBalance: string | null;
      gasBalance: string | null;
    }>(
      `/api/bridge/circle-bridge/wallet?address=${address}&sourceChainKey=${sourceChainKey}`,
    ),
  listMessages: (jobId: string, caller: string) =>
    json<{ messages: ChatMessage[] }>(`/api/chat/${jobId}?caller=${caller}`),
  sendMessage: (jobId: string, caller: string, body: string) =>
    json<{ message: ChatMessage }>(`/api/chat/${jobId}`, {
      method: 'POST',
      body: JSON.stringify({ caller, body }),
    }),
  telegramStatus: (address: string) =>
    json<TelegramStatus>(`/api/telegram/status?address=${address}`),
  telegramLinkStart: (address: string) =>
    json<{ token: string; deepLink: string | null; botUsername: string | null }>(
      '/api/telegram/link/start',
      { method: 'POST', body: JSON.stringify({ address }) },
    ),
  telegramLinkRemove: (address: string) =>
    json<{ ok: true }>('/api/telegram/link/remove', {
      method: 'POST',
      body: JSON.stringify({ address }),
    }),
  // Trade-finance PoD anchor (Phase 2 Track 2). Web3 path: caller signs
  // registry.acceptPoD via wallet, then posts the tx hash here. Circle DCW
  // path: backend signs via the user's identity wallet + mirrors.
  acceptTradePod: (body: { invoiceId: string; podHash: string; txHash?: string; caller: string }) =>
    json<{ ok: true }>('/api/trade/pod/accept', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  acceptTradePodCircle: (body: { address: string; invoiceId: string; podHash: string }) =>
    json<{ ok: true; txHash: string }>('/api/trade/pod/accept-circle', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // Invoice factoring (Phase 2 Track 2). Lists are public; mutations
  // require auth + match the caller against the relevant party.
  listFactoringAvailable: (params?: { sector?: string; region?: string }) => {
    const qs = new URLSearchParams();
    if (params?.sector) qs.set('sector', params.sector);
    if (params?.region) qs.set('region', params.region);
    const q = qs.toString();
    return json<{ deals: DirectDeal[] }>(
      `/api/factoring/available${q ? `?${q}` : ''}`,
    );
  },
  postFactoringOffer: (body: {
    invoiceId: string;
    offeredAdvanceUsdc: string;
    expectedReturnUsdc: string;
    expiresInHours?: number;
    /// Required for web3 financiers: EIP-3009 authorizing the advance
    /// (financier -> seller), submitted by the relay when the seller
    /// accepts. Circle financiers omit it; the backend transfers from
    /// their identity wallet.
    advanceAuthorization?: UsdcAuthorization;
  }) =>
    json<{ offer: FactoringOffer }>('/api/factoring/offer', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listOffersForInvoice: (invoiceId: string) =>
    json<{ offers: FactoringOffer[] }>(`/api/factoring/offers/${invoiceId}`),
  myFactoringQualification: () =>
    json<FactoringQualification>('/api/factoring/my-qualification'),
  listMyFactoringOffers: () =>
    json<{ asFinancier: FactoringOffer[]; asSeller: FactoringOffer[] }>(
      '/api/factoring/mine',
    ),
  acceptFactoringOffer: (body: {
    offerId: string;
    setPayeeTxHash?: string;
    /// Required for web3 sellers: EIP-3009 authorizing the repayment
    /// (seller -> financier), submitted by the settlement watcher when
    /// the escrow settles. Circle sellers omit it.
    repayAuthorization?: UsdcAuthorization;
  }) =>
    json<{ offer: FactoringOffer }>('/api/factoring/accept', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  rejectFactoringOffer: (body: { offerId: string }) =>
    json<{ offer: FactoringOffer }>('/api/factoring/reject', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // Purchase-order financing (Phase 2 Track 2). Lists are public; the
  // mutating calls require the financier's session + an on-chain tx
  // hash from KarwanPOFinancing.fund() / releaseToSeller() / claim()
  // signed by the user's wallet ahead of the POST.
  listPOFinancingAvailable: (params?: { sector?: string; region?: string }) => {
    const qs = new URLSearchParams();
    if (params?.sector) qs.set('sector', params.sector);
    if (params?.region) qs.set('region', params.region);
    const q = qs.toString();
    return json<{ deals: DirectDeal[] }>(
      `/api/po-financing/available${q ? `?${q}` : ''}`,
    );
  },
  fundPOLine: (body: {
    invoiceId: string;
    principalUsdc: string;
    repayUsdc: string;
    releaseTimeoutSeconds: number;
    fundTxHash: string;
  }) =>
    json<{ line: POFinancingLine }>('/api/po-financing/fund', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /// Circle DCW path. Backend signs USDC approve + KarwanPOFinancing.fund
  /// against the financier's identity wallet and returns both tx hashes.
  /// Web3 financiers stay on fundPOLine.
  fundPOLineCircle: (body: {
    address: string;
    invoiceId: string;
    principalUsdc: string;
    repayUsdc: string;
    releaseTimeoutSeconds: number;
  }) =>
    json<{
      line: POFinancingLine;
      approveTxHash: string;
      fundTxHash: string;
    }>('/api/po-financing/fund-circle', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  releasePOLine: (body: { lineId: string; releaseTxHash: string; podHash?: string }) =>
    json<{ line: POFinancingLine }>('/api/po-financing/release', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  claimPOLine: (body: { lineId: string; repayTxHash: string }) =>
    json<{ line: POFinancingLine }>('/api/po-financing/claim', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  reclaimPOLine: (body: { lineId: string; reclaimTxHash: string }) =>
    json<{ line: POFinancingLine }>('/api/po-financing/reclaim', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  defaultPOLine: (body: { lineId: string; defaultTxHash: string }) =>
    json<{ line: POFinancingLine }>('/api/po-financing/default', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listMyPOLines: () =>
    json<{ asFinancier: POFinancingLine[]; asSeller: POFinancingLine[] }>(
      '/api/po-financing/mine',
    ),
  getPOLine: (id: string) =>
    json<{ line: POFinancingLine }>(`/api/po-financing/line/${id}`),
  // SME profile (Phase 2 Track 2). Public passport read (no auth) +
  // authenticated self-edit. taxId is never round-tripped through this
  // API; the public route strips it from responses.
  getSmeProfile: (address: string) =>
    json<{
      smeProfile: {
        companyName?: string;
        sector?: string;
        region?: string;
        yearFounded?: number;
        employeeBand?: string;
        websiteUrl?: string;
        registrationId?: string;
        primaryMarkets?: string;
        annualVolumeBand?: string;
        minOrderValue?: string;
        leadTimeDays?: number;
        certifications?: string;
        hideFromDiscovery?: boolean;
        verifiedAt?: number;
      } | null;
      repaymentBehavior: {
        windowDealCount: number;
        onTimeRate: number;
        averageDaysToSettle: number;
        defaultCount: number;
        lastSettledAt: number;
        financingsTaken: number;
        financingsRepaid: number;
        financingsDefaulted: number;
        computedAt: number;
      } | null;
    }>(`/api/sme/profile/${address}`),
  updateSmeProfile: (body: {
    address: string;
    smeProfile: {
      companyName?: string;
      sector?: 'agriculture' | 'textiles' | 'electronics' | 'logistics' | 'manufacturing' | 'services' | 'other';
      region?: string;
      yearFounded?: number;
      employeeBand?: 'micro' | 'small' | 'medium';
      websiteUrl?: string;
      registrationId?: string;
      primaryMarkets?: string;
      annualVolumeBand?: 'under_100k' | '100k_1m' | '1m_10m' | 'over_10m';
      minOrderValue?: string;
      leadTimeDays?: number;
      certifications?: string;
      hideFromDiscovery?: boolean;
    };
  }) =>
    json<{ smeProfile: NonNullable<UserProfile['smeProfile']> | undefined }>(
      '/api/sme/profile',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  // B2B partner discovery: businesses on the SME rail, filterable by sourcing
  // sector + region. A directory of companies (their trade card), distinct from
  // the P2P listings feed.
  getPartners: (params?: { sector?: string; region?: string }) => {
    const q = new URLSearchParams();
    if (params?.sector) q.set('sector', params.sector);
    if (params?.region) q.set('region', params.region);
    const qs = q.toString();
    return json<{ partners: Partner[] }>(`/api/partners${qs ? `?${qs}` : ''}`);
  },

  // Recent events for a job (public, durable ring snapshot). Used to seed the
  // live x402 agent-payments panel before SSE takes over.
  recentEvents: (jobId: string, type?: string, limit = 100) => {
    const qs = new URLSearchParams({ jobId, limit: String(limit) });
    if (type) qs.set('type', type);
    return json<{ events: ChainEvent[] }>(`/api/events/recent?${qs.toString()}`);
  },

  // In-app support assistant. Sends the recent turns and gets one reply back.
  assistantChat: (messages: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    json<{ reply: string }>('/api/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ messages }),
    }),

  // Live support handoff. The widget escalates from the AI to a human; the
  // operator replies over Telegram and the widget polls for the deltas.
  supportStatus: () => json<{ enabled: boolean }>('/api/support/status'),
  supportStart: (
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    email?: string,
  ) =>
    json<{ conversationId: string; at: number }>(withCaller('/api/support/start'), {
      method: 'POST',
      body: JSON.stringify({ messages, ...(email ? { email } : {}) }),
    }),
  supportSend: (id: string, text: string) =>
    json<{ ok: boolean }>(`/api/support/${id}/message`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  supportPoll: (id: string, since: number) =>
    json<{
      status: 'open' | 'closed';
      messages: Array<{ role: 'user' | 'assistant' | 'operator' | 'system'; text: string; ts: number }>;
    }>(`/api/support/${id}/messages?since=${since}`),
  supportClose: (id: string) =>
    json<{ ok: boolean }>(`/api/support/${id}/close`, { method: 'POST' }),

  // Agent research activation. UI copy frames this as the agent paying for its
  // own market research; "x402" stays out of the interface.
  researchStatus: () =>
    json<{ active: boolean; creditUsdc: number; priceUsdc: number }>(
      withCaller('/api/research/status'),
    ),
  researchActivate: () =>
    json<{ active: boolean; creditUsdc: number; txHash?: string }>(
      withCaller('/api/research/activate'),
      { method: 'POST' },
    ),
  // Market scout: the user pays their research credit for a fresh market read on
  // their own keywords. Errors (402 no-credit, 429 rate-limit) surface as thrown
  // ApiError the caller inspects.
  scoutMarket: (input: { query?: string; keywords?: string[] }) =>
    json<{ read: ApiMarketRead; creditUsdc: number }>(withCaller('/api/research/scout'), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  recentScouts: (limit = 8) =>
    json<{ scouts: ScoutReadEntry[] }>(withCaller(`/api/research/scout/recent?limit=${limit}`)),

  // Financier application (SME rail). Anyone who meets the bar (tenure on
  // Karwan, a stake, reputation >= COLD) can self-serve apply to fund factoring
  // and PO-financing lines. The desk stays locked until approved.
  financierEligibility: () =>
    json<{
      eligible: boolean;
      tenureDays: number;
      tenureOk: boolean;
      stakeUsdc: number;
      stakeOk: boolean;
      repScore: number;
      repTier: string;
      repOk: boolean;
      reasons: string[];
      status: 'none' | 'applied' | 'approved' | 'rejected';
    }>('/api/financier/eligibility'),
  financierApply: () =>
    json<{ ok: boolean; status: 'approved' | 'applied'; grandfathered?: boolean }>(
      '/api/financier/apply',
      { method: 'POST' },
    ),

  // --- verified-business accounts ---------------------------------------
  /// Public verification status + compact company snapshot for an address.
  getBusinessStatus: (address: string) =>
    json<{
      accountType: 'person' | 'business';
      status: 'none' | 'submitted' | 'verified' | 'rejected';
      verifiedAt?: number;
      company: { companyName?: string; sector?: string; region?: string } | null;
      /// On-chain business registry address, read from the backend config at
      /// runtime. Web3 users sign submitRegistration against it. Sourced here
      /// (not the build-time NEXT_PUBLIC var) so a frontend built without that
      /// var still registers whenever the backend has the contract wired.
      registryAddr?: string | null;
    }>(`/api/business/status/${address}`),
  /// Web3 path: the caller has signed submitRegistration locally and reports
  /// the tx hash. Backend records the company snapshot + the submitted state.
  registerBusiness: (body: BusinessRegisterBody) =>
    json<{ ok: boolean; status: string; txHash?: string }>('/api/business/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /// Circle path: backend signs submitRegistration via the user's identity DCW.
  registerBusinessCircle: (body: BusinessRegisterBody) =>
    json<{ ok: boolean; status: string; txHash?: string }>(
      '/api/business/register-circle',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  /// Soft profile update for a business (no re-review). Sensitive fields route
  /// through registration instead.
  updateBusinessProfile: (body: {
    address: string;
    sector?: 'agriculture' | 'textiles' | 'electronics' | 'logistics' | 'manufacturing' | 'services' | 'other';
    region?: string;
    yearFounded?: number;
    employeeBand?: 'micro' | 'small' | 'medium';
    websiteUrl?: string;
  }) =>
    json<{ smeProfile: NonNullable<UserProfile['smeProfile']> | undefined }>(
      '/api/business/profile',
      { method: 'POST', body: JSON.stringify(body) },
    ),
};

export interface BusinessRegisterBody {
  address: string;
  company: {
    companyName: string;
    sector?: 'agriculture' | 'textiles' | 'electronics' | 'logistics' | 'manufacturing' | 'services' | 'other';
    region?: string;
    yearFounded?: number;
    employeeBand?: 'micro' | 'small' | 'medium';
    websiteUrl?: string;
  };
  docHash: string;
  docKind?: 'registration' | 'tax' | 'other';
  label?: string;
  txHash?: string;
}

export interface Partner {
  address: string;
  name: string;
  sector: string | null;
  region: string | null;
  primaryMarkets: string | null;
  minOrderValue: string | null;
  leadTimeDays: number | null;
  certifications: string | null;
  verified: boolean;
  canSupply: boolean;
}

export interface ChatMessage {
  id: string;
  jobId: string;
  sender: string;
  body: string;
  ts: number;
}

export interface TelegramStatus {
  enabled: boolean;
  botUsername: string | null;
  linked: boolean;
  chatId: number | null;
  username: string | null;
  linkedAt: number | null;
}
