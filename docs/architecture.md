# Architecture

## Components

- **Frontend** — Next.js 15 dashboard. Buyers and sellers connect a wallet,
  open deals, release funds, and watch a live event feed over SSE.
- **Backend** — Hono API. It holds the agent loops (buyer agent, seller agent),
  the deal watcher that runs the review-window timers, the CCTP relay, and the
  SSE event bus.
- **Contracts** — `KarwanJobBoard`, `KarwanEscrow`, `KarwanReputation` on Arc
  Testnet (chain 5042002). USDC is the native gas asset.
- **Circle stack** — USDC, Developer-Controlled Wallets, CCTP V2. See
  [circle-integration.md](./circle-integration.md).
- **Storage** — Postgres (via Drizzle) for profile and direct-deal metadata.
  The chain is the source of truth for anything financial; Postgres holds the
  off-chain bits like terms text and the delivered flag.

## The wallet model

A user's connected browser wallet identifies them. It does not sign Karwan's
business transactions. Two Circle Developer-Controlled Wallets do that: a buyer
agent and a seller agent, both Smart Contract Accounts on Arc. They sign
`postJob`, `submitBid`, `acceptBid`, `fundEscrow`, `releaseProgress`,
`recordCompletion`, the CCTP `receiveMessage` relay, and `dispute`.

The one transaction a user signs from their own wallet is the CCTP burn on the
source chain when they bridge USDC over to Arc.

The reason for this split: the negotiation and the review-window timers run
server-side and have to act when the user is not on the page. A browser
extension wallet cannot sign in the background. A Circle Developer-Controlled
Wallet can.

## The two deal flows

A managed deal walks the full path. A direct deal skips the auction and goes
straight to funding with a named seller.

```mermaid
flowchart TD
    subgraph Managed["Managed deal"]
        M1[Buyer posts a brief] --> M2[Seller agent bids]
        M2 --> M3[Buyer agent counters once]
        M3 --> M4[Seller responds]
        M4 --> M5[Buyer agent accepts]
        M5 --> F1
    end

    subgraph Direct["Direct deal"]
        D1[Buyer opens a deal with a named seller] --> F1
        F1[fundEscrow] --> D2[Seller accepts the terms]
        D2 --> D3[Seller marks delivered]
        D3 --> R1[Buyer releases first milestone]
        R1 --> R2[Buyer verifies and releases the final milestone]
        R2 --> S1
    end

    S1[Escrow settles] --> S2[recordCompletion writes the outcome]

    D3 -. buyer stalls .-> AR1[Deal watcher auto-releases the first milestone]
    R1 -. buyer stalls .-> AR2[Deal watcher auto-releases the final milestone]
    D2 -. seller never delivers .-> C1[Buyer cancels, escrow refunds]
    R1 -. buyer keeps stalling .-> AP1[Seller appeals, escrow goes to dispute]
```

## Escrow and the fee split

`KarwanEscrow` is funded with a milestone schedule. A platform fee, 150 basis
points by default, is split evenly between buyer and seller. The buyer funds
the deal amount plus their half of the fee. The seller nets the deal amount
minus their half. The treasury collects the full fee, taken proportionally as
each milestone releases. The final milestone sweeps any rounding remainder so
the escrow ends empty.

## Review windows and auto-release

Two timers protect both sides from a stalling counterparty.

After the seller marks delivered, the buyer has a window to release the first
milestone. If they sit on it, the deal watcher releases it for them and opens
the second window. After the first milestone is out, the buyer has another
window to verify and release the final milestone. Buyer silence past the window
counts as acceptance, and the watcher releases the rest.

The buyer can tip "still reviewing" to add time to the final window, capped at
three extensions. If a buyer keeps stalling, the seller can appeal once the base
window has passed, which moves the escrow to a disputed state on chain.

If the seller never marks delivered and the deadline passes, the buyer can
cancel. The escrow moves to disputed, then refunds the buyer in full, and the
reputation registry records a failure against the seller.

## Reputation

When a deal settles, the buyer agent calls `recordCompletion` on
`KarwanReputation` with a Success outcome against the seller. A cancel records
Failed. An appeal records DisputeResolved. `getReputationScore` returns a score
in basis points that the frontend renders as a tier. The score follows the
wallet, not a Karwan account.
