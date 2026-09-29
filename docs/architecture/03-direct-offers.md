# 03 · Direct offers

A seller who finds a request in the market can offer on it directly, at their own price and date, without waiting for an agent match. The buyer sees every offer with the seller's record and decides.

## Sequence

```mermaid
sequenceDiagram
  autonumber
  actor S as Seller
  participant UI as Request page
  participant API as Offers API
  participant DB as direct_offers_v1
  participant SA as Seller agent wallet
  participant JB as JobBoard on Arc
  participant BA as Buyer agent
  actor B as Buyer
  participant ESC as Escrow on Arc

  S->>UI: Opens request from the market
  UI->>API: GET /api/jobs/:id/offers
  API-->>UI: Public request, offer count, role = seller
  S->>UI: Make an offer (price, deliver by, note)
  UI->>API: POST /api/jobs/:id/offers
  API->>API: Rules (not own request, open, price, dates, note)
  API->>DB: Insert pending offer (one per seller per request)
  API->>SA: submitBid(jobId, price, valid until)
  SA->>JB: Bid on chain
  JB-->>BA: BidSubmitted
  BA->>DB: Is this a direct offer?
  DB-->>BA: Yes: rank only, never counter or auto-accept
  API-->>UI: Offer sent
  B->>UI: Opens own request: offers, cheapest first
  B->>UI: Accept (sheet shows amount incl. fee)
  UI->>API: POST /offers/:id/accept
  API->>API: Per-job lock, refuse if already matched
  API->>BA: Buyer-gated match at the offer price
  BA->>BA: Balance check before anything on chain
  BA->>JB: acceptBid
  BA->>ESC: fundEscrow
  API->>DB: Offer accepted
  API-->>UI: Money held
```

## Guards

| Risk | Guard |
|---|---|
| Double send | One pending offer per seller per request; a retry returns the first offer, no second bid |
| Request closed between load and send | Bid reads job state first; offer ends `failed` with a clear message; seller may retry |
| Seller already bidding through an agent | Refused (`ALREADY_BIDDING`); listing auto-bids skip a seller with a pending direct offer |
| Buyer short on funds | Nothing on chain; 409 top-up; the temporary match is removed |
| Two accepts at once, or agent match approving | Shared per-job lock with agent approvals; approved match refuses a new accept |
| Offer expires | Lapses at 7 days or the request deadline; a lapsed offer never blocks a new one |
| Privacy | Buyer sees all offers; a seller sees their own; everyone else sees only the count |

## Status

| Part | Status | Where |
|---|---|---|
| Rules, store, migration 35 | Built | `backend/src/offers/`, `backend/src/db/directOffers.ts` |
| Seller bid, buyer agent guard | Built | `backend/src/agents/seller.ts`, `buyer.ts` |
| Routes | Built | `backend/src/routes/offers.ts` |
| Request page, offer sheet, buyer list | Built | `frontend/features/offers/` |
| Agent ranking of direct offers by skill match | Planned | today sorted by price |
| Sibling offers closed when a request funds | Planned | |
| First real testnet offer | Pending | after deploy |
