# Karwan architecture

Every idea gets an architecture view here before it is built. The view names every actor, every system we own, and every outside provider, and shows in order what each one does. If a step cannot be drawn, it is not understood well enough to build.

## What Karwan is for

Karwan unifies online reputation with an agentic economic model. People join a new marketplace, job board or region and have to prove themselves from zero every time; Karwan is building one reputation that travels with them, so hidden talent becomes visible and opportunity follows. It starts with Karwan's own market: a seller gets found or shares a link, a buyer anywhere pays with what they already use, the money is held until the work arrives, the seller is paid out, and every completed deal becomes a record that earns them more reach and cheaper money over time. [View 00](00-direction.md) states the direction and the six tracks every other view serves.

## Views

| # | View | What it answers | Status |
|---|---|---|---|
| 00 | [Direction](00-direction.md) | The one direction, the six tracks, and how work is chosen | Agreed |
| 01 | [Workspace](01-workspace.md) | How the pieces fit: people, the workspace, the rails underneath | Direction agreed |
| 02 | [Deal link](02-deal-link.md) | A seller creates a link, a buyer pays from anywhere, the money is held, the seller is paid | Partly live |
| 03 | [Direct offers](03-direct-offers.md) | A seller finds a request and offers on it; the buyer compares and accepts | Built, not yet deployed |
| 04 | [Top up from another chain](04-instant-top-up.md) | One balance; a buyer funds a deal even when the money is on other chains | Partly live |
| 05 | [Sign-in and motion](05-sign-in.md) | How a person gets in, and how the sign-in art loads without slowing that down | Designed |
| 06 | [Record](06-record.md) | How a completed sale becomes proof that is hard to fake | Designed |
| 07 | [Escrow](07-escrow.md) | One engine for any deal: one-time, milestones, goods, pay on delivery, hourly, retainer, instalments, deposits | v3 built, extensions planned |
| 08 | [Unified reputation](08-reputation.md) | How a person's record from Karwan and partner platforms becomes one reputation, with consent and nothing leaked | Designing |
| 09 | [Trust engine](09-trust-engine.md) | Who verifies with World ID and why, how delivery is checked, and what protects each deal | v1 built |
| 10 | [Verified network](10-verified-network.md) | The Karwan agent in WhatsApp: register, get verified, be found by agents, close a deal in escrow from chat. Holds the architecture rules every build follows | Planned, building |
| 11 | [Contracts](11-contracts.md) | The suite on Arc, deployed once: an escrow per family of deals on one shared base, how they connect to stake, records, fees and yield, and what Karwan can and cannot do to the money | Designed |
| 12 | [Checks, record and risk on CRE](12-cre.md) | How delivered work is replayed against what was agreed, how outside facts reach the record, and how deals keep moving, signed by a decentralised network with Karwan's checks as the fallback | Built, not deployed |
| 13 | [Portable reputation](13-portable-reputation.md) | How agents bring a buyer a shortlist of verified and unverified people, pay to check each record, and how other platforms join as paid record sources | Built, not deployed |
| 14 | [Threat model](14-threat-model.md) | What the contracts protect, who can act on them and within what limits, and how each class of attack is checked | Written |
| 15 | [Outside agents](15-outside-agents.md) | How an agent outside Karwan finds trusted people, opens and funds a protected deal for its person, and why only the person can release | Designed |
| 16 | [Location, messages and ratings](16-feedback-and-location.md) | How agents match people near and far without showing where they live, how two people talk by tag before a deal, and how ratings stay apart from the reputation score | Built, not deployed |
| 17 | [One market, one entry](17-one-market.md) | One market for personal and business trading: find, your trades and start in one place, account type as a lens | Built, not deployed |
| 18 | [Trade finance](18-trade-finance.md) | How a seller with a funded deal gets paid now, how the financier is repaid first, and what the record changes | Built 29 Oct 2026, not deployed |
| 19 | [Simple Karwan](19-simple-karwan.md) | How a trader who knows nothing about escrow or agents says what they want, has the agent set up their account the way they want to use it, and runs it all by talking to the assistant | Draft |
| 25 | [Pay strangers safely](25-pay-strangers-safely.md) | How any agent checks a seller before paying, and how a seller offers payments that wait in escrow until the delivery is accepted, signed once like any x402 payment | Draft |
| 26 | [Agents for every kind of deal](26-agents-for-every-deal.md) | The ways a person deals (one-time, milestones, goods, deposit, then each escrow family as it deploys), asked in plain words, so agents match and draft terms for the right shape | Draft |
| 35 | [Offers that move](35-offers-that-move.md) | A request that changes is judged again at once; sellers who offered can lower or withdraw, get one best and final round, and never see the most the buyer will pay | Approved, built |
| 36 | [A delivery link is read, not guessed](36-read-the-link.md) | The server opens a delivery link safely and the model judges what the page is; the domain ending is context, never a verdict; a page that cannot be read is shown with a warning, not held | Draft |
| 37 | [Deal guarantee and legacy contracts](37-deal-guarantee-and-legacy.md) | Staking becomes Deal guarantee on the family vault; one page returns what a person still holds on any older Karwan contract, with no window, reached from Profile | Agreed 28 Oct 2026 |
| 38 | [One clear path](38-one-clear-path.md) | A new person goes from sign-up to a first post with no agent wallets, balances or second setup on the way; one balance, the same four tabs on every device | Agreed 29 Oct 2026 |
| 39 | [From /start to Home](39-start-to-home.md) | Sign-up, tag and About you on one page with the agent beside each step; Home with the balance on top and three cards; a privacy notice | Built 29 Oct 2026, not deployed |
| 40 | [Contests, outside-agent jobs, and requests off the old board](40-contests-and-agent-jobs.md) | A contest with the prize held from the start and winners picked from real entries; an outside agent hires a Karwan seller with only its person able to release; requests and offers kept in Karwan instead of the old request board | Agreed 29 Oct 2026 |
| 41 | [Agents that always answer](41-agents-that-always-answer.md) | Agents find each other in seconds both ways, treat prices as a starting point with quantities for goods, negotiate like people, and ask the person about anything outside their limits instead of going quiet | Approved 29 Oct 2026; phase 1 built 29 Oct |
| 42 | [A deal reference people can read out](42-deal-reference.md) | Every deal has a short reference such as D68F-E7D8 with a copy button; the assistant on the website and Telegram accepts it, and the Help panel tells the assistant which deal is on screen | Approved 30 Oct 2026, built |
| 43 | [A calm deal page](43-calm-deal-page.md) | One column: the title block with the money and the one move, then hairline rows that open in place, with whatever needs the person at the top; the financier hears when a seller takes their offer | Approved 30 Oct 2026, building |
| 34 | [Business tools for local and cross-border trade](34-business-tools.md) | Behind the business switch: a business page and order link, quotes that become protected orders, an order desk, customers, the business's own agent in chat, a cross-border document pack, payment terms with early payment, and books | Draft |
| 33 | [Delivery proof for every kind of deal](33-delivery-proof-for-every-kind-of-deal.md) | Each kind of deal asks for the proof that fits it (a link, photos, a tracking number, a handover code, hours, trade documents); the buyer sees every delivery on one Delivery card and from the assistant | Approved, building |
| 32 | [The kind of deal, and paying by the hour](32-kind-of-deal-and-hourly-work.md) | Karwan works out the kind of deal from what people say and opens it on the contract that holds it; a hirer can pay by the hour, one week at a time, on the Time escrow | Hourly work and retainers built on testnet; kind detection and the refusal rules planned |
| 31 | [The assistant does everything a person can](31-assistant-does-everything.md) | Every action in Karwan can be asked for on the website or Telegram: one card, the page's own route, the passkey or PIN for money; the few device steps open their page; a test keeps it complete | Approved, building |
| 30 | [The negotiation, run from the assistant](30-negotiation-in-the-assistant.md) | Post a request in the assistant and leave; it speaks up in the same conversation and on Telegram when there is a decision or a landed deal | Approved, built |
| 29 | [Share your full passport](29-share-full-passport.md) | The owner shows their full record to one person or anyone with a link, for 24 hours or 7 days, from the passport or the assistant on any channel, and can stop it any time | Approved, built |
| 28 | [Photos on offers and deals](28-photos-on-listings.md) | Up to four photos on an offer, from the form or sent to the assistant on any channel; the first leads the market card; reviewed when reported | Approved, built for offers |
| 27 | [Deals on the escrow family](27-deals-on-the-escrow-family.md) | New deals open on the escrow family deployed on testnet, one identity per person set up at the first money step, signed release, disputes with an appeal window, and getting paid early on the same deals | Draft |

## How to read a view

- **Participants** across the top: people first, then Karwan systems, then outside providers.
- **Solid arrows** are requests or actions; **dashed arrows** are replies, webhooks and notifications.
- Every view ends with a **status table**. Each step is marked:
  - **Live**: running in production today.
  - **Built**: in the repository and tested, not yet deployed.
  - **Planned**: designed, not built. Outside providers named here are candidates until a contract is signed.
- Numbers, names and amounts in diagrams are examples.

## How we plan

1. **Idea** in plain words: who has the problem, what changes for them, and which track and roadmap item it serves (view 00).
2. **Architecture view** in this folder: actors, systems, providers, the order of events, and what fails where.
3. **Spec**: decisions, screens, copy, what is out of scope.
4. **Plan**: small tested tasks.
5. **Build and verify**, then update the view's status table.

The view is updated whenever the flow changes, so this folder always describes the system as it is and as it is intended to be, with the difference marked.

## Conventions

- Diagrams are [Mermaid](https://mermaid.js.org/) inside Markdown, so they render on GitHub and in most editors and stay reviewable as text.
- Use the product's words for people (seller, buyer, request, offer). Contract and function names appear only in the notes under a diagram.
- No secrets, keys, wallet addresses of real users or live account numbers.
