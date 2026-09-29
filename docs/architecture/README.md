# Karwan architecture

Every idea gets an architecture view here before it is built. The view names every actor, every system we own, and every outside provider, and shows in order what each one does. If a step cannot be drawn, it is not understood well enough to build.

## What Karwan is for

Talented people, freelancers and small businesses have skills and customers on the internet but no reach, no way for a buyer anywhere to pay them safely, and no easy way to get paid. Karwan closes that gap: a seller gets found or shares a link, a buyer anywhere pays with what they already use, the money is held until the work arrives, the seller is paid out, and every completed sale becomes a record that earns the seller more reach and cheaper money over time.

## Views

| # | View | What it answers | Status |
|---|---|---|---|
| 01 | [Workspace](01-workspace.md) | How the pieces fit: people, the workspace, the rails underneath | Direction agreed |
| 02 | [Deal link](02-deal-link.md) | A seller creates a link, a buyer pays from anywhere, the money is held, the seller is paid | Partly live |
| 03 | [Direct offers](03-direct-offers.md) | A seller finds a request and offers on it; the buyer compares and accepts | Built, not yet deployed |
| 04 | [Instant top-up](04-instant-top-up.md) | One balance; a buyer funds a deal even when the money is on other chains | Partly live |
| 05 | [Sign-in and motion](05-sign-in.md) | How a person gets in, and how the sign-in art loads without slowing that down | Designed |
| 06 | [Record](06-record.md) | How a completed sale becomes proof that is hard to fake | Designed |

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
