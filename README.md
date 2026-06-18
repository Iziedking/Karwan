# Karwan

An agentic settlement layer on Arc. Two parties anywhere agree on a deal, the money sits in milestone escrow, and it releases as work is delivered. Agents handle the matching, negotiation, and settlement so neither side has to manage keys, watch the chain, or chase a counterparty.

Built on the Circle stack. Live on Arc Testnet (chain 5042002).

Live at [karwan.site](https://karwan.site). API at [api.karwan.site](https://api.karwan.site).

## What Karwan is

Karwan settles deals between people. The escrow primitive is the same whether a designer in Lagos sells a logo to a buyer in Berlin, or a supplier in Karachi ships cotton to a wholesaler in Dubai. What changes is the surface on top.

Two surfaces sit on that primitive:

- **P2P Trades** (live). Person-to-person, service-to-goods, any size. One person needs work or a product, another provides it, and the deal settles in USDC through milestone escrow.
- **SME Trades** (next). The business-to-business and cross-border trade layer: invoice factoring, purchase-order financing, and a portable credit passport. It opens to financiers after the first pilot.

## What is live now

### A working P2P flow with two ways in

You either know your counterparty or you do not. Both lead to the same escrow.

- **Direct deal.** Enter the counterparty's wallet, or just their email, then set the amount, terms, and deadline. The escrow funds, they sign in, accept, deliver, and you release in milestones.
- **Agent matched.** Post a request for work you need, or an offer for what you sell. Your agent watches the market, scores both sides, and surfaces a proposal when it finds a fit. You approve, escrow funds, and the rest settles automatically.

An agent never opens an escrow without your approval. New and low-reputation counterparties route to human review rather than an automatic decline.

### Safety built into delivery

Work changes hands through links, and links are where scams hide. A SecurityAgent scans every delivery proof before the buyer sees it, and the same scan guards the in-app chat so a phishing or malware link cannot be sent to a counterparty in the first place. A flagged link pauses the deal's automatic release, notifies both sides, and routes them to resolve it together in chat. A confirmed bad link is a heavy hit to the sender's reputation. When a delivery is a file, it is shared through a link the agent can check rather than an unverified attachment.

### An in-app cross-chain bridge

USDC flows in from Base, Ethereum, Arbitrum, Optimism, and Polygon Sepolia, plus Solana Devnet. The backend relays the mint on Arc, so a user never has to hold an Arc gas asset. After settlement, the seller picks a destination chain and recipient on the cashout page. Arc-to-Arc transfers are instant; cross-chain cashout routes through CCTP V2 with an inline progress card.

### Staking that doubles as deal insurance and earns yield

A staker locks USDC into KarwanVault, and the same principal does two jobs.

- **Deal insurance.** When a seller accepts a deal, the escrow reserves a portion of their free stake against it. A lost dispute slashes that reservation to the buyer. Trusted Match mode makes the reservation a precondition for matching rather than an option.
- **Yield on idle reserves.** Platform-fee reserves route through Hashnote USYC on Arc Testnet via KarwanTreasury, an ERC-4626 contract that subscribes idle USDC into USYC and redeems on demand. It earns the live Hashnote yield rate.

## SME Trades: the next layer

The business-to-business path needs richer context than a P2P deal. A supplier negotiating a six-figure invoice cares about market medians, shipping rates, and a buyer's payment history in a way a freelancer pricing a logo does not. The SME layer is built and gated behind the SME Trades launch flag while it runs through pilot.

- **Invoice factoring.** A financier pays a seller early at a discount tied to the seller's reputation tier. On settlement, the escrow routes funds to the financier. The seller gets paid early, the financier earns a spread, and the buyer pays the same amount they always would.
- **Purchase-order financing.** Working capital advanced against an accepted purchase order, released to the supplier on verified proof of delivery.
- **Credit passport.** A portable, on-chain record of completed deals, repayment behaviour, and counterparty concentration that travels with each business.
- **Paid agent signals.** Through Circle's x402 nanopayment surface, agents pull outside data during negotiation for fractions of a cent: counterparty sanctions screening, market-rate medians, and credit checks against a passport.

## Contracts on Arc Testnet (chain 5042002)

| Contract | Address |
|---|---|
| KarwanJobBoard | `0x35224C2234263B5506a9F7BfF4bb98e9FceD3FF3` |
| KarwanEscrow | `0x48797C04EE342067A68f29Fbb19B577077d77301` |
| KarwanReputation | `0xBBAC748cA8C7a47e39Bd2AEaDbaa4e9f96ae4442` |
| KarwanVault | `0x2d4506284B2D778365b4B295100EF099F35973c5` |
| KarwanTreasury | `0x9d95E4810E7C8B815F1Fb1Ec02C19085f8C76573` |
| KarwanYieldDistributor | `0x9950b9a41A3e80930e451F2FEdaeb81e80195D03` |
| KarwanInvoiceRegistry | `0x20a7CDf59b5f304De2b22a75e49f52353273E4E4` |
| KarwanPOFinancing | `0xc91122Eb88613C98d58616cD8973883142F74Bb5` |
| KarwanBusinessRegistry | `0xc64d347c9Fe451A3f1c8f4cF2d7a2E43D9AA771e` |
| USDC | `0x3600000000000000000000000000000000000000` |

Hashnote USYC on Arc Testnet, verified against Circle's published addresses.

| Contract | Address |
|---|---|
| USYC Token | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` |
| USYC Teller (USDC) | `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A` |
| USYC/USD Oracle | `0x52b56c7642E71dc54714d879127d97cd0B3D4581` |
| USYC Entitlements (RolesAuthority) | `0xcc205224862c7641930c87679e98999d23c26113` |

Earlier contract generations stay registered so users with open positions can find and exit them under `/legacy`. Nothing on a retired contract gets stuck.

## How it is built

Karwan runs on the Circle commerce stack end to end.

| Circle product | Role in Karwan |
|---|---|
| USDC on Arc | Settlement asset. Shares its address with the Arc gas token through a dual interface. |
| Developer-Controlled Wallets | Identity wallets for email and passkey users, plus a buyer and seller agent wallet per active user. |
| Gas Station | Sponsors gas on Base Sepolia and Ethereum Sepolia for new accounts, so a first-time user arrives without buying a separate gas asset. |
| Cross-Chain Transfer Protocol V2 | Pulls USDC into Arc from five EVM testnets and Solana Devnet. The backend relays the destination side. |
| Hashnote USYC | On-chain yield on treasury idle reserves, sourced from tokenized Treasury bills. |
| x402 nanopayments | Sub-cent paid signals to agents during negotiation. Part of the SME layer. |

The agent layer wraps Circle wallets so neither side handles keys. Web3 users can sign in with their own wallet through Sign-In with Ethereum if they prefer.


## Docs

- [docs/architecture.md](./docs/architecture.md). Components, both deal flows, the wallet model.
- [docs/circle-integration.md](./docs/circle-integration.md). Each Circle product and where it lands in the code.
- [docs/reputation-model.md](./docs/reputation-model.md). The composite score, tier breakpoints, and agent integration.
- [docs/why-karwan.md](./docs/why-karwan.md). The longer design brief.
- [docs/circle-product-feedback.md](./docs/circle-product-feedback.md). Notes from building on Circle.


## License

MIT.
