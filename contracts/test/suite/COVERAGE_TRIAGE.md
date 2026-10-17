# Coverage triage, contract suite

Every branch in the suite outside the CRE build's contracts is taken by a test. Run
`scripts/ops/forge-remote.sh --coverage`: it lists each branch no test takes as
`file:line (block.branch)`. Seven lines remain on that list, and each is explained below. A new
line on the list must get a test or a row here with its reason.

Coverage builds with `--ir-minimum`, since the escrows only compile through via-IR, and Foundry
warns that its source maps are then inexact. Six of the seven are branches that tests do take but
that the map credits to the wrong place. The mutation campaign is the stronger check for those
lines: a mutant that removes or flips the condition must be caught.

## Taken, but not credited

| Branch | Taken by |
|---|---|
| `KarwanJobEscrow.sol:110 (1.1)`, `reject` for a job that is not a bounty | `test_the_evaluator_rejects_a_funded_job_and_it_is_refunded_at_once`, `test_the_client_rejects_an_open_job` |
| `KarwanJobEscrow.sol:123 (2.1)`, `claimRefund` for a job that is not a bounty | `test_a_funded_job_nobody_submitted_expires_into_a_refund` |
| `AgreementDisputeLib.sol:33 (1.1)`, a dispute opened by someone other than the buyer | `test_seller_disputes_a_deposit_only_before_the_buyer_can_reclaim`, `test_the_seller_disputes_a_delivery_before_the_buyer_could_reclaim` |
| `AgreementDisputeLib.sol:35 (3.1)`, a dispute opened by neither party | `test_a_dispute_needs_a_delivery_and_a_party` |
| `AgreementLib.sol:152 (8.1)`, a plan the seller never accepted, ended on the buyer's record alone | `test_a_plan_the_seller_never_accepted_refunds_in_full`, `test_an_unaccepted_plan_ends_on_the_buyers_record_alone` |
| `SettlementLib.sol:202 (9.1)`, funding a deal with no pledge | Every funding without a pledge, among them `test_per_deal_cap_is_snapshotted_total_cap_is_live` |

## Not reachable

| Branch | Why no test can take it |
|---|---|
| `AgreementDeliveryLib.sol:46 (4.0)`, starting review by hand on terms whose review starts at delivery | On those terms `markDelivered` always starts the review in the same call, so a delivered deal never has a review still to start; the earlier check on line 45 refuses first, with `BadState` (`test_buyer_cannot_start_review_on_delivery_terms`). The check stays so the rule holds even if the order of the checks changes. |
