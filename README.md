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

Delivery has to be against something the buyer can check. A service delivers a link whose host must resolve, scanned before the buyer ever sees it. Physical goods deliver a carrier and tracking reference, and the buyer confirms arrival as a separate act from releasing the money.

The review window is not one fixed number. It grows with the size of the deal, shrinks as two parties build a settled history together, and on a goods deal it cannot expire while the shipment is still moving. Agreed Net terms hold it open for the full term. Marking goods delivered means dispatched, not arrived, and an escrow that released five minutes after a container left the port would be protecting nobody.

The platform fee is 1.5 percent of the deal, split evenly between the two sides.

### Invoice factoring

The supplier asks to be paid early, naming a floor if they want one. Financiers then bid a discount against the supplier's reputation tier, and the supplier accepts one or ignores them all. Nothing is shown to a financier until that request exists, so an invoice is never quietly listed for funding on the strength of the supplier having opened a deal.

On settlement the escrow pays the financier ahead of the supplier, so repayment is not something anyone has to chase. Both legs move native USDC.

### Purchase-order financing

Working capital advanced against an accepted purchase order whose escrow the buyer has already funded. The advance goes straight to the supplier, in the same transaction that redirects that deal's settlement to the financier. That atomicity is the whole design: there is no state where the redirect is live and the supplier has not been paid, so nothing can strand the advance. The supplier can spend the capital immediately, which is the point of pre-delivery finance.

On settlement the escrow pays the financier ahead of the supplier, so repayment is not something anyone has to chase. If the deal settles short, the shortfall, and only the shortfall, is recovered from the supplier's staked collateral. How much collateral a given supplier posts is set from their reputation tier.

### The credit passport

A public page per business at `/credit-passport/[address]`, built from settled deals, repayment behaviour, and counterparty concentration. It follows the wallet, not the platform.

Standing has to be earned in completed work. Stake, tenure and activity all raise the score on their own, but they cannot carry a tier without settled deals behind it, and concentration caps the tier when most of those deals are with a single counterparty. Both matter because the tier is not cosmetic: it decides financing eligibility and how much collateral a supplier posts against an advance. A ladder that is cheap to climb makes the financing gate cheap to fake.

It is also a paid endpoint. Any lender can pay a fraction of a cent over x402 and read a verifiable settled-deal record without asking Karwan for permission. That is what makes it a passport rather than a profile.

### Agents that negotiate with market context

An SME cannot afford to staff a sourcing desk. The agents do that work.

- **Market research, bought from outside.** Before negotiating, a neutral platform agent pays a genuinely independent provider **on Base mainnet, in real USDC**, over the standard x402 exact-EVM scheme, for a live web search. It grounds a market read on the results: current demand, a price note, and a fair-price estimate. Because it is an ordinary payment on a real network, the receipt resolves on the Base explorer. The read is shared with both sides, so both agents negotiate against the same outside number instead of against each other's guesses.
- **Best fit first.** Ranking leads with skill and topical fit. Reputation only breaks ties between comparable matches, so a strong specialist is never buried under a higher-reputation generalist.
- **Proceed or pass, never a silent no.** When the best achievable price lands just outside the buyer's range, the agent surfaces it with the market reason attached instead of declining behind their back. Nothing funds until a human approves.
- **Counterparty vetting.** A buyer agent pulls a seller's full settled-deal record before scoring their bid, and a seller agent pulls the buyer's funded-deal record before pricing: deals completed clean, deals on time, disputes, lifetime volume. Far beyond a public score. These reads settle on Arc through Circle Gateway, which nets thousands of sub-cent payments into batched on-chain settlement, because paying gas on each one would make the idea uneconomic. Each side pays only on the deals they actually match.
- **Human approval always.** An agent never opens or funds an escrow without an explicit click. New and low-reputation counterparties route to human review, never an automatic decline.

### Disputes, guardians, and deal timing

A dispute that survives the two sides talking goes to an arbiter, who splits the unreleased funds by basis points rather than picking a winner. The same ruling settles the seller's reserved stake in proportion to fault and hands the raw split to the reputation contract, which bands it into an outcome. A dead arbiter key can delay a deal but never trap it: after the dispute timeout either party can push the deal to its default outcome without the arbiter.

A contract-level guardian sits across the escrow, vault, treasury, and purchase-order financing. It places bounded, auto-expiring holds and records delivery attestation. It can pause a settlement and it can never move funds.

Deal timing is on chain: per-deal clocks both sides consent to, a capped seller-appeal extension, and a match window that expires a job nobody took.

Reputation is hardened against farming. Standing is value-weighted, a tier has to be backed by settled deals rather than parked capital and a calendar, and concentration caps the tier when most of those deals are with one counterparty, so volume against a single repeat partner cannot inflate a score.

### Delivery safety

Work changes hands through links, and links are where fraud hides. A SecurityAgent scans every delivery proof before the buyer sees it, and guards the in-app chat so a phishing or malware link cannot be sent in the first place. A flagged link pauses the deal's automatic release, notifies both sides, and routes them to resolve it in chat. A confirmed bad link is a heavy hit to the sender's reputation.

### USDC in and out, across twelve chains

USDC moves into and out of Arc in both directions across twelve chains, including Solana. Outbound settlement uses Circle's Forwarding Service to submit the destination mint, so a supplier cashes out anywhere without ever holding that chain's gas token.

Circle Gateway gives a business one pooled USDC balance across those chains. Deposit once, then spend to any chain from a single signature, with no chain switching and no source-chain gas.

**Depositing is one address.** For an email or passkey account, Circle derives every deposit wallet from the user's identity anchor, so the same address serves Ethereum, Base, Arbitrum and Polygon. The user copies one address, sends USDC from wherever they hold it, and the balance updates itself. There is no chain to select, no amount to declare, no wallet to connect, and no bridge in front of them. Solana gets its own address on the same screen, because a different signature curve cannot share an EVM address.

Inbound credit is driven by Circle's transaction webhook rather than by polling, and every guard on that path assumes the notification is untrusted: only inbound, only a transfer whose token contract matches the known USDC on that chain, only to an address derived for that user, keyed on chain and address together, deduplicated on the transaction id. The balance itself is always read from chain, so a missed, duplicated or forged webhook can change when the UI updates but never what the number is.

A user who connects their own wallet keeps the explicit flow: they pick the chain, and they sign. That difference is deliberate. Self-custody is the product working correctly for someone who wants it, and the absence of a wallet is the product working correctly for someone who does not.

### Staking that doubles as deal insurance, and earns while it does

A staker locks USDC into KarwanVault, and the same principal does two jobs at once. When a seller accepts a deal, the escrow reserves a portion of their free stake against it, and a lost dispute slashes that reservation to the buyer. Trust becomes something a trader can post, not just claim.

Collateral is normally dead money: it sits there proving you are good for it, and earns nothing for the privilege. Here it does not sit. Staked capital routes into USYC while it backs your deals, so you never choose between posting collateral and putting money to work.

### Every idle route is plugged into USYC

Trade capital is idle by nature. Ninety-day payment terms mean money sits in escrow, sits as collateral, sits in a treasury, and money that sits is why working capital is expensive. So no idle balance in Karwan is allowed to sit still. Every route is plugged into Hashnote USYC, tokenized Treasury bills, on Arc.

`KarwanTreasury` is an ERC-4626 contract that subscribes to USYC through the Hashnote Teller and redeems on demand, marked to the live on-chain oracle. Three routes feed it:

| Route into USYC | Status |
|---|---|
| **Staked capital**, in the vault. A trader's collateral, working while it backs their deals. | **Live**, and the largest position, held through an entitled operator address. The position was opened under the previous vault generation and has not been re-routed since the current bundle deployed, so the vault contract listed above reports no USYC of its own. |
| **Platform fee reserves**, in the treasury. Karwan's own balance sheet. | **Live.** The entitled treasury holds real allowlisted USYC today. |
| **Escrowed funds**, during long-dated trades. A buyer's money, earning while it waits for delivery. | **Deployed.** The live escrow carries the sweep path with a ceiling of 80 percent of idle float, and is covered by a stateful invariant suite. No escrow balance has been swept yet. |

USYC is permissioned, so holding it at all is the proof the integration is real: an unentitled address simply cannot. Circle allowlisted two Karwan addresses on Arc Testnet, the treasury contract and the operator that routes staked capital, because the Hashnote Teller checks entitlement against the **direct caller**, not the beneficiary. A vault subscribe reverts `NotPermissioned` for exactly this reason, so `withdrawForYield` hands USDC to the entitled operator, which subscribes and holds the position while the vault tracks it through `outForYield`.

Live position, read from Arc Testnet on 2026-07-26:

| | |
|---|---|
| Total USYC held | 3,533.12 USYC, worth **3,997.94 USDC** |
| Yield earned on staked capital | **45.06 USDC**, marked to the on-chain oracle |
| Staked capital | 3,507.60 USYC, worth 3,969.06 USDC against a 3,924.00 cost basis |
| Fee reserves | 25.52 USYC, worth 28.88 USDC |
| Instrument | USYC at 1.1316, up 1.87 percent over the 213 days Karwan has tracked it, about 3.20 percent annualized |

Yield is measured against USDC actually paid, not against par. USYC already traded above a dollar when Karwan subscribed, so the naive value-minus-shares measure would read the token's whole life as Karwan's return. The instrument row above follows the same rule: it reports the climb since Karwan started tracking the oracle, not the distance from a dollar.

One caveat the report prints for itself: the Arc Testnet oracle is frozen at round 100, dated 2026-07-20, so the marks above use a price a few days stale. The live Hashnote feed is the moving one. Reproduce the whole report against the live chain:

```bash
cd backend && npm run usyc:prove
```

The escrow route is the hardest of the three, because a buyer's escrowed money is exactly the capital that should be working and exactly the capital you must never gamble with. So escrow funds route **through** the treasury rather than holding USYC themselves. The escrow's books stay pure USDC and always pull back exactly what was swept, so principal is guaranteed regardless of the token's price, and the treasury, which holds the upside, absorbs any shortfall. The buyer's money earns while it waits, and the buyer never carries the risk. A stateful invariant suite ran 128,000 randomized calls against this path without breaking the invariant that liabilities stay covered.

## Custody

Karwan holds no customer funds on its own balance sheet. Balances sit in Circle-operated wallet infrastructure and, once a deal is funded, in escrow contracts on Arc.

Signing authority follows the sign-in method. A user who connects their own wallet holds sole signing authority. A user who signs in by email or passkey delegates signing authority to Karwan over an account Circle operates for them, and Karwan exercises it only to execute instructions that user has already given: funding, milestone release, refund, cancellation, and the published automatic outcomes.

That authority is bounded by the escrow contract, not by internal policy. Once a deal is funded, the contract governs where the money can go. Karwan cannot redirect a funded escrow, alter agreed terms, or withdraw a user balance to itself.

The automatic settlement paths depend on this. Auto-release after a review window, and auto-reclaim when a seller misses a delivery deadline, both require an account that can act when neither party is online.

## Roadmap

### Skill verification

An agent ranks a seller on what they claim plus their settled-deal record. The next layer proves the claim, without Karwan running assessments itself. Partners do the verifying, Karwan reads the proofs. A seller proves a fact about a partner account through a zero-knowledge proof, so the account is never exposed and only a salted commitment lands on chain.

### Mainnet

The delegated signing described under Custody narrows further. User funds move to user-held wallets, with agents funded only through a capped spend allowance, so Karwan holds no signing authority over a principal balance. Staker deposits route to USYC so stakers earn yield directly.

### The currency leg

A Lagos supplier prices in naira and a Dubai buyer pays in dirhams, so today the FX sits outside the rail. Circle's StableFX is an RFQ engine with payment-versus-payment settlement on Arc, already covering USDC and EURC and expanding to local stablecoin pairs. It is the missing leg of a cross-border trade, and it settles on the chain Karwan is already on.

### Fiat rails

On and off ramps through the Circle Payments Network, so a business funds a deal and cashes out in local currency through partner institutions without going through an exchange. The aim is onboarding and payout that feel like ordinary software, with the settlement layer kept out of sight.

## Contracts on Arc Testnet (chain 5042002)

| Contract | Address |
|---|---|
| KarwanEscrow | `0x0262A4dFec0E057cAf80F124BfD2847581E82B63` |
| KarwanInvoiceRegistry | `0xFb0Debd5E2618881699ED9b02CE0c9B718a1C649` |
| KarwanPOFinancing | `0xE87ef70E19FA8BbfdC04b9310371A7006B86b60A` |
| KarwanReputation | `0x8bD35853b986a04EfDED7F863AFF34826fde69eE` |
| KarwanVault | `0xA600Bd772A032Ec2b96a9A44545024E270418927` |
| KarwanTreasury | `0x5a642BE344Fc3a01999bF113197ddC1A163EE837` |
| KarwanBusinessRegistry | `0x77F4a1Cc4C1F7BB35b23db679966b33b8d8b27cf` |
| KarwanJobBoard | `0x35224C2234263B5506a9F7BfF4bb98e9FceD3FF3` |
| KarwanYieldDistributor | `0x9E4AdFcfB46108ED7c2F3C1AF1728AAE937f336F` |
| USDC | `0x3600000000000000000000000000000000000000` |

One address does not follow the bundle. The fee reserves that hold USYC sit in an earlier treasury, `0x9d95E4810E7C8B815F1Fb1Ec02C19085f8C76573`, because a Hashnote entitlement is granted to an address and does not transfer when a contract is redeployed. That treasury keeps the allowlisted position while `KarwanTreasury` above takes fee income from the current escrow. Anyone checking the USYC balance should read the entitled address, not the bundle one.

Hashnote USYC on Arc Testnet, verified against Circle's published addresses.

| Contract | Address |
|---|---|
| USYC Token | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` |
| USYC Teller (USDC) | `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A` |
| USYC/USD Oracle | `0x52b56c7642E71dc54714d879127d97cd0B3D4581` |
| USYC Entitlements (RolesAuthority) | `0xcc205224862c7641930c87679e98999d23c26113` |

Earlier contract generations stay registered so users with open positions can find and exit them under `/legacy`. Nothing on a retired contract gets stuck.

The current generation exists because an internal audit found problems worth changing the contracts for rather than patching around. It brings a contract-level guardian that can pause a settlement but can never move funds, dispute resolution through an arbiter that splits an escrow proportionally instead of all-or-nothing, on-chain deal clocks with a capped extension flow, receivable assignment for financing, and reputation hardened against farming. The contracts are immutable, so this was a redeployment with state migration, not an upgrade.

Because volume and transaction counts would otherwise reset with every redeployment, `/activity/all-time` reads every generation Karwan has ever deployed, retired ones included, and totals across all of them. It decodes the historical event shapes too, since event signatures changed between generations.

## The Circle stack

| Circle product | Role in Karwan |
|---|---|
| USDC on Arc | The settlement asset for escrow, milestone release, factoring, purchase-order advances, repayment, staking, and fees. On Arc it is also the gas token, so a business never buys a second asset to move its own money. |
| Developer-Controlled Wallets | An identity wallet and two agent wallets per user, provisioned on sign-in with an email or a passkey. No seed phrase. Web3 users can sign in with their own wallet through Sign-In with Ethereum instead. |
| CCTP V2 with Bridge Kit | USDC into and out of Arc across twelve chains, both directions, through App Kit and the Circle Wallets adapter. Outbound uses Circle's Forwarding Service to submit the destination mint, so a supplier cashes out anywhere without holding that chain's gas token. |
| Wallets: derived deposit addresses | Every deposit wallet for an email or passkey account is derived from that user's identity anchor, so one address serves every EVM chain instead of one per chain. Inbound credit is triggered by the transaction webhook and verified against the USDC contract on the notified chain. |
| Circle Gateway | One pooled USDC balance across twelve chains, spendable to any of them from a single signature. Also the settlement rail for x402, netting the agents' per-call payments into batched on-chain settlement. |
| Nanopayments (x402) | Agents pay a cent per call to read a counterparty's full settled-deal record before they price a bid, so neither side negotiates on a public score alone. Karwan also sells five paid endpoints, including the credit passport and repayment behaviour. |
| Hashnote USYC | On-chain yield on idle balances, sourced from tokenized Treasury bills. Real allowlisted USYC, marked to the live oracle. |

## How it is built

A Next.js frontend and a Hono backend sit above the Circle SDKs. The backend holds no user funds: it provisions Circle wallets, relays what needs relaying, and runs the watchers that drive delivery, repayment, expiry, and yield. The contracts are the source of truth, and every settlement event links to Arcscan from the live activity feed at `/activity`.

Contracts are Solidity, tested with Foundry: **409 tests passing across 35 suites**, including conservation and vault invariant suites, named attack suites for escrow timing, vault reentrancy, and reputation farming, and an exploit-first acceptance suite for the trade-finance v2 design.

```bash
cd contracts && forge test
```

## Documentation

Start here.

- **[SETUP.md](./SETUP.md)** — how to clone, configure, and run the project, and how the Circle wallets are provisioned.
- **[CIRCLE.md](./CIRCLE.md)** — how each Circle tool is integrated: the package, the file, the call, the gotcha.

Deeper reference.

- [docs/architecture.md](./docs/architecture.md) — components, the deal flows, the wallet model, and the diagram.
- [docs/circle-integration.md](./docs/circle-integration.md) — the longer per-product integration notes.
- [docs/circle-product-feedback.md](./docs/circle-product-feedback.md) — why we chose each product, what worked, what to improve.
- [docs/reputation-model.md](./docs/reputation-model.md) — the composite score, tier breakpoints, and agent integration.
- [docs/why-karwan.md](./docs/why-karwan.md) — the longer design brief.

## License

MIT. See [LICENSE](./LICENSE).
