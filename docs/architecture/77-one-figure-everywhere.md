# 77 · One figure everywhere

Track T5 (money like a bank account), roadmap item T5.2 (money-path re-architecture). Proposed 11 Nov 2026 from the live product test. It finishes [view 55](55-money-in-your-own-currency.md), which made people type and read in their own currency, and closes the gaps that view listed under "Not done".

## What a person sees today

One account, read in naira, on one morning:

| Where | What it said |
|---|---|
| Home, Money, Profile | ₦2,029,299, then ₦2,029,284, then ₦2,029,314 within minutes |
| Order page | "Your balance ₦1,971,715" |
| Send | "Available ₦1,328,627" |
| Help and Telegram | "about ₦2,067,257" |
| A request typed as ₦300,000 | "Up to ₦299,996" five minutes later |
| A deal paid two days ago | a naira amount worked out at today's rate |
| Two emails about one request | ₦299,996 and ₦299,988 |

Nothing is wrong underneath. The USDC is exact. The figures differ for four reasons:

1. **The rate is read again every minute**, by every screen on its own, so the same USDC reads differently from one screen to the next.
2. **"Your balance" means three different sums**: everything you own, what you and your buying agent can spend, and what sits in your own wallet.
3. **Only some records keep the figure a person typed.** Sends, direct deals, listings and request budgets do. Monthly and hourly work, offers on requests and anything the assistant does in chat do not.
4. **Nothing keeps what a payment was worth when it happened**, so history is repriced every day.

## The idea in one line

A figure is said once and then it stays: what you typed stays as typed, what was paid stays at what it was worth then, and everything else on a screen is read at one rate that everyone shares.

```mermaid
flowchart TB
  A["An amount to show"] --> B{"Did this person type or agree it?"}
  B -- yes --> C["Show the figure as typed<br/>₦300,000"]
  B -- no --> D{"Has the money already moved?"}
  D -- yes --> E["Show what it was worth<br/>when it moved, kept on the record"]
  D -- no --> F["Show it at the shared rate<br/>the same on every screen and message"]
```

## The three rules

**1. Typed stays typed.** Any amount a person types, says to the assistant, or agrees to is kept with its currency on the record it belongs to, beside the USDC. Whoever reads in that currency sees that figure for the life of the record. This already holds for sends, direct deals, listings and request budgets. It is extended to:

- the monthly or hourly rate on work and on a request for work,
- an offer made on a request, and the price an agent agrees for you,
- every amount the assistant acts on from the website, Help or Telegram,
- agent limits and price ranges from setup.

When an agent agrees a price that is exactly the buyer's budget, the buyer reads the budget's own figure, not a fresh conversion of the same USDC.

**2. Paid stays paid.** When money moves or a deal settles, each side's record keeps what the amount was worth in that side's currency at that moment. Activity, receipts, finished deals, emails and messages about it read that figure from then on. A person who later changes their currency reads the old amounts at the shared rate, marked "about".

**3. One shared rate for everything else.** Balances and prices nobody has typed or paid yet are read at one reference rate, held by the server and given to every screen, email and message. It does not change every minute. It changes at the start of each day, and during the day only when the market has moved more than half a percent since it was set. Every screen a person opens, and every message sent to them, uses the rate in force, so two screens can no longer disagree.

```mermaid
sequenceDiagram
  participant M as Market rate
  participant S as Karwan's shared rate
  participant P as Every screen, email and message
  M->>S: Start of day: ₦1,346 to 1 USDC
  S->>P: ₦1,346, the same everywhere
  M-->>S: Moves 0.2%. No change
  M->>S: Moves 0.6% since it was set
  S->>P: New shared rate, everywhere at once
```

## One balance, named parts

"Your balance" is one sum everywhere: everything that is yours and free to use, in your account and with your agents. Home, Money, Profile, the order page, Send, Help and Telegram all show that figure under that name.

Where a step can use only part of it, the screen shows the part under its own name and says where the rest is:

- Send and Withdraw: "Ready to send ₦1,328,627" and, under it, "₦700,672 is with your agents. Bring it here."
- An order: "You can pay with ₦1,971,715" when that differs from the balance.

Money held in a deal or set aside as a deal guarantee is never part of the balance, as now. It is listed under the balance with its own name.

## How it works underneath

- **USDC is still the truth.** Contracts, escrow, ledgers and reconciliation do not change. Every rule above is about what is kept beside the USDC and how it is read.
- **Kept figures.** Records gain the same optional `{ currency, amount, rate, at }` that view 55 introduced, in the places listed under rule 1.
- **Worth when paid.** A money movement and a settled deal keep one such figure for each side, worked out at the shared rate in force at that moment.
- **The shared rate.** The server keeps the rate in force with the time it was set. The rates endpoint returns it, with that time, in place of the live reading. Quotes for typing use the same rate, so a figure typed and the balance it comes out of agree to the naira. The half percent step protects against holding a rate the market has left behind. The day starts at midnight in Lagos. Each currency steps on its own, so a move in the naira does not change what a euro reader sees. If the market cannot be read, the rate held stays for six hours after its last check; after that there is no rate and amounts read in USDC until the market is back.
- **One reader.** The server has one function that turns an amount on a record into the line a person reads, following the three rules. Emails, Telegram, the assistant's cards and the API's "as said" fields all use it. The website's own reader follows the same rules and is tested against it with the same cases.
- **Old records.** Anything made before this view has no kept figure and reads at the shared rate, marked "about" where it is a payment already made.

## What does not change

- No naira moves. Bank and card in and out is roadmap T5.4 and its own view. When a provider is connected, the provider's own rate applies at that edge and is shown there.
- The few screens that must say USDC still do: paying in from another network, a withdrawal to an outside wallet, and the Proof line on a receipt.
- With USDC chosen as the reading currency, every figure is exact USDC and none of this applies.

## Decisions for the owner

All five were approved as recommended on 11 Nov 2026.

1. **The shared rate changes daily, and inside the day only on a move above half a percent.** Recommended. The other choice is a rate fixed for the whole day whatever happens, which is simpler to explain but can sit two or three percent off on a bad day.
2. **A quote for a typed amount uses the shared rate, not the live one.** Recommended, so that typing ₦50,000 takes ₦50,000 off the balance on screen. The cost is that the USDC moved can be up to half a percent off the live market at that minute. Nobody trades at this rate, and both sides of a deal see the same figure.
3. **History is frozen at what it was worth then.** Recommended. A bank statement does not change after the fact.
4. **"Your balance" counts money with your agents.** Recommended, as Home does today, with the usable part named wherever it is smaller.
5. **Old payments read "about".** Recommended, instead of guessing a past rate for records that never kept one.

## Prices you give your agent

Approved by the owner on 11 Nov 2026: the figure you type is the rule.

A lowest price, a usual price, a rate or the most you pay is a rule your agent follows, so it cannot be a figure that only reads right on the day it was saved. The figure typed in your currency is kept with the rule, and the USDC your agent works in is worked out from it again whenever the shared rate changes. "Never below ₦30,000" stays ₦30,000.

- A rule typed in USDC stays in USDC.
- When a rule's USDC is changed some other way, by the assistant in USDC or by an older form, the kept figure is dropped and the rule reads at the shared rate, as before.
- If the market cannot be read, rules keep their last USDC.

## Done when

One account is checked, inside one minute, on Home, Money, Profile, an order, Send, Help, an email and Telegram, and every amount for the same thing reads the same. A request typed as ₦300,000 reads ₦300,000 a week later. A deal paid on Monday reads the same on Friday.

## As built

Built 11 and 12 Nov 2026. Front end and back end deploy together.

- **Shared rate.** `backend/src/rates/sharedRate.ts` holds one rate for each currency, set at midnight in Lagos and stepped inside the day above half a percent. Every server caller reads it, and a test fails the build if anything outside `rates/` reads the live rate. When the sources are down the held rate is kept for 6 hours after the last check, then amounts read in USDC.
- **One reader.** `backend/src/rates/figure.ts` turns an amount on a record into the line a person reads. Emails, Telegram and the assistant's request lines go through it with the figures kept on the request, the deal and the listing.
- **Kept figures.** Hourly and monthly work rates, offers on fixed-price requests, prices said to the assistant, and a send said in chat keep the figure as typed or said.
- **Prices given to an agent.** Each way of dealing keeps the figure typed; the USDC behind it is worked out again every 15 minutes when the shared rate has changed (`backend/src/agents/waysSaid.ts`).
- **Worth when paid.** A money movement and a settled deal keep what the amount was worth to each side at that moment (`backend/src/money/worth.ts`). Activity, Recent, receipts, the deal page, emails and Telegram read it. A payment with no kept figure reads at the shared rate, marked "about".
- **Older payments.** `backend/src/scripts/backfill-payment-worth.ts` fills in payments and settled deals from before 12 Nov from the price published for the day each one happened. It has a preview mode and changes nothing when run twice. It is run by hand after deploy. The price source refuses the production server, so the prices are fetched elsewhere as one chart for each currency and handed to the script as a file. The source has no chart for the Kenyan shilling or the CFA franc, so payments read in those keep "about".
- **One balance.** Money names the two parts under the balance. Send says "Ready to send" and, under it, what is with the agents. An order says "You can pay with" and names the rest only when it cannot use all of the balance. Home, Profile and the assistant already gave the same sum.
- **Words.** The Currency and Local currency paragraphs of the terms changed in all five languages and in `docs/terms-and-conditions.md`, and the FAQ gained three answers: the rate, "about", and "Ready to send".

Added 12 Nov 2026, after the first pass:

- **Prices said, not typed.** A selling price answered in the setup questions, and any price given to the assistant for a way of dealing, is kept as said on the way, exactly as one typed in the editor is (`saidOnWay` in `backend/src/agents/waysSaid.ts`).
- **Lines worked out from a price.** One session of a month, a first week, a fee and a total keep their proportion of the figure typed (`scaledLocal` in `frontend/features/money/localAmount.ts`), so ₦50,000 a month over 4 sessions reads ₦12,500.
- **The weekly limit.** A limit said to the assistant in the person's own currency is kept as said and worked out again when the shared rate changes, never past the 5 USDC ceiling (`limitAtRate` in `backend/src/agents/agentLimit.ts`). A choice tapped on Money replaces it.

Added 12 Nov 2026, after the first live check:

- **The assistant's balance is the screen's balance.** The server counted a Transfer balance for every account while the website counts one only for an account that signs in with its own wallet, so the assistant read 50 USDC high on an email account. One rule now decides it on the server (`holdsPool` in `backend/src/money/ownedBalanceModel.ts`), the same one Send already used.
- **The assistant does no sums.** The balance tool gives the total and the two parts, "ready to send" and "with your agents", already in the person's currency and rounded as Money rounds them (`ownedInLocal`). Before, it gave the parts in USDC only and the assistant converted them itself, wrongly.

Rulings while building:

- An offer at exactly the budget reads the budget's figure only for a viewer who is shown the budget, so a hidden budget is never given away.
- A rule's kept figure is dropped when its USDC is changed some other way, so the screen never states a rule the agent does not follow.
- Keeping the worth happens after the payment is saved and never holds a payment up.
- With a Transfer balance, Withdraw keeps its older sentence naming both places the rest can be.

## Not done

- A price for buying answered in the setup questions is kept in USDC only: setup writes it to the older buying settings, which have no place for the figure said. A buying way added afterwards keeps it.
- The three weekly limits offered on Money are fixed USDC amounts and read at the shared rate; only a limit said to the assistant is kept as said.
- The "Done when" check on a live account, across every screen inside one minute, waits for the deploy.

## Build order, once approved

1. The shared rate on the server, the rates endpoint and the quote using it.
2. The one reader on the server, with the three rules and its test cases; emails, Telegram and the assistant's cards moved onto it.
3. Kept figures on work rates, offers, agreed prices and the assistant's moves.
4. Worth when paid on movements and settled deals; Activity, receipts and finished deals reading it.
5. One balance with named parts on Home, Money, the order page, Send, Withdraw, Help.
6. Guide, canon, FAQ and this view's "As built" section.
