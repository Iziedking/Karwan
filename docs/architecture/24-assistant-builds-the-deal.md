# 24 · The assistant builds the deal

Track T2, protected deals, through T6 (one assistant everywhere). Approved by the owner 23 Oct 2026 as recommended (one tap to send, pay card also in the conversation, goods deals included) and built the same day. In Telegram the pay card is the existing "seller agreed" message with its button to the deal page, because money is confirmed on Karwan, not by a chat button.

## What is wrong today

The owner, 23 Oct: "assistant prepares a deal that still takes me to manual deal cards to set up". It should ask what it needs, fill in every answer itself, and ask for a confirmation only where money moves.

What the code does now:

- **Website assistant.** `propose_direct_deal` only checks the tag, then shows a button that opens the deal form with the seller, the amount and a few words filled in. The person then works through the form's three steps by hand.
- **Chat channels (Telegram).** `start_protected_deal` and `pay_into_escrow` (backend/src/assistant/directDealTools.ts) already build confirm cards that create the deal and pay it into escrow. But they are switched off on the website ("Use the deal form in the app"), and they carry only 4 of the form's fields: who, amount, what, and days to deliver.
- **The website's chat** can't run the `create_direct_deal` or `fund_direct_deal` cards at all; its executor (frontend/shared/assistant/AssistantThread.tsx) has no branch for them.

So the same person gets a full deal from Telegram, a partial deal with fixed defaults, and only a pre-filled form from the website. That breaks rule 13: one assistant everywhere.

## The idea in one line

One deal conversation on the shared core, for the website and every channel. The assistant asks only what it is missing, fills in every answer, and ends with one card showing all the terms. Sending the deal needs one tap, and paying into escrow needs a second card with the amount.

## How it works

```
"I want to work with @tuesbimec"
  │
  ├─ assistant asks only what is missing, one short question at a time:
  │     what is the work?  how much?  by when?
  │  then one line for the rest, with the defaults said out loud:
  │     "One payment on delivery, the usual days to check it, 24 hours for them to accept.
  │      Want to split the payment, require stake, or change any of that?"
  │
  ├─ draft_deal   (shared core tool; validated by the same schema POST /api/deals/direct uses)
  │     → one card: With, For, Amount, Fee, Deliver by, Payment (parts), Review days,
  │       Acceptance window, and Goods terms or Stake when they apply
  │     → [Send the deal]   no money moves; the seller is asked to accept
  │     a change in chat ("make it two payments") replaces the card, never adds a second
  │
  ├─ seller accepts (notification, and a line in the same conversation)
  │
  └─ pay_into_escrow
        → card: amount + fee, from which balance, "stays in escrow until you release it"
        → [Pay 35.70 USDC]   money moves only here
```

- **Every field the form has**, asked in plain words, with the form's own defaults:

  | Form field | Question or default |
  | --- | --- |
  | seller (tag, email or address) | "Who is it with?" (a past counterparty can be picked by name) |
  | terms | "What is the work, or what are the goods?" |
  | dealAmountUsdc | "How much?" |
  | deadlineDays / deadlineHours | "By when?" A date is turned into days by the server, never by the model. |
  | firstReleasePct / milestonePcts | default: one payment; or "split it 50/50", "three parts" |
  | reviewWindowDays | default stated, changeable |
  | acceptanceWindowHours | default 24 hours |
  | tradeType, incoterms, paymentTerms, counterpartyCompany | asked only when the deal is for goods |
  | requireStake / requireStakePct | asked only when the person mentions trust, or for business deals |
  | evidenceRequired, verificationPolicy | defaults; changed only on request |

- **One schema.** The tool validates against the exact `createSchema` from routes/deals.ts, moved to a shared module, so the assistant can never build a deal the route would reject.
- **One executor.** The card runs the same `POST /api/deals/direct` the form uses, on the website through AssistantThread and in chat through channels/executor.ts, with every field passed through rather than the 4 used today.
- **Consistent with the rest:** requests and offers already work this way (`post_request` and `post_offer` cards). The website keeps the deal form for anyone who prefers it.

## Checks before code (rule 14)

Nothing here touches Arc or Circle directly. Paying into escrow uses the existing `POST /api/deals/direct/:jobId/fund` route, whose checks are already logged. If that changes, it gets an entry first.

## What it does not do

- No money moves without its own card. Sending the deal moves none.
- No document uploads in chat in this build. Invoices and proofs stay on the deal page; a later build can attach a chat image to `documentRefs`.
- No change to escrow contracts, fees or limits. The mainnet beta cap shows on the pay card, as today.
- No auto-fill of terms the person didn't state. A missing answer is asked, never guessed.

## Questions for the owner

1. Sending the deal moves no money, but it sends terms to another person. Keep one tap for it? (Recommended: yes.)
2. When the seller accepts, should the pay card appear in the same conversation as well as in notifications? (Recommended: yes.)
3. Include goods deals (incoterms, payment terms, company) in this build, or services first? (Recommended: include. It is the same card, with four questions that only appear for goods.)

## Tests

- **Schema:** every field the form sends is accepted by the tool; a value the route rejects is rejected by the tool too.
- **Questions:** with only "deal with @ada" given, the assistant asks what, how much and by when, and nothing else first.
- **Card:** one card per draft; a change replaces it.
- **Execution:** website and chat send the identical request body for the same answers.
- **Money:** paying into escrow is impossible without its own confirm, and impossible before the seller accepts.
- **Browser:** a deal built in the website chat appears on the deal page with every term as stated.
