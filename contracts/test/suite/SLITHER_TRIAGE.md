# Slither triage: contracts/src/suite

Slither from `trailofbits/eth-security-toolbox`, run with `scripts/ops/forge-remote.sh --slither`
(101 detectors). Plan 2a closed at 50 accepted findings. Plan 2b added the shared dispute library,
Agreement disputes, instalment plans, the signed release and pledged money. Its first run reported
61 findings; three were fixed in the source, and the base's new pledge path adds one more internal
path. The final review's fixes added two clock checks, moved a third into a helper, and their one
new event-order finding was fixed, so the current run reports 60, all accepted below. Every new finding must be fixed or added
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

## Accepted

| Detector | Count | Location | Why it stands |
|---|---|---|---|
| timestamp | 32 | identity registry, record, `SettlementLib`, `DisputeLib`, `AgreementCommon`, `AgreementLib`, `AgreementDeliveryLib`, `AgreementTermsLib`, the base's `_requireNotHeld` | Intended clocks: signature deadlines, agent expiry, recovery delay, fact expiry, holds, horizons, the long-stop, accept deadlines, delivery deadlines, review windows, extensions, the cap on a late review start, the cutoff for a late failed check, instalment due times, a late last part, and the dispute windows. Windows are set in hours or days, far beyond the seconds a block producer can shift |
| dead-code | 12 | `KarwanSettlementBase` `_account`, `_open`, `_addPayee`, `_markConsent`, `_fund`, `_pledge`, `_payTo`, `_payFee`, `_close`, `_extendHorizon`, `_requireNotHeld`, `_recordOutcome` | Internal paths of the abstract base for families that keep their rules in the contract. `TestFamily` uses them; the Agreement family calls `SettlementLib` directly from its own libraries |
| reentrancy-events | 4 | `SettlementLib.fund`, `AgreementLib.fund`, `SettlementLib.payLongstop`, `SettlementLib.recordOutcome` | `Funded` and `DealFunded` follow the identity registry and the token pull; `LongstopSplit` and `RecordPending` follow the record. Every callee is trusted (registry and record wired once at deploy, the asset allowlisted through the timelock), the deal's books are written before each call, and every entry point that moves money is `nonReentrant` |
| calls-loop | 3 | `SettlementLib._appendPayee`, `SettlementLib.recordOutcome` | At most 8 payees, each looked up in the identity registry wired at deploy. Record writes go to the record wired at deploy; a failure is kept for `retryRecord`, so the loop cannot be blocked |
| uninitialized-local | 5 | `SettlementLib.payTo.cut`, `KarwanRecord.validFactsOf.n`, `KarwanCheckVerifier.report.last`, `AgreementTermsLib.validate.sum`, `AgreementLib.cancelMissed.toSeller` | Start at zero by design. `last` is the previous signer, and zero is below every address, so signers must be strictly ascending. `toSeller` stays zero when no cancellation fee is due |
| unused-return | 2 | `SigCheck.isValid` | The third value of `ECDSA.tryRecover` (the error argument) is not needed; the error kind is checked. One call per signature format (65 and 64 bytes) |
| cyclomatic-complexity | 1 | `AgreementTermsLib.validate` | One condition per term, in one place; instalment rules sit in their own `_checkParts`. Splitting further would scatter the list of rules a deal must meet; `AgreementTerms.t.sol` tests the refusals |
| missing-zero-check | 1 | `KarwanHub.setAutoArbiter` | Zero is a documented setting: automatic proposals off, disputes go straight to the reviewer |
