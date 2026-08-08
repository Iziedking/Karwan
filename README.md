# Karwan

Karwan is an on-chain settlement and reputation workspace for person-to-person and business trade. Parties agree terms, fund USDC escrow on Arc, and release money as delivery is accepted.

The current build runs on Arc Testnet (chain `5042002`) and supports:

- Buyer and Seller desks for individual trade.
- Buyer Desk and Supply Desk for business trade.
- Direct deals and agent-assisted matching and negotiation.
- Milestone escrow, delivery review, cancellation, and dispute outcomes enforced by contracts.
- Reputation, staking, tier progression, and yield surfaces.
- Activity, wallet, bridge, profile, and business-account workspaces.
- Business registration and verification status workflows.

Karwan is testnet software. Do not use it for real funds or rely on it as a regulated financial, identity, or employment service.

## Start locally

```powershell
npm install
npm run dev --workspace=frontend
```

The frontend is served at `http://localhost:3000`.

For a production-like frontend:

```powershell
npm run build --workspace=frontend
npm run start --workspace=frontend -- -p 3000
```

See [`docs/current-build.md`](docs/current-build.md) for the current product inventory, verification boundaries, and route map.

## Repository map

- `frontend/` — Next.js application and product surfaces.
- `backend/` — API, policy, data, and contract-facing services.
- `contracts/` — Arc Testnet contracts and deployment material.
- `docs/` — product, architecture, operations, verification, and test documentation.

## Important documents

- [`docs/terms-and-conditions.md`](docs/terms-and-conditions.md)
- [`docs/current-build.md`](docs/current-build.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/reputation-model.md`](docs/reputation-model.md)
- [`docs/skill-verification-roadmap.md`](docs/skill-verification-roadmap.md)
- [`docs/test-guide.md`](docs/test-guide.md)

## Roadmap

The next product track is a mobile companion for the core web workspace. It will keep the high-frequency actions simple: review a match, approve a counter, fund or release a milestone, respond to a deadline, and see the current deal state. The full buyer and seller desks, business controls, verification review, and detailed activity history remain on the web surface. The mobile app is planned work, not a shipped product.
## Status

This repository contains an active testnet build. Some integrations and policy controls are present behind configuration flags. A feature is live only when the product exposes it and the relevant backend and contract path are enabled.