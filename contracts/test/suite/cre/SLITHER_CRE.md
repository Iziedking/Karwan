# Slither triage: KarwanCreAdapter

Run on 15 October 2026 with `scripts/ops/forge-remote.sh --slither` (the
pinned eth-security-toolbox image), rerun the same day after the seal hold, the fee contract and the DRY kind were
added (whole repo: 151). These are the results that name the adapter or its interfaces. One
needed a code change: a revoke now clears the seal hold and emits before it
calls the record. None of the others is a risk.

| Detector | Where | Why it is not a risk | Pinned by |
|---|---|---|---|
| calls-loop (`hub.isFamily`) | `_keep`, validation loop | At most 8 calls per report (`MAX_CALLS`), to the hub, which the adapter trusts by construction. A batch that fails validation reverts as a whole before any keeper call runs. | `test_refuses_an_empty_batch_more_than_eight_calls_and_long_args`, `test_refuses_a_target_that_is_not_a_family` |
| calls-loop (family call) | `_keep`, call loop | Same bound. Each call is isolated: a revert is caught and reported, so one stuck deal never blocks the rest. | `test_a_batch_lands_due_calls_across_families_and_isolates_the_rest` |
| reentrancy-no-eth / reentrancy-benign / reentrancy-events | `_fact` write path (`issuedTo[id]`, `_holdOf[id]`, `sealHold`, `FactWritten` and a renewal's `FactRevoked` after `recordFact`) | The fact id comes back from `recordFact`, so these writes cannot move before it. `onReport` is callable only by the forwarder, and `reportUsed` is set before any external call, so re-entering the adapter cannot replay a report. The call goes to `hub.record()`, a suite contract registered at wiring. | `test_a_report_id_is_used_once`, `invariant_a_used_report_stays_used` |
| reentrancy-events | `_keep` (`KeepResult` after the family call) | As above. A family re-entering `onReport` would not be the forwarder. | `test_only_the_forwarder_can_report` |
| reentrancy-events | `_submit` (events after `verifier.report`) | As above. The verifier then calls the escrow's `attestCheck`, which is gated to that verifier. | `test_a_pass_through_cre_attests_and_starts_review` |
| return-bomb | `_keep` (revert data copied into `reason`) | Targets must be families registered on the hub through the timelock. Their reverts are short custom errors. Gas is capped per call (`KEEP_CALL_GAS`), and a pathological return only makes that one report run out of gas, with nothing paid. The next tick sends a fresh report. | `test_refuses_a_target_that_is_not_a_family` |
| timestamp | `KarwanCreFees.release` and `refund` (`openedAt + REFUND_AFTER`) | The window is an hour. A few seconds of validator drift only moves when a payer can take an unanswered fee back. | `test_with_no_answer_anyone_refunds_the_payer_after_an_hour` |
| timestamp | `_fact` seal hold (`hold.expiresAt > block.timestamp`) | Facts last a year. A few seconds of validator drift only moves when an expired hold frees, by those seconds. | `test_an_expired_fact_frees_the_account_seal` |
| timestamp | `onReport` age window | The window is an hour, with 5 minutes of skew allowed. A validator's few seconds of drift cannot make a stale report fresh in any useful way. | `test_a_report_older_than_an_hour_or_too_far_ahead_is_refused`, `test_a_failed_transmission_retried_after_an_hour_is_refused` |
| assembly | `_metadata` | Three fixed-offset calldata loads after the length check. The name word is masked to its 10 bytes, so the owner bytes that follow cannot change the comparison. | `test_metadata_must_be_62_or_64_bytes`, `test_forged_owner_id_or_name_is_refused` |
| low-level-calls | `_keep` | Deliberate. The selector comes from a fixed list, the args are at most 64 bytes, the target is a registered family, and no value is sent. | `CreAdapterKeep.t.sol` |
| missing-inheritance | `KarwanAgreementEscrow` should inherit `IAgreementDeals` | `IAgreementDeals` is the adapter's one-function view of the escrow, declared in the adapter so the suite contract stays unchanged. | n/a |
| missing-inheritance | `KarwanCreFees` should inherit `IKarwanCreFeesRelease` | The interface is the adapter's one-function view of the fee contract; inheriting it changes nothing. | n/a |
| missing-inheritance | `KarwanRecord` should inherit `IKarwanRecordFacts` | `IKarwanRecordFacts` is the adapter's narrow view of the record. Making the record inherit it would mean editing a deployed-once suite contract for no behaviour change. | n/a |

Mutation check, same day: with the one-result guard in `_check` switched off,
`invariant_one_verdict_per_delivery` (2 approvals for one delivery) and
`invariant_escrow_check_matches_the_approved_result` both failed. They pass
with the guard in place.
