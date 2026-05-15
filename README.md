# Karwan

On-chain settlement for service deals. Money sits in USDC escrow on Arc while
work gets delivered, and releases as the work lands. Built on Circle's stack.

## What it is

Two parties agree on a service deal. The buyer's funds go into a milestone
escrow on Arc. The seller delivers. The buyer releases, in tranches, and the
escrow settles. A platform fee is split between both sides and collected on
chain. Past outcomes are written to a reputation registry, so a wallet's track
record follows it to the next deal.

There are two ways to open a deal:

- **Direct deal** — you already have a counterparty. You name their wallet, set
  the amount and terms, and the escrow funds. They accept the terms, deliver,
  and you release.
- **Managed deal** — you need a counterparty. You post a brief and your buyer
  agent runs a sealed auction against seller agents, negotiates, and funds the
  escrow on acceptance.

Both run on the same settlement spine: USDC escrow, milestone release with a
fee split, review-window timers with agent auto-release, on-chain reputation,
and CCTP for bringing USDC over from other chains.

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
| KarwanJobBoard | `0x6B32f87954483525b8FBBDa27453F6454a745b2F` |
| KarwanEscrow | `0x9eD65f925baf6B1D794A10CfDdFAe4E56cC4e5F8` |
| KarwanReputation | `0xB2D80C6d34649873471d836847ca6498eCb072D2` |
| USDC | `0x3600000000000000000000000000000000000000` |

`KarwanEscrow` carries a platform fee (default 150 bps) split evenly between
buyer and seller, collected by a treasury address set at deploy time. Build,
test, and deploy instructions are in [contracts/README.md](./contracts/README.md).

## Communication

Buyer and seller can chat inside the deal page. Messages are end-to-end between
the two parties — only the buyer and seller of a deal can read or post to its
thread. The transcript is persisted, delivered live via SSE, and replayed on
reload.

Anyone can pair their wallet to Telegram from `/profile`. Once linked, the
Karwan bot pushes deal updates, chat messages from the other party, and bridge
state changes to that chat — so you don't have to keep the dashboard open.

To enable Telegram on a deployment:

```
TELEGRAM_BOT_TOKEN=<token from @BotFather>
TELEGRAM_BOT_USERNAME=<bot username, no @>
```

Without those set, the bot is disabled cleanly and `/profile` shows a "not
configured" hint instead of the connect flow.

Email notifications for deal alerts are planned for a later release.

## Docs

- [docs/architecture.md](./docs/architecture.md) — components, the two deal
  flows, the wallet model
- [docs/circle-integration.md](./docs/circle-integration.md) — how each Circle
  product is used
- [docs/circle-product-feedback.md](./docs/circle-product-feedback.md) — DevX
  notes from the build
