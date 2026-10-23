# 14 · Threat model: the contract suite

This view is step 1 of the release bar in [view 11](11-contracts.md): what the suite protects, who can act on it and with what limits, how each class of attack in the [OWASP Smart Contract Top 10 (2025)](https://owasp.org/www-project-smart-contract-top-10/) could reach it, and which test, invariant or proof shows the control holds. It covers every contract in view 11. The CRE adapter in [view 12](12-cre.md) appears here as an outside caller with fixed roles.

Every control below names the check that pins it. A control without one is a gap, not a claim.

## What is protected

| Asset | Where it sits | Who can ever move it |
|---|---|---|
| Deal money | Each family's escrow (Agreement, Time, Jobs and bounties) | Only the settlement base, to a party recorded before any money left the deal, an assignee that party signed for, or the fee recipient within the fee fixed at opening |
| Parked money | The yield pool, off at launch | Only back to the family that parked it; yield above the cushion to the fee recipient |
| Stake | The stake vault | The staker after the cooldown, or a slash to the beneficiary the staker signed for, within the signed limit |
| Owed balances | The family or vault that owes them | Only the address they are owed to |
| Records and facts | The record contract | Families write deal outcomes, once per party; registered issuers write facts and revoke only their own |
| Fees | The Treasury Safe | Its signers |
| Rules | The hub, owned by the timelock | The owner Safe, through the timelock and its 48-hour delay; a change reaches new deals only |

## Who can act, and the limits

| Actor | Can | Can never |
|---|---|---|
| Parties to a deal | Act on their own deal: fund, deliver, review, release, dispute, claim, reclaim | Act on another deal, or take more than the terms give them |
| Evaluator of a job | Complete or reject submitted work | Be paid. A rejection of submitted work can be disputed |
| Agents | Act for a person within the per-payment and total limits that person signed | Spend past those limits, or after the binding expires |
| Automatic arbiter | Propose a ruling from the outcomes the terms allow | Rule outside them; any party escalates |
| Reviewer Safes | Rule on an escalated dispute, within its amount, between the deal's parties | Touch undisputed money or pay anyone else |
| Guardian Safe | Pause new money into a family, hold a deal 7 days at a time and 30 days at most, cancel a queued timelock change | Stop an exit for good, or move money |
| Owner Safe, through the timelock | Register families, verifiers and issuers, set caps, fees within 10% and the fee recipient | Change a live deal's rules, or move deal money |
| Senior Safe | Split a deal's balance between its parties 180 days after its horizon | Pay anyone outside the deal |
| Check verifiers | Report a delivery check signed by enough of their fixed checkers, once per delivery | Overturn a result already reported for that delivery |
| CRE adapter | Sign checks for verifiers that list it, write facts of the kinds fixed at its deployment, trigger timeouts anyone may trigger | Act on a report not from the forwarder and the workflow bound by the timelock, or move money |
| Karwan's servers | Run the keeper, the fallback checker and the automatic arbiter as conveniences | Hold any role over deal money; every timeout is open to anyone |
| Outside contracts (USDC, the USYC Teller, the ERC-8004 registries) | Behave as their owners decide, including upgrades and blocklists | Block an exit: a payout that fails becomes an owed balance |

## Attacks, mapped to the OWASP Smart Contract Top 10 (2025)

| Risk | How it could reach Karwan | Control | Pinned by |
|---|---|---|---|
| SC01 Access control | A stranger, a family or an admin moves money they have no right to | The settlement base decides every payee; families have no owner; the hub's setters are owner-only and the owner is the timelock; the fee recipient is never a family, the hub, the stake vault or a yield pool | `test_every_setter_is_owner_only`, `test_a_family_is_never_the_fee_recipient`, `test_no_suite_contract_is_the_fee_recipient`, the "no stranger is ever paid" property in every family, the Halmos proof `check_no_payout_beyond_the_deal` |
| SC02 Price oracle manipulation | A moved price makes a deal pay out the wrong amount | Deals hold no prices. Only the yield pool values USYC, from the Teller's own redemption quote, and it never subscribes more than its margin covers | `YieldPool.t.sol`, the property "the pool covers what families parked" |
| SC03 Logic errors | A sequence of valid steps leaves money stranded, double-paid or with the wrong person | Each family's books are written as properties and run by three fuzzers; the settlement base's books are proved for every amount along a fund, payout and fee sequence on one deal | The six property sets under Foundry, Medusa and Echidna; the Halmos proofs `check_the_books_balance` and `check_principal_can_always_be_withdrawn` |
| SC04 Lack of input validation | Terms outside their bounds, or a payout above what a deal holds | Each family checks its terms against fixed bounds; the base refuses a payout above a deal's balance or a fee above its cap | `test_terms_out_of_bounds_are_refused`, the Agreement terms tests, `test_cannot_pay_more_than_the_deal_holds`, `test_fee_stays_within_the_snapshotted_rate`, `check_no_payout_beyond_the_deal` |
| SC05 Reentrancy | A token or callee calls back mid-payout | Every entry point that moves money is non-reentrant; books are written before any transfer; every callee is fixed at deployment or through the timelock | A test per guarded function in which a token calls back mid-payment and is refused (`*Reentrancy.t.sol`); Slither and Aderyn triage; the "books balance" property in every family |
| SC06 Unchecked external calls | A failed transfer or record write is taken as done | Transfers use checked calls, and a refused payout becomes an owed balance; funding checks the amount that actually arrived; record writes and stake hooks that fail are kept for retry | The blocklist tests in every family, `test_a_token_that_delivers_less_is_refused`, `check_principal_can_always_be_withdrawn`, the pending-record tests |
| SC07 Flash loans | Borrowed money inflates a value for one transaction | No deal reads a price or a share of a pool; funding must arrive as a real transfer | `test_a_token_that_delivers_less_is_refused`; the books properties. The only balance a deal path reads is that arrival check |
| SC08 Integer overflow and underflow | Arithmetic wraps and pays the wrong amount | Checked arithmetic throughout; every narrowing cast takes a value bounded by its source | Aderyn triage of the casts; the Halmos proofs, for the settlement base's amounts |
| SC09 Insecure randomness | An outcome depends on a guessable number | No contract uses randomness | No contract reads `blockhash` or `prevrandao`; Slither's `weak-prng` detector reports nothing |
| SC10 Denial of service | Someone stops others from getting their money | Exits are open to anyone and never wait on a pause, a verifier or an outside contract, except that owed money parked in the yield pool waits until the pool can redeem it (the pool is off at launch); payouts are pull-safe; holds are capped at 30 days a deal; every loop is bounded (8 payees, 520 cycles, 32 amendments, 8 places) | The "exits never revert" property for the settlement base, Time, Jobs and the yield pool, and "buyer release always works on a live deal" for Agreement; the pause and hold tests; rule S4 in view 11 |

## What the suite assumes

- USDC moves as an ERC-20 token with a blocklist. Circle can upgrade it; a transfer it refuses becomes an owed balance, never a lost one.
- The timelock's delay, 48 hours and never below 24, gives everyone time to see a change before it applies, and a change reaches new deals only.
- The reviewer Safes and the senior Safe are signed by named people who rule within the limits above.
- The fee recipient is the Treasury Safe. The hub refuses a family in that role, because a fee paid to a family's own address would stay in it while its books let it go, and refuses the hub, the stake vault and a yield pool, which would hold the fees with no way out.
- CRE workflows act only through the adapter, which takes reports from Chainlink's forwarder for the workflows the timelock bound.

## How each claim is checked

| Check | Tool | Where |
|---|---|---|
| Unit and exploit tests | Foundry | `contracts/test/suite` |
| Properties, one set per family, run by three fuzzers | Foundry, Medusa, Echidna | `contracts/test/suite/**/*Props.sol`; 24 hours on the frozen release |
| Proofs over every amount on the settlement base's fund, payout, fee and withdrawal path | Halmos | `contracts/test/suite/proofs` |
| Two static analysers, every finding explained | Slither, Aderyn | `contracts/test/suite/SLITHER_TRIAGE.md`, `contracts/test/suite/ADERYN_TRIAGE.md`; the CRE contracts in `contracts/test/suite/cre/SLITHER_CRE.md`, their Aderyn findings still being triaged by the CRE build |
| Branch coverage: every branch taken by a test, or explained | Foundry coverage, `scripts/ops/forge-remote.sh --coverage` | `contracts/test/suite/COVERAGE_TRIAGE.md` |
| Fuzz tests over every money computation, 10,000 runs each | Foundry, release profile | `contracts/test/suite/**/*Fuzz.t.sol` |
| Mutation testing: every mutant of every suite contract outside the CRE build, built and tested against the Foundry tests | slither-mutate's mutators, each replacement written over the exact expression it names, run by `scripts/ops/forge-remote.sh --campaign` | Every survivor is closed before deployment, by a test or under a rule in `contracts/test/suite/MUTATION_TRIAGE.md` that `scripts/ops/forge-remote.sh --campaign-triage` checks, and the campaign runs again on the frozen release. Each survivor is confirmed once more against every test that can run its code, apart from the invariant tests, which the 24-hour fuzz runs cover. The Halmos proofs and the Arc fork tests run outside it |
| Every reentrancy guard proven: each guarded function refuses a token that calls back mid-payment, and each test fails without its guard | Foundry | `contracts/test/suite/**/*Reentrancy.t.sol` |
| Every event checked field by field, each topic and each data field | Foundry, `vm.expectEmit` and recorded logs | `contracts/test/suite/**/*Events.t.sol` and each contract's own tests |
| Two rehearsals on Arc testnet | The deployment script | Before the single deployment |

## Status

| Piece | Status |
|---|---|
| This threat model | Written |
| Property sets under three fuzzers | Built |
| Halmos proofs of the settlement base's books | Built |
| Aderyn and its triage | Built |
| Full branch coverage, with every exception explained | Built |
| Fuzz tests at 10,000 runs | Built |
| Every reentrancy guard proven, one test each | Built |
| Every event checked field by field | Built |
| Mutation testing | Done: 12,988 mutants; every survivor killed by a test or listed under one of 16 rules with its reason, confirmed against every test that can run its code. Runs again on the frozen release |
| 24-hour fuzzing on the frozen release | Planned, at release |
