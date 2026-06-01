# Karwan

Stablecoin settlement for cross-border service deals. Two people anywhere agree to work, the money sits in milestone escrow on Arc while the work happens, and it pays out as the buyer releases. Built on Circle, live on Arc Testnet (chain 5042002).

Live: [karwan.site](https://karwan.site). API: [api.karwan.site](https://api.karwan.site).

> For the long technical brief (agent reasoning, reputation engine, contract layout, cross-chain ingress), read [docs/why-karwan.md](./docs/why-karwan.md).

## What it does

Two ways in. Same escrow underneath.

- **Direct deal.** You already know your counterparty. Drop their wallet, or just their email, set the amount and terms, set the deadline. The escrow funds. They sign in, accept, deliver, and you release in tranches.
- **Agent-matched.** You don't have a counterparty yet. Post a request (the work you need) or an offer (what you sell). Your agent watches the market, scores both sides, surfaces a proposal when it finds a fit. You approve, the escrow funds, the rest auto-settles.

The agent is a matchmaker. It never opens an escrow without you tapping approve. New or low-reputation sellers always route to human review.

## What's live now

All shipped on Arc Testnet:

- **Shareable deal links.** Send a deal to anyone by email. They open the link, type the OTP, a Circle wallet provisions in their browser, they accept. No signup form.
- **Cashout in seconds.** After settlement, the seller picks a destination chain and recipient on the cashout page. Arc-to-Arc transfers are instant. Cross-chain bridge-out goes through CCTP V2 to Ethereum, Base, Arbitrum, Optimism, Polygon, or Solana with an inline progress card.
- **Stake as insurance.** On accept, the escrow reserves `dealAmount × reservationBps` from the seller's free stake. A failed dispute slashes the reservation to the buyer. Trusted Match mode makes the floor a precondition, not a feature.
- **Public credit passport.** Every wallet has a public reputation page at `karwan.site/credit-passport/0x...`. No login. Share it like a LinkedIn profile.
- **USYC in the vault (mainnet path).** Idle stake principal routes through Hashnote USYC via an ERC-4626 Teller. Testnet uses a deterministic Mock USYC adapter on the same interface, so the mainnet flip is a constructor flag.
- **Five-chain CCTP bridge.** Pull USDC from Base, Ethereum, Arbitrum, Optimism, or Polygon Sepolia, plus Solana Devnet, into Arc. Backend relays the mint so the user never holds Arc gas.
- **Extension request.** Seller asks for more time, buyer approves or declines from a banner. Audit-logged as structured deal state, not a chat shim.
- **Three login paths.** Passkey, email OTP, or web3 wallet via SIWE.
- **Guided coachmark tours.** Role-aware, experience-weighted, runs once per page.
- **i18n framework.** English ships fully. Arabic, French, Hindi, Swahili have scaffolding and Telegram notifications already localised. Full UI extraction is on the v2 list.

## Contracts (Arc Testnet, chain 5042002)

| Contract | Address |
|---|---|
| KarwanJobBoard | `0x35224C2234263B5506a9F7BfF4bb98e9FceD3FF3` |
| KarwanEscrow | `0x48797C04EE342067A68f29Fbb19B577077d77301` |
| KarwanReputation | `0xBBAC748cA8C7a47e39Bd2AEaDbaa4e9f96ae4442` |
| KarwanVault | `0x2d4506284B2D778365b4B295100EF099F35973c5` |
| KarwanTreasury (ERC-4626) | `0xa5516F58Ab4dbF1B4949723715D1310A8FBb6fBA` |
| MockUSYC (testnet only) | `0x1789cdD059724CDffC33a9E0d43aE6415D79965b` |
| USDC | `0x3600000000000000000000000000000000000000` |

Earlier-generation contracts (Gen 1, Gen 2, Gen 3) stay registered so users with positions on them can still see and exit under `/legacy`.

## Docs

- [docs/why-karwan.md](./docs/why-karwan.md). Full technical brief.
- [docs/architecture.md](./docs/architecture.md). Components, both deal flows, wallet model.
- [docs/reputation-model.md](./docs/reputation-model.md). Composite score, tiers, agent integration.
- [docs/circle-integration.md](./docs/circle-integration.md). How each Circle product is wired.
- [docs/circle-product-feedback.md](./docs/circle-product-feedback.md). DevX notes from the build.

## What's next

Headline item first, then the smaller follow-throughs.

- **x402 nanopayment rails for agents.** Wire Circle's x402 micropayment surface so the buyer and seller agents can pay sub-cent fees for live data they need to negotiate well. Market-rate medians from paid APIs, skill demand snapshots, news signals during a delivery review window, deeper credit checks against a passport. Today the agents run on what we cache. With x402, every negotiation round can pull a fresh outside signal for a few thousandths of a cent. The result is richer match decisions and a marketplace that prices itself against the real world, not against our local view of it.
- **Invoice factoring.** A financier funds an accepted deal at a discount; the escrow settles to the financier on release. Reputation tier sets the discount floor.
- **Symmetric reputation crediting** on settlement so both sides' on-chain records reflect a clean delivery, not just the seller's.
- **External smart-contract audit** before any mainnet exposure.
- **Safe multisig treasury** to replace the deployer EOA before the current contracts go mainnet.
- **Foundry coverage above 80%** on the escrow and vault branches.
- **Full UI string extraction and RTL audit** so Arabic isn't a fallback to English layout.
- **GitBook handbook** covering buyer, seller, financier, and agent-operator workflows.


