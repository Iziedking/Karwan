# Karwan

Cross-border settlement and reputation rails for SME trade between MEASA merchants, powered by autonomous agents on Arc.

## Repo layout

```
karwan/
├── backend/      Hono + TS API and agent loops
├── contracts/    Foundry workspace
├── frontend/     Next.js dashboard
└── docs/
```

## Prerequisites

- Node.js >= 20
- Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- A Circle Developer account at https://console.circle.com

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` from https://console.circle.com.

Create agent wallets:

```bash
npm run wallets:create
```

Append the printed lines to `.env`. Fund both addresses at https://faucet.circle.com (Arc Testnet).

Register both wallets on the ERC-8004 IdentityRegistry:

```bash
npm run identity:register
```

Verify the stack:

```bash
npm run smoke-test
npm run dev
```

## Contracts

See [contracts/README.md](./contracts/README.md).
