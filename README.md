# Karwan

On-chain settlement for cross-border service deals. USDC sits in milestone
escrow on Arc while the work gets done, and releases as it lands. Built on
Circle's stack.

> **For the full technical brief — agent reasoning loop, reputation system,
> two-contract architecture, cross-chain ingress — read
> [docs/why-karwan.md](./docs/why-karwan.md).** Five minutes, no jargon, no
> code spelunking required.

## What it is

Two parties agree on a deal. The buyer's funds go into a milestone escrow on
Arc. The seller delivers. The buyer releases, in tranches, and the escrow
settles. A platform fee splits evenly between both sides and collects on chain.
Every outcome writes to a reputation score that follows the wallet to the next
deal.

There are two ways to open a deal:

- **Direct deal.** You already have a counterparty. Name their wallet, set the
  amount and terms, and the escrow funds. They sign in with that wallet,
  accept, deliver, and you release.
- **Agent-matched deal.** You don't have a counterparty yet. Post a brief or a
  listing, and your agent watches the marketplace on your behalf. When it finds
  a match, it scores both sides, weighs reputation, and surfaces a proposal.
  You approve, the escrow funds, the rest auto-settles.

The agent is a matchmaker, not a spender. It never opens an escrow without your
sign-off. New or low-reputation counterparties always route to human review.

## Reputation

Every wallet has a composite reputation score in [0, 1000] that grows with
completed deals, locked stake, and time on the platform. It drops with spam,
cancellations, and lost disputes. Five tiers gate the agent loop: NEW, COLD,
ESTABLISHED, STRONG, ELITE.

Sellers grow reputation by staking USDC in `KarwanVault`. On mainnet the vault
routes through Hashnote USYC, so the locked principal also earns yield. On
testnet it holds plain USDC.

## Contracts

Live on Arc Testnet (chain 5042002):

| Contract | Address |
|---|---|
| KarwanJobBoard | `0xB5C863322C174801610e6e19C25688232De27558` |
| KarwanEscrow | `0xb81d9093607E460e2E4Fa971c75d9322E756b838` |
| KarwanReputation | `0x622b2AA60A29Be1F5F98A64FdC0Fc4ba8c109723` |
| KarwanVault | `0x92b1223921944024f6615A604a2bDA6eF1fEe922` |
| USDC | `0x3600000000000000000000000000000000000000` |

## Docs

- [docs/why-karwan.md](./docs/why-karwan.md). The technical brief. What makes Karwan an SME trade platform rather than an escrow form.
- [docs/architecture.md](./docs/architecture.md). The components, both deal flows, the wallet model.
- [docs/reputation-model.md](./docs/reputation-model.md). The composite score formula, the spam detector, and the agent integration spec.
- [docs/circle-integration.md](./docs/circle-integration.md). How each Circle product is wired.
- [docs/circle-product-feedback.md](./docs/circle-product-feedback.md). DevX notes from the build.

## Roadmap

- Security and verification agent for delivered links
- Hardened staking as deal insurance
- Terms and Conditions surface, with versioned consent
- Reputation rules doc and completion-rate signal
- Agent intelligence upgrade with market-aware negotiation
- File delivery via Cloudflare R2 and IPFS
- Full localisation in English, Arabic, French, Hindi, and Swahili, with an Arabic RTL pass
- Credit Passport, invoice factoring, and USYC treasury routing on mainnet
- GitBook handbook for buyers, sellers, financiers, and agent operators
