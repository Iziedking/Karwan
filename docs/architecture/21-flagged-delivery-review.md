# 21 · A person checks a flagged delivery link

Track T2, protected deals. The owner agreed this on 22 Oct 2026.

## What was wrong

Every delivery link is scanned. A link rated suspicious or malicious:

- is hidden from the buyer;
- holds the release, off chain and with a guardian hold on the escrow;
- adds an offense to the seller's record.

Scanners make mistakes, and nobody at Karwan could clear a hold the scanner placed wrongly. Support could only tell the seller to send another link.

## How it works now

```
seller on the paused deal
  "My link is safe. Ask a person to check"
      │ callPerson(message, dealId)            shared/assistant/openHelp.ts
      ▼
Help panel (its own thread, never a copy of another chat)
      │ POST /api/support/start {dealId}      or /:id/message on an open ticket
      │ deal attached only for one of its two parties
      ▼
support ticket KSUP-… (Telegram alert names the deal)
      ▼
/admin/support → DeliveryReviewPanel
      │ GET  /api/admin/support/deliveries/:jobId     link as text, scanner verdict, review so far
      │ POST /api/admin/support/deliveries/:jobId/review {decision, reason}
      ▼
deals/deliveryReview.ts (rules) → deals/deliveryReviewService.ts (apply)
```

## The rules

These live in `deliveryReview.ts`.

- **What can be reviewed.** Only a delivered, open deal whose current delivery is held, either suspicious or malicious. Every decision needs a written reason.
- **Suspicious link.** One decision clears it.
- **Malicious link.** It needs both credentials, the support token and the admin token, in either order. One credential cannot decide twice. Either reviewer saying "unsafe" ends the review with the link blocked.
- **Which delivery.** A review belongs to one delivery revision. A new delivery is scanned afresh and starts a new review.

## Clearing a link

- The delivery becomes clean. The buyer can open the link, the release checks run as usual, and the buyer's review window starts at that moment.
- That delivery is marked clean in the deal's delivery history too, so its photos and its line under Earlier deliveries reach the buyer. Found on testnet 27 Oct 2026: a cleared link showed, but its photo stayed hidden because the history still said held. A link cleared before this fix is read as clean from the review record (`entryHeld` in `deals/deliveryHistoryView.ts`).
- The on-chain guardian hold is lifted. This is best-effort, the same way a clean redelivery lifts it.
- The scanner's offense comes off the seller's record.
- Both people get `deal.delivery.cleared`, and a line appears in the deal chat.

## Keeping a link blocked

Nothing changes for the money. The seller is told in the deal chat to send a new link.

## Privacy

The buyer and seller see only where the check stands: `checking`, `safe` or `unsafe`. They never see the reviewers' notes or which credential decided; the deal response drops the record and sends `deliveryReviewState` from `reviewForParty` instead.

The audit trail is the review record kept on the deal (each step's credential, decision, reason and time), the line in the deal chat, and the server log. There is no separate admin audit log.

## Limits

- The two credentials stand for roles, not named people. Whoever holds both tokens can clear a malicious link alone.
- Named operator accounts for support would close that gap.

## On the escrow family (found on testnet, 27 Oct 2026)

A 230 USDC deal's link (`.xyz`) was held for a safety check, but the deal page said "Delivery check passed", the seller was told no action was needed, and the buyer's review end would have paid the seller three days later. The family has no guardian hold, and the deal watcher's family branch ran the review end before it recorded any hold. Fixed:

- The watcher records a held link on family deals as on the other escrows (`releaseBlockedReason: 'security-hold'`), so both sides get the held-link card.
- The review end never pays while the link is held (`deals/suiteReviewEnd.ts`), on any escrow.
- The delivery check shows held when the link is held, even if the work matches the request (`deals/deliveryCheckState.ts`, `features/deals/workspace/checkStatus.ts`).
- The seller's next move on a held link is to send another link, with "Ask a person to check" beside it; the buyer waits on the seller (`deals/dealView.ts`).

A person who clears the link late cannot restart the buyer's review on the family's chain clock; the buyer can still ask once for more time.

## A person checks a held match (found on testnet, 30 Oct 2026)

Deal `0xd68f…` (a smart contract audit, 104.66 USDC) showed "Match held for review" to both people. The buyer read it as a flagged link, opened the support panel, and the panel answered that the delivery was not held, which was true: the delivery link was clean. The hold came from the security match gate (`security/matchGate.ts`), which screens the match after funding and held it because the buyer's account carried one unsafe-link offence from an earlier deal where they were the seller. What was wrong:

- A held match had no way out. The field for clearing it existed but nothing wrote it, and no operator page showed held matches.
- The deal page said "nothing releases until it clears". Nothing in the release rules reads the match hold, so that was not true. The gate was built as advisory, and the copy promised more.
- The hold's reason was addressed to the other side, so the buyer saw a hold with no reason. The raw response still carried the other side's line, which only the browser hid.
- The offence came from a replaced delivery (revision 2 of `0x0aa431…`, an `.xyz` link flagged on 23 Oct 2026). Revision 1 had been cleared by review, revision 3 was clean and the deal settled, so revision 2 was never reviewed, and a review can only reach the current revision of an open deal. The offence stayed on the record with no way off, and it will hold every later match of that account.

### How it works now

```
match funded → security match gate → hold or flag on the deal
      │
      ▼
deal page / assistant: "Held for a look", money unchanged, "Ask a person to check"
      │ callPerson(message, dealId)              as for a held link
      ▼
/admin/support → Held, above the tickets
      │ GET  /api/admin/support/held                    open deals with a held match or a held link
      │ POST /api/admin/support/matches/:jobId/clear    {reason}
      │ GET  /api/admin/support/deliveries/:jobId?revision=N
      │ POST /api/admin/support/deliveries/:jobId/review {decision, reason, revision?}
      ▼
deals/matchHold.ts (rules) → deals/matchHoldService.ts (apply)
deals/deliveryReview.ts, now by revision
```

### The rules

- **A held match moves no money.** The deal page and the assistant say: the security agent held this match for a person at Karwan to look at; the money stays in escrow and release follows the deal's own rules. The old sentence about release is gone.
- **Each side reads only its own lines.** The server sends a party the lines addressed to their role or to both, never the other side's line. Every hold carries one shared line: a past delivery link from one side was flagged by the safety check, a person at Karwan looks at it, nothing is blocked. The same line reaches the assistant through the shared deal view, so the website, Telegram and every channel answer "why is my match held" the same way.
- **Clearing a hold.** Either credential, support or admin, clears it with a written reason; one decision is enough because the hold moves no money. The deal records who cleared it (the role, never a name), when and why. Both people get one line in the deal chat, and the card goes.
- **A review reaches any revision.** A review names the delivery revision it is about. The current revision of an open deal is reviewed as before. A replaced revision, or any revision of a closed deal, can still be reviewed: clearing it marks that delivery clean in the history and takes the offence off the record, and changes nothing for the money or for the current delivery. Keeping it blocked only records the decision. A malicious verdict still needs both credentials.
- **Finding the work.** Held matches and held links are listed for operators without a ticket. A held match shows the offence it rests on and the deals it came from, so the reviewer opens the right revision.

### Decision for the owner

The scanner rates `.xyz` a high-risk domain (`security/localScan.ts`). That is what flagged `arcrun.xyz`, twice. Options: keep it (one reviewer clears each hit, and the offence can now come off later), or take `.xyz` out of the list. Recommended: keep it until the review path above is live, then decide from how often it fires on real deals.

#

## Status

Built 22 Oct 2026; the escrow family fix built 27 Oct 2026. The held-match review was found, designed and built on 30 Oct 2026.
