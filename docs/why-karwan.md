# Why Karwan

This document is the technical brief. Spend five minutes here and understand why Karwan is not just an
escrow form on Arc.

## In one paragraph

Karwan is an on-chain settlement platform for cross-border service deals.
Two parties open a deal; USDC sits in milestone escrow on Arc while the
work gets done; the buyer releases in tranches; the deal settles. The
differentiator is the layer above the escrow: a pair of LLM-driven agents
that find each other, negotiate price and deadline like humans do, hand
the final terms back to their principals for sign-off, and follow the
deal through to settlement. Reputation is on-chain and portable. Treasury
idle USDC routes through Hashnote USYC on mainnet. The product ships in
five languages today and is built for global service trade, with early
focus on corridors where bank rails are slowest.

## What makes Karwan different

most escrow projects on Arc stop at "buyer types a seller address
into a form, funds the escrow, releases on delivery." Karwan does this too,
but most users never see it because the agents handle the matching and
negotiation upstream of the escrow.

Four things, in order of how much they shape the user experience.

### 1. Agent reasoning loop with cascading fallback

When a buyer posts a request, the buyer agent collects bids during an
auction window. Each bid is scored with a **deterministic 0-100 function**
combining price, reputation tier, completion rate, deal count, account age,
and recent activity. The LLM still writes per-bid reasoning so the audit
trail reads like a human took notes. The ranking comes from the function,
so two evaluations of the same bid pool can never disagree.

The top three bids become a candidate queue. The buyer agent attempts a full
negotiation with the head candidate first. If that negotiation fails for any
reason (the seller's LLM declined, max counter rounds, low confidence, or
the seller priced themselves outside the buyer's tolerance) the agent
**moves to the next candidate in the queue** and starts a fresh negotiation. Only when
the queue is exhausted does the deal fail.

This is the difference, "agentic reasoning."
Every other escrow on Arc gives up after one failed negotiation. Karwan keeps
working through the pool the way a procurement officer would call a second
supplier when the first one's quote came back too high.

### 2. Asymmetric, role-aware negotiation

The buyer agent and the seller agent **do not share a prompt**. They're
trained with opposing postures:

- **Buyer's agent posture:** "Hold the budget. Move up only when seller has
  credible reputation OR the market median justifies it. Never exceed the
  principal's cap."
- **Seller's agent posture:** "Defend the asking price. Concede only when
  the buyer is credible OR the deal is urgent. Never drop below the floor."

Each round, both agents apply a **concession decay curve**: 50% of the
remaining gap on round 0, 25% on round 1, 10% on round 2. Tier elasticity
nudges the curve. A STRONG counterparty earns a slightly faster concession
than a NEW one. Urgency factor steepens the curve when the deadline is
tight. The reasoning trace in the timeline cites tier, recent market median,
or urgency, never the counterparty's reservation price, because that
information is not in the prompt.

On the final allowed round, if the other side's offer is inside the
acceptor's cap, the agent **accepts instead of declining-on-rounds-exhausted.**
That single rule turns the agent from a bot that walks away at the last
second into one that closes the deal a human would have closed.

### 3. ERC-8004 reputation with tier-aware behavior

Every wallet carries a composite reputation score in [0, 1000] computed from
on-chain settled deals, locked stake in `KarwanVault`, time on platform, and
slashes from spam, cancellations, and lost disputes. Score buckets into five
tiers: NEW, COLD, ESTABLISHED, STRONG, ELITE.

Tiers gate agent behavior deterministically.

- **ELITE seller:** auction is skipped. Buyer agent accepts within the
  effective cap directly.
- **STRONG seller:** if top bid is within 5% of the next-best, short-circuit
  to accept. Skip the counter round.
- **ESTABLISHED seller:** standard counter cycle.
- **COLD seller:** a forced -5% counter even when the bid is at-or-under
  budget, to discourage opportunistic pricing from unproven wallets.
- **NEW seller:** full counter cycle, and bottom-decile pricing routes the
  final approval to a human.

The seller's pricing mirrors the inverse: ELITE buyer pays no tier premium,
STRONG pays +7%, ESTABLISHED pays +15%, COLD/NEW pay +20%. The seller is
treating known regulars like known regulars and strangers like strangers.

### 4. Two-contract architecture (Escrow and Vault)

Karwan ships two principal contracts, not one.

- **`KarwanEscrow`** runs the deal. Milestone funding, 150-bps platform fee
  split evenly between buyer and seller, release in tranches, review-window
  auto-release, dispute path, mutual-cancel taxonomy.
- **`KarwanVault`** runs the reputation stake. Users deposit USDC to lift
  their tier; deposits are withdrawable anytime with a 3-day cooling window
  for fraud checks. On mainnet, the same vault routes USDC through Hashnote
  USYC so the locked principal also earns ~5% APY in tokenized T-bills.
  Treasury fees walk the same path on mainnet, so platform revenue compounds
  in real-world assets instead of sitting idle.


## Cross-chain ingress: CCTP V2

Buyers can land USDC on Arc from Base Sepolia or Ethereum Sepolia via Circle
CCTP V2. Web3 users sign the burn from their own wallet; the backend polls
Circle's IRIS attestation API and relays the mint on Arc from a buyer agent
DCW, so the user never needs Arc gas to receive funds. Circle email/passkey
users get a per-chain Circle DCW lazy-provisioned at first bridge attempt;
the backend handles approve and `depositForBurn` from that DCW. Three chains
at launch, more on demand. No hardcoded single-chain assumption anywhere in
the bridge surface.

## Two ways to open a deal

- **Direct deal.** Buyer already has a counterparty. Name their wallet, set
  amount and terms, the escrow funds on seller accept. The fast path. Buyers
  can also point a deal at a plain email address. Karwan sends a branded
  invite, the recipient claims with a one-time code, and a Circle wallet
  provisions in their browser. No signup form.
- **Agent-matched deal.** Buyer doesn't have a counterparty. Post a request
  (the work you need) or an offer (what you sell). The agent watches the
  marketplace, scores both sides, weighs reputation, and surfaces a proposal.
  The agent never opens an escrow without the human's sign-off. New or
  low-reputation counterparties route to human review regardless.

The agent is a matchmaker, not a spender. Every escrow funding tx requires
explicit human approval of a `MatchProposal`.

## Identity model: passkey, email, or wallet

Karwan accepts three sign-in paths:

- **Email + passkey** (recommended). Email plus a platform-native passkey
  (Face ID / Touch ID / Windows Hello). Backed by a Circle Developer-
  Controlled Wallet provisioned at signup. No seed phrase, no extension.
- **Email code (OTP).** Same DCW provisioned, but auth via 6-digit code from
  email. Upgradeable to a passkey later from Settings.
- **Web3 wallet.** MetaMask, Coinbase, Rabby, WalletConnect. RainbowKit
  modal. Existing crypto users sign in with their own keys.

The unified login flow picks the right path automatically: enter your email,
backend looks up account existence and passkey state, UI drops into the
right CTA without forcing you to choose Sign In vs Create Account up front.

## Five languages at launch

The product ships with English, Arabic (RTL), French, Hindi, and Swahili.
Settings page, top navigation, onboarding language step, Telegram
notifications, and email templates are localized today. The RTL layout
audit and full string-extraction sweep ride v2.

The five languages cover several of the trade corridors where bank rails
are slowest today, including the Gulf, North and West Africa, the Indian
subcontinent, and East Africa. The product itself is global; the language
roster grows with where the deals are coming from.

## What we explicitly do not claim

- **The current contracts are not externally audited.** They have a Foundry
  test suite and an internal review that caught and fixed six findings before
  the v2.D redeploy. A professional audit is the gate before any deployment
  holding live USDC.
- **Standard CCTP V2 attestation takes 10-19 minutes** on Sepolia testnets.
  Fast Transfer would cut this to seconds, at a fee Circle takes. Karwan
  uses Standard Transfer for now to keep the relay path simple.
- **The buyer-dispute-refund vector is closed.** A seller's active stake
  reserves against every accepted deal; a failed dispute outcome slashes
  the reservation to the buyer. Insurance, not just a reputation hit.
  Logged here as historical because it shaped v2.D.

## What is shipped today (v2.A through v2.E)

The bundle that was scoped for v2 is mostly live on Arc Testnet.

- **v2.C: Versioned Terms and Conditions** with first-signup consent and a
  re-prompt when the version bumps.
- **v2.D: Hardened staking as deal insurance.** `acceptEscrow` reserves
  `dealAmount × reservationBps` from the seller's free stake; a `Failed`
  outcome slashes the reservation to the buyer. Bundled with audit fixes
  B.1, B.2, C.1, C.4 in a single redeploy. The reservation slider lives on
  the per-deal accept panel; the default is 30% but the buyer sets it per
  deal.
- **v2.E: Agent intelligence upgrade.** Asymmetric negotiation walk with
  per-side prompts, trending-skill price aggregator feeding the LLM
  reasoning, opening-bid anchoring, cascading candidate queue. Trusted
  Match mode is the strict variant that gates bidding on stake and on
  reputation tier.
- **Phase 2 d3-5: MockUSYC + KarwanTreasury (ERC-4626) + Vault USYC
  adapter.** The mainnet path is wired through the same Teller interface
  Hashnote USYC speaks. Testnet uses a deterministic mock adapter so the
  demo is not gated on Circle's USYC entitlement.
- **Phase 2 d6-7: Credit Passport public page.** Every wallet has a
  public reputation surface at `/credit-passport/0x...` rendering tier,
  score, term breakdown, deal count, success ratio, stake position, and
  the on-chain anchor. No login.
- **SIWE + Settings + i18n framework + guided coachmark tours + shareable
  deal links + cashout + extension requests** all shipped on the same
  release train.

## What's next

- **x402 nanopayment rails for agents** (headline). Wire Circle's x402
  micropayment surface so the agents can pay sub-cent fees for live data
  during a negotiation: market medians from paid APIs, skill demand
  snapshots, credit-feed reads against a passport, news during a
  delivery review window. Every round can pull a fresh outside signal for
  thousandths of a cent. Result: richer match decisions and pricing that
  tracks the real world.
- **Invoice factoring.** Financier funds an accepted deal at a discount;
  the escrow's payee slot switches to the financier for that release; the
  seller gets paid early. Reputation tier sets the discount floor.
- **Symmetric reputation crediting** so both buyer and seller earn an
  on-chain Success record on a clean settlement, not just the seller.
- **External smart-contract audit** as the gate before mainnet.
- **Safe multisig treasury** replacing the deployer EOA before mainnet.
- **Foundry coverage above 80%** on the escrow and vault branches.
- **v2.H: Full UI string extraction and RTL audit.** Five locales get
  full coverage; Arabic gets a real RTL layout pass.
- **v2.F: GitBook handbook** for buyers, sellers, financiers, and agent
  operators.

## Technical approach in one paragraph

A Node service holds two LLM-driven agents (one buyer, one seller) that
react to on-chain events from the escrow and job-board contracts. The
agents share a deterministic strategy core (pure functions for bid
scoring, concession decay, tier elasticity, urgency factor, opening
anchor) and ask the LLM only for the reasoning trace and the
accept-counter-decline decision. The LLM provider is reached over an
abstraction so swapping models or vendors is one config change. A small
state machine drives the cascading candidate queue and the review-window
auto-release timers. Reputation is on-chain and idempotent; the off-chain
DB caches signals that feed the strategy core. The frontend is a Next.js
15 app with feature-folder layout and a shared component grammar.

## The five-line summary

> Karwan turns an on-chain milestone escrow into a cross-border service
> settlement product by adding LLM-driven asymmetric negotiation agents,
> an ERC-8004 reputation registry that gates agent behavior, a
> yield-bearing reputation stake that funds itself on mainnet via Hashnote
> USYC, multi-chain USDC ingress via CCTP V2, and a multi-language front
> door for the trade corridors it serves first. The agents cascade through
> the candidate pool when the first negotiation fails, accept on the final
> round when the offer is inside tolerance, and apply tier-aware concession
> decay so the price walk looks human. Two parties trade across a border
> with one click and a passkey.
