# Circle Agent Marketplace service policy

Status: approved public service-selection boundary, verified 2026-08-25.

The [Circle Discovery API](https://developers.circle.com/agent-stack/agent-marketplace/discovery-api)
is the source of truth for paid x402 API services currently listed in Circle's
marketplace. It is not Karwan's authoritative directory of people, buyers,
sellers, or SME counterparties. Karwan's own profiles, verification state,
mandates, deal history, and deterministic eligibility rules remain
authoritative for counterparties.

The browser catalogue at
[agents.circle.com/services](https://agents.circle.com/services) is useful for
human review. Runtime discovery uses the public API at
`GET https://api.circle.com/v2/x402/discovery/resources` so it can filter by
category, network, price, payment rail, protocol type, and SIWX requirement.

## Recommended services

| Need | Service | Role | Price observed 2026-08-25 | Payment rail observed |
| --- | --- | --- | --- | --- |
| Web research and source retrieval | Exa Search / Contents | Primary | 0.007 / 0.001 USDC | Standard exact-EVM x402 |
| General web search | Serper Search through Orthogonal | Economical fallback | 0.002 USDC | Circle Gateway Nanopayments |
| Company search and enrichment | OpenMart through Orthogonal | Supplemental business evidence | 0.010 USDC | Circle Gateway Nanopayments |
| Business operating status | Voygr through Orthogonal | Supplemental business evidence | 0.005 USDC | Circle Gateway Nanopayments |
| Wallet and transaction evidence | Allium | Supplemental evidence only when the subject chain is supported | 0.010 to 0.030 USDC for the selected wallet endpoints | Standard exact-EVM x402 |

Prices and availability are catalogue data, not configuration constants.
Runtime code must query Discovery with `siwx=false`, validate the exact resource
and current payment metadata, then pass the candidate through Karwan's existing
evidence budget, mandate, idempotency, and x402 reconciliation gates. Discovery
alone never authorizes a purchase.

The payment network advertised by a resource only identifies where the x402 fee
can be paid. It does not prove that the provider covers the chain being
investigated. Allium may be selected only after its current request schema or
provider documentation confirms support for the subject chain.

Provider responses are corroborating inputs. They do not create or verify a
Karwan person, SME, profile, offer, mandate, eligibility decision, deal
completion, or counterparty relationship.

## Workflow

1. The matching or qualification engine opens a versioned evidence need with a
   claim, subject, freshness limit, minimum reliability, maximum price, mandate
   version, policy version, and expiry.
2. The planner prefers direct evidence, then a fresh cached snapshot. No payment
   is made when either is sufficient.
3. If a paid read is justified, Discovery is queried with `siwx=false`. The
   exact listing is validated against Karwan's allowlists and the current
   request and response schema.
4. The research-credit ledger reserves the amount under an idempotency key.
   Authorization is checkpointed before any payment signature is created.
5. Agent Nanopayments or another explicitly accepted x402 rail pays the selected
   service. The response is size-bounded, schema-checked, hashed, and stored with
   its provenance and payment correlation.
6. A verified settlement and valid response fulfill the evidence need. A
   timeout, missing receipt, price mismatch, provenance gap, stale response, or
   contradictory response stays blocked or enters reconciliation.
7. Qualification resumes from the durable snapshot. The provider response can
   support a decision, but cannot override a hard eligibility, verification,
   mandate, or staking rule.

This workflow is part of the public
[agent workflow architecture](./agent-workflows.md). Paid execution remains
behind `AGENT_RUNTIME_V2_ENABLED`, `REVIEWED_OPERATION_TASKS_V2_ENABLED`, and
`EVIDENCE_RESEARCH_CREDIT_V2_ENABLED`.
