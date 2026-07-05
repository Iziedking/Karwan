# Release notes

## June 15 to July 5, 2026

This window moved Karwan from a working escrow marketplace to an agent-run
settlement network. Agents now research a deal before they price it, pay for
that intelligence per call in USDC, and negotiate against a shared market read.
A security agent screens every match and every delivery. We rebuilt the
cross-chain money path on CCTP V2, and the business finance rail (invoice
factoring, purchase-order financing) came together behind a launch flag.

242 commits across the backend, contracts, and frontend. What follows is grouped
by area rather than by date.

### Agent negotiation and matching

- Rebuilt the negotiation lifecycle to mirror how people actually trade. Sellers
  a buyer has closed clean deals with are evaluated first, the market is polled
  concurrently instead of one seller at a time, and the auction window stays open
  while agents are still deciding rather than closing on a fixed timer. A stronger
  bid that arrives late gets one counter at the buyer's cap, with the agreed match
  held in reserve as the fallback.
- Ranking leads with skill and topical fit. Reputation only breaks ties between
  comparable matches, so a strong specialist is never buried under a
  higher-reputation generalist.
- Relationship memory. A buyer agent remembers proven sellers and gives them a
  small, capped edge in ranking and negotiation. It never beats a clearly better
  or cheaper newcomer, and it never pays above the buyer's cap.
- Proceed-or-pass on a near miss. When the best achievable price lands just
  outside the buyer's range, the agent surfaces it with the market reason attached
  and waits for a human decision, instead of declining behind the buyer's back. It
  always surfaces the best seller it found, not a weaker, pricier fallback.
- An honest stop when nothing fits the budget. If the only match is priced far
  past budget and nothing cheaper exists, the deal says so plainly and offers one
  tap to raise the budget or bring back an offer the buyer passed.
- Structured-output negotiation model. Bid scoring, counter evaluation, and the
  market read run on a model tuned for strict schema output, so a malformed
  response never stalls a live negotiation. The deterministic ranking stays the
  source of truth; the model writes the reasoning, not the decision.
- Buyers can set a custom milestone split on a request, carried into escrow when
  the agent finds a deal. Milestones support two to five tranches.

### Paid market intelligence over x402

- Agents pay for a live market read before negotiating, funded per call in USDC.
  The read is a shared good: once one side researches an order, both agents
  negotiate against the same grounded price rather than guessing. The research
  credit is charged only to the buyer and seller who actually match.
- Two rails, both real. Internal signals (credit passport, repayment behaviour,
  counterparty concentration) are sold over x402 and settled through Circle
  Gateway Nanopayments on Arc, with gasless EIP-3009 authorizations batched
  onchain. External research runs on the standard x402 exact-EVM scheme on Base,
  where the agent pays a web-search provider and synthesises a market read.
- A deal-aware security agent fronts the single external research call the moment
  an order is posted and writes the result into a shared cache, so no agent bids
  blind and no one pays twice. It is neutral by design: the read is a shared good,
  not an edge one side bought.
- Every payment emits an `agent.paid` event, so the nanopayment trail is auditable
  per deal. `GET /api/x402` lists the internal paid endpoints and their prices.

### Delivery and counterparty safety

- A security agent scans every delivery proof before the buyer sees it, and the
  same scan guards in-app chat so a phishing or malware link cannot reach a
  counterparty in the first place.
- A flagged link pauses the deal's automatic release and routes both sides to
  resolve it together in chat. A confirmed bad link is a heavy hit to the sender's
  reputation. File deliveries move through a link the agent can check, not an
  unverified attachment.
- The security agent screens a match before it is proposed. New and low-reputation
  counterparties route to human review rather than an automatic decline.

### Settlement and cross-chain money movement

- Rebuilt the bridge on CCTP V2. USDC moves into Arc from Base, Ethereum,
  Arbitrum, Optimism, and Polygon testnets, plus Solana Devnet. The backend relays
  the destination mint, so a user never holds an Arc gas asset to get started.
- Cash out to a chosen chain and recipient after settlement. Arc-to-Arc transfers
  are instant; cross-chain cash-out routes through CCTP V2 with an inline progress
  card.
- Durable, resumable bridge state. A transfer that is interrupted resumes from its
  last attested step, and a mint that lands without a returned hash still settles
  to done rather than reading as failed.
- Gas Station sponsors the source-chain burn for Circle Wallet users, so a
  first-time user moves USDC without holding a separate gas token.

### Staking, insurance, and treasury yield

- A staker locks USDC into the vault, and the same principal does two jobs. When a
  seller accepts a deal, the escrow reserves part of their free stake against it; a
  lost dispute slashes that reservation to the buyer. Trusted Match mode makes the
  reservation a precondition for matching.
- Platform-fee reserves route through Hashnote USYC on Arc Testnet via an
  ERC-4626 treasury that subscribes idle USDC into USYC and redeems on demand. The
  treasury holds real, allowlisted USYC, verifiable with `npm run usyc:prove`.

### SME trade finance

- Financier desk. A self-serve surface for financiers to fund invoices and
  purchase orders, gated behind the SME Trades launch flag while it runs through
  pilot.
- Invoice factoring. A financier pays a seller early at a discount tied to the
  seller's reputation tier; on settlement the escrow routes funds to the financier.
  Hardened with idempotency keys and unique money indexes so a retry cannot
  double-fund.
- Purchase-order financing. Working capital advanced against an accepted purchase
  order, released to the supplier on verified proof of delivery.
- Credit passport. A portable onchain record of completed deals, repayment
  behaviour, and counterparty concentration that travels with each business.

### Platform, reliability, and product

- Security sweep across the backend: signed sessions required on every write, rate
  limits, session hardening, security headers, and user and auth state moved to
  Postgres. Containers run as a non-root user.
- The landing page reads real onchain statistics rather than static copy.
- Event handling made resilient. The agent poller reads events over HTTP instead
  of a dropping WebSocket, and a reconciler self-heals any `JobPosted` event a
  seller agent missed.
- Database egress cut with short-lived caches on hot read loops, after a
  full-table read pattern drove a provider egress spike.
- New-user onboarding funds a buyer and seller agent with a working USDC float on
  activation, so a first-time user lands ready to trade.
- Localised across five languages. Per-page guide tours cover the key elements of
  each screen. A privacy pass tightened who can read a matched deal.

### In development, targeting the next contract release

The following is built and test-proven in the repository. It ships as the next
immutable contract bundle rather than a mid-cycle redeploy, so the live deployment
stays stable while the new bundle completes its security review.

- A contract-level guardian that places bounded, auto-expiring holds and records
  delivery attestation across the escrow, vault, treasury, and financing
  contracts. It can pause a settlement but never move funds.
- Arbiter dispute resolution with proportional splits, a seller claim path after a
  review window, consented agent binding, and vault solvency enforcement.
- Deal-timing at the contract level: consented per-deal clocks, a capped
  seller-appeal extension flow, and an on-chain match window.
- Anti-farming reputation that weights standing by distinct settled counterparties,
  so volume against a single repeat party cannot inflate a score.
- Full test suite including adversarial exploit cases, run under an internal audit
  cycle with findings tracked to resolution.

### How to verify

- Live on Arc Testnet at [karwan.site](https://karwan.site).
- `GET /api/x402` lists the internal paid endpoints and prices.
- `agent.paid` events expose every nanopayment, internal and external, per deal.
- `npm run usyc:prove` reports the treasury's real USYC holding and reconciles it
  against the onchain oracle.

### Stack

Arc Testnet (USDC as native gas), Circle Developer-Controlled Wallets, Circle
Gateway Nanopayments and CCTP V2, x402 (Circle Gateway on Arc, exact-EVM on Base),
Hashnote USYC, ERC-8004 reputation, viem, Foundry, Hono, Next.js.
