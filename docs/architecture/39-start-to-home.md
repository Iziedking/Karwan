# 39 · From /start to Home, with the agent beside you

Track T1, find and agree, roadmap item T1.1 (one market, one entry), and step 1 and step 5 of [view 38](38-one-clear-path.md). The owner reviewed drawn samples on 29 Oct 2026 and asked for them to be built as drawn, with three additions: a privacy notice, a short agent nudge on every step so nobody is lost, and the rule that what a person tells their agent sets up their workspace and profile by itself. Personal details are asked only once, at identity checks on mainnet, and only what the partner running the check needs.

## What a new person does

Everything happens on `/start`. There is no second page called setup.

1. **Account.** Email and a code, or a wallet. Nothing else is asked.
2. **Tag.** They pick the Karwan tag clients find and pay them by. The account is created here.
3. **About you.** The agent asks what they want Karwan to do, then only the questions those goals need:
   - selling work or goods: what they do and their usual price, on one screen. The agent reads it back as a price range and delivery time before they move on;
   - buying, a business, or a record: one line each, as today;
   - then whether they have clients and how to reach them, on one screen.
4. **Here's your Karwan.** One summary: tag, clients, what the agent may do, how we reach them, and the first offer or request the agent wrote from their words, with "Post it on the market now" ticked. "Looks right, take me home" saves everything and, when ticked, the assistant posts it. They land on Home.

A three-part bar (Account, Tag, About you) stays at the top the whole way. Each screen carries one line from the agent saying what the answer is used for. How clients pay and what the agent may do on its own are not asked: they start as "all at once" (or "I send goods" for sellers of goods) and "make offers within my price, ask before any deal", and both can be changed on the summary or later under Profile. Where the person is gets asked later, on the profile, when it is needed for matching.

## What the answers set up

Unchanged from [view 19](19-simple-karwan.md): `POST /api/setup/save` turns the answers into the agent settings, the public profile (work, price range, delivery time, ways to pay) and what Home shows first. The person never types a name, an address or an ID number to use Karwan on testnet. On mainnet the identity check asks for what the licensed partner requires, at the moment a feature needs it, and that data goes to the partner under the privacy notice.

## Home

The balance is the top line of the page, not a card: the amount, the active trade count, and Add money, Send, Request and Withdraw beside it. Under it, three cards side by side (stacked on a phone):

- **The next step from setup** (Find work, Get paid, Post what you need), as today.
- **Your first trade**: steps done out of five, the next step, and "See the steps", which opens the full list in a side drawer (bottom sheet on a phone). It goes away after the first settled deal, as today.
- **Ask your assistant**: a box and two suggestions.

"Trade now" is gone: the first card already leads to the market. Updates move on by themselves every 6 seconds and stop while the pointer or keyboard focus is on them, or when the person has asked for reduced motion. There is no pause button.

## Smaller fixes in the same batch

- Putting up a deal guarantee shows the balance it comes from, a "Use all" button and what is left after. The title reads "Put up a deal guarantee" until an amount is typed.
- Legacy contracts shows five rows at a time with Previous and Next for older deals and for guarantees, and its Back link lines up with the heading. The "Done" line becomes a notice at the top of the list.

## Privacy notice

A new public page, `/privacy`, linked from sign-up, the terms, the footer and the assistant guide. It says in plain words what Karwan keeps, why, who processes it for us, how long, what goes on chain and cannot be removed, the identity data partners collect on mainnet, and how to get a copy or delete an account. Section 8 of the terms points to it. It is written for the Nigeria Data Protection Act 2023 first and needs a legal review before mainnet.

## The assistant and Telegram

The guide learns the new path ("sign-up is on /start: account, tag, a few questions") and the privacy page. The Telegram interview keeps its own order of questions for now. Bringing it to the same shorter order is a follow-up.

## Status

Built, not deployed. Samples: the design canvas from 29 Oct 2026.
