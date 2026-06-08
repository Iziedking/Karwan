# Why Karwan

The technical brief. Spend five minutes here and understand why Karwan is not another escrow form on Arc.

## In one paragraph

Karwan is an on-chain commerce platform for p2p and b2b trade. Two parties open a deal, USDC sits in milestone escrow on Arc while the work gets done, the buyer releases in tranches, the deal settles. The differentiator is the layer above the escrow. A pair of LLM-driven agents find each other, negotiate price and deadline the way humans do, hand the final terms back to their principals for sign-off, and follow the deal through to settlement. Reputation is on-chain and portable. Treasury idle reserves route through real Hashnote USYC on Arc Testnet today (live as of 2026-06-06), not a mock. The product ships in five languages and is built for global service trade, with an early focus on corridors where bank rails are slowest.

## What makes Karwan different

Most escrow projects on Arc stop at "buyer types a seller address into a form, funds the escrow, releases on delivery." Karwan does this too, but most users never see it because the agents handle the matching and negotiation upstream of the escrow.

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
- **`KarwanVault`** runs the reputation stake. Users deposit USDC to lift their tier, deposits are withdrawable anytime with a 3-day cooling window for fraud checks. The vault routes through an ERC-4626 yield adapter, so stake principal earns alongside the reputation work it does.
- **`KarwanTreasury`** holds platform fees and parks idle USDC in real Hashnote USYC on Arc. Subscribe and redeem run against Hashnote's ERC-4626 Teller interface, so on-chain accounting reads through to a real tokenized T-bill yield, not a mock.


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

The product ships in English, Arabic (RTL), French, Hindi, and Swahili. Settings, top navigation, onboarding language step, Telegram notifications, and email templates are localized.

The five languages cover several of the trade corridors where bank rails are slowest today, including the Gulf, North and West Africa, the Indian subcontinent, and East Africa. The product is global; the language roster grows with where the deals are coming from.

## A few notes for builders reading the source

- **Standard CCTP V2 attestation takes 10-19 minutes** on Sepolia testnets. Fast Transfer would cut this to seconds for a small Circle fee. Karwan ships Standard today to keep the relay path simple.
- **The buyer-dispute-refund attack is closed.** A seller's active stake reserves against every accepted deal; a failed dispute outcome slashes the reservation to the buyer. Insurance, not just a reputation hit.

## What is shipped

- **Versioned Terms and Conditions** with first-signup consent and a re-prompt on version bumps.
- **Hardened staking as deal insurance.** `acceptEscrow` reserves `dealAmount × reservationBps` from the seller's free stake; a `Failed` outcome slashes the reservation to the buyer. The reservation slider lives on the per-deal accept panel; the default is 30% but the buyer sets it per deal.
- **Agent intelligence.** Asymmetric negotiation walk with per-side prompts, trending-skill price aggregator feeding the LLM reasoning, opening-bid anchoring, cascading candidate queue. Trusted Match mode is the strict variant that gates bidding on stake and on reputation tier.
- **Real Hashnote USYC on Treasury.** Platform fee USDC subscribes into real USYC via Hashnote's ERC-4626 Teller, the same interface mainnet uses. Yield reads through to real Hashnote rates, not a mock.
- **Credit Passport public page.** Every wallet has a public reputation surface at `/credit-passport/0x...` rendering tier, score, term breakdown, deal count, success ratio, stake position, and the on-chain anchor. No login.
- **SIWE, Settings, i18n, guided coachmark tours, shareable deal links, cashout, extension requests** all ship in product.

## What is next

Two product expansions are in flight.

### SME trade rails with x402 nanopayments for agents

The b2b path needs richer context than p2p. A supplier negotiating a six-figure invoice cares about market medians, shipping rates, and a buyer's payment history more than a freelancer pricing a logo does. Circle's x402 micropayment surface wires into both buyer and seller agents so every negotiation round can pull a fresh outside signal for thousandths of a cent. Market medians from paid APIs, skill demand snapshots, news during a review window, deeper credit checks against the passport. The marketplace prices against the real world, not a cached view.

### Invoice factoring with tier-based discounts

A seller does not always want to wait for settlement. A financier steps in, pays the seller right away at a small discount, and on release the escrow routes to the financier. The seller got their money early, the financier earned a small spread, the buyer paid the same total. The discount depends on the seller's tier. A strong on-chain record gets factored at a tighter spread because the risk is lower. A new seller pays a wider spread for the uncertainty. Reputation finally has a number that lenders care about.

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

> Karwan turns an on-chain milestone escrow into a global commerce product for p2p and b2b trade. The layer above the escrow adds LLM-driven asymmetric negotiation agents, an ERC-8004 reputation registry that gates agent behavior, a yield-bearing reputation stake that earns real Hashnote USYC on Arc Testnet today, multi-chain USDC ingress via CCTP V2, and a multi-language front door for the corridors it serves first. The agents cascade through the candidate pool when the first negotiation fails, accept on the final round when the offer is inside tolerance, and apply tier-aware concession decay so the price walk looks human. Two parties trade across a border with one click and a passkey.
