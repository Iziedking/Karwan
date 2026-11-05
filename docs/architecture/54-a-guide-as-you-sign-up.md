# 54 · A guide as you sign up

Track T1 (find and agree), roadmap item T1.1 (one market, one entry), and T5 (money) for how amounts read. Proposed 5 Nov 2026 from the owner's notes, with the desktop pop-up added after the first review: "the AI nudge during registration… more like a pop up while signing up showing it is guiding you as you sign up, very smart and responsive", "country selection below choosing your pay tag", and "only block balance per page should have USDC value". It builds on [view 39](39-start-to-home.md) and replaces the seventh round of [view 51](51-top-up-in-one-tap.md). Built 5 Nov 2026, not deployed.

## How sign-up works today

Everything is on `/start` ([view 39](39-start-to-home.md)):

1. **Account** (`AuthCard`, step `method`): email, or a wallet.
2. **Code** (step `code`): the six digits from the email. A passkey account has a `passkey` step instead.
3. **Tag** (step `tag`): the Karwan tag, a live "available" line, and the terms box. Pressing Continue creates the account. When business accounts are open there is a `kind` step after it.
4. **About you** (`/start?step=about`, `SetupFlow`): the agent's questions. Goals come first. Then, only as the goals need them: what you do and charge, what you buy, your business, where you work. Then clients and how to reach you, a "Reading that…" pause, and the summary. Home comes last.

A three-part bar (Account, Tag, About you) runs across the top. Each screen ends with a `Nudge`: a chat bubble under the form, signed "Karwan" or "Your agent". Its words are fixed per step and say what the answer is for.

What is wrong with it:

- **The nudge is a paragraph at the bottom of the form.** It sits under the button, so most people never read it. It says the same thing whatever you do and never reacts to you.
- **Nothing asks where you are.** Your country is set only if you tell the assistant later (`set_location`), so prices stay in USDC for everyone until they find Show amounts in.

## The idea in one line

A guide answers what you just did, in one line, the moment you do it: a pop-up that stays long enough to read, then fades away. On a computer it sits in the open space beside the form; on a phone it drops in at the top, over the progress bar, where it blocks nothing. Under the tag you pick your country, and prices read in your currency from your first screen on.

## The guide

**Where it sits.** On a computer, the guide is a pop-up in the open space beside the form, never over it: the wide area to the right of the sign-up column (the left in Arabic), level with the field it is talking about. It carries the Karwan mark (or Your agent from About you on) and the line, at a comfortable 17px. On a phone it is the same pop-up, placed where it blocks nothing: it drops in at the top of the screen over the progress bar, never over a field, a button or the keyboard, at most two lines, and the screen below it does not move. × hides it for the rest of sign-up on either size.

**How long it stays.** Each line stays up long enough to read twice: 300ms a word plus 2 seconds, never under 4 seconds and never over 9. Then it fades away. The pointer resting on it, or keyboard focus inside it, holds it until the pointer leaves. A new line from the next action replaces the one showing. The same timing holds on a phone.

**How it speaks.** One line at a time. A new line replaces the old one with a short fade, and screen readers hear it politely. It reacts to what the person does on that step, from facts the page already has, so it answers instantly and needs no model call:

| Step | When | It says |
|---|---|---|
| Account | opening | Sign in with your email or a wallet. Nothing is paid. |
| Account | an email with a likely typo (`gmial.com`) | Did you mean gmail.com? (tap to fix) |
| Account | wallet chosen | Your wallet only signs you in. It won't move money. |
| Code | sent | Code sent to ada@…. It arrives in a few seconds. |
| Code | 30 seconds, no code | Not there? Check spam, or send a new code. |
| Code | a wrong code | That code didn't match. You have 4 tries left. |
| Tag | typing | @ada is taken. @ada_obi is free. (tap to use) |
| Tag | available | @adaobi is yours. Clients find and pay you by it. |
| Country | picked | Prices will show in naira (₦). Change it any time in Settings. |
| Country | not yet supported | Prices will show in USDC for now. |
| About you | after the hello | I'm your agent. Four quick questions and you're in. |
| About you | price typed | I'll offer between ₦50,000 and ₦150,000 for you. |
| About you | Reading that… | Reading your answer… |
| Summary | opening | Nothing is saved until you say so. |

From About you on, the card is signed "Your agent" instead of "Karwan", the same handover the bubbles make today. Free text such as "what do you do" is read the way it is today (the "Reading that…" step). The card shows that reading as it arrives.

**What it never does.** It never explains itself: no timer bar, no "tap to dismiss" hint, no caption about how it works. People find out by using it. It never asks a question of its own and never blocks a button. Every line is about the step in front of you. The words live in the five languages like every other line, and the card follows the light and dark theme.

## Country, under the tag

On the Tag screen, under the tag field and its available line, a **Country** field: a select that opens a list with a search box at the top ("e.g. United Kingdom"), with every country in the person's language, A to Z. The country from the browser's region is already picked. Choosing one shows the guide line above.

Continue saves the country together with the tag, in the same request that creates the account. It goes into the field `set_location` uses, so matching and the public country read it. It also sets Show amounts in:

| Country | Shows amounts in |
|---|---|
| Nigeria | NGN |
| United States | USD |
| Euro area countries | EUR |
| United Kingdom | GBP |
| China | CNY |
| India | INR |
| United Arab Emirates | AED |
| Kenya | KES |
| Benin, Burkina Faso, Côte d'Ivoire, Guinea-Bissau, Mali, Niger, Senegal, Togo | XOF |
| Anywhere else | USDC |

A currency added later becomes the default for its countries from then on. Show amounts in changes it any time; changing the country later never overrides a currency the person picked themselves. Accounts made before this keep what they have. A wallet person who already had an account is never asked.

## One block balance per page, everything else in your currency only

**One rule:** a page has at most one block balance, the big figure at its top. That block shows your currency big and the USDC under it. Every other figure on every page shows your currency only: rows, cards, prices, buttons, sentences, offers, the financier desk, the profile, receipts, emails and Telegram. With USDC chosen, everything reads in USDC.

| Page | Its block balance |
|---|---|
| Home | the total |
| Money, Balance | Your balance |
| Money, Agent | With your agent |
| Money, Deal guarantee | the guarantee in place |
| Profile, the trade record, market, deals, offers, the desk | none |

So the profile's Money row reads "₦283,341", the Deal guarantee rows read "Holding for deals ₦0", and a market card reads "₦129,224". The profile row showing "210.49 USDC" with naira chosen is a bug: that row formats its own figure and skips the currency (`ProfileAccountHub.tsx`). It moves to the one formatter. A check fails the build whenever a component prints a figure with "USDC" by hand.

USDC still shows in three places, because it is the exact amount that leaves the wallet:

1. Typing an amount: you type in USDC, with "≈ ₦26,922" under it.
2. The confirm card before money moves: one line, "Moves 20.00 USDC".
3. Paying from another network: "Send exactly 20.00 USDC", which the other wallet must send.

A receipt shows your currency, plus one row "Settled 20.00 USDC" for the record.

## Every channel does the same

The Telegram sign-up asks where you are right after the tag, not last, with the same country buttons (the five most likely first, then "Another country" to type it), and sets the currency the same way. Its messages carry the same guide lines. The assistant's `set_location` sets the currency only when the person never chose one. Telegram and email amounts follow the same rule: your currency only. The one exception is the big figure at the top of a deal email, which is the email's block balance.

## Motion

On a computer, a line arrives by moving 16px in from the form's side while fading in (280ms, ease out), so the eye follows it from the field to the pop-up. It leaves by drifting 8px up while fading out (240ms). A line that replaces another crossfades in place (160ms). The mark's listening pulse is a 1.2s opacity loop. On a phone, a line drops 12px down from the top edge while fading in (240ms) and leaves by sliding back up and fading (200ms). With reduced motion, lines appear and go without movement, after the same reading time.

## What stays the same

The steps, their order and the three-part bar stay as they are. The questions About you asks stay as they are. Nothing new is asked except the country, and the country takes one tap because it is already picked.

## As built

- **Two big sizes.** `Price` has `block` (the page's one balance: your currency big, USDC under it) and `hero` (any other big figure, your currency only). Home's total, the Agent tab and the Deal guarantee use `block`; the Balance tab keeps its own block. Rows, cards and sentences go through `useMoneyText()` and show one figure.
- **The exact USDC lines.** The withdraw confirm, the order confirm and the release confirm on a deal each carry one Moves row with the exact USDC; the funding confirm keeps its rows in USDC. Typed amounts show "≈ ₦…" under them.
- **Kept in USDC on purpose.** Moving between networks (the bridge, the transfer balance, wallet balances per network), the exact amount to add on the order page, Karwan-wide totals on public pages, and the developer docs. A test (`oneCurrency.test.ts`) fails the build when any other screen prints a figure with "USDC" by hand.
- **The guide.** `Nudge` in `features/setup/StartParts.tsx` is now the pop-up. It sits beside the form from 1240px wide (the form is centred, so narrower screens have no open space beside it) and drops in under the header below that. The agent's read-back of a price in About you stays in the page, because the person checks it before going on.
- **Country.** `CountrySelect` sits under the tag line; the browser's region is picked first. `POST /api/signup` takes `country`, and the new account gets that location and, for a supported currency, Show amounts in. A country without one stores no currency, so it reads in USDC and takes a currency added later. The assistant's `set_location` and the Telegram interview set the currency the same way, only when none was chosen.
- **Telegram.** The interview asks where you are right after the goals, the first question it asks after you are in, rather than before them.
- **Recorded sentences.** The server writes a movement's sentence once, in USDC ("Received 500 USDC"). The Activity statement, the Recent rows, the receipt and the notifications (bell and toasts) pass it through `useMoneyText().line`, which says each figure in your currency ("Received ₦673,055"). The statement's amount column and its repeat line ("3 times, ₦26,922 each") read the same way.
- **Not done.** Receipts do not yet carry a separate "Settled N USDC" row.

## Status

Approved and built 5 Nov 2026, not deployed.
