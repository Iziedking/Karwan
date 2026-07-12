# Setup

How to run Karwan locally and how the Circle wiring is provisioned. For the
integration detail behind each Circle product, see [CIRCLE.md](./CIRCLE.md).

Karwan is an npm-workspaces monorepo:

- `backend/` — Hono API, the agents, the watchers, and every Circle SDK call
- `frontend/` — Next.js app
- `contracts/` — Foundry (Solidity)

## Prerequisites

- **Node 20 or newer** (`engines.node >= 20`)
- **Foundry** for the contracts ([getfoundry.sh](https://getfoundry.sh)), only if you want to build or test the contracts
- A **Circle Developer account** ([console.circle.com/signup](https://console.circle.com/signup)) for an API key and entity secret

## 1. Install

```bash
git clone https://github.com/Iziedking/Karwan
cd Karwan
npm install          # installs backend + frontend workspaces
```

## 2. Configure the environment

```bash
cp .env.example .env
```

Every variable the backend reads is documented inline in `.env.example`. To
just get the app running against Arc testnet, the ones that matter are:

| Variable | What it is |
|---|---|
| `CIRCLE_API_KEY` | Console → Keys → Create a key (Standard Key) |
| `CIRCLE_ENTITY_SECRET` | Registered with Circle, see step 4 |
| `OPENROUTER_API_KEY` | The agents' LLM calls ([openrouter.ai/keys](https://openrouter.ai/keys)) |
| `SESSION_SECRET` | Any 32+ char random string (`openssl rand -hex 64`) |
| Arc RPC / addresses | Preconfigured to Arc testnet (chain 5042002); the public RPC works for dev |

Everything else is optional and falls back sensibly: no `DATABASE_URL` uses a
flat-file store under `backend/data/`, no `RESEND_API_KEY` logs OTP codes to
stdout, no `TELEGRAM_BOT_TOKEN` no-ops the bot. The Karwan contract addresses
for a running deployment are in the [README](./README.md#contracts-on-arc-testnet-chain-5042002).

## 3. Run

```bash
npm run dev          # backend on :8787, frontend on :3000
```

Or each side on its own:

```bash
npm run dev:backend
npm run dev:frontend
```

Open [http://localhost:3000](http://localhost:3000).

## 4. Provision the Circle wallets (first run)

The backend signs on behalf of users with Circle Developer-Controlled Wallets.
Register your entity secret once, then create the wallet set the agents use:

```bash
npm run entity-secret:register    # one-time, per Circle account
npm run wallets:create            # creates the wallet set + CCTP relay wallet
```

`wallets:create` prints the IDs to paste back into `.env`
(`CIRCLE_WALLET_SET_ID`, `CCTP_RELAY_WALLET_ID`, `CCTP_RELAY_ADDRESS`). Fund the
relay wallet with a little Arc USDC for gas ([faucet.circle.com](https://faucet.circle.com)).
On Arc, USDC is the native gas token, so no second asset is needed.

## 5. Contracts

```bash
npm run contracts:build
npm run contracts:test            # 375 passing
```

To deploy your own set instead of using the addresses in the README, run the
Foundry deploy scripts in `contracts/script/` with a funded `DEPLOYER_PRIVATE_KEY`
in `.env`, then paste the emitted addresses into the `KARWAN_*_ADDR` variables.

## Useful checks

```bash
npm run typecheck                 # backend + frontend
npm run build                     # production build of both
```

## Where things live

| Path | What |
|---|---|
| `backend/src/circle/` | The Circle SDK wiring (wallets, bridge, webhooks) |
| `backend/src/chain/` | Arc client, CCTP, contract bindings, watchers |
| `backend/src/routes/` | The API surface |
| `backend/src/agents/` | Buyer, seller, and settlement agents |
| `contracts/src/` | KarwanEscrow, Vault, Reputation, Treasury, InvoiceRegistry, POFinancing |
| `frontend/features/` | The product surfaces (bridge, deals, financier, profile) |
