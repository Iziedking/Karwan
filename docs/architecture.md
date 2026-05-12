# Architecture

## Components

- **Frontend** — Next.js dashboard for buyers and sellers.
- **Backend** — Hono API with buyer, seller, and verifier agent loops; SSE bridge to the dashboard.
- **Contracts** — `KarwanJobBoard`, `KarwanEscrow`, `KarwanReputation` on Arc Testnet (chain ID 5042002). USDC is the native gas token.
- **Circle stack** — Developer-Controlled Wallets, USDC, Nanopayments, CCTP, Gateway.

## Flow

```
postJob → submitBid → (counterOffer ↔ respondToCounter) → acceptBid
       → [CCTP if cross-chain] → fundEscrow → releaseProgress* → releaseFinal
       → recordCompletion (each party rates the other)
```

The chain is the source of truth. Postgres is an audit log only.
