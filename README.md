# Karwan

Stablecoin commerce rails for p2p and b2b trade. Two parties anywhere agree to work, the money sits in milestone escrow on Arc, and it pays out as the buyer releases. Built on the Circle stack, live on Arc Testnet (chain 5042002).

Live at [karwan.site](https://karwan.site). API at [api.karwan.site](https://api.karwan.site). Long technical brief: [docs/why-karwan.md](./docs/why-karwan.md).

---

## What Karwan is

We came together with a few builders in the space to ship something that had been conceived for a long time before now. The reason it could not be built earlier was the missing infrastructure. Arc is what closed that gap, so we are building on Arc.

The platform supports p2p and b2b trades across small, medium, and large scale. At the small end, a freelance designer in Lagos selling a logo to a buyer in Berlin. At the medium end, a supplier in Karachi shipping cotton to a wholesaler in Dubai. At the large end, an exporter routing a six-figure container with a financier funding the receivable. Same escrow primitive underneath, different surfaces on top.

---

## What is live now

Three things ship today on Arc Testnet.

### 1. A working p2p flow with two ways in

You either know your counterparty already or you do not. Both lead to the same escrow.

- **Direct deal.** Drop the counterparty's wallet, or just their email, set the amount, terms, and deadline. The escrow funds, they sign in, accept, deliver, and you release in milestones.
- **Agent matched.** Post a request (work you need) or an offer (what you sell). The agent watches the market, scores both sides, and surfaces a proposal when it finds a fit. You approve, escrow funds, the rest auto settles.

The agent never opens an escrow without you tapping approve. New or low reputation sellers always route to human review, never auto declined.

### 2. An in-app cross-chain bridge

USDC flows in from Base, Ethereum, Arbitrum, Optimism, or Polygon Sepolia, plus Solana Devnet. The backend relays the mint on Arc so the user never needs to hold Arc gas. After settlement, the seller picks a destination chain and recipient on the cashout page. Arc to Arc transfers are instant. Cross chain cashout routes through CCTP V2 with an inline progress card.

### 3. Staking that doubles as deal insurance and earns yield

A staker locks USDC into KarwanVault. The same principal does two things at once.

- **Deal insurance.** When a seller accepts a deal, the escrow reserves `dealAmount × reservationBps` from the seller's free stake. A failed dispute slashes that reservation to the buyer. Trusted Match mode makes the floor a precondition rather than a knob.
- **Yield on idle reserves.** Platform fee reserves route through real Hashnote USYC on Arc Testnet via KarwanTreasury V3, an ERC-4626 wired contract that subscribes idle USDC into USYC and redeems on demand. The Treasury was whitelisted by Circle on 2026-06-06 and is actively earning the real Hashnote yield rate.

---

## What is coming

The platform expands along three lines.

### Full SME trade rails with x402 nanopayment for agents

The b2b path needs richer context than the p2p path. A supplier negotiating a six-figure invoice cares about market medians, current shipping rates, and a buyer's payment history more than a freelancer pricing a logo does. We wire Circle's x402 micropayment surface into both the buyer and seller agents, so every negotiation round can pull a fresh outside signal for thousandths of a cent. Market rate medians from paid APIs, skill demand snapshots, news during a delivery review window, deeper credit checks against a passport. The marketplace stops pricing against our local view and starts pricing against the real world.

### Invoice factoring with reputation tier discounts

A seller does not always want to wait for the deal to settle to get paid. With factoring, a financier steps in and pays the seller right away at a small discount. When the buyer releases the escrow, funds route to the financier instead of the seller. The seller got their money early, the financier earned a small spread, the buyer paid the same amount they were always going to pay.

The discount depends on the seller's tier. A seller with a strong on-chain track record gets factored at a tighter spread because they are lower risk. A new seller pays a wider spread because the financier is taking more uncertainty. Reputation finally has a number attached to it that lenders care about.

### A few smaller but real upgrades

- Symmetric reputation crediting on settlement, so both sides' on chain records reflect a clean delivery rather than only the seller's.
- External smart contract audit before any mainnet exposure.
- Safe multisig treasury replacing the deployer EOA before the current contracts touch real money.
- Foundry coverage above 80% on the escrow and vault branches.
- Full UI string extraction and an RTL audit, so Arabic stops falling back to English layout.

---

## Contracts on Arc Testnet (chain 5042002)

Current generation.

| Contract | Address |
|---|---|
| KarwanJobBoard | `0x35224C2234263B5506a9F7BfF4bb98e9FceD3FF3` |
| KarwanEscrow | `0x48797C04EE342067A68f29Fbb19B577077d77301` |
| KarwanReputation | `0xBBAC748cA8C7a47e39Bd2AEaDbaa4e9f96ae4442` |
| KarwanVault | `0x2d4506284B2D778365b4B295100EF099F35973c5` |
| KarwanTreasury V3 (real USYC, whitelisted) | `0x9d95E4810E7C8B815F1Fb1Ec02C19085f8C76573` |
| KarwanYieldDistributor | `0x9950b9a41A3e80930e451F2FEdaeb81e80195D03` |
| MockUSYC (vault side only, sunsetting) | `0x1789cdD059724CDffC33a9E0d43aE6415D79965b` |
| USDC | `0x3600000000000000000000000000000000000000` |

Hashnote USYC integration on Arc Testnet, verified against Circle's published addresses.

| Contract | Address |
|---|---|
| Hashnote USYC Token | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` |
| Hashnote USYC Teller (USDC) | `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A` |
| Hashnote USYC/USD Oracle | `0x52b56c7642E71dc54714d879127d97cd0B3D4581` |
| Hashnote Entitlements (RolesAuthority) | `0xcc205224862c7641930c87679e98999d23c26113` |

Earlier generation contracts (Gen 1, Gen 2, Gen 3) stay registered so users with positions on them can still find and exit them under `/legacy`. Nothing on a legacy contract gets stuck.

---

## How it is built

Karwan rides on the Circle commerce stack end to end.

| Circle product | What it does for us |
|---|---|
| USDC on Arc | Native settlement asset. Same address as gas on Arc (dual interface). |
| Circle Developer Controlled Wallets | Identity wallets for email and passkey users. Buyer agent and seller agent wallets per active user. |
| Circle Gas Station | Sponsors gas on Base Sepolia and Ethereum Sepolia for new accounts, so a brand new user lands without buying a separate gas asset. |
| Cross Chain Transfer Protocol V2 (CCTP) | Pulling USDC into Arc from five EVM testnets and Solana Devnet. Backend relays the destination side. |
| Hashnote USYC (Reg D tokenized T-bills) | Real on chain yield on Treasury idle reserves. Live as of 2026-06-06. |
| Circle Mint x402 (planned) | Sub cent paid signals to the buyer and seller agents during negotiation. |

The agent layer wraps Circle wallets so neither side has to think about keys. Web3 users can sign in with their wallet via SIWE if they prefer that path.

---

## Repo layout

```
karwan/
├── contracts/    Foundry. KarwanEscrow, KarwanVault, KarwanReputation,
│                 KarwanTreasury, KarwanJobBoard, mocks, deploy scripts.
├── backend/      Hono. Auctions, agents, deal lifecycle, CCTP relay,
│                 reputation engine, Telegram notifier, SSE bus.
├── frontend/     Next.js 15 + wagmi + RainbowKit. App shell, i18n, all
│                 user surfaces. react-query everywhere.
└── docs/         Long form documentation. why-karwan, architecture,
                  circle-integration, reputation-model
```

---

## Docs

- [docs/why-karwan.md](./docs/why-karwan.md). The technical brief. Read this if you want to understand the design choices.
- [docs/architecture.md](./docs/architecture.md). Components, both deal flows, wallet model.
- [docs/circle-integration.md](./docs/circle-integration.md). Every Circle product and where it lands in the codebase.
- [docs/reputation-model.md](./docs/reputation-model.md). The composite score, tier breakpoints, and agent integration.
- [docs/circle-product-feedback.md](./docs/circle-product-feedback.md). Notes from building on Circle, kept honest.

---

## Run it

Backend.

```bash
cd backend
cp .env.example .env
# fill in OPENROUTER_API_KEY, Circle keys, Arc RPC, contract addresses
npm install
npm run dev
```

Frontend.

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Contracts (Foundry).

```bash
cd contracts
forge build
forge test
```

---

## License

MIT.
