# 18 · Trade finance

Track T4, roadmap item T4.1 ([view 00](00-direction.md)). A seller with a funded deal can be paid now instead of waiting for delivery and review. A financier advances part of the deal's value, the escrow repays the financier first when the deal settles, and the seller gets the rest. Purchase-order financing and invoice factoring are the same move at two different moments of one deal.

## Why it matters

A trade can be profitable and still leave the seller short of cash. A supplier in Lagos wins a 150 USDC order, but has to pay producers before the buyer's money is released, and the buyer may be on Net 30 to 90 terms. Banks ask for collateral the supplier does not have. On Karwan the order itself is the collateral: the buyer's money is already locked in escrow, the terms are signed, and the supplier's record shows how they have delivered before.

## One mechanism, two moments

| Name in the trade | When the seller asks | What backs the advance |
|---|---|---|
| Purchase-order financing | After the buyer funds the order and the seller accepts it, before the goods or work are delivered | The funded order, the seller's stake and record |
| Invoice factoring | After delivery, while the buyer reviews or while Net 30 to 90 terms run | The same, plus the delivered milestone |

Both run through the same contract call ([view 11](11-contracts.md#financing-a-business-order)). The seller sees one action, **Get paid now**, on any funded deal that qualifies; the moment decides which name the financier's records use.

## The flow

```mermaid
sequenceDiagram
  autonumber
  actor Bu as Buyer
  actor S as Seller
  participant K as Karwan (web, Telegram, assistant)
  actor F as Financier
  participant AG as Agreement escrow
  participant TF as Trade finance
  participant SV as Stake vault
  participant R as Record

  Bu->>AG: Funds the order (Net 30 in this example)
  S->>AG: Accepts the order
  S->>K: "Get paid now" on the deal, or asks the agent in Telegram
  K->>F: Shows the deal to approved financiers: amount, terms, the seller's record
  F->>K: Offers an advance and a payback amount (120 now, 126 paid back)
  K-->>S: Plain offer: 120 now; 126 of the buyer's 150 goes to the financier first; 12 of your deal guarantee is held until it is repaid
  S-->>K: Taps the offer; the selling agent signs the payout over to the financier, up to 126, and the stake hold
  F->>TF: Opens the line with the seller's two signatures, from the financier's wallet (Karwan sends it at once for a wallet it holds; an own-wallet financier has 24 hours)
  TF->>AG: Records the assignment
  TF->>SV: Holds the seller's stake for the financier (at least 10% of the advance)
  TF-->>S: 120 USDC, straight from the financier
  Bu->>AG: Releases after review, or the review window ends
  AG-->>F: 126, paid first
  AG-->>S: The rest of the order, less the Karwan fee
  Note over TF,SV: Anyone settles the line once the deal ends; repaid in full frees the stake
  TF->>R: Financed and repaid on time: added to the seller's record
```

Numbers are the ones the rehearsal used on Arc Testnet: order 150, advance 120, payback 126, stake 12; the seller received 143.25 in total.

## Who does what

| Who | What they do | What they never do |
|---|---|---|
| Seller | Asks to be paid now, compares offers, takes one with a tap; their selling agent signs the payout assignment and the hold on their deal guarantee under the consent given when the guarantee went up; if the guarantee is short, the same confirmation puts up the rest from their balance | Pay the financier back by hand. The escrow does it |
| Buyer | Funds and releases the order as on any deal | Learn anything new or carry new risk. Their protection and review window are unchanged |
| Financier | Applies once (account age on Karwan, some stake, a reputation of at least Cold), sees qualifying deals, makes offers, opens the line from their own wallet | Take money from the escrow before the buyer releases, or touch more than the assigned payback |
| Karwan | Matches deals with financiers, shows offers in plain words, keeps the line in step with the chain, writes the outcome to the record | Hold the advance or the repayment. Money moves wallet to wallet and escrow to wallet |
| Assistant (web and Telegram) | Tells a seller which deals qualify, brings offers into chat, prepares the signatures for the seller to confirm | Sign for anyone. Every money step needs the person's confirmation |

## Who funds on testnet

Two kinds of financier from the start: a test financier that Karwan runs, so every qualifying deal can get an offer, and invited partners who fund from their own wallets under the same rules. Both apply through the same desk and meet the same bar.

The test financier offers 80% of what the deal still owes the seller, paid back with 3% of the advance, holding 10% of the advance from the seller's deal guarantee (owner, 29 Oct 2026). On a deal that still owes 150 USDC, that is 120 now and 123.60 back.

A financier whose wallet Karwan holds is charged the moment the seller takes the offer. A financier who pays from their own wallet sees **Pay the seller** on their desk and has 24 hours from the seller's tap; until then the seller sees **Waiting for the financier to pay**. If the 24 hours pass, the seller's signatures expire, nothing was held and nothing moved, and the seller can take another offer.

## When a deal goes wrong

- **The buyer refunds or a dispute splits the deal short.** The escrow pays what it can to the financier first. The shortfall comes out of the seller's held stake to the financier; anything beyond the stake is recovered off chain under the signed financing agreement.
- **The seller never delivers.** Same path as a refund: the stake covers the financier first.
- **The financier never opens the line.** Nothing moves; the signatures expire after 24 hours and the guarantee is never held.
- **Settling.** Once the deal has ended, Karwan settles the line on chain: repaid in full frees the held guarantee; a shortfall is paid to the financier from it. While the deal can still run past the hold, Karwan keeps the hold for longer. Anyone may make both calls; Karwan's operator wallet pays the gas.
- **What the record keeps.** A line repaid on time counts for the seller. A line that defaulted counts against them, with the reason. Financiers' agents acting on a live deal read the full record for that deal only, logged and deleted after 24 hours (track T3).

## While the financed deal runs

A financier's repayment depends on the deal underneath, so the financier follows it like a party to it, without acting on it.

| What happens on the deal | What the financier is told | Why |
|---|---|---|
| The seller delivers | Delivered, the buyer is reviewing | Repayment is now one release away |
| A milestone is released | Released; what came back to them, if any | The escrow pays the financier first |
| A dispute opens | Disputed, and that money is frozen until it is decided | Repayment may be smaller or later |
| The buyer is refunded or cancels | Refunded; the stake covers them first | The shortfall path starts |
| The delivery deadline passes | Missed deadline, the buyer can take money back | Risk of a refund |

The same alert goes to the bell, email and Telegram. Profile, Open deals lists **Deals you financed**: the advance, what is expected back, the deal's stage in plain words and **Needs you** when there is a step for them. The assistant lists the same positions, so "how are my financed deals?" works in Telegram.

## What the record changes

Each repaid line is proof that the seller delivers and that money advanced to them comes back. Over time this gives a seller faster offers and a smaller payback, and that is how Karwan's record turns into cheaper money. The seller's record shows the count of financed deals repaid. It never shows financier names or amounts to the public.

## Words people see

The seller sees **Get paid now**, **paid back first**, **held from your stake until it is repaid** and amounts in USDC (local currency later, track T5). "Factoring", "assignment" and "line" stay in the financier's desk and in proof details, never on the seller's main path.

## Today and the move to the suite

| Piece | Today | Target |
|---|---|---|
| Factoring | Live on testnet on the older escrow: the financier pre-signs a USDC transfer and the seller's call assigns the receivable. 15 offers made, 1 settled (9 Oct 2026) | The suite's trade finance contract on the Agreement escrow, as above |
| Purchase-order financing | Older contract, disabled on testnet; its fix was never deployed | The same contract call as factoring, earlier in the deal |
| Stake behind an advance | Read as a number, never held on chain | Held in the stake vault for the financier, released or used on settlement |
| Financier desk | Behind the business-trade switch, older UI | UI law v2, plain amounts and status words, offers from Telegram too |
| Contracts | Proven on Arc Testnet in a rehearsal deploy: one financed two-milestone order, financier repaid first, all sources verified. Not connected to the app | Deployed once with the contract family (track T2), then connected to the app |

The older factoring and purchase-order routes stay readable for past deals and stop taking new ones once the suite is connected.

## Status

| Step | Status |
|---|---|
| Contract mechanics: advance, assignment, repaid first, deal guarantee held | Built and tested; proven in the Arc Testnet rehearsal |
| The seller's deal guarantee on the family vault, which an advance holds (view 37) | Built 29 Oct 2026, not deployed |
| Contract family deployed once on testnet | Planned (track T2, item 1), after the audit gates, expected by 24 Oct 2026 |
| App connected to the suite: offers, signatures, line in step with chain | Built 29 Oct 2026, not deployed: the selling agent signs, a held financier is charged at the tap, an own-wallet financier has 24 hours to Pay the seller, Karwan settles each line when its deal ends; on an Arc fork at block 69,622,426 an advance of 119.40 was paid exactly, the financier was repaid 122.98 first, settling freed the hold, and a refunded deal paid the financier the 11.94 held |
| Financier follows the deal: Open deals list and deal alerts | Built 20 Oct 2026, not deployed |
| Offer funded before it goes out; accept checks the financier's money first; offers ranked by financier reputation, then price, with one Recommended | Built 20 Oct 2026, not deployed. Found from a seller whose accept failed: the financier's wallet held 310.97 USDC against offers of 880 and 815 (`routes/factoringFunding.ts`, `routes/factoringRanking.ts`) |
| Get paid now on the deal page | Built on the current escrow (invoice factoring), not deployed; the new deal page also takes the goods delivery with its tracking number, so a business order no longer drops to the old page. Moves to the suite after the audit |
| Seller's Activity on a financed deal adds up | Built 22 Oct 2026, not deployed: each deal payment shows what reached the seller and the financier's part reads Repaid to your financier, unsigned. Found on deal 0x756b…: the seller's list showed about 3,865 USDC in against 1,865 received (`routes/activityMovementLedger.ts` netOfFinancierRepayments) |
| Get paid now in Telegram | Built 29 Oct 2026, not deployed: the same cards; Pay the seller opens Karwan for the own-wallet signature |
| Financier desk to UI law v2 | Started: positions show Pay the seller, Repaid, Closed and what came from the guarantee; the rest of the desk follows |
| Record counts financed and repaid lines | Planned |
