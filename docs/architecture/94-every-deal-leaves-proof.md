# 94 · Every deal leaves proof

Track T2 (protected deals). It keeps the deal page of [view 92](92-every-deal-looks-like-what-it-is.md), the disputes of [view 90](90-disputes-settled-reliably.md), the delivery proof and handover code of [view 33](33-delivery-proof-for-every-kind-of-deal.md) and the signed deal statements of [view 13](13-portable-reputation.md). Proposed by the owner on 19 Nov 2026: "the process should feel seamless and we use a technique that ensures people comply and everything is verifiable... what matters is the work has been done and payment has to be released."

## What is hard today

- When a deal finishes, the page says "Paid out" and stops there. Neither side can see in one place why the money moved.
- The proof exists, but it is spread over the system: the fingerprint of the terms both approved, the funding transaction, the delivery history, the handover code, the review clock, the dispute finding and the release in the money record. Support can piece it together; a person cannot.
- The public statement Karwan signs about a settled deal says it settled, the role and a value range. It does not say how the work was confirmed, which is the part that shows Karwan protected anyone.

## The idea

When the money moves at the end of a deal, Karwan writes one **deal record** from facts it already holds, signs it, and never changes it. Nobody does anything extra: no new step, no form, no meeting place or time. The record only reads what the deal already did.

Five lines, the same on every kind of deal:

| Line | What it says | Where it comes from |
|---|---|---|
| Agreed | What both sides agreed, the day each approved, and the terms fingerprint | The agreement digest both approved |
| Money held | The amount locked and when, with the funding transaction on Arc | The funding record and its transaction |
| Work confirmed | How the work was confirmed (one of the ways below), with the date | The delivery history, handover, review and dispute records |
| Released | What the seller got, any refund to the buyer, Karwan's fee, when, with the release transaction on Arc | The money record and its transaction |
| Signed | Karwan's signature over the four lines above | The key that already signs deal statements |

A deal in stages has one "Work confirmed" and one "Released" per stage.

## How the work was confirmed

Exactly one of these, from what really happened. Nothing is guessed.

| Way | When it applies |
|---|---|
| The buyer confirmed it | The buyer released the money or approved the work |
| The buyer gave the handover code | Goods handed over in person: the seller entered the buyer's code |
| The buyer did not answer | The seller asked for payment, the buyer was told and given time to answer, and did not (the buyer-silence rule, or the seller's delay appeal on the last stage) |
| Decided in a dispute | Karwan's finding, confirmed by a person, or the panel's decision (view 90), with which one |
| The review time for this stage ended | A first or middle stage of a deal in stages, paid when its review window passed with no word from the buyer |
| Cancelled by both | Both agreed to cancel; the money went back |
| Refunded | The money went back to the buyer, with the reason |

The record says what happened, even where it is not what Karwan wants to happen. Found while writing the spec (19 Nov 2026): the deal watcher still pays the first and middle stages of a deal in stages when their review window passes (`agents/dealWatcher.ts`, the timer ladder), which is a payout on review time alone. The final stage already waits for the seller to ask and the buyer to stay silent. Whether the ladder should change is the owner's call; until then the record shows it plainly.

## Who sees what

- **The two sides** see the whole record on the finished deal page, on the deal's receipt, and from their assistant in chat or Telegram ("show me the record for D68F-E7D8").
- **Anyone a side shares it with** sees the same record through a link that side makes. Names and Karwan tags, never wallet addresses; transactions link to the Arc explorer.
- **The public statement** gains one line: how the work was confirmed. Still no amounts beyond the range, no other party, no deal reference.

A record can be checked without trusting Karwan's page: the transactions are on Arc, and the signature checks against Karwan's published key.

## Deals that finished before this

A record is built for them from what was stored. A line Karwan did not keep reads "Not recorded" instead of being filled in.

## Same answers in every channel

One assistant tool, `deal_record`, returns the record for a deal the person is on. The web assistant and Telegram use it; the deal page and receipt render the same data. Outside agents through MCP only search today and are never a party to a deal, so they get the record when MCP gains deal tools, not in this build.

## Decisions

The owner approved all three on 19 Nov 2026:

1. The public statement shows how the work was confirmed. It is the line that shows protection, and it names no one.
2. Either side can share the full record by a link, each side alone, and take the link back.
3. Deals that finished before this view get a record, with "Not recorded" where data is missing.

## Status

Approved by the owner on 19 Nov 2026. Built 20 Nov 2026, for testnet at the next deploy:

| Part | State |
|---|---|
| The record, written and signed once when a deal ends, older deals included | Built |
| Deal record on the finished deal page, five rows with Arc links, and the receipt for the last payout linking to it | Built |
| Share the record: a link per side, Copy link, Stop sharing, and the page the link opens, signed out, names and Karwan tags only | Built |
| The assistant: `deal_record`, `share_deal_record` (confirm card), `stop_sharing_deal_record`, on the website and Telegram | Built |
| The public statement says how the work was confirmed (`karwan.deal-settled.v2`) | Built, switched off until `DEAL_SETTLED_V2_FROM` is set; v1 statements stay valid |
| Outside agents through MCP | Not in this build |

The timer ladder finding above is still the owner's call; the record shows it as "Released when the review time ended".
