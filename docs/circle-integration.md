# Circle integration

Concrete map of how each Circle product is used in Karwan.

| Product | Role | Status |
|---|---|---|
| **USDC** | Settlement currency for escrow funding, milestone releases, agent payments, platform fees | Core |
| **Circle Wallets** | Developer-Controlled Wallets for every agent and embedded wallets for human users. Per-wallet daily limits and recipient whitelist | Core |
| **Nanopayments** | (1) Agents pay per research call (reputation, market data, profile validation). (2) Milestone-based progress payments stream from escrow to seller | Core |
| **CCTP + Bridge Kit** | Buyer agent moves USDC from buyer's home chain (Ethereum, Base) onto Arc before funding escrow | Core, one direction in v0 |
| **Circle Gateway** | Platform treasury aggregates fees as a unified balance and maintains refund liquidity across chains | Light — one working call + architectural doc |

## Wallet topology

- **Buyer-side agent wallet** — signs counter-offers, escrow funding, milestone release approvals, reputation writes.
- **Seller-side agent wallet** — signs bid submissions, counter-responses, milestone completion signals.
- **Per-human user wallets** — embedded SCA wallets created on first dashboard sign-in.
- **Platform treasury wallet** — receives platform fees; Gateway aggregates across chains.

## Anti-self-dealing (ERC-8004)

Per ERC-8004, an agent's owner cannot record reputation for that agent. In Karwan, the buyer and seller rate each other after a deal — so the constraint is satisfied naturally without an extra validator wallet. The platform never writes its own reputation.
