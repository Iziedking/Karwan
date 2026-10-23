# Slither triage: contracts/src/suite

Slither from `trailofbits/eth-security-toolbox`, run with `scripts/ops/forge-remote.sh --slither`
(101 detectors). Plan 2b closed at 60 accepted findings. Plan 3 added the stake vault, Trade finance
and the Agreement seller stake, and after its review fixes the run reported 72. Plan 4 added the yield pool and
deal money parked in it, and after its review fixes the run reported 94. Plan 5 added the Time family, and its
run reports 134, all accepted below. Plan 7b-2 removed the unused `_account` from the settlement base,
and its dead-code finding with it. Every new finding must be fixed or added
here with a reason before a release.

## Fixed

| Detector | Location | Fix |
|---|---|---|
| reentrancy-no-eth | `KarwanSettlementBase._fund` (now `SettlementLib.fund`) | The agent allowance is counted after the deal's books are written, so no state changes after the call to the identity registry |
| missing-inheritance | `KarwanRecord` | Inherits `IKarwanRecord`, so the compiler checks the interface the families call |
| unindexed-event-address | `KarwanHub.Wired` | Addresses indexed |
| missing-inheritance | `KarwanAgreementEscrow` | Inherits `ICheckTarget`, so the compiler checks the call the verifier makes |
| reentrancy-events | `AgreementLib` `_payTranche`, `cancelUnaccepted`, `reclaim`, `split` | `DealSettled`, `DealCancelled`, `DealReclaimed` and `SplitSettled` are emitted before the outcomes are written to the record |
| reentrancy-events | `AgreementLib.payPart` | `PartPaid` is emitted before the part is pulled |
| reentrancy-events | `SettlementLib.pledge` | `Promised` is emitted before the agent's limits are charged in the identity registry |
| unused-return | `AgreementLib.acceptSplit` | `DisputeLib.drop` returns nothing; a caller that needs the dispute's opening time reads it first |
| assembly | `AgreementDeliveryLib._revert` | Plain `revert` statements replace the assembly that re-threw an error selector |
| unused-return | `KarwanTradeFinance.settle` | Settling reads the assigned amount too, so a line whose assignment was replaced is waived |
| reentrancy-events | `SettlementLib` `payTo`, `payFee`, `payLongstop` | `Paid` and `FeePaid` are emitted before the money is delivered, and the long-stop closes the account before it pays out |
| unindexed-event-address | `KarwanYieldPool.Stopped` | `by` indexed |
| missing-zero-check | `KarwanYieldPool` constructor | The hub and the asset must be set |

## Accepted

| Detector | Count | Location | Why it stands |
|---|---|---|---|
| timestamp | 67 | identity registry, record, stake vault, `TimeLib`, `JobLib`, `BountyLib`, `SettlementLib`, `DisputeLib`, `AgreementCommon`, `AgreementLib`, `AgreementDeliveryLib`, `AgreementTermsLib`, the base's `_requireNotHeld` | Intended clocks: signature deadlines, agent expiry, recovery delay, fact expiry, holds, horizons, the long-stop, accept deadlines, delivery deadlines, review windows, extensions, the cap on a late review start, the cutoff for a late failed check, instalment due times, a late last part, the dispute windows, stake withdrawal cooldowns, reservation expiries, the check that a reservation still stands before Trade finance slashes it, the 3 days a deal must be able to run to take yield, and a Time engagement's cycle starts and ends, claim graces, the review windows that follow them, notice counted from the cycles started, the cycle an end request belongs to, an offer's acceptance deadline and the 30 days an amendment waits for the other side, and a job's expiry, review window after submission and 3 days to dispute a rejection, and a bounty's entry and award deadlines. Windows are set in hours or days, far beyond the seconds a block producer can shift |
| dead-code | 11 | `KarwanSettlementBase` `_open`, `_addPayee`, `_markConsent`, `_fund`, `_pledge`, `_payTo`, `_payFee`, `_close`, `_extendHorizon`, `_requireNotHeld`, `_recordOutcome` | Internal paths of the abstract base for families that keep their rules in the contract. `TestFamily` uses them; the Agreement family calls `SettlementLib` directly from its own libraries |
| reentrancy-events | 18 | `SettlementLib.fund`, `AgreementLib.fund`, `SettlementLib.payLongstop` (2), `SettlementLib.recordOutcome`, `AgreementCommon.releaseStake`, `AgreementCommon.slashStake`, `AgreementCommon.keepStake`, `SettlementLib.payTo` (2), `SettlementLib.payFee`, `SettlementLib._pull`, `AgreementLib` `_payTranche`, `cancelUnaccepted`, `cancelMissed`, `reclaim`, `split`, `AgreementDisputeLib._ruleTranche` | `Funded` and `DealFunded` follow the identity registry and the token pull; `LongstopSplit` and `RecordPending` follow the record. A payout of an eligible deal first brings back what is parked beyond the family's new target, and a payout the family cannot cover from its own balance withdraws the rest from the asset's yield pool, which the hub points at once and which calls only its Teller; `YieldPulled` and `PayoutCredited` report how that withdrawal went, and the Agreement exits' events follow `payTo` and `close`, which must run once the deal is paid out. Every callee is trusted (registry, record and pool set once, the asset allowlisted through the timelock), the deal's books are written before each call, and every entry point that moves money is `nonReentrant`. `StakeHookFailed` reports a vault call that failed, so it can only follow that call |
| calls-loop | 3 | `SettlementLib._appendPayee`, `SettlementLib.recordOutcome` | At most 8 payees, each looked up in the identity registry wired at deploy. Record writes go to the record wired at deploy; a failure is kept for `retryRecord`, so the loop cannot be blocked |
| uninitialized-local | 13 | `SettlementLib.payTo.cut`, `KarwanRecord.validFactsOf.n`, `KarwanCheckVerifier.report.last`, `AgreementTermsLib.validate.sum`, `AgreementLib.cancelMissed.toSeller`, `KarwanTradeFinance.settle.fromStake`, `KarwanYieldPool._subscribe.room`, `KarwanYieldPool.setTeller.nextShare`, `TimeLib._endAfter.refund`, `BountyLib.open.sum`, `BountyLib._pay` `paid`, `fee`, `toWinners` | Start at zero by design. `last` is the previous signer, and zero is below every address, so signers must be strictly ascending. `toSeller` stays zero when no cancellation fee is due, `fromStake` when the reservation has expired or been freed, `room` when the Teller cannot say how much it takes, `nextShare` when the pool goes back to cash only, `refund` before it adds up the cycles a notice refunds, and a bounty's sums before they add up its shares and payouts |
| incorrect-equality | 7 | `KarwanYieldPool` `_ensureCash`, `_entryCost`, `_subscribe`, `sweepYield`, `value`, `_sharesWorth`, `TimeLib.giveNotice` | Each compares a share count, an amount or a count of cycles started with zero. No balance is compared for equality with an expected value |
| reentrancy-balance | 2 | `KarwanYieldPool.sweepYield` | The yield and the cash are read again after the Teller redemption, before anything is paid, and the amount is capped by the cash then held above the buffer |
| unused-return | 9 | `SigCheck.isValid`, `AgreementCommon.slashStake`, `TimeDisputeLib` and `JobDisputeLib` `executeRuling`, `rule`, `applyFallback` | The third value of `ECDSA.tryRecover` (the error argument) is not needed; the error kind is checked, once per signature format (65 and 64 bytes). The amount a stake slash paid is emitted by the vault itself. The opening time `DisputeLib` returns is not needed by Time or Jobs: unlike an Agreement deadline, a cycle's clocks and a job's do not move by the length of a dispute, and a disputed job ends with the ruling |
| missing-inheritance | 1 | `KarwanAgreementEscrow` and `IFinanceable` | The functions Trade finance calls live in the settlement base; inheriting the interface would need overrides in both. Trade finance calls through the interface, and `TradeFinance.t.sol` exercises every one of them |
| cyclomatic-complexity | 1 | `AgreementTermsLib.validate` | One condition per term, in one place; instalment rules sit in their own `_checkParts`. Splitting further would scatter the list of rules a deal must meet; `AgreementTerms.t.sol` tests the refusals |
| missing-zero-check | 1 | `KarwanHub.setAutoArbiter` | Zero is a documented setting: automatic proposals off, disputes go straight to the reviewer |
