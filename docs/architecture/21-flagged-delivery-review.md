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

## Status

Built 22 Oct 2026, uncommitted.
