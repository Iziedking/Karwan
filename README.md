# Karwan

On-chain settlement for cross-border service deals. USDC sits in milestone
escrow on Arc while the work gets done, and releases as it lands. Built on
Circle's stack.

## What it is

Two parties agree on a deal. The buyer's funds go into a milestone escrow on
Arc. The seller delivers. The buyer releases, in tranches, and the escrow
settles. A platform fee splits evenly between both sides and collects on chain.
Every outcome writes to a reputation score that follows the wallet to the next
deal.

There are two ways to open a deal:

- **Direct deal.** You already have a counterparty. Name their wallet, set the
  amount and terms, and the escrow funds. They sign in with that wallet,
  accept, deliver, and you release.
- **Agent-matched deal.** You don't have a counterparty yet. Post a brief or a
  listing, and your agent watches the marketplace on your behalf. When it finds
  a match, it scores both sides, weighs reputation, and surfaces a proposal.
  You approve, the escrow funds, the rest auto-settles.

The agent is a matchmaker, not a spender. It never opens an escrow without your
sign-off. New or low-reputation counterparties always route to human review.

## Reputation is the golden ticket

Every wallet has a composite reputation score in [0, 1000] that grows with
completed deals, locked stake, and time on the platform. It drops with spam,
cancellations, and lost disputes. The score gates who your agent prefers and
how aggressively it counters.

Users grow reputation by completing deals and by staking USDC in `KarwanVault`.
A vault deposit can be withdrawn any time. Withdrawals go through a 7-day
cooling window during which the stake signal pauses and the system runs fraud
checks. Cancel the request inside the window to resume without losing accrued
tenure. The full deposit / cool-down / claim loop has a UI at `/profile` under
the `STAKE` tab.

On mainnet, the same vault deposit routes through Hashnote USYC, so the
locked principal also earns yield. On Arc Testnet the vault holds plain USDC,
the reputation signal is unchanged. The platform treasury fees walk the same
path on mainnet, so platform revenue also compounds in tokenised T-bills
rather than sitting idle.

The five tiers (`NEW`, `COLD`, `ESTABLISHED`, `STRONG`, `ELITE`) gate the
agent loop deterministically. `ELITE` sellers skip the auction; `STRONG`
top bids within 5% of the next-best auto-accept; `COLD` sellers always get
a forced `-5%` counter; `NEW` buyers pay a `+15%` premium and the seller
human reviews before approving. See
[docs/reputation-model.md](./docs/reputation-model.md) for the formula, the
spam detector, and the full agent integration spec.

Everything else runs on the same spine: USDC settlement, milestone escrow with
a 1.5% fee split, review-window timers with auto-release, on-chain reputation
events, CCTP V2 for moving USDC across chains.

The app ships with a five-language framework: English (default), Arabic,
French, Hindi, and Swahili. Pick yours during onboarding or switch any time
from the Settings page (gear icon, top right). At launch, the Settings page,
the top navigation, the onboarding language step, and Telegram notifications
are fully localised; the rest of the product is being extracted progressively
and will land in v2 alongside an Arabic RTL layout audit.

## Repo layout

```
karwan/
├── backend/      Hono + TypeScript API, agent loops, the deal watcher
├── contracts/    Foundry workspace (KarwanJobBoard, KarwanEscrow, KarwanReputation)
├── frontend/     Next.js 15 dashboard
└── docs/         architecture, Circle integration, demo script
```

## Stack

Node 20+, TypeScript. Hono on the backend. viem for chain reads, Circle
Developer-Controlled Wallets for the agent transactions. Next.js 15 App Router
with wagmi and RainbowKit on the frontend. Foundry for the contracts. Postgres
(via Drizzle) for profile and direct-deal records, with a flat-file fallback for
local development.

## Prerequisites

- Node.js 20 or newer
- Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- A Circle Developer account at https://console.circle.com
- A Postgres connection string (a free Neon or Supabase database works). Without
  one, the backend falls back to flat-file storage, which is fine for local runs.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` from the Circle console, and
`DATABASE_URL` if you are using Postgres.

Create the two agent wallets:

```bash
npm run wallets:create
```

Append the printed lines to `.env`, then fund both addresses at
https://faucet.circle.com on Arc Testnet. On Arc, USDC is the native gas asset,
so the agent wallets need a USDC balance to send transactions.

Register both wallets on the ERC-8004 IdentityRegistry:

```bash
npm run identity:register
```

Verify the stack and start both servers:

```bash
npm run smoke-test
npm run dev
```

The dashboard runs at `http://localhost:3000`, the API at `http://localhost:8787`.

## Contracts

Live on Arc Testnet (chain 5042002):

| Contract | Address |
|---|---|
| KarwanJobBoard | `0xB5C863322C174801610e6e19C25688232De27558` |
| KarwanEscrow | `0xb81d9093607E460e2E4Fa971c75d9322E756b838` |
| KarwanReputation | `0x622b2AA60A29Be1F5F98A64FdC0Fc4ba8c109723` |
| KarwanVault | `0x92b1223921944024f6615A604a2bDA6eF1fEe922` |
| USDC | `0x3600000000000000000000000000000000000000` |

Redeployed 2026-05-18 to apply audit finding D.5 (zero-address constructor
check on KarwanEscrow). Previous addresses are orphaned on chain; nothing
references them after this point.

`KarwanVault` is the flexible USDC staking vault that powers the reputation
formula. No forced lock period. Deposits can be withdrawn at any time, gated
by a 7-day cooling window for fraud checks. The deployed address ships with
each release; check the latest tag.

`KarwanEscrow` carries a platform fee (default 150 bps) split evenly between
buyer and seller, collected by a treasury address set at deploy time. Build,
test, and deploy instructions are in [contracts/README.md](./contracts/README.md).

## Communication

Buyer and seller can chat inside the deal page. Messages stay scoped to the
two wallets on that deal. Only those two can read or post to the thread. The
transcript is persisted, streamed live over SSE, and replayed on reload.

Anyone can pair their wallet to Telegram from `/profile`. Once linked, the
Karwan bot pushes deal updates, chat messages from the other party, and bridge
state changes to that chat, so you don't have to keep the dashboard open.

Email is wired too, via Resend, for sign-in codes and key alerts. Set
`RESEND_API_KEY` and `RESEND_FROM` in `.env` to enable. Without those, the OTP
backend falls back to a dev-only autofill so local builds keep working.

To enable Telegram on a deployment:

```
TELEGRAM_BOT_TOKEN=<token from @BotFather>
TELEGRAM_BOT_USERNAME=<bot username, no @>
```

Without those set, the bot is disabled cleanly and `/profile` shows a "not
configured" hint instead of the connect flow.

## Docs

- [docs/architecture.md](./docs/architecture.md). Components, both deal flows,
  the wallet model.
- [docs/circle-integration.md](./docs/circle-integration.md). How each Circle
  product is used.
- [docs/circle-product-feedback.md](./docs/circle-product-feedback.md). DevX
  notes from the build.
- [docs/reputation-model.md](./docs/reputation-model.md). The composite
  formula, the spam detector, and the agent integration spec.

## Known limitations

The current testnet build has known gaps the team has documented and is
fixing in v2. The most important is that a buyer can call dispute + refund
after the seller delivers, and the seller has no on-chain recourse beyond
the reputation slash that follows. See
[/known-limitations](https://karwan.app/known-limitations) for the full list
and the planned mitigations. **Real-USDC mainnet deploy requires v2.D plus a
professional external audit.** Testnet runs use no real money.

## Roadmap

The current build covers the launch surface above. v2 continues along these
tracks:

- **Security and verification agent.** Independent engines vote on every
  deliverable URL before the buyer sees it. Confirmed malicious deliveries
  slash reputation and tag the seller. Off-platform deliveries are recorded as
  at-your-own-risk.
- **Reputation rules doc.** `docs/reputation-rules.md` becomes the source of
  truth for the composite-score math, tier breakpoints, slash multipliers, and
  a new speed-bonus term that pays sellers who deliver early and never
  penalises slow-but-on-time delivery.
- **Terms and Conditions.** Versioned, professional consent surface gating
  signup. Public `/terms` page and a first-signup modal that records the
  accepted version against the wallet.
- **Hardened staking as deal insurance.** A portion of a seller's active stake
  reserves against deals they accept. Confirmed disputes against the seller
  transfer the reservation to the buyer, so the stake is a real deliverable
  backstop and not only a reputation signal. **Also bundled into this contract
  redeploy**: B.2 (`releaseFromDispute` so Disputed can resolve in favour of
  the seller), C.1 (OpenZeppelin `ReentrancyGuard`), C.4 (gate
  `recordCompletion` to escrow-only). All audit-driven, all in one redeploy.
- **Agent intelligence upgrade.** Buyer and seller agents read trending-skill
  signals from real platform activity. Counter-bids carry a reasoning trace
  citing market medians and scarcity. Buyers who post under-market briefs see
  a non-blocking nudge before submit.
- **File delivery and storage.** Cloudflare R2 with TTL for the default flow,
  IPFS content-addressed delivery as an opt-in for trade-document workflows
  where tamper evidence matters. Files run through a hash-first scan pipeline.
- **Full localisation + RTL audit.** The framework + critical surfaces ship
  at launch (Settings page, top nav, Telegram notifications, onboarding step
  1). v2 completes the work: extracting every literal string across the
  product and migrating directional CSS so Arabic renders right-to-left
  without breaking layout. All five locales reach full coverage together.
- **Credit Passport, invoice factoring, USYC treasury routing.** The Track 2
  surface. A public Credit Passport page for any wallet, an invoice factoring
  micro-flow for STRONG and ELITE sellers, and idle treasury USDC routed
  through Hashnote USYC on mainnet.

A full project handbook on **GitBook** ships after production stabilises:
overview, architecture, on-chain reference, role walkthroughs for buyer,
seller, and financier, and an agent operator guide. The handbook will host
the user-facing how-to alongside everything currently in `docs/`.
