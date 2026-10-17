# Mutation triage, contract suite

Every mutant of every suite contract outside the CRE build is killed by a test, does not compile, or
is listed here under the rule that shows it cannot change what the contract does.
`scripts/ops/forge-remote.sh --campaign-triage` checks this file against the campaign: it fails while
any mutant is still undecided, on a survivor not listed here, and on a listed mutant that no longer
survives. A new survivor gets a
test, or a row under a rule with the reason it fits.

The campaign builds each mutant with forge and runs the Foundry tests, without the size tests, since
it builds without the optimiser. The Halmos proofs and the Arc fork tests run outside it.

## R1. `constant` to `immutable`, same value

The value is a literal or another constant, so the getter and every use read the same value; only where the value is kept changes, and nothing can write either.

| Mutant | Where | Change |
|---|---|---|
| `m-2441c6fadc` | `KarwanCheckVerifier.sol:19` | `...es32 public constant REPORT_TYPEHASH...` to `...es32 public immutable REPORT_TYPEHAS...` |
| `m-b1a0d5acf1` | `KarwanIdentityRegistry.sol:39` | `uint64 public constant RECOVERY_DELAY = 7 days` to `uint64 public immutable RECOVERY_DELAY = 7 days` |
| `m-afe5bea51f` | `KarwanIdentityRegistry.sol:40` | `...es32 public constant BIND_TYPEHASH =...` to `...es32 public immutable BIND_TYPEHASH ...` |
| `m-a232c1f8c8` | `KarwanRecord.sol:25` | `uint8 public constant MAX_BAND = 3` to `uint8 public immutable MAX_BAND = 3` |
| `m-1596e41085` | `KarwanSettlementBase.sol:20` | `...nt16 public constant MAX_FEE_BPS = S...` to `...nt16 public immutable MAX_FEE_BPS = ...` |
| `m-fcfbf30c8a` | `KarwanSettlementBase.sol:21` | `uint8 public constant MAX_PAYEES = SettlementLib.MAX_PAYEES` to `uint8 public immutable MAX_PAYEES = SettlementLib.MAX_PAYEES` |
| `m-c43d7375f7` | `KarwanSettlementBase.sol:23` | `...nt64 public constant MAX_HORIZON = S...` to `...nt64 public immutable MAX_HORIZON = ...` |

## R2. A constant narrowed to a type that holds its value

The value fits the narrower type, every use widens it back to the same number, and the getter's return is encoded as the same 32-byte word.

| Mutant | Where | Change |
|---|---|---|
| `m-a5643623f7` | `KarwanIdentityRegistry.sol:39` | `uint64 public constant RECOVERY_DELAY = 7 days` to `uint32 public constant RECOVERY_DELAY = 7 days` |

## R3. A loop counter narrowed to `uint128`

The counter runs to an array's length, and no array in the suite can reach 2^128 elements, so the counter never wraps.

| Mutant | Where | Change |
|---|---|---|
| `m-8ee65d759b` | `KarwanCheckVerifier.sol:39` | `...for (uint256 i; i < signers.lengt...` to `...for (uint128 i; i < signers.lengt...` |
| `m-f13a367c76` | `KarwanCheckVerifier.sol:39` | `uint256 i` to `uint128 i` |
| `m-fdaf141875` | `KarwanCheckVerifier.sol:62` | `...for (uint256 i; i < signers.lengt...` to `...for (uint128 i; i < signers.lengt...` |
| `m-124cb75bb8` | `KarwanCheckVerifier.sol:62` | `uint256 i` to `uint128 i` |
| `m-773744cdb6` | `KarwanRecord.sol:119` | `...for (uint256 i; i < ids.length; +...` to `...for (uint128 i; i < ids.length; +...` |
| `m-699ff882a8` | `KarwanRecord.sol:119` | `uint256 i` to `uint128 i` |
| `m-b5384bc1c0` | `KarwanRecord.sol:124` | `uint256 i` to `uint128 i` |

## R4. `++x` and `x++` where the value is not used

As a loop step or a statement on its own, both add one and nothing reads the expression's value.

| Mutant | Where | Change |
|---|---|---|
| `m-7e13caab50` | `KarwanCheckVerifier.sol:39` | `++i` to `i++` |
| `m-10f998510e` | `KarwanCheckVerifier.sol:62` | `++i` to `i++` |
| `m-882b865160` | `KarwanRecord.sol:119` | `++i` to `i++` |
| `m-aec1fa04af` | `KarwanRecord.sol:120` | `++n` to `n++` |
| `m-8a8b5d938c` | `KarwanSettlementBase.sol:166` | `++i` to `i++` |

## R5. `storage` and `memory` swapped on a local that is only read

The local is only read, and every read happens before anything writes the slot it comes from, so a copy and a reference give the same values.

| Mutant | Where | Change |
|---|---|---|
| `m-905f1493c2` | `KarwanAgreementEscrow.sol:85` | `AgreementDeal storage d = _g.deals[dealId]` to `AgreementDeal memory d = _g.deals[dealId]` |
| `m-b554719e14` | `KarwanAgreementEscrow.sol:86` | `AgreementTerms storage t = _g.terms[dealId]` to `AgreementTerms memory t = _g.terms[dealId]` |
| `m-80350a615e` | `KarwanAgreementEscrow.sol:87` | `DealAccount storage a = _s.accounts[dealId]` to `DealAccount memory a = _s.accounts[dealId]` |
| `m-10aeb62a0d` | `KarwanIdentityRegistry.sol:176` | `RecoveryRequest memory r = recoveryRequestOf[id]` to `RecoveryRequest storage r = recoveryRequestOf[id]`. `r` is read before `_setController` deletes the request. |
| `m-e5d7e831b0` | `KarwanIdentityRegistry.sol:188` | `Binding memory b = bindingOf[wallet]` to `Binding storage b = bindingOf[wallet]` |
| `m-cbe38c30b4` | `KarwanIdentityRegistry.sol:201` | `Binding memory b = bindingOf[wallet]` to `Binding storage b = bindingOf[wallet]` |
| `m-1642387e38` | `KarwanIdentityRegistry.sol:207` | `Binding memory b = bindingOf[wallet]` to `Binding storage b = bindingOf[wallet]` |
| `m-0e80b56906` | `KarwanIdentityRegistry.sol:235` | `Binding memory b = bindingOf[wallet]` to `Binding storage b = bindingOf[wallet]` |
| `m-3ee34385be` | `KarwanJobEscrow.sol:36` | `JobCore storage j = _g.jobs[id]` to `JobCore memory j = _g.jobs[id]` |
| `m-b981623d80` | `KarwanRecord.sol:117` | `uint256[] storage ids = _bySubject[subject]` to `uint256[] memory ids = _bySubject[subject]` |
| `m-8a494b487a` | `KarwanSettlementBase.sol:184` | `Assignment storage g = _s.assignments[dealId][payee]` to `Assignment memory g = _s.assignments[dealId][payee]` |

## R6. A write of what the slot already holds

The mutated branch writes only values the slots already hold, so the state after is the same.

| Mutant | Where | Change |
|---|---|---|
| `m-136fbcbae7` | `KarwanIdentityRegistry.sol:114` | `kind == Kind.Agent` to `true`. A wallet binding carries no limits (line 106 refuses any), and an unbound wallet's limit slot is zero: bind is its only writer for a wallet and unbind deletes it. |
| `m-d5d3140196` | `KarwanJobEscrow.sol:170` | `j.disputed` to `true`. The flag and the dispute record are set together, by `disputeRejection`, and cleared together: `complete` drops the record as it clears the flag, and every ruling deletes the record in `DisputeLib` before `payRuling` clears the flag. So when the flag is false there is no record, the flag is already false, and `drop` deletes nothing. |
