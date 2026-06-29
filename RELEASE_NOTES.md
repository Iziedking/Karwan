# Karwan release notes 29/06/2026

## x402 agentic settlement

In this window we shipped the full agent-mediated deal end to end, with the x402
nanopayment rail incorporated on both sides: agents pay Karwan's own paid
endpoints (internal) and pay third-party services (external), and a deal-aware
SecurityAgent pays a nanopayment to produce a shared finding the moment an order
is posted. 

### Headline: the full agent-mediated deal, end to end

A buyer posts a request. Their agent runs an auction, scores bids, and counters
within the buyer's stated limits. The human approves the terms, USDC locks in
milestone escrow on Arc, the seller delivers against milestones, and each
milestone releases its tranche on chain. Every settled deal writes to an
on-chain reputation record. The human keeps two gates, approving the deal and
the release; the agent does the rest.

### The x402 nanopayment rail, internal and external

**Internal: Karwan's own paid endpoints (Arc Testnet, Circle Gateway).**
Karwan exposes paid data endpoints over x402, settled in USDC through Circle
Gateway batched settlement on Arc. The endpoints serve the same underwriting
signals the platform computes for itself: credit passport, repayment behaviour,
counterparty concentration, and document anchors. The buyer agent pays these
during bid scoring, moving real USDC from its Gateway deposit to the platform
treasury. Financiers and external agents can pay per call for the same signals.
`GET /api/x402` is the free directory, and privacy and existence checks run
before the payment gate so a caller is never charged for a 404.

- Wallet model: agent wallets are Circle smart accounts; Gateway accepts EOA
  signatures, so each user gets a lazily provisioned x402 EOA that signs the
  EIP-3009 authorizations while the agent funds the Gateway deposit.

**External: third-party services (Base mainnet, standard exact-EVM x402).**
When the platform does not hold the data, agents pay external sellers on Base
mainnet over the standard x402 exact-EVM scheme (EIP-3009 against Base USDC). The
live use is market research: given a deal's keywords, the agent pays a web-search
service (Exa, via Circle's x402 marketplace) and synthesises a market read with
the platform model. The payer is a plain EOA that only ever signs; the seller's
facilitator submits on chain and pays the gas.

### The SecurityAgent: deal-aware, and it pays for its own findings

The moment an order is posted, the SecurityAgent fronts the single paid
market-research call on the Base x402 rail, then writes the result into a shared
keyword and demand cache. Every buyer and seller agent on that deal reads the
same intel from cache, so nobody bids blind and nobody re-pays. It is neutral by
design: the security agent is not a counterparty, so the read is a shared good
rather than an edge one side bought. The matched pair is billed for the read at
match, out of their research credit. Every payment emits an `agent.paid` event,
so the nanopayment trail is auditable per deal.

Alongside the paid research, the SecurityAgent runs a delivery-proof safety gate:
it extracts and scans the links in a delivery before the buyer reviews, so a
settlement is never gated on a hostile URL.

### Also shipped in this window

- Custom milestone split set on the request, carried into escrow when the agent
  finds a deal
- Deadline handling: the buyer is alerted on a missed delivery and the escrow
  auto-refunds in full after a grace window, with the seller's reputation hit
  recorded
- Bid ranking corrected so a comparable strong skill match lets reputation
  decide, instead of a perfect score escaping the top band
- Live balances that refresh every few seconds across the app
- Agents seeded with a working USDC float from an operator wallet on activation,
  so a new user lands ready to trade with sufficient fees enough for agent activities
- Platform treasury routed to USYC, Circle's tokenized US Treasuries, so reserves
  earn institutional yield on chain

### How to verify

- `GET /api/x402` lists the internal paid endpoints and their prices
- `backend/src/scripts/research-smoke.ts` exercises the external x402 market read
- `agent.paid` events surface every nanopayment, internal and external, per deal
- Live on Arc Testnet at karwan.site

### Stack

Arc Testnet (USDC as native gas), Circle Developer-Controlled Wallets, Circle
Gateway and CCTP, x402 (Circle marketplace plus exact-EVM on Base), viem,
Foundry, Hono, Next.js.
