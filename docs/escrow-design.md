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
| `reviewStarts` | `ON_DELIVERY`, or `ON_ARRIVAL` for physical goods | |
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
| `rule(jobId, sellerBps, rulingHash)` | admin review Safe (1 of 4) | escalated | final split of the unreleased amount between the parties only |
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
| Admin review | Safe, 1 of 4 named reviewers | rule an escalated dispute: split the unreleased amount between the two parties, with a ruling hash | touch disputes that were not escalated, pay anyone else, change terms |
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
     the four admin reviewers signs the final ruling. The reason is published to both sides and
     the ruling hash goes on-chain. An escalated dispute cannot go back to the automatic tier.
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

**Why 1 of 4 is acceptable here, and what bounds it.** Admin review only ever sees escalated
disputes, it can only split money between the two parties of that deal, and every ruling is
public with its reason. The risk left is one compromised or careless reviewer favouring one side
of one escalated deal. Two limits keep that small: the per-deal cap during the guarded beta, and
a proposed rule that escalated deals at or above `highValue` need a second reviewer's
co-signature. Decision 5 in section 13 asks whether to keep that second rule.

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

## 13. Decisions needed before the contract is frozen

1. `highValue` threshold (proposed 5,000 USDC) and the guarded-beta caps (proposed 1,000 per deal,
   25,000 total).
2. Preset default clocks in section 5.
3. Who the four admin reviewers are, kept separate from the owner Safe signers.
4. Whether pre-accept deals get a seller-acceptance deadline on-chain (proposed yes: buyer can
   reclaim if the seller never accepts by a term-set time).
5. Whether escalated deals at or above `highValue` need a second admin reviewer (proposed yes).
6. `appealWindow` and `autoRulingSla` on mainnet (proposed 72 hours and 5 days).
