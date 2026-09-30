# Karwan architecture

Every idea gets an architecture view here before it is built. The view names every actor, every system we own, and every outside provider, and shows in order what each one does. If a step cannot be drawn, it is not understood well enough to build.

## What Karwan is for

Karwan unifies online reputation with an agentic economic model. People join a new marketplace, job board or region and have to prove themselves from zero every time; Karwan is building one reputation that travels with them, so hidden talent becomes visible and opportunity follows. It starts with Karwan's own market: a seller gets found or shares a link, a buyer anywhere pays with what they already use, the money is held until the work arrives, the seller is paid out, and every completed deal becomes a record that earns them more reach and cheaper money over time. View 08 is the direction the other views serve.

## Views

| # | View | What it answers | Status |
|---|---|---|---|
| 01 | [Workspace](01-workspace.md) | How the pieces fit: people, the workspace, the rails underneath | Direction agreed |
| 02 | [Deal link](02-deal-link.md) | A seller creates a link, a buyer pays from anywhere, the money is held, the seller is paid | Partly live |
| 03 | [Direct offers](03-direct-offers.md) | A seller finds a request and offers on it; the buyer compares and accepts | Built, not yet deployed |
| 04 | [Instant top-up](04-instant-top-up.md) | One balance; a buyer funds a deal even when the money is on other chains | Partly live |
| 05 | [Sign-in and motion](05-sign-in.md) | How a person gets in, and how the sign-in art loads without slowing that down | Designed |
| 06 | [Record](06-record.md) | How a completed sale becomes proof that is hard to fake | Designed |
| 07 | [Escrow](07-escrow.md) | One engine for any deal: one-time, milestones, goods, pay on delivery, hourly, retainer, instalments, deposits | v3 built, extensions planned |
| 08 | [Unified reputation](08-reputation.md) | How a person's record from Karwan and partner platforms becomes one reputation, with consent and nothing leaked | Designing |

## How to read a view

- **Participants** across the top: people first, then Karwan systems, then outside providers.
- **Solid arrows** are requests or actions; **dashed arrows** are replies, webhooks and notifications.
- Every view ends with a **status table**. Each step is marked:
  - **Live**: running in production today.
  - **Built**: in the repository and tested, not yet deployed.
  - **Planned**: designed, not built. Outside providers named here are candidates until a contract is signed.
- Numbers, names and amounts in diagrams are examples.

## How we plan

1. **Idea** in plain words: who has the problem and what changes for them.
2. **Architecture view** in this folder: actors, systems, providers, the order of events, and what fails where.
3. **Spec**: decisions, screens, copy, what is out of scope.
4. **Plan**: small tested tasks.
5. **Build and verify**, then update the view's status table.

The view is updated whenever the flow changes, so this folder always describes the system as it is and as it is intended to be, with the difference marked.

## Conventions

- Diagrams are [Mermaid](https://mermaid.js.org/) inside Markdown, so they render on GitHub and in most editors and stay reviewable as text.
- Use the product's words for people (seller, buyer, request, offer). Contract and function names appear only in the notes under a diagram.
- No secrets, keys, wallet addresses of real users or live account numbers.
