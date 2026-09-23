# Karwan escrow: terms-driven deal design

Status: design for review, 2026-09-23. Not deployed. This is the mainnet escrow that replaces the
current `KarwanEscrow` at Stage B of the mainnet rollout. Nothing in it is live until it passes
internal audit rounds 1 and 2 and the go/no-go review.

## 1. The idea in one paragraph

Two people agree terms. The terms are the deal: price, milestones, delivery date, how long the
buyer has to check each delivery, how much extra time the buyer may ask for, what happens if
somebody goes quiet, and whether the last payment can release on a timer. The contract stores
those terms when the deal is funded, the seller confirms the exact same terms on-chain, and from
then on every clock and every payout follows them. Nobody can change them afterwards, including
Karwan. People step in at a small number of named points (a dispute ruling, a safety hold, a
configuration change), each with limits written into the contract.

## 2. Principles

1. **The terms are the program.** No deal behaviour comes from a platform setting that the two
   parties did not see. Platform settings only bound what terms may say.
2. **Both sides consent to the same bytes.** The seller accepts with the hash of the terms the
   buyer funded. A mismatch reverts.
3. **Every deal can end without Karwan.** From any live state there is a path to a final state
   that uses only the two parties and time. Admin action can make it faster or fairer, never
   necessary.
4. **Admin can pause or rule, never take.** No role can send deal money anywhere except to the
   deal's own parties (or a financier the seller assigned, or the fee treasury).
5. **Exits never pause.** An emergency pause stops new deals. It never blocks a release, claim,
   refund or reclaim.
6. **Money is exact and conserved.** USDC in equals USDC out, per deal and in total, at every
   step.
7. **One job per contract.** The escrow does not route yield. Yield, if it comes back, is a
   separate contract with its own audit (Stage D).

## 3. Who holds what (mainnet wallet model)

| Party | Wallet | Custody |
| --- | --- | --- |
| Email users | Circle Modular Wallet (passkey smart account) | The user's own key. Karwan cannot sign for it. |
| Web3 users | Their own wallet | The user's own key. |
| Agents (optional) | Circle Developer-Controlled Wallet | Operated by Karwan, only inside allowances the user sets, and only for actions the user delegated. |
| Deal money | The escrow contract | Only the contract's rules release it. |

The contract already records two addresses per side, the acting wallet and the identity wallet,
and either can drive the deal (`_isBuyer`, `_isSeller`). On mainnet the identity wallet is the
user's own passkey or web3 wallet. So even when an agent opened the deal, the human can always
release, dispute, claim or reclaim from their own key.

## 4. Deal terms

Stored once at funding. `termsHash = keccak256(abi.encode(terms))` is stored with the deal and
emitted in `DealTermsSet`.

| Field | Meaning | Bounds (checked at fund) |
| --- | --- | --- |
| `seller` | Seller wallet | not zero, not the buyer's identity |
| `amount` | Deal price, USDC 6 decimals | `0 < amount <= dealCap` and `outstanding + amount <= totalCap` |
| `milestonePcts` | Share of the price per milestone | 1 to 5 entries, sum 100 |
| `reservationBps` | Seller stake reserved as insurance | 0, or 5000 to `maxReservationBps` |
| `deliveryDeadline` | When the next undelivered milestone is late | 0 (open) only below `highValue`; otherwise now < d <= now + horizon |
| `reclaimGrace` | Seller's last chance after the deadline | <= 30 days |
| `reviewWindow` | Buyer's time to check each delivery | `minReview` to `maxReview` |
| `reviewStarts` | `ON_DELIVERY`, `ON_ARRIVAL` for physical goods, or `ON_CHECK_PASS` when a delivery check is agreed (section 13) | |
| `checkPolicy` | The delivery check plan's policy ID and version, built from the terms | required when `ON_CHECK_PASS` |
| `checkLongstop` | Review starts anyway this long after delivery if the check never answers | required when `ON_CHECK_PASS`, <= 14 days |
| `arrivalLongstop` | For `ON_ARRIVAL`: review starts anyway this long after delivery if the buyer never confirms arrival | required when `ON_ARRIVAL`, <= 120 days |
| `maxExtensions` | How many times the buyer may ask for more review time | 0 to 3 |
| `extensionSecs` | Length of each extension | <= `reviewWindow` |
| `finalRelease` | `ON_TIMER`: seller can claim the last milestone after review. `BY_BUYER`: last milestone needs the buyer, the arbiter, or the longstop | `BY_BUYER` required at or above `highValue` |
| `silentLongstop` | If the buyer neither releases nor disputes, the seller can claim this long after delivery, even under `BY_BUYER` or a missing evidence check | `reviewWindow` + all extensions <= longstop <= 180 days |
| `evidenceRequired` | Timer claims need a passing delivery check (guardian attestation) | required at or above `highValue` |
| `agreementHash` | Digest of the full signed off-chain agreement (scope, files, legal text) | not zero |

Platform bounds (`minReview`, `maxReview`, `highValue`, `dealCap`, `totalCap`, `maxReservationBps`,
horizon) are set at deploy. `dealCap`, `totalCap` and `highValue` can change later only through
the owner Safe and a timelock, and only affect deals funded afterwards.

## 5. Deal types are presets, not code paths

The contract has one state machine. Deal types are term presets the app fills in and both sides
can edit before funding. Testnet presets use short clocks so a whole deal fits in one sitting,
and the app says so on every deal.

| Preset | Review starts | Review | Extensions | Final release | Evidence | Mainnet defaults |
| --- | --- | --- | --- | --- | --- | --- |
| Service or freelance work | delivery | 3 days | 2 x 2 days | timer | optional | longstop 14 days |
| Digital goods, files, accounts | delivery | 2 days | 1 x 2 days | timer | recommended | longstop 10 days |
| Physical goods | arrival | 5 days | 2 x 3 days | buyer | optional | arrival longstop 45 days, longstop 60 days |
| Business order, Net 30/60/90 | delivery | net term | 1 x 7 days | buyer | recommended | longstop net + 30 days |
| High value (at or above `highValue`) | preset | preset | preset | buyer (forced) | required (forced) | preset |
| Testnet demo (any preset) | as preset | 5 minutes | 1 x 5 minutes | as preset | as preset | longstop 30 minutes |

Individuals and businesses use the same presets. A business account changes what the app
suggests (net terms, arrival review), not what the contract allows.

## 6. Lifecycle

```
            fund(terms)                 accept(termsHash)
   None ───────────────▶ Funded ───────────────────────▶ Accepted
                          │  │                              │
       buyer refund ◀─────┘  └── deadline passes,           │ markDelivered(i)
       (pre-accept only)         no accept: buyer reclaims  ▼
                                                     Delivered(i) ── confirmArrival (goods)
                                                       │   │   │
                         buyer release(i) ◀────────────┘   │   └──── requestMoreTime (≤ maxExtensions)
                         seller claim(i) after review ◀────┘
                                   │                      dispute ─────▶ Disputed
                                   ▼                                     │  │  │
                        next milestone, or Settled                       │  │  └─ lapse after disputeTimeout:
                                                                         │  │     back to Delivered(i) or
                   deadline + grace, nothing delivered:                  │  │     Accepted, delivery kept
                   buyer reclaims ─▶ Reclaimed                           │  └─ mutual cancel split
                                                                         └─ automatic ruling proposed
                                                                             ├─ no appeal: applies ─▶ Split
                                                                             └─ escalated: admin review
                                                                                (1 of 4) rules ─▶ Split
```

Final states: `Settled`, `Refunded`, `Reclaimed`, `Split`. They are absorbing: nothing moves out.

### Who can do what

| Action | Who | When | Effect |
| --- | --- | --- | --- |
| `fund(jobId, terms)` | buyer | `None`, not paused, within caps | stores terms, pulls `amount + buyer fee share` |
| `accept(jobId, termsHash)` | seller | `Funded`, hash matches | reserves stake if any, snapshots identities |
| `refund(jobId)` | buyer | `Funded` (seller never accepted) | full refund |
| `markDelivered(jobId, i, proof)` | seller | `Accepted`, milestone `i` is next, not past deadline + grace | starts review, or waits for arrival |
| `confirmArrival(jobId, i)` | buyer | goods deal, delivered | review clock starts now |
| `requestMoreTime(jobId, i)` | buyer | in review, extensions left | review end moves by `extensionSecs` |
| `release(jobId, i)` | buyer | milestone `i` delivered or not | pays milestone `i` |
| `claim(jobId, i)` | seller | review over, not held, rules in section 7 | pays milestone `i` |
| `reclaim(jobId)` | buyer | deadline + grace passed, nothing pending review | returns unreleased funds, slashes stake pro rata |
| `extendDeadline(jobId, t)` | buyer | any live state | deadline only moves later |
| `requestExtension` / `approveExtension` | seller / buyer | before deadline | seller asks, buyer grants, capped at 3 |
| `dispute(jobId, reason)` | either side | live, and that side has not already disputed this milestone | freezes clocks |
| `lapseDispute(jobId)` | either side | `disputeTimeout` passed | back to where it was, delivery kept, clocks credited |
| `proposeSplit` / `acceptSplit` | either side / the other | `Accepted`, `Delivered` or `Disputed` | agreed split of the unreleased amount |
| `proposeRuling(jobId, sellerBps, rulingHash)` | automatic arbiter | `Disputed` | records a proposed split; it takes effect after `appealWindow` unless a side escalates |
| `executeRuling(jobId)` | anyone | appeal window passed, no escalation | applies the proposed split |
| `escalate(jobId)` | either side | proposed ruling pending, inside `appealWindow`; or dispute older than `autoRulingSla` with no proposal | moves the dispute to admin review |
| `rule(jobId, sellerBps, rulingHash)` | admin review Safe (1 of 4, or 2 of 4 at or above `highValue`) | escalated | final split of the unreleased amount between the parties only |
| `hold(jobId, reason)` / `releaseHold` | guardian | delivered | pauses seller claims, bounded by `holdBudget` |
| `attest(jobId, i, pass, evidenceHash)` | guardian | delivered | pass can shorten review toward `attestedWindow`, fail places a hold |

## 7. Clock rules

- **Review end** = review start + `reviewWindow` + extensions used + guardian hold time.
  Review start is the delivery time, or for `ON_ARRIVAL` the earlier of the buyer's arrival
  confirmation and `delivery + arrivalLongstop`.
- **Seller claim on a milestone before the last:** after review end, if not held, and if
  `evidenceRequired`, only with a passing attestation for that delivery. Without one, only after
  `delivery + silentLongstop`.
- **Seller claim on the last milestone:** as above under `ON_TIMER`. Under `BY_BUYER`, only after
  `delivery + silentLongstop` with no open dispute.
- **Buyer release** is always allowed while live. It is the buyer's money to give.
- **Deadline reclaim** needs nothing pending review. A delivery made on time is never wiped by a
  lapsed dispute. A mark made during the grace period stays wiped on lapse, so a
  late seller cannot stall the buyer.
- **Disputes freeze every clock.** On lapse, the delivery deadline moves by the frozen time
  unless the delivery was late, and the review restarts with its remaining time.
- **One dispute per side per milestone.** After a side's dispute lapses, that side cannot open
  another on the same milestone. The arbiter had the full timeout to act. This ends the
  repeated-dispute stall.

Liveness bound: every live deal reaches a final state using only party actions within
`deadline + grace + silentLongstop + 2 * disputeTimeout + holdBudget`. Automatic rulings and
escalation shorten real deals; the lapse path keeps the bound even if both tiers go silent. The invariant suite
checks this bound.

## 8. People in the loop

Karwan covers individuals and businesses, small and large deals. The admin role is intentional:
present where judgement is needed, absent everywhere else, and bounded in the contract.

| Role | Held by | Can | Cannot |
| --- | --- | --- | --- |
| Automatic arbiter | Dispute engine key operated by the backend | propose a ruling on a disputed deal from the terms and the evidence | make a ruling take effect before the appeal window ends, rule on an escalated dispute, pay anyone but the parties |
| Admin review | Two Safes with the same 4 named reviewers: 1 of 4 below `highValue`, 2 of 4 at or above it | rule an escalated dispute: split the unreleased amount between the two parties, with a ruling hash | touch disputes that were not escalated, pay anyone else, change terms |
| Guardian | Security agent key, separate from every Safe signer | hold a delivered milestone (bounded, 30-day ceiling), attest a delivery check, pause new deals | move money, extend a hold past its budget, block buyer exits |
| Owner | Safe, 2 of N, behind a 48-hour timelock | set arbiter, guardian, fee (under the immutable 10% cap), caps, `highValue`, financier assigners, unpause | move deal money, change a funded deal |
| Operator | Backend relayer | submit transactions for users who delegated to an agent | anything a party did not authorise |

Critical transactions and the humans on them:

1. **Dispute rulings, in two tiers.**
   - *Automatic.* The dispute engine reads the terms, the on-chain clocks and the delivery
     evidence and proposes a split (for example: nothing delivered by the deadline, full refund;
     delivery passed the check and the buyer gave no reason, seller paid). The proposal and its
     reason are shown to both sides and take effect after `appealWindow` (proposed 72 hours on
     mainnet, 10 minutes on testnet) unless one side escalates. Most disputes end here with no
     human.
   - *Admin review.* A side escalates, or the engine cannot decide and escalates itself. One of
     the four admin reviewers signs the final ruling; at or above `highValue`, two of the four
     must sign. The reason is published to both sides and the ruling hash goes on-chain. An
     escalated dispute cannot go back to the automatic tier.
2. **High-value deals** (at or above `highValue`). The contract forces `BY_BUYER` final release
   and a delivery check, so a large final payment never releases on a bare timer. If the buyer
   goes quiet, the seller is paid at the longstop, and the arbiter gets an alert before then.
3. **Configuration.** Timelocked, evented, and only for future deals.
4. **Emergency.** The guardian can stop new deals at once. Only the owner Safe can resume.
   Existing deals keep every exit.
5. **Agent-signed money actions.** Off-chain policy: an agent may release or fund only inside
   the user's allowance. Above the user's per-deal limit the app asks the human, and the
   human's own wallet signs.

The backend alerts the admin reviewers on every escalation at once, at half of
`disputeTimeout`, and one day before a lapse becomes possible.

**Why 1 of 4 is acceptable below `highValue`, and why large deals need 2.** Admin review only
ever sees escalated disputes, it can only split money between the two parties of that deal, and
every ruling is public with its reason. The risk left is one compromised or careless reviewer
favouring one side of one escalated deal. Below `highValue` that risk is bounded by the per-deal
cap. At or above it, two of the four reviewers must sign (decided 2026-09-23). The contract
stores both Safe addresses and picks the one the deal's amount requires; the same four people
own both Safes.

## 9. Money handling

- **Payouts never brick a deal.** Each payout leg is attempted as a transfer. If the recipient
  cannot receive (Arc reverts USDC transfers to blocklisted addresses), the amount is credited
  to `owed[recipient]` and the rest of the settlement completes. The recipient can later call
  `withdrawOwed(to)` to send it to their identity wallet.
- **Caps for the guarded beta.** `dealCap` and `totalCap` are checked at funding. Proposed first
  values: 1,000 USDC per deal and 25,000 USDC in total. Raised by the owner Safe through the
  timelock after each clean period.
- **Fees** are snapshotted per deal at funding, capped at 10% by an immutable constant, and split
  between buyer and seller as today.
- **Financing** keeps the current assignment design: a financier assigned by an authorised
  finance contract is paid first from the seller's side, once, irrevocably.
- **No yield routing.** `sweepIdle`, the backstop and `atTreasury` are removed. This also frees
  the bytecode room the terms need.

## 10. What changes from the current escrow

| Current | New | Why |
| --- | --- | --- |
| Review window is one number passed at funding by our backend | Full terms struct, seller accepts the hash | Terms are consented on-chain, not only off-chain |
| Lapsed dispute wiped any delivery | On-time delivery survives | A buyer could otherwise dispute, wait out the timeout and reclaim an on-time delivery |
| Unlimited disputes | One per side per milestone | Repeated disputes could stall an on-time seller |
| "More time" existed only in our database | `requestMoreTime` on-chain, capped by the terms | The seller's on-chain claim ignored the extension |
| Final milestone claimable on a timer, terms said otherwise | `finalRelease` is a term, forced to `BY_BUYER` for high value, longstop prevents traps | The rule has to be the same in the contract and the terms |
| Push payments | Push, with credit on failure | Arc reverts transfers to blocklisted addresses, which would freeze the whole settlement |
| No value limits | Per-deal and total caps | Guarded mainnet beta |
| Owner and guardian were one key | Separate: owner Safe with timelock, admin review Safe, guardian key | No single key should both configure and guard |
| Yield routing inside the escrow | Removed | One job per contract, bytecode room |
| Goods transit floor enforced only by our backend | `ON_ARRIVAL` review on-chain with a longstop | Terms live in the contract |

The backend changes with it: the deal agreement produces the terms struct, the funding call
sends it, the watcher reads the on-chain clocks instead of computing its own, and the deal page
shows the contract's clocks.

## 11. Invariants the stress tests must hold

| ID | Invariant |
| --- | --- |
| I1 | `usdc.balanceOf(escrow) == sum(outstanding) + sum(owed)` after every call |
| I2 | For every final deal, paid to buyer + seller side + assignee + treasury + owed == funded |
| I3 | Final states are absorbing |
| I4 | `termsHash` never changes after accept |
| I5 | Every transfer recipient is the buyer, the seller, either identity wallet, the assignee or the treasury |
| I6 | No admin call changes a deal's balance except `executeRuling` after the appeal window or `rule` on an escalated dispute |
| I13 | A proposed automatic ruling never takes effect inside its appeal window, and never after an escalation |
| I7 | Pausing never blocks release, claim, refund, reclaim, lapse, split or withdraw |
| I8 | Deadlines and review ends only move later, except a passing attestation shortening review |
| I9 | An on-time delivery the buyer never disputes is paid to the seller by `silentLongstop` |
| I10 | A side opens at most one dispute per milestone |
| I11 | `sum(outstanding) <= totalCap` and each funding respects `dealCap` |
| I12 | Liveness: party-only actions reach a final state within the bound in section 7 |

## 12. How it gets verified

1. **Exploit-first unit tests** for every known attack and every row of the action table.
2. **Handler-based invariant tests** (Foundry): buyer, seller, arbiter, guardian and a stranger
   acting in random order with time jumps, checked against I1 to I12. Release candidates run at
   least 1,000,000 calls.
3. **Fuzzed terms**: every bound at, just inside and just outside its limit.
4. **Model check**: a small TypeScript model of the state machine runs the same random action
   sequences as the contract, and results must match. The deal page and watcher use that same
   model, so the product and the contract cannot drift.
5. **Static analysis in CI**: Slither and Aderyn, with a reviewed baseline.
6. **Mutation testing** on the escrow to prove the tests catch changed logic.
7. **Blocklist test** against Arc testnet's seeded blocklisted address.
8. **Rehearsal**: two full buyer, seller and dispute runs on testnet with mainnet presets, from
   the frozen commit.
9. **Internal audit round 2** on the frozen commit, then an external audit before caps rise.

## 13. Delivery verification: the deterministic check

This is what sets Karwan apart. Before a delivery reaches the buyer, a check reads the deal's
own terms and tests the delivery against them. Most of the check is fixed rules that give the
same answer every time. A small language model helps only where a rule cannot decide, and it
never has the final word on a failure. If the delivery passes, the buyer's own review starts. If
it fails, the seller is told exactly which term failed and why, and can deliver again.

### How the terms become the check

When both sides agree the terms, each clause that can be tested becomes a check in a
**check plan**, stored with the terms and bound into the terms hash (`checkPolicy` and its
version). A clause like "a merged pull request into `main` with a passing CI run" becomes
repository, branch, merge, required-check and submitter tests. A clause like "three PNG files,
at least 2000 px wide" becomes file-count, format and size tests. Clauses that cannot be tested
stay with the buyer's own review and are labelled that way on the terms card, so nobody mistakes
an unchecked clause for a checked one.

### The model

For a delivery `d` against terms `T`, the plan holds required checks `r_1 … r_n` and advisory
checks `a_1 … a_m`.

- Each required check is a deterministic predicate `r_i(d, T) ∈ {PASS, FAIL, UNAVAILABLE}`
  with a reason code. It reads only a pinned snapshot of the evidence (a commit SHA, a file
  hash, a fetched response with its timestamp), never a live moving source.
- **Verdict:** `PASS` if every `r_i` passes. `MISMATCH` if any `r_i` fails. `UNAVAILABLE` if
  none fails but at least one could not run.
- Advisory checks give scores `s_j ∈ [0, 1]` with weights `w_j`. The buyer sees
  `S = Σ w_j s_j / Σ w_j` and the individual results. `S` never gates payment on its own.
- **Reproducible:** the same terms, the same evidence snapshot and the same policy version give
  the same verdict. The evidence, criteria and verdict commitments and the policy version are
  recorded, so anyone holding the evidence can re-run the check and get the same answer.

### Where the small model sits

The model handles questions no rule can answer, such as "does this write-up cover the three
topics in the brief". Its output is held to a schema: a verdict, the clause it relates to, and a
short quoted reason. It can:

- add an advisory result;
- flag "needs the buyer's eyes", which passes the delivery to the buyer's review with the flag
  shown.

It cannot turn a passed required check into a failure, cannot fail a delivery on its own, and
cannot release or hold money. Prompts and outputs are logged with the policy version.

### Sandboxed checks (Chainlink CRE)

Some checks need secrets or must run code, so they run in a private sandbox rather than on our
servers. **GitHub delivery is built as a sandbox pilot on testnet.** A Chainlink CRE confidential
workflow pins the pull request's commit, checks the repository, base branch, merge state,
submitter and the required check run from a trusted app, and writes a receipt to
`KarwanEvidenceRegistry` holding only commitments, a decision code and a report ID. The GitHub
token and the criteria stay inside the sandbox.

- It is opt-in per deal. When the terms mention a repository, a pull request or GitHub, the app
  suggests it on the terms card and both sides confirm.
- It is a separate review step with its own status on the deal: Queued, Checking, Passed,
  Mismatch or Unavailable.
- Planned sandboxes, same pattern: a live website or API answering the agreed endpoints, data
  files matching an agreed schema, and build artefacts that compile and pass agreed tests. Each
  gets its own policy version and registry domain before it is offered.

### Outcomes

| Verdict | Buyer | Seller | Review clock |
| --- | --- | --- | --- |
| Pass | Sees the delivery, the checks that passed, and any advisory flags | Told it passed | Starts now |
| Mismatch | Told a delivery was tried and did not meet the terms, with the failed clauses; not shown the content | Told which clause failed and the reason code; can deliver again as a new revision | Does not start |
| Unavailable, or no answer by `checkLongstop` | Can choose "review it myself" and see the delivery | Told the check could not run | Starts when the buyer chooses, or at `checkLongstop` |
| Security flag (unsafe link or file) | Not shown the content | Told it was withheld and why | Held under the guardian hold budget |

A seller can re-deliver after a mismatch until the delivery deadline plus grace. The check never
shortens the buyer's rights: a pass starts the normal review, it does not skip it.

### How it binds to the escrow

- New term values: `reviewStarts = ON_CHECK_PASS`, `checkPolicy` (policy ID and version),
  `checkLongstop`.
- The escrow reads a pass from a trusted verifier: an `EvidenceRegistry` receipt for sandboxed
  checks, or a guardian attestation for server-side checks. The receipt must match the deal, the
  terms version and the delivery revision.
- A pass starts the review clock. A mismatch only records the result, so the seller can
  re-deliver. At `checkLongstop`, or when the buyer chooses to review it themselves, the review
  starts without a pass.
- The verifier can start or withhold a clock. It cannot pay, refund or change a split.
- The automatic dispute tier reads the same check results, so a dispute ruling and a delivery
  check never disagree about the facts.

### Added invariants

| ID | Invariant |
| --- | --- |
| I14 | No verifier, sandbox or model output moves money or changes a split |
| I15 | A mismatch never starts a review clock and never shortens any buyer right |
| I16 | A stalled check cannot trap a deal: the review starts by `checkLongstop` at the latest |
| I17 | The same terms, evidence snapshot and policy version always produce the same verdict (checked in CI by replaying recorded snapshots) |

### Built today and still to build

| Piece | State |
| --- | --- |
| GitHub rule set (`githubDeliveryPredicate`, policy `github-delivery-v2`) | Built, tested |
| CRE confidential workflow and `KarwanEvidenceRegistry` receipts | Built. The hosted workflow currently fails on the provider side, so testnet deals fall back to the buyer's own review |
| Buyer "review it myself" fallback | Live on testnet |
| Unsafe-link hold | Live on testnet |
| Terms-to-check-plan compiler for other deal kinds | Not built |
| Advisory score and model-assisted checks with a fixed schema | Not built |
| `ON_CHECK_PASS` review start in the escrow | Designed here, not built |

## 14. Decisions needed before the contract is frozen

1. `highValue` threshold (proposed 5,000 USDC) and the guarded-beta caps (proposed 1,000 per deal,
   25,000 total).
2. Preset default clocks in section 5.
3. Who the four admin reviewers are, kept separate from the owner Safe signers.
4. Whether pre-accept deals get a seller-acceptance deadline on-chain (proposed yes: buyer can
   reclaim if the seller never accepts by a term-set time).
5. Decided 2026-09-23: escalated deals at or above `highValue` need 2 of the 4 admin reviewers.
6. `appealWindow` and `autoRulingSla` on mainnet (proposed 72 hours and 5 days).
