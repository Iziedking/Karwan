# 01 · Workspace

The workspace is where a seller runs their trade: today's orders, new sale links, money, their record and their customers. Buyers never need the workspace; they meet Karwan through a link or the market.

## Context

```mermaid
flowchart LR
  subgraph People
    S[Seller<br/>freelancer, artisan, small business]
    B[Buyer<br/>anywhere, any account]
  end

  subgraph Karwan
    W[Workspace<br/>Today, Sales, Money, Record, Customers]
    L[Deal link<br/>pay page]
    M[Market<br/>offers and requests]
    E[Escrow<br/>money held until delivery]
    R[Record<br/>verified sales]
    A[Agents<br/>find and rank on request]
  end

  subgraph Rails[Rails underneath]
    Arc[Arc<br/>USDC settlement]
    CW[Circle wallets<br/>passkey and agent wallets]
    GW[Circle Gateway<br/>Instant top-up]
    IN[Local pay-in partner<br/>bank, mobile money, card]
    OUT[Local payout partner<br/>bank, mobile money]
    MSG[Messaging<br/>chat apps, email]
  end

  S -- creates sale, offers on requests --> W
  W -- sale link --> L
  S -- shares link in chat --> B
  B -- opens --> L
  B -- posts requests, browses --> M
  M -- sellers offer --> W
  L -- pays --> IN
  IN -- USDC --> E
  E -- on delivery --> OUT
  OUT -- local currency --> S
  E -- completed sale --> R
  R -- proof page, unlocks --> W
  A -. ranks, matches .-> M
  E --- Arc
  W --- CW
  L --- GW
  L -. receipts, nudges .-> MSG
```

## The loop that makes it a product

```mermaid
flowchart LR
  A[Link or offer] --> B[Buyer pays]
  B --> C[Money held]
  C --> D[Seller delivers]
  D --> E[Released]
  E --> F[Record grows]
  F --> G[Unlocks: more reach,<br/>lower fee, faster payout,<br/>working capital]
  G --> A
```

The top of the loop (hold and release) is infrastructure nobody pays for directly. The bottom (record and unlocks) is why a seller keeps coming back.

## Status

| Part | Status | Where |
|---|---|---|
| Market with offers and requests | Live (testnet) | `frontend/features/listings`, `backend/src/routes/listings.ts`, `jobs.ts` |
| Escrow, release, disputes | Live | `contracts/`, `backend/src/agents/dealWatcher.ts` |
| Passkey accounts (mainnet) and agent wallets | Live | `frontend/features/modularWallet`, `backend/src/db/agentWallets.ts` |
| Direct offers on requests | Built | [03](03-direct-offers.md) |
| Workspace tabs (Today, Sales, Money, Record, Customers) | Planned | spec: seller workspace |
| Local pay-in and payout partners | Planned | chosen per country, see research log |
| Messaging receipts and nudges | Planned | |
| Record that unlocks money | Planned | [06](06-record.md) |
