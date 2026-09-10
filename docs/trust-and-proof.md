# Trust and proof in Karwan

Last reviewed: 2026-09-10

Karwan protects an internet trade with two separate questions:

1. **What happened?** Delivery and settlement evidence must match the deal.
2. **Who is behind the action?** A person or agent may need an identity and registration check before receiving access to a protected capability.

Arc holds the escrow and settlement state. Chainlink CRE checks delivery evidence before Karwan treats a milestone as ready for release. World ID and AgentKit provide an optional human-backed identity signal for agent and research workflows. None of these systems replaces the buyer's review of the agreed work.

## The trade flow

```text
Find a counterparty anywhere
        ↓
Bring the agreed terms into Karwan
        ↓
Buyer and seller review amount, milestones, evidence, and deadlines
        ↓
Buyer funds USDC escrow on Arc Testnet
        ↓
Seller delivers against a milestone
        ↓
Evidence is bound to the deal and checked
        ↓
Buyer reviews and releases the milestone
        ↓
Both sides receive a settlement receipt and trade record
```

The starting surface can be a direct message, marketplace listing, referral,
email invite, or Karwan request. Social platforms are discovery surfaces. They
do not become the ledger and they do not receive authority to move escrow funds.

## What Chainlink CRE adds

Karwan's CRE delivery path gives the evidence workflow a verifiable boundary.
The current demonstration uses a GitHub source because a commit or pull request
can be tied to an immutable revision.

The reusable controls apply to other evidence sources too:

- delivery requests are authenticated and bound to the current agreement;
- workers use leases so an expired or duplicate worker cannot publish stale evidence;
- evidence is invalidated when a request is redelivered or its terms change;
- provider results are stored with their digest, provenance, and delivery identity;
- missing, stale, mismatched, or unavailable evidence pauses release;
- retries reconcile the existing operation instead of creating a second payout.

For a goods deal, the source could be a carrier event. For a service, it could
be a signed artifact, a buyer acceptance, or a repository release. The adapter
changes; the agreement binding and release policy remain the same.

## What World ID and AgentKit add

World is an optional identity layer for actions where a human-backed agent or
anti-sybil signal improves the decision. Karwan's integration has three parts:

- World ID staging proofs are verified by the backend and protected against
  reused nullifiers.
- AgentKit requests are bound to a short-lived challenge, domain, nonce, and
  signature, so a signed request cannot be replayed in another context.
- The World AgentBook provider is queried before a protected agent capability is
  accepted. An unregistered agent is refused rather than treated as trusted.

This does not make World ID a payment approval. The user still approves the
deal terms and money movement, and the Arc contracts remain authoritative for
escrow and settlement.

The current testnet build proves World ID staging verification and the safe
unregistered-agent path. Live AgentBook registration is still subject to the
supported World verification path and is documented as pending until it is
completed.

## Why this works for different trades

The same protection layer can secure services, goods, creator work, purchase
orders, and cross-border supply. Each deal declares its own evidence rules:

| Deal | Example evidence | Human decision |
| --- | --- | --- |
| Software work | commit, release artifact, buyer test | accept the milestone |
| Design or content | hashed export, review link, acceptance note | approve the draft |
| Goods | carrier event, tracking reference, signed receipt | confirm arrival or dispute |
| Purchase order | accepted order, delivery attestation, settlement terms | approve financing or release |
| Agent-negotiated trade | mandate, AgentKit proof, offer history, delivery evidence | approve the final terms |

Karwan does not assume that one provider or one platform can prove every claim.
It records the source, scope, freshness, and verification state so a counterparty
can see what was checked and what still needs review.

## Current boundary

Karwan is running on Arc Testnet. Testnet USDC has no real value. CRE and World
are integrated as reviewed trust boundaries, but a live provider or on-chain
receipt is only claimed when the submission includes the corresponding evidence.
The browser companion, mainnet settlement, and local bank payout corridors are
planned expansion work.
