# Karwan

A settlement and credit layer for cross-border SME trade. Money sits in milestone escrow and releases against delivery. Every settled deal writes to a credit record that belongs to the business and travels with it, so a supplier finishes their first shipment with cash in hand and a credit file a financier can read.

Built on the Circle stack. Live on Arc Testnet (chain 5042002), where USDC is the gas token.

Live at [karwan.site](https://karwan.site). API at [api.karwan.site](https://api.karwan.site).

![Karwan architecture](./docs/diagrams/architecture.png)

## The problem

A supplier in Lagos ships cotton to a buyer in Dubai. The goods leave in a week. The money arrives in ninety days, if it arrives. In between sits a correspondent banking chain that charges for every hop, a letter of credit most small exporters cannot get, and a working-capital hole the supplier funds out of pocket or not at all.

The financing exists. It does not reach them. A bank underwrites against a credit file a first-time exporter does not have, and the trade record that would build one is scattered across invoices, emails, and bank statements no lender can verify.

Karwan gives that trade a settlement layer and a credit history at the same time. The trade is the underwriting.

## One primitive, two surfaces

The escrow underneath does not care who is trading. It is the same whether a supplier in Karachi ships cotton to a wholesaler in Dubai, or a designer in Lagos sells a logo to a buyer in Berlin. Two parties agree, the money waits, the work lands, the money moves. What changes is the surface on top.

- **SME Trades.** The business-to-business and cross-border layer, and the one this repository leads with: invoice factoring, purchase-order financing, and a portable credit passport. A trade that used to need a bank now needs a counterparty.
- **P2P Trades.** Person to person, services or goods, any size. A freelancer, a small seller, a one-off deal between two people who found each other. Same escrow, same reputation, none of the trade-finance machinery they would never use.

Both are live. The sections below describe the trade-finance layer, because that is where the money problem is hardest, but every settlement guarantee applies equally to the person selling a logo.

## What is live

### Milestone escrow for import and export settlement

A deal splits into two to five milestones. The supplier marks a milestone delivered, the buyer reviews and releases that portion. The final milestone always needs an explicit buyer click and never releases on a timer. A missed deadline lets the buyer reclaim, and it counts against the supplier's record. A cancel or extension both sides agree to carries no penalty and refunds in full.

The platform fee is 1.5 percent of the deal, split evenly between the two sides.

### Invoice factoring

A financier advances against an invoice at a discount tied to the supplier's reputation tier. The supplier is paid early. On settlement the contract pulls the agreed repayment, so the financier does not chase it. Both legs move native USDC.

### Purchase-order financing

Working capital advanced against an accepted purchase order and held in contract custody. Proof of delivery is attested on chain by an allowlisted attester, and that attestation is what releases the capital to the supplier. A watcher drives release and repayment without a human in the loop.

### The credit passport

A public page per business at `/credit-passport/[address]`, built from settled deals, repayment behaviour, and counterparty concentration. Reputation is value-weighted and counts distinct settled counterparties, so volume with one repeat partner cannot inflate a score. It follows the wallet, not the platform.

It is also a paid endpoint. Any lender can pay a fraction of a cent over x402 and read a verifiable settled-deal record without asking Karwan for permission. That is what makes it a passport rather than a profile.

### Agents that negotiate with market context

An SME cannot afford to staff a sourcing desk. The agents do that work.

- **Market research, bought from outside.** Before negotiating, a neutral platform agent pays a genuinely independent provider **on Base mainnet, in real USDC**, over the standard x402 exact-EVM scheme, for a live web search. It grounds a market read on the results: current demand, a price note, and a fair-price estimate. Because it is an ordinary payment on a real network, the receipt resolves on the Base explorer. The read is shared with both sides, so both agents negotiate against the same outside number instead of against each other's guesses.
- **Best fit first.** Ranking leads with skill and topical fit. Reputation only breaks ties between comparable matches, so a strong specialist is never buried under a higher-reputation generalist.
- **Proceed or pass, never a silent no.** When the best achievable price lands just outside the buyer's range, the agent surfaces it with the market reason attached instead of declining behind their back. Nothing funds until a human approves.
- **Counterparty vetting.** A buyer agent pulls a seller's full settled-deal record before scoring their bid, and a seller agent pulls the buyer's funded-deal record before pricing: deals completed clean, deals on time, disputes, lifetime volume. Far beyond a public score. These reads settle on Arc through Circle Gateway, which nets thousands of sub-cent payments into batched on-chain settlement, because paying gas on each one would make the idea uneconomic. Each side pays only on the deals they actually match.
- **Human approval always.** An agent never opens or funds an escrow without an explicit click. New and low-reputation counterparties route to human review, never an automatic decline.

### Delivery safety

Work changes hands through links, and links are where fraud hides. A SecurityAgent scans every delivery proof before the buyer sees it, and guards the in-app chat so a phishing or malware link cannot be sent in the first place. A flagged link pauses the deal's automatic release, notifies both sides, and routes them to resolve it in chat. A confirmed bad link is a heavy hit to the sender's reputation.

### USDC in and out, across twelve chains

USDC moves into and out of Arc in both directions across twelve chains, including Solana. Outbound settlement uses Circle's Forwarding Service to submit the destination mint, so a supplier cashes out anywhere without ever holding that chain's gas token.

Circle Gateway gives a business one pooled USDC balance across those chains. Deposit once, then spend to any chain from a single signature, with no chain switching and no source-chain gas.

### Staking that doubles as deal insurance, and earns while it does

A staker locks USDC into KarwanVault, and the same principal does two jobs at once. When a seller accepts a deal, the escrow reserves a portion of their free stake against it, and a lost dispute slashes that reservation to the buyer. Trust becomes something a trader can post, not just claim.

Collateral is normally dead money: it sits there proving you are good for it, and earns nothing for the privilege. Here it does not sit. Staked capital routes into USYC while it backs your deals, so you never choose between posting collateral and putting money to work.

### Every idle route is plugged into USYC

Trade capital is idle by nature. Ninety-day payment terms mean money sits in escrow, sits as collateral, sits in a treasury, and money that sits is why working capital is expensive. So no idle balance in Karwan is allowed to sit still. Every route is plugged into Hashnote USYC, tokenized Treasury bills, on Arc.

`KarwanTreasury` is an ERC-4626 contract that subscribes to USYC through the Hashnote Teller and redeems on demand, marked to the live on-chain oracle. Three routes feed it:

| Route into USYC | Status |
|---|---|
| **Staked capital**, in the vault. A trader's collateral, working while it backs their deals. | **Live**, and the largest position. Routed through an entitled operator address. |
| **Platform fee reserves**, in the treasury. Karwan's own balance sheet. | **Live.** The treasury holds real allowlisted USYC today. |
| **Escrowed funds**, during long-dated trades. A buyer's money, earning while it waits for delivery. | **Ships with v2.** Built, and covered by a stateful invariant suite. |

USYC is permissioned, so holding it at all is the proof the integration is real: an unentitled address simply cannot. Circle allowlisted two Karwan addresses on Arc Testnet, the treasury contract and the operator that routes staked capital, because the Hashnote Teller checks entitlement against the **direct caller**, not the beneficiary. A vault subscribe reverts `NotPermissioned` for exactly this reason, so `withdrawForYield` hands USDC to the entitled operator, which subscribes and holds the position while the vault tracks it through `outForYield`.

Live position at the time of writing:

| | |
|---|---|
| Total USYC held | **3,994.60 USDC** across the vault and treasury |
| Yield earned | **45.08 USDC**, marked to the on-chain oracle |
| Staked capital | 3,507.60 USYC, worth 3,965.75 USDC against a 3,924.00 cost basis |
| Fee reserves | 25.52 USYC, worth 28.85 USDC |
| Instrument | USYC at 1.1306, up 13.06 percent on par |

Yield is measured against USDC actually paid, not against par. USYC already traded above a dollar when Karwan subscribed, so the naive value-minus-shares measure would count appreciation that accrued before Karwan held the token. Reproduce the whole report against the live chain:

```bash
cd backend && npm run usyc:prove
```

The escrow route is the hardest of the three, because a buyer's escrowed money is exactly the capital that should be working and exactly the capital you must never gamble with. So escrow funds route **through** the treasury rather than holding USYC themselves. The escrow's books stay pure USDC and always pull back exactly what was swept, so principal is guaranteed regardless of the token's price, and the treasury, which holds the upside, absorbs any shortfall. The buyer's money earns while it waits, and the buyer never carries the risk.

## Roadmap

### The v2 contract bundle

A second contract generation is written, tested, and reviewed internally. It ships as one immutable release after review rather than a mid-cycle redeploy, so the live deployment stays stable while the bundle is finished. It lands in the coming weeks.

- **Escrow idle funds earn USYC.** Escrow sweeps its idle float into the treasury, which wraps it into USYC, and pulls it back before every payout. The escrow holds only USDC and always recovers exactly what it swept, so principal is guaranteed regardless of the token's price. Covered by a stateful invariant suite that ran 128,000 randomized calls without breaking the liability-always-covered invariant.
- A contract-level guardian places bounded, auto-expiring holds and records delivery attestation across the escrow, vault, treasury, and financing contracts. It can pause a settlement but never move funds.
- Arbiter dispute resolution with proportional splits, and a seller claim path after a review window.
- Deal timing on chain: consented per-deal clocks, a capped seller-appeal extension flow, and a match window.
- Reputation hardened against farming, weighting standing on distinct settled counterparties so volume against one repeat party cannot inflate a score.

### Skill verification

An agent ranks a seller on what they claim plus their settled-deal record. The next layer proves the claim, without Karwan running assessments itself. Partners do the verifying, Karwan reads the proofs. A seller proves a fact about a partner account through a zero-knowledge proof, so the account is never exposed and only a salted commitment lands on chain.

### Mainnet

User funds move to user-held wallets, with agents funded only through a capped spend allowance, so the platform never custodies a principal. Staker deposits route to USYC so stakers earn yield directly.

### The currency leg

A Lagos supplier prices in naira and a Dubai buyer pays in dirhams, so today the FX sits outside the rail. Circle's StableFX is an RFQ engine with payment-versus-payment settlement on Arc, already covering USDC and EURC and expanding to local stablecoin pairs. It is the missing leg of a cross-border trade, and it settles on the chain Karwan is already on.

### Fiat rails

On and off ramps through the Circle Payments Network, so a business funds a deal and cashes out in local currency through partner institutions without going through an exchange. The aim is onboarding and payout that feel like ordinary software, with the settlement layer kept out of sight.

## Contracts on Arc Testnet (chain 5042002)

| Contract | Address |
|---|---|
| KarwanEscrow | `0x48797C04EE342067A68f29Fbb19B577077d77301` |
| KarwanInvoiceRegistry | `0x20a7CDf59b5f304De2b22a75e49f52353273E4E4` |
| KarwanPOFinancing | `0xc91122Eb88613C98d58616cD8973883142F74Bb5` |
| KarwanReputation | `0xBBAC748cA8C7a47e39Bd2AEaDbaa4e9f96ae4442` |
| KarwanVault | `0x2d4506284B2D778365b4B295100EF099F35973c5` |
| KarwanTreasury | `0x9d95E4810E7C8B815F1Fb1Ec02C19085f8C76573` |
| KarwanBusinessRegistry | `0xc64d347c9Fe451A3f1c8f4cF2d7a2E43D9AA771e` |
| KarwanJobBoard | `0x35224C2234263B5506a9F7BfF4bb98e9FceD3FF3` |
| KarwanYieldDistributor | `0x9950b9a41A3e80930e451F2FEdaeb81e80195D03` |
| USDC | `0x3600000000000000000000000000000000000000` |

Hashnote USYC on Arc Testnet, verified against Circle's published addresses.

| Contract | Address |
|---|---|
| USYC Token | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` |
| USYC Teller (USDC) | `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A` |
| USYC/USD Oracle | `0x52b56c7642E71dc54714d879127d97cd0B3D4581` |
| USYC Entitlements (RolesAuthority) | `0xcc205224862c7641930c87679e98999d23c26113` |

Earlier contract generations stay registered so users with open positions can find and exit them under `/legacy`. Nothing on a retired contract gets stuck.

## The Circle stack

| Circle product | Role in Karwan |
|---|---|
| USDC on Arc | The settlement asset for escrow, milestone release, factoring, purchase-order custody, repayment, staking, and fees. On Arc it is also the gas token, so a business never buys a second asset to move its own money. |
| Developer-Controlled Wallets | An identity wallet and two agent wallets per user, provisioned on sign-in with an email or a passkey. No seed phrase. Web3 users can sign in with their own wallet through Sign-In with Ethereum instead. |
| CCTP V2 with Bridge Kit | USDC into and out of Arc across twelve chains, both directions, through App Kit and the Circle Wallets adapter. Outbound uses Circle's Forwarding Service to submit the destination mint, so a supplier cashes out anywhere without holding that chain's gas token. |
| Circle Gateway | One pooled USDC balance across twelve chains, spendable to any of them from a single signature. Also the settlement rail for x402, netting the agents' per-call payments into batched on-chain settlement. |
| Nanopayments (x402) | Agents pay a cent per call to read a counterparty's full settled-deal record before they price a bid, so neither side negotiates on a public score alone. Karwan also sells five paid endpoints, including the credit passport and repayment behaviour. |
| Hashnote USYC | On-chain yield on idle balances, sourced from tokenized Treasury bills. Real allowlisted USYC, marked to the live oracle. |

## How it is built

A Next.js frontend and a Hono backend sit above the Circle SDKs. The backend holds no user funds: it provisions Circle wallets, relays what needs relaying, and runs the watchers that drive delivery, repayment, expiry, and yield. The contracts are the source of truth, and every settlement event links to Arcscan from the live activity feed at `/activity`.

Contracts are Solidity, tested with Foundry: **362 tests passing across 28 suites**, including conservation and vault invariant suites and named attack suites for escrow timing, vault reentrancy, and reputation farming.

```bash
cd contracts && forge test
```

## Docs

- [docs/architecture.md](./docs/architecture.md). Components, the deal flows, the wallet model.
- [docs/circle-integration.md](./docs/circle-integration.md). Each Circle product and where it lands in the code.
- [docs/reputation-model.md](./docs/reputation-model.md). The composite score, tier breakpoints, and agent integration.
- [docs/why-karwan.md](./docs/why-karwan.md). The longer design brief.
- [docs/circle-product-feedback.md](./docs/circle-product-feedback.md). Notes from building on Circle.

## License

MIT.
