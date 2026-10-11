# Slither triage: contracts/src/suite

Slither from `trailofbits/eth-security-toolbox`, run with `scripts/ops/forge-remote.sh --slither`
(101 detectors). The first run reported 31 findings, and three were fixed in the source. The
review fixes added four internal base paths, each reported as dead code, and compact signature
support added a second `tryRecover` call, so the current run reports 33, all accepted below.
Every new finding must be fixed or added here with a reason before a release.

## Fixed

| Detector | Location | Fix |
|---|---|---|
| reentrancy-no-eth | `KarwanSettlementBase._fund` | The agent allowance is counted after the deal's books are written, so no state changes after the call to the identity registry |
| missing-inheritance | `KarwanRecord` | Inherits `IKarwanRecord`, so the compiler checks the interface the families call |
| unindexed-event-address | `KarwanHub.Wired` | Addresses indexed |

## Accepted

| Detector | Count | Location | Why it stands |
|---|---|---|---|
| timestamp | 13 | identity registry, record, settlement base | Intended clocks: signature deadlines, agent expiry, recovery delay, fact expiry, holds, horizons and the long-stop. Every window is hours or days, far beyond what a block producer can shift |
| dead-code | 10 | `_open`, `_fund`, `_payFee`, `_close`, `_extendHorizon`, `_requireNotHeld`, `_addPayee`, `_markConsent` and their helpers `_appendPayee`, `_checkHorizon` | Internal paths of an abstract base that the escrow families call. They are used by `TestFamily` and will be by every family |
| unimplemented-functions | 1 | `KarwanSettlementBase` | `_onLongstop` is deliberately left to each family |
| calls-loop | 2 | `_recordOutcome` inside `longstopSplit` | At most 9 calls (payer and up to 8 payees), to the record wired once at deploy. A failure is kept for `retryRecord`, so the loop cannot be blocked |
| reentrancy-benign | 1 | `_recordOutcome` | The only call is to the record wired once at deploy; the pending entry is written only when that call failed |
| reentrancy-events | 1 | `_fund` | `Funded` is emitted after the identity registry and the token transfer. Both are trusted (the registry wired at deploy, the asset allowlisted through the timelock), and every family entry point is `nonReentrant` |
| uninitialized-local | 2 | `_payTo.cut`, `validFactsOf.n` | Start at zero by design |
| unused-return | 2 | `SigCheck.isValid` | The third value of `ECDSA.tryRecover` (the error argument) is not needed; the error kind is checked. One call per signature format (65 and 64 bytes) |
| missing-zero-check | 1 | `KarwanHub.setAutoArbiter` | Zero is a documented setting: automatic proposals off, disputes go straight to the reviewers |
