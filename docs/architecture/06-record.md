# 06 · Record

Every completed sale can raise the seller's record. The record is shown on a public proof page and unlocks cheaper and faster money. Because it is worth something, it must be expensive to fake.

## From sale to record

```mermaid
flowchart TD
  R[Deal released] --> C{Four checks}
  C -->|Independent buyer| C1[Paid from an account in<br/>another person's name, no shared<br/>phone, device or payout account]
  C -->|Real delivery| C2[Waybill, delivery code,<br/>or confirmation after a<br/>plausible interval]
  C -->|Diminishing repeats| C3[Same buyer counts less each time,<br/>closed rings count nothing]
  C -->|Real fee| C4[Every sale pays the fee]
  C1 & C2 & C3 & C4 --> P{All pass?}
  P -->|Yes| V[Verified sale:<br/>record +1, value added]
  P -->|No| N[Sale completes normally,<br/>record unchanged,<br/>seller told why]
  V --> A[Anchored on Arc]
  V --> U[Unlocks weighed by value<br/>from independent buyers,<br/>after a waiting period]
  V --> PP[Public proof page<br/>counts and ranges only]
```

## Privacy

The public page never shows buyer names, exact amounts, addresses or phone numbers. Prices appear as ranges. The seller chooses which sections are public.

## Status

| Part | Status |
|---|---|
| Reputation engine and registries | Live (agent-based reputation) |
| Four checks per sale | Planned |
| Proof page | Planned |
| Unlocks (fee, payout speed, working capital) | Planned |
