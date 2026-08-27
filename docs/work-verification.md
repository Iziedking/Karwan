# karwan work verification standard

status: implementation baseline and mainnet reliability proposal

## purpose

karwan should treat a link as a locator, not as proof. A URL can be edited,
removed, redirected, or controlled by somebody other than the counterparty.
Work reputation therefore needs an evidence envelope, a verification state, and
an auditable decision trail. The contract protects settlement; verification
establishes whether the agreed work or delivery actually happened.

This is deliberately separate from identity verification. A verified business
may still submit weak delivery evidence, and a person may submit strong work
evidence without claiming to represent a registered company.

## evidence hierarchy

Evidence is scored on four dimensions: issuer trust, integrity, independence,
and freshness. A counterparty receives a public summary only after the evidence
has been checked against the relevant agreement or milestone.

| tier | evidence | default treatment |
| --- | --- | --- |
| 0 | self-attested URL, screenshot, or description | discoverable, never sufficient for a high-value completion claim |
| 1 | controlled-domain proof, signed file, repository commit, timestamped artifact, or hash-linked deliverable | corroborating signal; verify that the subject controls the source |
| 2 | buyer or seller acceptance inside the deal, with the milestone and evidence digest bound to the agreement | primary completion signal for ordinary work |
| 3 | independent issuer attestation: carrier proof of delivery, registry record, verified client confirmation, or verifiable credential | strong corroboration; retain issuer and validity metadata |
| 4 | two independent tier-2/3 signals that agree on subject, scope, time, and outcome | high-confidence claim suitable for reputation and automated release within policy |

No single AI judgment should create tier-4 evidence. Agents may collect,
normalize, compare, and explain evidence, but a disputed or high-value claim
must remain reviewable by a human.

## evidence envelope

Persist one immutable record per submitted artifact or attestation:

```text
evidence_id
agreement_id / job_id / milestone_id
subject (worker, seller, buyer, or business)
issuer and issuer_type
evidence_type and source_uri
content_hash and hash_algorithm
signature / verification_method (when present)
issued_at, observed_at, expires_at, revoked_at
scope (what work, goods, quantity, or period it covers)
relationship_to_claim (delivery, acceptance, identity, shipment, outcome)
verification_state (submitted, fetched, checked, corroborated, accepted, rejected, expired)
confidence and reasons
privacy_class and redaction policy
reviewer / agent decision, policy version, and audit event
```

Store raw documents privately. Public profiles should expose only a verification
state, count, freshness, and outcome summary; never publish private invoices,
client names, raw provider identifiers, or unredacted wallet/contract data.

## lane-specific controls

### trade lane (businesses and smes)

1. bind the invoice or purchase order digest to the agreement before funding;
2. require a commercial document with issuer, buyer, seller, amount, currency,
   due date, and line-item scope; cross-check those fields against the deal;
3. for goods, prefer carrier or logistics events and signed proof of delivery;
4. for services, require milestone artifacts plus buyer acceptance or a timed
   review window; and
5. for high-value releases, require two independent signals (for example a
   signed delivery receipt plus buyer acceptance).

EPCIS is a useful interoperability model for goods: it represents events in
   terms of what happened, when, where, and why, and provides capture/query
   interfaces that trading partners can share. See the [GS1 EPCIS
   standard](https://www.gs1.org/standards/epcis).

### p2p and freelancer lane

Use a bounded milestone rather than a vague “completed” link. Accept one or
more of:

- a deliverable uploaded to karwan with a content hash;
- a signed repository commit, release artifact, or design/file export;
- a buyer test, review, or acceptance record bound to the milestone;
- a verified external account or domain that controls the artifact; and
- a counterparty attestation with timestamp, scope, and dispute window.

Hourly and daily work should settle against approved work units or a periodic
claim, not an unverified wall-clock assertion. Batch claims daily or weekly so
the evidence is reviewable and transaction costs remain predictable.

## identity, credentials, and issuer checks

When an issuer can provide a signed credential, model the record using the W3C
Verifiable Credentials Data Model: issuer, holder, verifier, credential
subject, evidence, validity, and status are explicit rather than implied by a
URL. Use OpenID4VCI where an issuer needs a standard issuance flow. A
credential is a transport and integrity mechanism, not proof that the underlying
claim is economically true; Karwan must still check scope and corroboration.

For business and operator identity, follow NIST evidence principles: check
authenticity, integrity, accuracy, and currentness; use more than one evidence
source for higher assurance; and record the validation method and result. See
the [W3C VC data model](https://www.w3.org/TR/vc-data-model/),
[OpenID4VCI 1.0](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html),
and [NIST identity evidence validation guidance](https://pages.nist.gov/800-63-3-Implementation-Resources/63A/validation/).

## verification lifecycle

```text
submitted → fetched → integrity checked → issuer/source verified
          → scope matched → corroborated → accepted/rejected
          → expired or revoked (if validity changes)
```

Every transition records actor, timestamp, policy version, reason, and the
agreement/milestone it affected. A failed fetch is `unverified`, not `clean`.
A broken link never silently becomes a successful outcome.

## release policy

- low-value, low-risk work may release after one accepted milestone and a
  review window;
- higher-value work requires corroboration and an explicit buyer acceptance or
  an authorized timeout rule;
- disputes pause automated release and preserve all submitted evidence;
- agents can request evidence, run deterministic checks, explain the result,
  and recommend release; they cannot resolve a disputed claim alone; and
- reputation uses accepted outcomes and their evidence tier, with decay for
  stale evidence and a visible “self-reported” state for tier 0.

## rollout in karwan

1. keep the current link verifier as tier 0/1 and label it honestly;
2. add the immutable evidence envelope and state transitions to the existing
   evidence projection;
3. add upload-and-hash for private deliverables and signed acceptance for
   milestones;
4. add adapters for repository commits, domain control, carrier/POD, and
   business registries; and
5. enable automated release only for policies whose evidence requirements and
   failure recovery are covered by integration tests.

The profile surface should show “verified”, “corroborated”, “self-reported”, or
“needs review” with a short reason. Technical proof remains available behind a
deliberate disclosure control, never in the primary copy.

## paid-research accounting invariant

External research is a financial operation independent of model synthesis. As
soon as an x402 provider confirms a paid response, karwan records an immutable
provider-payment row keyed by research run and sweep angle and emits the
corresponding audit event. The row includes amount, payer, provider, optional
transaction proof, job/owner scope, and timestamp. Synthesis may later be
successful, partial, or failed; none of those outcomes can delete or hide the
payment. A paid-but-unsynthesized event is surfaced for reconciliation and
retry. Prepaid scout credit is decremented per confirmed payment with
per-owner serialization so parallel sweep angles cannot overwrite one
another's balance.
## conversation retention and operational timing

deal and financing conversations are coordination surfaces, not permanent
document storage. messages are available for 14 days, filtered at read time
and permanently deleted by the server retention sweep. attachments are limited
to png, jpeg, and webp images and follow the same expiry. reply references are
constrained to the same deal channel.

karwan derives operational timing from verified lifecycle transitions. for a
seller, the record can report average time from deal creation to seller
agreement and from verified escrow funding to delivery. for a buyer, it can
report average time from delivery to the buyer's recorded verification point
and from delivery to final settlement. missing or reversed timestamps produce
no metric, and each value carries a sample count. legacy deals without an
explicit verification timestamp use the first release-window timestamp as a
clearly documented compatibility fallback.

## deal lifecycle protection

the protected trade path keeps commercial agreement, escrow funding,
fulfilment, review, and settlement as separate recorded transitions. seller
agreement does not move funds. funding requires the current terms and an
explicit buyer approval. delivery opens a buyer review window, and release
is only available through the recorded settlement conditions. a dispute,
expiry, cancellation, or failed chain confirmation pauses the automatic path
and leaves an auditable action for the responsible party.

each money movement is idempotent and reconciled against authoritative chain
state before it is shown as complete. retries therefore recover an existing
operation instead of creating a second payout. the activity trail exposes the
next required action, while technical proof remains available for review
without making it a prerequisite for ordinary trade users.
