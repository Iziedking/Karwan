# Why Karwan

Last reviewed: 2026-09-09

Karwan is an open market for internet trade. It gives people and small
businesses a clear way to move from finding a counterparty to a protected
USDC settlement, whether the trade is local or cross-border.

## The problem

Internet trade usually starts in a social post, a chat, a marketplace, or a
referral. The place where the buyer and seller meet rarely gives them a shared
way to agree terms, protect payment, verify delivery, or carry a record of the
completed trade.

Cross-border trade adds more friction. Bank rails bring fees, foreign-exchange
spreads, delays, and unclear payment status. The buyer worries that the goods
or service will not arrive. The seller worries that the payment will not come.
Past work is scattered across platforms, so a good delivery record is hard to
carry into the next trade.

## The Karwan answer

Karwan gives one identity and one login a shared trade layer:

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

This makes a trade found on TikTok, Instagram, Facebook, X, a marketplace, or
a private conversation easier to bring into one protected closing path. Social
platforms are discovery surfaces. Karwan is the place where both sides agree,
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

USDC settlement on Arc Testnet is the current development path. The chain is
authoritative for escrow state, releases, and receipts. Circle transfer and
bridge views report the status known to the app and do not promise a fixed
arrival time. Testnet balances and receipts are not production money.

## What is live in this build

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
