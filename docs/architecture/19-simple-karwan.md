# 19 · Simple Karwan: say what you want

Tracks T1 and T6, roadmap items T1.1 (one market, one entry) and T6.2 (website assistant parity), and the Milestone 1 rule "no crypto words in the path" ([view 00](00-direction.md)). Draft for the owner to agree, 20 Oct 2026; onboarding reframed for the whole open market the same day. What is built is in the status table.

## Who this is for

Anyone who deals online and wants to be paid safely and build a name: a freelancer in Lagos who designs logos for clients on Instagram, a tailor in Kano who sells through WhatsApp, a supplier in Accra shipping rice to shops, a small business that hires help. Karwan is an open market for all of them. Most work from a phone. They know their work, their prices and their customers. They do not know what escrow, an agent wallet, USDC or a reputation tier is, and they should not have to. Every screen starts from what they want to do; Karwan and its agent fill in the rest.

## What is hard today

Read from the code on 20 Oct 2026.

| Where | What the person meets | Why it is hard |
|---|---|---|
| Sidebar | Home, Discover, Finance, Activity | Named after features. "Discover" and "Finance" do not say buy, sell or get paid |
| After activation | Nothing asks what they want from Karwan or what they do. The agents start with empty settings | The agent cannot work for someone it knows nothing about |
| Agent workspace (`/profile/setup`) | Forms: what you offer, a description, a price range, delivery days, the most the agent may pay, a payment split | Six fields of jargon, with no example of a good answer |
| Profile hub | USDC balance, Agents, Open deals, Activity and receipts, Reputation, Edit profile, Agent workspace, Contact, Wallets, Request a payment, Open a business profile | Three rows about agents and wallets under different names; money rows spread across two groups |
| Telegram interview | Asks sell, buy or both, what, where, usual price and timing, then posts a first offer or request | The answers never reach the agent's settings, so the website still shows empty forms |
| Words on the main path | Escrow, agent wallets, USDC, Discover, Finance, workspace | Product words, not trade words |

## The idea in one line

Ask once, in plain words, what the person wants Karwan to do for their deals, work or business; let the agent set the account up from the answers; and let anyone run their whole account by talking to the assistant.

## After activation: the agent gets to know you

When agent wallets finish activating, the agent starts a short conversation that sets up the whole account the way this person wants to use Karwan: not a tour of one feature, and not a form for the agent alone. It asks what Karwan needs to take their online deals, freelance work or business further. One question per screen, a progress line at the top, every answer optional, each with examples, nothing is a form field with a unit, and it takes about a minute.

It is a conversation, not a wizard. The person can tap an answer or type anything in their own words, and can ask a question at any step ("what does held until delivery mean?", "is there a fee?"); the agent answers in a line and carries on from where they were.

**1. What do you want Karwan to do for you?** Pick any.

```
What do you want Karwan to do for you?                    1 of 5
━━━━━━━━━━──────────────────────────────────────────────

  [ Get paid safely for my work ]     freelancers and services
  [ Sell my products ]                goods, online or in person
  [ Buy or hire ]                     find someone and pay safely
  [ Run my business deals ]           orders with other businesses
  [ Build a record clients trust ]    one name across platforms

                                         [ Skip ]  [ Next ]
```

**Then only the questions their picks need,** each on its own screen. The progress line counts the steps this person will actually see:

| They picked | The agent asks | Example answer |
|---|---|---|
| Get paid for my work | What do you do? | Logo and brand design |
| Sell my products | What do you sell? | Ankara fabric, 6 yards a piece |
| Either of the two above | Your usual price and how fast you deliver | 20 to 40 USDC, 3 days |
| Buy or hire | What do you usually buy or hire for, and your usual budget? | Phone repairs, up to 50 USDC |
| Run my business deals | Your business name, and what it trades | Bello Foods, rice and grains to shops |
| Build a record | Where do you already work or sell? | Instagram, WhatsApp, Fiverr, Jumia |
| Any of the first three | Do you have clients already, or should Karwan find them? | Both |
| Karwan finds them | How much should your agent do on its own? | Make offers within my price, ask me before anything else |

**Then: how should we reach you?** Telegram, email or both, for new offers, payments and anything that needs them.

**Last: where are you?** Only the country is ever shown; the city helps find people nearby.

### What the answers set up

Each answer changes the account itself, so the person lands in a Karwan that already looks like the way they work.

| Answer | What it sets up |
|---|---|
| Get paid for my work, Sell my products | The selling agent: what they offer, the price range and delivery time, in their own words. Home leads with "Send a client a payment request" and "Post your service" or "Post your product" |
| Buy or hire | The buying agent: what they look for, the most it may agree to, delivery time. Home leads with "Post what you need" |
| Run my business deals | A business profile started with the name and trade filled in, and the market's trade-as answer set to business (`tradesAs`, view 17) |
| Build a record | A "Connect your accounts" step on the first-trade checklist for the places they named; each counts only once proven |
| I have clients already | Payment requests and direct deals come first: the first-trade step becomes "Send your first client a payment request" |
| Karwan finds them | The agent is switched on to look for matching requests or offers (a new setting; none exists today) |
| How much the agent does on its own | The agent's limits: make offers within the price range, or only suggest and ask first (a new setting; the spec maps it onto how the agents behave today). Money still moves only after the person confirms |
| How to reach you | Telegram connected now (one tap), email notices on or off |
| Where you are | Country and city, private, for nearby matches |

Everything set here can be changed later, by saying it to the agent ("stop making offers for me") or under Me.

Where they already work or sell is kept as context for the agent and as places to connect later. Only accounts a person proves they own ever count toward their record (track T3); a name typed here never does.

Then the agent says back what it understood, in sentences, before anything is saved:

```
Here's your Karwan
  ✓ Your agent offers logo and brand design
  ✓ Asks 20 to 40 USDC, delivers in about 3 days
  ✓ Makes offers on matching requests, asks you before anything else
  ✓ Looks for clients in Nigeria first
  ✓ Tells you on Telegram
  ✓ Every client's payment is held until you deliver

            [ Change something ]   [ Looks right ]
```

"Looks right" saves everything above and lands on a Home shaped by the answers, with the first-trade checklist. "Change something" lets them type a correction ("make it 25 to 45") or open the form. The forms stay, but only as **Review and edit** under Me.

### How it moves

Motion explains each change and keeps the flow feeling light; it never decorates. Durations follow the UI law (180 to 320 ms) and every motion has a reduced-motion version.

| Moment | Motion | Reduced motion |
|---|---|---|
| Activation finishes | The success tick draws in, then the first question slides up into place (280 ms) | Cross-fade |
| Next question | The answered card slides out to the start edge and the next slides in from the end edge, 24 px and a fade (260 ms); mirrored in Arabic | Cross-fade |
| Picking a choice | The chip fills with the accent and its check draws in (180 ms) | Instant fill |
| Progress line | Grows to the new step (240 ms) | Jumps |
| Reading the answers | A short "Reading your answers" line, then each "your agents will" line appears in turn, 60 ms apart, its tick drawing in | All lines at once |
| Looks right | The summary settles into the first-trade card on Home, its first steps already ticked | Cross-fade to Home |

Taps stay where the thumb is: the main button sits at the bottom on phones, Back is always one tap, and an answer is never lost when going back.

```mermaid
sequenceDiagram
  autonumber
  actor P as Person
  participant W as Website or Telegram
  participant C as Shared core: agent brief
  participant L as Language model
  participant S as Profile store

  P->>W: Activates agent wallets
  W->>P: What do you want Karwan to do for you? Then only the questions those picks need (questions answered on the way)
  P->>W: Answers in their own words, or skips
  W->>C: Brief: goals, what they do or sell, price and pace, what they buy, business, where they work, place
  C->>L: Read the answers into settings
  L-->>C: Offer text, price range, delivery days, buyer limits
  C-->>W: Settings plus the sentences that describe them
  W-->>P: Your selling agent will ... Looks right?
  P->>W: Looks right (or a correction)
  W->>C: Confirm
  C->>S: Save the agents, limits, business start, contact and place; keep the person's own words
  C-->>W: Saved; first-trade checklist, next step
```

- **One core, three doors.** The same brief step runs behind the website screens, the Telegram interview (which now also saves the settings, not just a first post) and a new assistant action, so "change my price to 25 to 45" works anywhere. A channel only translates.
- **The person's words are kept.** The settings are read from them, never instead of them, so the description a buyer sees is what the seller wrote.
- **Reading never fails silently.** If the answers cannot be read into a number ("depends on size"), the agent says so and asks once, or saves the words and leaves the range open. It never invents a price, and model output is never hard-limited (a hard limit once silenced sellers' agents).
- **Nothing moves money.** This conversation only sets the account up. Posting, paying and accepting keep their confirm cards.

## Home: what do you want to do?

```
What do you want to do?
[ Type or pick one                                    ]
 Buy 50 bags of rice   Sell my fabric   Get paid for an order
 Someone owes me money   Pay a supplier

Your first trade                                   2 of 5   (until the first deal finishes)
Your balance       Your trades
```

- The box goes to the same assistant as Telegram. It answers with the right action card: a request, an offer, a direct deal, a payment request or a send. Nothing moves until the person confirms.
- The chips are the most common jobs, in trade words. They change with what the person does (a seller sees "Sell" first).

## Navigation and assistant mode

Decided by the owner, 20 Oct 2026, after seeing the proposal:

- **The sidebar stays:** Home, Discover, Finance, Activity. "Discover" reads better than "Buy and sell", which sounded like goods only.
- **The profile button in the top bar is the round photo only.** No name and no arrow. Without a photo it shows the first two letters of the name (KI for Kingizie). It opens Me.
- **Use assistant.** A switch in the top bar, beside the bell, turns the whole app into assistant mode, the way Claude desktop works: past conversations on the left, the conversation in the middle, a composer at the bottom with suggestions, and the person runs their account by saying what they want. Answers come back as cards, the same cards as everywhere (balance, an offer to post, a payment request, deals that need them), and money still moves only when they confirm a card. Switching back returns to the page they were on. On a phone the switch sits in the top bar and the bottom bar hides while it is on.
- The ask line on Home ("What do you want to do? Ask your assistant") opens assistant mode.
- **Help replaces Ask.** The floating button bottom right reads "? Help" and becomes support: how something works, or what went wrong. It answers from what the account shows first: a transfer on its way is answered with where it is, not with a person. A person from the Karwan team joins only when someone asks for one, or when the assistant cannot do it, and then without a button to press: the conversation goes to them with its transcript, so nobody repeats themselves, and their reply comes back into the same panel. This is the existing live-support handoff (`backend/src/routes/support.ts`, operator over Telegram), renamed and focused. Running the account lives in assistant mode, so Help never has to.

The design is on the canvas "Karwan assistant mode and onboarding": desktop app and assistant mode, the onboarding flow, and the phone.

## Me, in plain words

```
Me
  binac · Personal account

How your agents work for you
  Selling: Ankara fabric, 20 to 40 USDC, about 3 days      Change
  Buying: up to 200 USDC, 7 days                           Change
  Money with your agents: 59.00 USDC               Add   Take back

Your record
  Good, 12 deals, 4.8 from 9 ratings                          >

Your account
  Name and photo  ·  Contact  ·  Sign-in and security  ·  Business profile

Help and settings
```

"Change" opens the same brief in chat form ("what should change?"), with the full form one tap further for people who prefer it. "Agents", "Agent workspace" and "Wallets" stop being three rows: the agents are one section, and wallet details move to Money under "Where your money is".

## Words people see

| Product word | What the person reads |
|---|---|
| Escrow | Money held until delivery |
| Agent wallets | Your agents (the money they hold reads "money with your agents") |
| Finance, factoring | Get paid early (seller); Financier desk (financier, under Me) |
| Agent workspace | How your agents work for you |
| Stake | Money locked as deal insurance (T5.1) |
| Reputation tier | Your record |

USDC stays as the unit until local currency arrives (T5.4); chain names stay behind "Proof".

## What it does not change

- Every money step keeps its confirm sheet; the ask box only proposes.
- The market, deals, escrow and contracts are untouched; this is the way in and the words, not the engine.
- Business accounts keep their extra fields; "Run my business deals" starts the existing business setup with the name and trade already filled.

## Languages

English first, with French, Arabic, Hindi and Swahili as today. Local Nigerian languages wait until after mainnet.

## Later, not in this view

- Voice notes for the questions and the ask box (Telegram and web), for people who would rather talk than type.

## Status

| Part | Status |
|---|---|
| Telegram interview | Live on testnet as sell, buy or both, then a first post. The new interview (the setup questions, Here's your Karwan, then "Post this as your first offer?") is built 20 Oct 2026, not deployed |
| First-trade checklist on Home and in the assistant | Built 20 Oct 2026, not deployed ([view 01](01-workspace.md#the-first-trade)) |
| Onboarding conversation after activation, shared agent brief, assistant action to change settings | Built 20 Oct 2026, not deployed: `/setup`, the Telegram interview and `set_up_my_agents` all save through `POST /api/setup/save` |
| Agent on or off and "ask me first" limits | Saved by setup (`agentPrefs`); the agents do not read it yet |
| Business start and trade-as answer from onboarding | The answer is kept (`businessDraft`); opening the business form from it is planned. `tradesAs` exists (view 17) |
| Ask box on Home | Planned |
| Assistant mode switch, round profile button, plain-words pass | Switch, `/assistant` with saved conversations and the round photo-or-initials button built 20 Oct 2026, not deployed. Attach and deleting a conversation are not built yet. The plain-words pass is planned |
| Help in place of Ask | Built 20 Oct 2026, not deployed: ? Help answers from the account first; a person joins automatically when asked for or when the assistant cannot do it, with no button first (owner, 20 Oct) |
| Me in plain words | Planned |
