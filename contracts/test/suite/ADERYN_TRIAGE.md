# Aderyn triage, contract suite

Aderyn 0.6.8, run with `scripts/ops/forge-remote.sh --aderyn` over `src/suite`, is the
second static analyser next to Slither. Every finding is accepted below with its reason.
A new finding must be fixed or added here with one. Findings in the CRE build's contracts
(`KarwanCreAdapter`, `KarwanCreFees`, `IKarwanCreAdapter`) are that build's to explain: its
Slither findings are in `cre/SLITHER_CRE.md`, and its Aderyn findings are still being
triaged there. The counts below cover the rest of the suite.

## High

| Detector | Instances | Where | Why it stands |
|---|---|---|---|
| Reentrancy: state change after external call | 33 | The hub, the identity registry, the record, the settlement base and `SettlementLib`, the stake vault, Trade finance, the yield pool, `AgreementLib`, `BountyLib` | Every call is to a contract fixed at deployment or set through the timelock (the identity registry, the record, the stake vault, the yield pool and its Teller, a registered family), never to a deal party. Every entry point that moves money is non-reentrant, and the deal's books are written before any transfer. The same calls are triaged under Slither's reentrancy classes |
| Storage array edited with memory | 3 | `TimeLib` `approve`, `settle`, `object` | Each passes a cycle's stored terms to `grossOf`, which reads a copy and writes nothing back |
| Unsafe casting of integers | 4 | `AgreementDeliveryLib.nextTranche`, `SettlementLib.setRecordValue`, `TimeLib._finish` | Each value is bounded by the 128-bit field it comes from: a tranche's cut of `sellerNet` and `feeTotal`; the value `setRecordValue` is given by each caller, Time's `paidGross`, a job's `gross` and a bounty's `paid` and per-winner `gross`, each paid out of a 128-bit deal balance first; and a cycle's unused budget |

## Low

| Detector | Instances | Where | Why it stands |
|---|---|---|---|
| Centralization risk | 21 | The hub's owner-only setters, the yield pool's hub-owner settings | The owner is the timelock, with a 48-hour delay the guardian can cancel; no setter reaches a live deal's money |
| Internal function used only once | 2 | `AgreementCommon.stakeExpiry`, `TimeLib.cycleStart` | Named for what they compute, where they are read |
| Large numeric literal | 9 | Bounds and windows such as `10_000`, `730 days`, `5_000e6` | Written with separators and named where they are declared |
| Literal instead of constant | 3 | The default job terms, the pending-record packing | Each literal is local to one function and documented beside it |
| PUSH0 opcode | 30 | Every contract | Arc supports PUSH0; the suite is compiled for it and tested against Arc's own node |
| Loop contains revert | 1 | `KarwanCheckVerifier.report` | A bad or repeated signer refuses the whole report, by design |
| State change without event | 1 | `KarwanSettlementBase.longstopSplit` | `SettlementLib.payLongstop` emits `LongstopSplit` and the payouts; the family's own state change follows from it |
| Address state variable set without checks | 1 | `KarwanHub.setAutoArbiter` | Zero is a documented setting: automatic proposals off, disputes go straight to the reviewer |
| Unchecked return | 21 | Checks that return what they checked (`_onlyBuyer`, `_onlyEmployer`, `_onlySeller`, `_family`, `live` in `assignPayout`, `_accept`), `DisputeLib` calls whose opening time Time and Jobs do not need, best-effort pool withdrawals (`_pull` in `rebalanceYield`, `_tryRedeem`), the timelock's role grant | Each return is either a value the caller does not need or a best effort whose shortfall is handled after it |
| Uninitialized local variable | 1 | `SettlementLib.payLongstop` loop counter | Starts at zero by design |
| Unsafe ERC20 operation | 1 | `KarwanTimeEscrow.approve` | Not a token call: the Time family's own `approve` of submitted units |
| Unspecific Solidity pragma | 15 | Every contract | The pragma is `^0.8.24`; the build pins solc 0.8.28 in `foundry.toml`, and the bytecode will be verified against it when it is deployed |
| Unused error | 23 | `KarwanSettlementBase` | The base declares the errors `SettlementLib` raises, so they appear in every family's ABI |
| Public function not used internally | 3 | `JobLib.payRuling`, `TimeLib.payRuling`, `SettlementLib.close` | Public so the dispute libraries and the families can call them across library boundaries |
