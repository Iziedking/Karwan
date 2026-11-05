# 15 · Outside agents: find trusted people and secure a deal for a person

An agent that lives outside Karwan (Claude, ChatGPT, a company's own bot) works for one person. Through the Karwan MCP server it finds people it can trust, opens a protected deal, funds it from its own wallet, and follows it to the end. It pays Karwan per call in USDC with x402. It never sees anyone's record data: Karwan matches inside and answers with who fits and why. And it can never pay the seller on its own: only its person can say the work is done.

It builds on the record (view 06), portable reputation (view 13) and the escrow (view 07). The design behind it is the agentic market spec of 17 Oct 2026.

## Rules this view adds

- **Matching runs inside Karwan.** An outside agent gets people, tiers, reasons, prices and delivery times. It never receives a score, counts or outcomes (decision D23).
- **Reads from outside need the person's yes.** `check_person` returns the public view unless the person turned on "Let agents outside Karwan check my record".
- **One human behind every agent.** Each outside agent proves it acts for one real, unique person with World AgentKit, and the person pairs with Karwan once with World ID. A verified person has no extra caps; the job escrow's own cap per deal still applies (owner, 5 Nov 2026). On testnet World ID is the whole check; on mainnet pairing adds identity checks.
- **Only the person releases.** Outside-agent deals use the job escrow with Karwan as evaluator, so the agent's wallet cannot pay the seller. Karwan completes the job only after the person confirms they are happy, or when the review window ends in silence, as on every Karwan deal.

## How an agent connects

- **Endpoint:** `https://api.karwan.site/mcp`, MCP over Streamable HTTP with no sessions. Every message is a POST.
- **Who it acts for:** every request carries a World AgentKit proof in the `agentkit` header. A request without one gets `401` with the challenge to sign.
- **Paying:** `find_counterparty` and `check_person` answer first with the x402 payment they need. The agent pays from a Circle Gateway balance on Arc Testnet and sends the signed payment in `_meta["x402/payment"]`. A refused call is never settled.
- **Deals:** the deal tools never sign anything. They return the exact calls for the agent's own wallet to send, and read each one back from Arc.

## Participants

```mermaid
flowchart LR
  P[Person] --> OA[Outside agent]
  P -->|funds by USDC, bank or card| W[Agent's wallet<br/>provider on-ramp]
  OA -->|MCP calls, paid with x402| MCP[Karwan MCP]
  MCP --> MA[Karwan matching<br/>full records, inside]
  MCP --> D[Deals]
  OA -->|signs funding| E[Job escrow on Arc<br/>Karwan is evaluator]
  W --> E
  S[Karwan seller] --> E
  P -->|confirms happy| D
  D -->|completes| E
  E -->|pays| S
```

## Pair once

The first time an agent opens a deal for a person, the person verifies once with World ID through a Karwan link. World's agent proof and Karwan's World ID check give different values for the same human, so the pairing is what lets Karwan know the person confirming a release is the person behind the agent.

```mermaid
sequenceDiagram
  participant P as Person
  participant OA as Outside agent
  participant MCP as Karwan MCP
  participant WID as World ID
  OA->>MCP: open_protected_deal (with AgentKit proof)
  MCP-->>OA: pairing needed, here is a link
  OA-->>P: please verify once with Karwan
  P->>WID: verifies
  WID-->>MCP: proof for this person
  MCP->>MCP: stores the pairing with the agent's proof
  MCP-->>OA: paired, continue
```

## Find people

```mermaid
sequenceDiagram
  participant OA as Outside agent
  participant MCP as Karwan MCP
  participant MA as Karwan matching
  OA->>MCP: find_counterparty (need, budget, deadline)
  MCP-->>OA: 402, 0.10 USDC
  OA->>MCP: pays with x402
  MCP->>MA: match against live offers, reading full records inside
  MA-->>MCP: best fits
  MCP-->>OA: up to 5 people: tag, tier, reasons, price, delivery
```

Later, when no seller fits, the agent will call `post_request` to post a real request for the person, so sellers' agents bid on it. Posting needs a Karwan account to post under, and the person behind an outside agent has only their World ID, so `post_request` waits until those people can hold one.

## Open and fund a protected deal

```mermaid
sequenceDiagram
  participant P as Person
  participant OA as Outside agent
  participant W as Agent's wallet
  participant MCP as Karwan MCP
  participant E as Job escrow
  participant S as Karwan seller
  OA->>MCP: open_protected_deal (seller, terms, amount, deadline)
  MCP-->>OA: quote: 110 work + 3.56 fee = 113.56 USDC
  OA-->>P: 113.56 USDC is needed to fund this deal
  P->>W: funds the wallet (USDC, or bank or card where offered)
  OA->>MCP: fund_deal
  MCP-->>OA: what to sign
  OA->>E: funds from its wallet
  MCP-->>S: new deal, funded by an agent for a verified person
```

The quote is the only source of the amount the person is asked for, so the total never surprises them. Karwan runs no on-ramp of its own.

## Release

```mermaid
sequenceDiagram
  participant P as Person
  participant OA as Outside agent
  participant MCP as Karwan MCP
  participant E as Job escrow
  participant S as Karwan seller
  S->>E: submits the work
  MCP-->>OA: work delivered
  OA->>MCP: request_release
  MCP-->>OA: a one-time link for the person
  OA-->>P: are you happy with the work?
  P->>MCP: confirms (checked against the pairing)
  MCP->>E: completes as evaluator
  E-->>S: paid
```

Before the review window ends the agent reminds its person. If the person neither confirms nor disputes by the end of the window, the job completes and the seller is paid, as on every Karwan deal; the seller's deal page says when that happens. The agent cannot answer the link and cannot complete the job.

## Refunds and disputes

```mermaid
sequenceDiagram
  participant P as Person
  participant OA as Outside agent
  participant MCP as Karwan MCP
  participant E as Job escrow
  participant W as Agent's wallet
  alt the seller misses the deadline
    OA->>E: claims the refund
  else the person is not happy
    OA->>MCP: open_dispute (the person's account)
    MCP->>E: ruling
  end
  E-->>W: money back
  OA-->>P: your money is back in the wallet
```

## Who pays

| Call | Price | Paid by |
|---|---|---|
| `find_counterparty` | 0.10 USDC | the outside agent, with x402 |
| `check_person` | 0.005 USDC, the same as a record read inside Karwan (owner, 3 Nov 2026) | the outside agent, with x402 |
| `open_protected_deal`, `fund_deal`, `deal_status`, `request_release`, `open_dispute` | free | the Karwan deal fee applies to the deal |

## What fails where

| Step | Failure | What happens |
|---|---|---|
| Open | The person has not paired yet | The agent gets a pairing link; nothing is opened until the person verifies |
| Any call | The AgentKit proof is missing or invalid | Refused before any payment |
| Find | The x402 payment does not settle | No matches are returned and nothing is charged |
| Any paid call | Karwan refuses it | The refusal comes back as an error and the payment is not settled |
| Open | The seller turned off deals from outside agents | That seller is never offered; opening a deal with them is refused |
| Fund | The wallet holds less than the quote | `fund_deal` answers with the amount still needed |
| Release | The person never answers | Reminder before the window ends; the seller is paid at its end |
| Release | Someone other than the paired person answers the link | Refused; the job stays open |
| Check | The person has not allowed outside reads | The public view only: level, tier, reasons, attested deals |

## Status

| Step | Status |
|---|---|
| World AgentKit proof of a human behind an agent | Built (`backend/src/agentkit`) |
| Job escrow with an evaluator | Deployed on Arc Testnet at `0xEA06b70c0808c2ad9b6316758407284fdAD9D550` (23 Oct 2026) |
| Karwan MCP server and its seven tools, at `https://api.karwan.site/mcp` | Built 5 Nov 2026, not deployed. Needs Karwan's reviewer key on the server |
| Pairing with World ID | Built 5 Nov 2026, not deployed: a World ID session, saved once, proved again on every answer |
| Release confirmation link and evaluator completion | Built 5 Nov 2026, not deployed. Proved on an Arc fork at block 70,780,914: completed, paid by silence, rejected and refunded, and refunded after a missed deadline, every amount to the unit |
| Seller switch for outside-agent deals | Built 5 Nov 2026, not deployed: Settings, on unless turned off |
| `post_request` | Not built: needs a Karwan account for the person behind the agent |
| x402 payments | Built for record reads; nanopayments run on Arc Testnet only, so this view is testnet only until Circle supports a mainnet chain |
