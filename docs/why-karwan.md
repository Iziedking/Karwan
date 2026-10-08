# Why Karwan

Last reviewed: 2026-10-08

Karwan lets your reputation travel with you, and lets your agent use that
reputation to find, negotiate with, and transact with the right people. It
starts with Karwan's own open market.

## The problem

People join a new marketplace, a new job board, a new region, and have to
vet themselves from zero every time. Years of good work stay locked inside
platforms that do not talk to each other. A freelancer with five years of
five-star work on one site is a stranger on the next. A supplier who has
delivered on time for a decade has nothing a buyer abroad can check. Real
talent stays hidden, and opportunities go to whoever is easiest to check,
not whoever is best.

Trade itself carries the same gap. Internet deals start in a social post, a
chat, a marketplace or a referral, and the place where the buyer and seller
meet rarely gives them a shared way to agree terms, protect payment, verify
delivery or keep the record. Across borders, bank rails add fees, spreads,
delays and unclear status on top.

## The direction

Karwan lets your reputation travel with you, and lets your agent use that
reputation to find, negotiate with, and transact with the right people.

The internet made it easy to find people and hard to know who to trust.
Karwan is building two things that answer that together:

- **A portable, verified reputation.** One record that follows a person from
  market to market: easy to look up and hard to fake. Their agent gathers and
  verifies their work history, only with their consent.
- **An agent for every person.** Tell it what you need and your budget. It
  searches the network, weighs reputation, talks to other people's agents,
  negotiates price, timeline and terms, and brings back the best matches. You
  choose, the deal opens with the money protected in escrow, and the finished
  work updates both records.

Humans make the decisions. Agents do the legwork.

How it is built:

- **It starts with the market.** Every completed Karwan deal is protected in
  escrow and recorded, and that record is the first input to the portable
  reputation.
- **Your data, your permission.** Agents work with data a person already owns,
  only after they connect it and agree. Nothing is leaked, sold or scraped.
- **Partners, not scraping.** Other platforms join as partners when the working
  model is designed with them. None is named until an agreement exists.
- **Built on Circle.** Escrow, staking and Circle's payment tools bring the
  market on chain. The reputation layer is being built on Circle's agent stack.
- **Designed before it is built.** The model is drawn and explained in
  [architecture view 08](./architecture/08-reputation.md).

Today, the market, the buyer and seller agents inside it, and the reputation
earned from Karwan deals are live on testnet. The portable reputation and the
agent-to-agent network beyond Karwan's market are being built.

## The Karwan answer

One Karwan account includes:

- A personal workspace for individual trade.
- An optional business workspace under the same identity.
- One customer wallet and one USDC balance in v1.
- A visible workspace switch before sensitive actions.
- Simple availability records for goods and services.
- Business verification kept separate from personal identity verification.
- A trade record that follows the agreement, delivery, payment, and outcome.

The business workspace is owner-only in the current build. Team permissions
are on the roadmap, not a live claim.

## Two ways to start

### Bring a deal

When you already know the other side, enter the amount, terms, and counterparty.
Both sides review the proposed deal before funding. The trade then follows the
same delivery, release, settlement, and record path as a market match.

### Find supply

When you need a supplier or want to show what you can provide, post a request
or availability record. Karwan can compare candidates and prepare a structured
recommendation. You remain the decision maker before a match is accepted or
money moves.

This makes a trade found on a social app, a marketplace, or a private
conversation easier to bring into one protected closing path. Those places are
where people meet. Karwan is the place where both sides agree,
settle, and keep the record.

## What agents do

Agents help with the work that is difficult to do by hand:

- Search and compare possible counterparties.
- Read the request, offer, and delivery context.
- Gather available reputation and market evidence.
- Prepare a versioned offer with clear reasons.
- Keep the activity record updated while the trade progresses.

Agents do not silently accept a match, fund escrow, release money, alter a
workspace, or change verification. Consequential actions require the user's
approval and are reconciled against current provider and chain state.

## Two proof questions

Karwan keeps delivery proof and participant identity separate.

Chainlink CRE helps answer **what happened**. Its delivery path binds an
authenticated request to the current agreement, fences duplicate workers,
records the evidence digest and provenance, and pauses release when evidence is
missing, stale, mismatched, or unavailable. GitHub is the first concrete source;
carrier events, signed artifacts, buyer acceptance, and other sources can use the
same agreement-bound adapter shape.

World ID and AgentKit help answer **who is behind an automated action**. Karwan
verifies World ID staging proofs, protects AgentKit challenges against replay,
and checks the World AgentBook before granting a protected agent capability. An
unregistered agent is refused. This is an optional trust signal, not payment
approval, and it does not replace the user's review of the deal.

Together, the systems let Karwan protect a software milestone, a goods delivery,
a creator contract, a purchase order, or a cross-border service with the same
settlement boundary. The evidence source changes with the deal; the agreement,
escrow, review, release, and receipt path stays consistent.

## What a trade records

Karwan keeps the important parts of a trade together:

1. What was requested or offered.
2. Who the counterparties are and which workspace acted.
3. The agreed amount, delivery terms, and milestones.
4. The payment and release events.
5. Evidence and the final outcome.

That record helps a future counterparty understand what has actually happened.
Reputation is evidence of completed activity, not a guarantee that every future
trade is safe.

## Settlement

Escrow settlement remains on Arc testnet. Mainnet currently provides the wallet
application and two registries, without escrow trading. The chain is
authoritative for escrow state, releases, and receipts. Circle transfer and
bridge views report the status known to the app and do not promise a fixed
arrival time. Testnet balances and receipts are not production money.

## What the testnet trade application includes

- Personal and owner-only business workspaces under one identity.
- Workspace-aware profile, setup, business home, marketplace, and trade entry
  surfaces.
- Direct deals and market requests for goods or services.
- Reputation, stake, wallet, bridge, activity, and trade-record surfaces.
- Human review before consequential deal actions.
- Localized product copy and guided tours on sensitive pages.

The public documentation marks capabilities as planned, testnet-only, or
owner-only when those limits matter. It does not describe financing, team
permissions, or production settlement as available unless the current build
and deployment prove them.

## Read next

- [Architecture](./architecture.md) for the system shape and data boundaries.
- [Agent workflows](./agent-workflows.md) for the approval and reconciliation
  boundary.
- [Work verification](./work-verification.md) for evidence handling.
- [Reputation model](./reputation-model.md) for score inputs and limits.
- [Terms and conditions](./terms-and-conditions.md) for the legal product
  description.
