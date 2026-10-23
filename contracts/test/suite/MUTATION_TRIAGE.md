# Mutation triage, contract suite

Every mutant of every suite contract outside the CRE build is killed by a test, does not compile, or
is listed here under the rule that shows it cannot change what the contract does.
`scripts/ops/mutant_worker.py --triage` checks this file against a campaign's mutant list and results
(`scripts/ops/forge-remote.sh --campaign-triage` runs it on the campaign in progress): it fails while any
mutant is still undecided, on a survivor not listed here, and on a listed mutant that no longer survives.
A new survivor gets a test, or a row under a rule with the reason it fits.

The campaign builds each mutant with forge and runs the Foundry tests, without the size tests, since
it builds without the optimiser. The Halmos proofs and the Arc fork tests run outside it. Each survivor
below was run once more against every test whose imports reach its source file, apart from the invariant
tests, which the 24-hour fuzz runs cover.

Rules R1 to R5 and R7 to R11 follow from the change itself. Rules R6 and R12 to R16 hold only for the
line named, for the reason given on its row.

## R1. `constant` to `immutable`, same value

The value is a literal or another constant, so the getter and every use read the same value; only where the value is kept changes, and nothing can write either.

| Mutant | Where | Change |
|---|---|---|
| `m-2441c6fadc` | `KarwanCheckVerifier.sol:19` | `...es32 public constant REPORT_TYPEHASH...` to `...es32 public immutable REPORT_TYPEHAS...` |
| `m-a29f776688` | `KarwanHub.sol:15` | `uint16 public constant MAX_FEE_BPS = 1_000` to `uint16 public immutable MAX_FEE_BPS = 1_000` |
| `m-cf66cc47a0` | `KarwanHub.sol:17` | `uint16 public constant MAX_YIELD_SHARE_BPS = 9_000` to `uint16 public immutable MAX_YIELD_SHARE_BPS = 9_000` |
| `m-b1a0d5acf1` | `KarwanIdentityRegistry.sol:39` | `uint64 public constant RECOVERY_DELAY = 7 days` to `uint64 public immutable RECOVERY_DELAY = 7 days` |
| `m-afe5bea51f` | `KarwanIdentityRegistry.sol:40` | `...es32 public constant BIND_TYPEHASH =...` to `...es32 public immutable BIND_TYPEHASH ...` |
| `m-a232c1f8c8` | `KarwanRecord.sol:25` | `uint8 public constant MAX_BAND = 3` to `uint8 public immutable MAX_BAND = 3` |
| `m-1596e41085` | `KarwanSettlementBase.sol:20` | `...nt16 public constant MAX_FEE_BPS = S...` to `...nt16 public immutable MAX_FEE_BPS = ...` |
| `m-fcfbf30c8a` | `KarwanSettlementBase.sol:21` | `uint8 public constant MAX_PAYEES = SettlementLib.MAX_PAYEES` to `uint8 public immutable MAX_PAYEES = SettlementLib.MAX_PAYEES` |
| `m-763369d9d4` | `KarwanSettlementBase.sol:22` | `uint64 public constant LONGSTOP = SettlementLib.LONGSTOP` to `uint64 public immutable LONGSTOP = SettlementLib.LONGSTOP` |
| `m-c43d7375f7` | `KarwanSettlementBase.sol:23` | `...nt64 public constant MAX_HORIZON = S...` to `...nt64 public immutable MAX_HORIZON = ...` |
| `m-08418bc38f` | `KarwanSettlementBase.sol:24` | `uint64 public constant HOLD_STEP = SettlementLib.HOLD_STEP` to `uint64 public immutable HOLD_STEP = SettlementLib.HOLD_STEP` |
| `m-272dded5bc` | `KarwanSettlementBase.sol:25` | `...nt64 public constant HOLD_BUDGET = S...` to `...nt64 public immutable HOLD_BUDGET = ...` |
| `m-796b07fd30` | `KarwanStakeVault.sol:24` | `uint64 public constant COOLDOWN = 7 days` to `uint64 public immutable COOLDOWN = 7 days` |
| `m-01278bca9d` | `KarwanStakeVault.sol:25` | `uint64 public constant MAX_TERM = 1_095 days` to `uint64 public immutable MAX_TERM = 1_095 days` |
| `m-c7f3beefd4` | `KarwanStakeVault.sol:26` | `...32 internal constant RESERVE_TYPEHAS...` to `...32 internal immutable RESERVE_TYPEHA...` |
| `m-291e1e3a36` | `KarwanTimelock.sol:14` | `uint256 public constant FLOOR = 24 hours` to `uint256 public immutable FLOOR = 24 hours` |
| `m-156ff5b2fa` | `KarwanTimelock.sol:15` | `uint256 public constant PROTECTED_DELAY = 7 days` to `uint256 public immutable PROTECTED_DELAY = 7 days` |
| `m-e551c73b3f` | `KarwanTradeFinance.sol:21` | `uint16 public constant BPS = 10_000` to `uint16 public immutable BPS = 10_000` |
| `m-e726d4af4b` | `KarwanTradeFinance.sol:23` | `uint16 public constant MIN_STAKE_BPS = 1_000` to `uint16 public immutable MIN_STAKE_BPS = 1_000` |
| `m-11891c3e1c` | `KarwanTradeFinance.sol:24` | `uint64 public constant LONGSTOP = 180 days` to `uint64 public immutable LONGSTOP = 180 days` |
| `m-869a6b065c` | `KarwanTradeFinance.sol:25` | `uint64 public constant SETTLE_WINDOW = 30 days` to `uint64 public immutable SETTLE_WINDOW = 30 days` |
| `m-1ad162fa8a` | `KarwanTradeFinance.sol:27` | `uint8 internal constant OPEN = 1` to `uint8 internal immutable OPEN = 1` |
| `m-d673dbb242` | `KarwanTradeFinance.sol:28` | `uint8 internal constant REPAID = 2` to `uint8 internal immutable REPAID = 2` |
| `m-510c37e038` | `KarwanTradeFinance.sol:29` | `uint8 internal constant DEFAULTED = 3` to `uint8 internal immutable DEFAULTED = 3` |
| `m-c6e880dcd1` | `KarwanTradeFinance.sol:30` | `uint8 internal constant WAIVED = 4` to `uint8 internal immutable WAIVED = 4` |
| `m-e76e0edb15` | `KarwanYieldPool.sol:38` | `uint16 public constant BPS = 10_000` to `uint16 public immutable BPS = 10_000` |
| `m-00671784e3` | `KarwanYieldPool.sol:39` | `uint16 public constant MAX_BUFFER_BPS = 5_000` to `uint16 public immutable MAX_BUFFER_BPS = 5_000` |
| `m-9fcf1f8180` | `KarwanYieldPool.sol:40` | `uint16 public constant MIN_CUSHION_BPS = 10` to `uint16 public immutable MIN_CUSHION_BPS = 10` |
| `m-0749f69f42` | `KarwanYieldPool.sol:41` | `uint16 public constant MAX_CUSHION_BPS = 500` to `uint16 public immutable MAX_CUSHION_BPS = 500` |
| `m-d493e3687c` | `KarwanYieldPool.sol:44` | `uint256 public constant MIN_MARGIN = 1_000` to `uint256 public immutable MIN_MARGIN = 1_000` |

## R2. A constant narrowed to a type that holds its value

The value fits the narrower type, every use widens it back to the same number, and the getter's return is encoded as the same 32-byte word.

| Mutant | Where | Change |
|---|---|---|
| `m-a5643623f7` | `KarwanIdentityRegistry.sol:39` | `uint64 public constant RECOVERY_DELAY = 7 days` to `uint32 public constant RECOVERY_DELAY = 7 days` |
| `m-83a9590760` | `KarwanStakeVault.sol:24` | `uint64 public constant COOLDOWN = 7 days` to `uint32 public constant COOLDOWN = 7 days` |
| `m-bd7541784b` | `KarwanStakeVault.sol:25` | `uint64 public constant MAX_TERM = 1_095 days` to `uint32 public constant MAX_TERM = 1_095 days` |
| `m-a680858027` | `KarwanTimelock.sol:14` | `uint256 public constant FLOOR = 24 hours` to `uint128 public constant FLOOR = 24 hours` |
| `m-e0a2b5df19` | `KarwanTimelock.sol:15` | `uint256 public constant PROTECTED_DELAY = 7 days` to `uint128 public constant PROTECTED_DELAY = 7 days` |
| `m-10f36b2f8c` | `KarwanTradeFinance.sol:24` | `uint64 public constant LONGSTOP = 180 days` to `uint32 public constant LONGSTOP = 180 days` |
| `m-08be70ca5d` | `KarwanTradeFinance.sol:25` | `uint64 public constant SETTLE_WINDOW = 30 days` to `uint32 public constant SETTLE_WINDOW = 30 days` |
| `m-cb073022a8` | `KarwanYieldPool.sol:40` | `uint16 public constant MIN_CUSHION_BPS = 10` to `uint8 public constant MIN_CUSHION_BPS = 10` |
| `m-d60bb5e2c3` | `KarwanYieldPool.sol:44` | `uint256 public constant MIN_MARGIN = 1_000` to `uint128 public constant MIN_MARGIN = 1_000` |
| `m-48eb4b6ecd` | `AgreementCommon.sol:14` | `uint64 internal constant STAKE_SLACK = 30 days` to `uint32 internal constant STAKE_SLACK = 30 days` |
| `m-07ed4a7e45` | `DisputeLib.sol:36` | `uint64 internal constant PROPOSAL_WINDOW = 5 days` to `uint32 internal constant PROPOSAL_WINDOW = 5 days` |
| `m-901555ed29` | `DisputeLib.sol:37` | `uint64 internal constant APPEAL_WINDOW = 72 hours` to `uint32 internal constant APPEAL_WINDOW = 72 hours` |
| `m-ac752480c1` | `DisputeLib.sol:38` | `uint64 internal constant RULING_PERIOD = 5 days` to `uint32 internal constant RULING_PERIOD = 5 days` |
| `m-a26f16ab63` | `BountyLib.sol:20` | `uint256 internal constant MAX_PLACES = 8` to `uint128 internal constant MAX_PLACES = 8` |
| `m-f2c0cb5e84` | `BountyLib.sol:21` | `uint64 internal constant MAX_AWARD_WAIT = 60 days` to `uint32 internal constant MAX_AWARD_WAIT = 60 days` |
| `m-351c8e5546` | `JobLib.sol:22` | `uint32 internal constant MIN_REVIEW = 1 hours` to `uint16 internal constant MIN_REVIEW = 1 hours` |
| `m-b2d827a48b` | `JobLib.sol:24` | `uint64 internal constant REJECT_WINDOW = 3 days` to `uint32 internal constant REJECT_WINDOW = 3 days` |
| `m-ec37c7ec72` | `JobLib.sol:25` | `uint64 internal constant MIN_EXPIRY = 1 hours` to `uint32 internal constant MIN_EXPIRY = 1 hours` |
| `m-dd3996dec1` | `JobLib.sol:26` | `uint64 internal constant MAX_EXPIRY = 365 days` to `uint32 internal constant MAX_EXPIRY = 365 days` |
| `m-24f7eed979` | `JobLib.sol:27` | `uint256 internal constant MAX_DESCRIPTION = 2_048` to `uint128 internal constant MAX_DESCRIPTION = 2_048` |
| `m-4f343e8e67` | `SettlementLib.sol:77` | `uint64 internal constant LONGSTOP = 180 days` to `uint32 internal constant LONGSTOP = 180 days` |
| `m-401a454c44` | `SettlementLib.sol:78` | `uint64 internal constant MAX_HORIZON = 730 days` to `uint32 internal constant MAX_HORIZON = 730 days` |
| `m-f53e0f35f1` | `SettlementLib.sol:79` | `uint64 internal constant HOLD_STEP = 7 days` to `uint32 internal constant HOLD_STEP = 7 days` |
| `m-f3e5504e8b` | `SettlementLib.sol:80` | `uint64 internal constant HOLD_BUDGET = 30 days` to `uint32 internal constant HOLD_BUDGET = 30 days` |
| `m-1b140157da` | `SettlementLib.sol:82` | `uint64 internal constant MIN_YIELD_TERM = 3 days` to `uint32 internal constant MIN_YIELD_TERM = 3 days` |
| `m-4583b4e8c1` | `TimeLib.sol:22` | `uint32 internal constant MIN_REVIEW = 1 hours` to `uint16 internal constant MIN_REVIEW = 1 hours` |
| `m-a8de2a86b4` | `TimeLib.sol:27` | `uint32 internal constant MAX_SCALE = 10_000` to `uint16 internal constant MAX_SCALE = 10_000` |
| `m-1c084f3c9c` | `TimeLib.sol:28` | `uint64 internal constant MAX_START = 90 days` to `uint32 internal constant MAX_START = 90 days` |
| `m-e9dec498f0` | `TimeLib.sol:29` | `uint64 internal constant MAX_AMEND_WAIT = 30 days` to `uint32 internal constant MAX_AMEND_WAIT = 30 days` |
| `m-46f45a02ec` | `TimeLib.sol:30` | `uint16 internal constant MAX_VERSIONS = 32` to `uint8 internal constant MAX_VERSIONS = 32` |

## R3. A loop counter narrowed to `uint128`

The counter runs to an array's length, and no array in the suite can reach 2^128 elements, so the counter never wraps.

| Mutant | Where | Change |
|---|---|---|
| `m-8ee65d759b` | `KarwanCheckVerifier.sol:39` | `...for (uint256 i; i < signers.lengt...` to `...for (uint128 i; i < signers.lengt...` |
| `m-f13a367c76` | `KarwanCheckVerifier.sol:39` | `uint256 i` to `uint128 i`. The counter runs to `signers.length`, a short list. |
| `m-fdaf141875` | `KarwanCheckVerifier.sol:62` | `...for (uint256 i; i < signers.lengt...` to `...for (uint128 i; i < signers.lengt...` |
| `m-124cb75bb8` | `KarwanCheckVerifier.sol:62` | `uint256 i` to `uint128 i`. The counter runs to `signers.length`, a short list. |
| `m-773744cdb6` | `KarwanRecord.sol:119` | `...for (uint256 i; i < ids.length; +...` to `...for (uint128 i; i < ids.length; +...` |
| `m-699ff882a8` | `KarwanRecord.sol:119` | `uint256 i` to `uint128 i`. The counter runs to an array's length. |
| `m-b4477a45d4` | `KarwanRecord.sol:124` | `...for (uint256 i; i < ids.length; +...` to `...for (uint128 i; i < ids.length; +...` |
| `m-b5384bc1c0` | `KarwanRecord.sol:124` | `uint256 i` to `uint128 i`. The counter runs to an array's length. |
| `m-6be0eb3381` | `BountyLib.sol:45` | `...for (uint256 i; i < places; ++i) ...` to `...for (uint128 i; i < places; ++i) ...`. The counter runs to the number of places, at most `MAX_PLACES`. |
| `m-f73672f0db` | `BountyLib.sol:45` | `uint256 i` to `uint128 i`. The counter runs to the number of places, at most `MAX_PLACES`. |
| `m-cfcb88502a` | `BountyLib.sol:107` | `...for (uint256 i; i < n; ++i) { if ...` to `...for (uint128 i; i < n; ++i) { if ...`. The counter runs to the number of winners, an array's length. |
| `m-681d3fa939` | `BountyLib.sol:107` | `uint256 i` to `uint128 i`. The counter runs to the number of winners, an array's length. |
| `m-b55ac11a67` | `BountyLib.sol:144` | `...for (uint256 i; i < n; ++i) { emi...` to `...for (uint128 i; i < n; ++i) { emi...`. The counter runs to the number of winners, an array's length. |
| `m-19fc2ac14c` | `BountyLib.sol:144` | `uint256 i` to `uint128 i`. The counter runs to the number of winners, an array's length. |
| `m-ec82769f2d` | `BountyLib.sol:148` | `...for (uint256 i; i < n; ++i) { Set...` to `...for (uint128 i; i < n; ++i) { Set...`. The counter runs to the number of winners, an array's length. |
| `m-984695f591` | `BountyLib.sol:148` | `uint256 i` to `uint128 i`. The counter runs to the number of winners, an array's length. |
| `m-c8b2827430` | `BountyLib.sol:156` | `...for (uint256 i; i < n; ++i) { Set...` to `...for (uint128 i; i < n; ++i) { Set...`. The counter runs to the number of winners, an array's length. |
| `m-1544f001eb` | `BountyLib.sol:156` | `uint256 i` to `uint128 i`. The counter runs to the number of winners, an array's length. |
| `m-cb4e9a7183` | `SettlementLib.sol:159` | `...for (uint256 i; i < n; ++i) { _ap...` to `...for (uint128 i; i < n; ++i) { _ap...`. The counter runs to `payees.length`, at most `MAX_PAYEES`. |
| `m-36cd0d082a` | `SettlementLib.sol:159` | `uint256 i` to `uint128 i`. The counter runs to `payees.length`, at most `MAX_PAYEES`. |

## R4. `++x` and `x++` where the value is not used

As a loop step or a statement on its own, both add one and nothing reads the expression's value.

| Mutant | Where | Change |
|---|---|---|
| `m-7e13caab50` | `KarwanCheckVerifier.sol:39` | `++i` to `i++` |
| `m-10f998510e` | `KarwanCheckVerifier.sol:62` | `++i` to `i++` |
| `m-882b865160` | `KarwanRecord.sol:119` | `++i` to `i++` |
| `m-aec1fa04af` | `KarwanRecord.sol:120` | `++n` to `n++` |
| `m-8a8b5d938c` | `KarwanSettlementBase.sol:166` | `++i` to `i++` |
| `m-245599a7da` | `AgreementTermsLib.sol:21` | `++i` to `i++` |
| `m-96cd97a44f` | `AgreementTermsLib.sol:25` | `count++` to `++count` |
| `m-f3d8facd8d` | `BountyLib.sol:45` | `++i` to `i++` |
| `m-1bf5d24ab2` | `BountyLib.sol:107` | `++i` to `i++` |
| `m-6b878dcbc9` | `BountyLib.sol:134` | `++i` to `i++` |
| `m-8d08c6e2ed` | `SettlementLib.sol:159` | `++i` to `i++` |
| `m-b8fc9faf9d` | `SettlementLib.sol:180` | `++i` to `i++` |
| `m-9afcec75cb` | `SettlementLib.sol:400` | `++i` to `i++` |
| `m-1ce8b519d1` | `SettlementLib.sol:419` | `++i` to `i++` |
| `m-f7919e3359` | `SettlementLib.sol:422` | `++p` to `p++` |
| `m-890c0693ec` | `SettlementLib.sol:494` | `++i` to `i++` |
| `m-e60be2b49f` | `TimeLib.sol:452` | `++k` to `k++` |
| `m-e8a6340a04` | `TimeLib.sol:469` | `--v` to `v--` |

## R5. `storage` and `memory` swapped on a local that is only read

The local is only read, and every read happens before anything writes the slot it comes from, so a copy and a reference give the same values.

| Mutant | Where | Change |
|---|---|---|
| `m-905f1493c2` | `KarwanAgreementEscrow.sol:85` | `AgreementDeal storage d = _g.deals[dealId]` to `AgreementDeal memory d = _g.deals[dealId]` |
| `m-b554719e14` | `KarwanAgreementEscrow.sol:86` | `AgreementTerms storage t = _g.terms[dealId]` to `AgreementTerms memory t = _g.terms[dealId]` |
| `m-80350a615e` | `KarwanAgreementEscrow.sol:87` | `DealAccount storage a = _s.accounts[dealId]` to `DealAccount memory a = _s.accounts[dealId]` |
| `m-6d05b5dae6` | `KarwanHub.sol:244` | `Family storage f = families[family]` to `Family memory f = families[family]` |
| `m-5035d24c28` | `KarwanHub.sol:245` | `Caps storage k = capsOf[family][asset]` to `Caps memory k = capsOf[family][asset]` |
| `m-10fe034a43` | `KarwanHub.sol:267` | `Family storage f = families[family]` to `Family memory f = families[family]` |
| `m-10aeb62a0d` | `KarwanIdentityRegistry.sol:176` | `RecoveryRequest memory r = recoveryRequestOf[id]` to `RecoveryRequest storage r = recoveryRequestOf[id]` |
| `m-e5d7e831b0` | `KarwanIdentityRegistry.sol:188` | `Binding memory b = bindingOf[wallet]` to `Binding storage b = bindingOf[wallet]` |
| `m-cbe38c30b4` | `KarwanIdentityRegistry.sol:201` | `Binding memory b = bindingOf[wallet]` to `Binding storage b = bindingOf[wallet]` |
| `m-1642387e38` | `KarwanIdentityRegistry.sol:207` | `Binding memory b = bindingOf[wallet]` to `Binding storage b = bindingOf[wallet]` |
| `m-0e80b56906` | `KarwanIdentityRegistry.sol:235` | `Binding memory b = bindingOf[wallet]` to `Binding storage b = bindingOf[wallet]` |
| `m-3ee34385be` | `KarwanJobEscrow.sol:36` | `JobCore storage j = _g.jobs[id]` to `JobCore memory j = _g.jobs[id]` |
| `m-b981623d80` | `KarwanRecord.sol:117` | `uint256[] storage ids = _bySubject[subject]` to `uint256[] memory ids = _bySubject[subject]` |
| `m-8a494b487a` | `KarwanSettlementBase.sol:184` | `Assignment storage g = _s.assignments[dealId][payee]` to `Assignment memory g = _s.assignments[dealId][payee]` |
| `m-c09f056f2c` | `KarwanStakeVault.sol:210` | `Reservation storage r = _reservations[keyOf(family, ref)]` to `Reservation memory r = _reservations[keyOf(family, ref)]` |
| `m-85f09022c7` | `KarwanStakeVault.sol:243` | `Reservation storage r = _reservations[keyOf(family, ref)]` to `Reservation memory r = _reservations[keyOf(family, ref)]` |
| `m-da124bc03b` | `KarwanTradeFinance.sol:193` | `Line storage l = _lines[lineId]` to `Line memory l = _lines[lineId]` |
| `m-a85f84acda` | `AgreementDisputeLib.sol:95` | `AgreementTerms storage t = g.terms[dealId]` to `AgreementTerms memory t = g.terms[dealId]` |
| `m-d162e00c1e` | `AgreementLib.sol:139` | `DealAccount storage a = s.accounts[dealId]` to `DealAccount memory a = s.accounts[dealId]` |
| `m-29d56f9d1b` | `AgreementLib.sol:172` | `AgreementTerms storage t = _accept(s, g, dealId, termsHash)` to `AgreementTerms memory t = _accept(s, g, dealId, termsHash)` |
| `m-42accab85b` | `AgreementLib.sol:191` | `AgreementDeal storage d = g.deals[dealId]` to `AgreementDeal memory d = g.deals[dealId]` |
| `m-60c5d12672` | `AgreementLib.sol:387` | `SplitOffer storage o = g.splits[dealId]` to `SplitOffer memory o = g.splits[dealId]` |
| `m-e1408ef26b` | `AgreementLib.sol:402` | `SplitOffer memory o = g.splits[dealId]` to `SplitOffer storage o = g.splits[dealId]` |
| `m-211214a2fe` | `AgreementLib.sol:467` | `AgreementDeal storage d = g.deals[dealId]` to `AgreementDeal memory d = g.deals[dealId]` |
| `m-9c8746f825` | `AgreementLib.sol:486` | `AgreementTerms storage t = g.terms[dealId]` to `AgreementTerms memory t = g.terms[dealId]` |
| `m-5a8fe71227` | `AgreementLib.sol:512` | `AgreementTerms storage t = g.terms[dealId]` to `AgreementTerms memory t = g.terms[dealId]` |
| `m-c650d47b6c` | `DisputeLib.sol:111` | `Dispute storage x = _open(ds, dealId)` to `Dispute memory x = _open(ds, dealId)` |
| `m-42e20f865c` | `DisputeLib.sol:124` | `Dispute storage x = _open(ds, dealId)` to `Dispute memory x = _open(ds, dealId)` |
| `m-58fa10d5dc` | `DisputeLib.sol:137` | `Dispute storage x = _open(ds, dealId)` to `Dispute memory x = _open(ds, dealId)` |
| `m-755780429a` | `JobLib.sol:161` | `JobCore storage j = _job(g, id)` to `JobCore memory j = _job(g, id)` |
| `m-3095f3082f` | `JobLib.sol:212` | `JobCore storage j = _job(g, id)` to `JobCore memory j = _job(g, id)` |
| `m-9352e8d4a0` | `JobLib.sol:224` | `JobCore storage j = _job(g, id)` to `JobCore memory j = _job(g, id)` |
| `m-002d88f052` | `JobLib.sol:260` | `DealAccount storage a = s.accounts[key]` to `DealAccount memory a = s.accounts[key]` |
| `m-b0b388b3c8` | `SettlementLib.sol:339` | `Assignment storage g = s.assignments[dealId][payee]` to `Assignment memory g = s.assignments[dealId][payee]` |
| `m-472249a957` | `SettlementLib.sol:394` | `DealAccount storage a = live(s, dealId)` to `DealAccount memory a = live(s, dealId)` |
| `m-be193f13a5` | `SettlementLib.sol:507` | `DealAccount storage a = s.accounts[dealId]` to `DealAccount memory a = s.accounts[dealId]` |
| `m-bbf2396663` | `TimeLib.sol:101` | `TimeTerms storage t = g.terms[id][0]` to `TimeTerms memory t = g.terms[id][0]` |
| `m-15b294d96f` | `TimeLib.sol:141` | `TimeEngagement storage e = g.engagements[id]` to `TimeEngagement memory e = g.engagements[id]` |
| `m-300435f00a` | `TimeLib.sol:147` | `TimeTerms storage t = g.terms[id][c.version]` to `TimeTerms memory t = g.terms[id][c.version]` |
| `m-2529b2db2b` | `TimeLib.sol:229` | `TimeTerms storage t = g.terms[id][c.version]` to `TimeTerms memory t = g.terms[id][c.version]` |
| `m-098248569f` | `TimeLib.sol:243` | `TimeEngagement storage e = g.engagements[id]` to `TimeEngagement memory e = g.engagements[id]` |
| `m-8ef5e8eb7d` | `TimeLib.sol:362` | `TimeCycle storage c = g.cycles[id][k]` to `TimeCycle memory c = g.cycles[id][k]` |
| `m-26826ef241` | `TimeLib.sol:363` | `TimeTerms storage t = g.terms[id][c.version]` to `TimeTerms memory t = g.terms[id][c.version]` |
| `m-dd8679c29f` | `TimeLib.sol:381` | `TimeTerms storage t = g.terms[id][v]` to `TimeTerms memory t = g.terms[id][v]` |
| `m-2a044c94cc` | `TimeLib.sol:480` | `TimeTerms storage t0 = g.terms[id][0]` to `TimeTerms memory t0 = g.terms[id][0]` |

## R6. A write of what the slot already holds

The mutated branch writes only values the slots already hold, so the state after is the same.

| Mutant | Where | Change |
|---|---|---|
| `m-136fbcbae7` | `KarwanIdentityRegistry.sol:114` | `kind == Kind.Agent` to `true`. A wallet binding carries no limits (line 106 refuses any), and an unbound wallet's limit slot is zero: bind is its only writer for a wallet and unbind deletes it. |
| `m-ce670f0af9` | `KarwanIdentityRegistry.sol:114` | `==` to `<=`. For a wallet binding the mutant writes zero limits, and the slot is already zero: line 106 refuses limits on a wallet binding, bind is the slot's only writer and unbind deletes it. |
| `m-d5d3140196` | `KarwanJobEscrow.sol:170` | `j.disputed` to `true`. The flag and the dispute record are set together, by `disputeRejection`, and cleared together: `complete` drops the record as it clears the flag, and every ruling deletes the record in `DisputeLib` before `payRuling` clears the flag. So when the flag is false there is no record, the flag is already false, and `drop` deletes nothing. |
| `m-e4649d74d3` | `JobLib.sol:150` | `j.disputed` to `true`. With no dispute the mutant writes false over false and `drop` deletes an empty record. |
| `m-f7edd26f9a` | `SettlementLib.sol:166` | `!=` to `>=`. With a zero rate the mutant writes zero over the zero the account starts with. |
| `m-01afb534c9` | `SettlementLib.sol:302` | `promised != 0` to `true`. With nothing promised the mutant writes zero over zero and subtracts zero. |
| `m-913608bc8d` | `SettlementLib.sol:302` | `!=` to `>=`. With nothing promised the mutant writes zero over zero and subtracts zero. |
| `m-8457647164` | `SettlementLib.sol:353` | `address pool = s.yieldPool[asset]` to `address pool`. The hub sets an asset's pool once, so reading it again writes the same pool. |
| `m-80423f02a1` | `SettlementLib.sol:354` | `pool == address(0)` to `true`. The hub sets an asset's pool once, so reading it again writes the same pool. |
| `m-6a5384840e` | `TimeLib.sol:335` | `g.highValueOf[id] = 0` to `//g.highValueOf[id] = 0`. `highValueOf` is read only on line 332, and `reviewerOf` is written only at the offer and here, so once the senior Safe is the reviewer a later amendment can only write it again. |

## R7. An unsigned value compared with zero, same truth

Every integer in the suite is unsigned, and `bytes32` compares as unsigned, so against `0` or `bytes32(0)` the operators `==` and `<=` (with zero on the right, `>=` with zero on the left) are true for the same values, and so are `!=` and `>` (`<` with zero on the left).

| Mutant | Where | Change |
|---|---|---|
| `m-2befe061d2` | `KarwanAgreementEscrow.sol:39` | `==` to `<=` |
| `m-caab0366e2` | `KarwanAgreementEscrow.sol:39` | `==` to `<=` |
| `m-73cf9a2131` | `KarwanCheckVerifier.sol:38` | `==` to `<=` |
| `m-4a9e757b70` | `KarwanHub.sol:246` | `!=` to `>` |
| `m-d50e82ea64` | `KarwanIdentityRegistry.sol:83` | `!=` to `>` |
| `m-e56992d106` | `KarwanIdentityRegistry.sol:103` | `!=` to `>` |
| `m-d329c41efa` | `KarwanIdentityRegistry.sol:105` | `==` to `<=` |
| `m-e3a75f21ea` | `KarwanIdentityRegistry.sol:106` | `!=` to `>` |
| `m-030a5328f5` | `KarwanIdentityRegistry.sol:106` | `!=` to `>` |
| `m-07747a5bbc` | `KarwanIdentityRegistry.sol:106` | `!=` to `>` |
| `m-20fed6ab14` | `KarwanIdentityRegistry.sol:122` | `==` to `<=` |
| `m-ad69d28810` | `KarwanIdentityRegistry.sol:144` | `==` to `<=` |
| `m-b3807d0749` | `KarwanIdentityRegistry.sol:162` | `==` to `<=` |
| `m-ce351f4de4` | `KarwanIdentityRegistry.sol:177` | `==` to `<=` |
| `m-b3a126fce6` | `KarwanIdentityRegistry.sol:231` | `==` to `<=` |
| `m-451645b6b9` | `KarwanRecord.sol:76` | `==` to `<=` |
| `m-df815a10dc` | `KarwanRecord.sol:77` | `==` to `<=` |
| `m-f470718e16` | `KarwanRecord.sol:77` | `==` to `<=` |
| `m-7e52bdd10c` | `KarwanRecord.sol:97` | `==` to `<=` |
| `m-a4dc42a620` | `KarwanRecord.sol:98` | `==` to `<=` |
| `m-d53c183dc3` | `KarwanStakeVault.sol:97` | `==` to `<=` |
| `m-48abb54f01` | `KarwanStakeVault.sol:111` | `==` to `<=` |
| `m-dfa9d5f88b` | `KarwanStakeVault.sol:128` | `==` to `<=` |
| `m-42ca0f99d1` | `KarwanStakeVault.sol:152` | `==` to `<=` |
| `m-e70534390d` | `KarwanStakeVault.sol:191` | `==` to `<=` |
| `m-ef81a2d4b9` | `KarwanStakeVault.sol:193` | `==` to `<=` |
| `m-15280c8851` | `KarwanStakeVault.sol:220` | `==` to `<=` |
| `m-e4d1486481` | `KarwanStakeVault.sol:270` | `==` to `<=` |
| `m-f4c18c67d5` | `KarwanTradeFinance.sol:121` | `==` to `<=` |
| `m-4aedc4eb45` | `KarwanTradeFinance.sol:125` | `!=` to `>` |
| `m-f79397494d` | `KarwanTradeFinance.sol:141` | `!=` to `>` |
| `m-851e9f08aa` | `KarwanYieldPool.sol:106` | `==` to `<=` |
| `m-5c17ff66d5` | `KarwanYieldPool.sol:119` | `==` to `<=` |
| `m-2426e0fff1` | `KarwanYieldPool.sol:146` | `!=` to `>` |
| `m-7755ed4946` | `KarwanYieldPool.sol:152` | `!=` to `>` |
| `m-ba538521d4` | `KarwanYieldPool.sol:154` | `!=` to `>` |
| `m-840230d18e` | `KarwanYieldPool.sol:168` | `!=` to `>` |
| `m-8b683c6d02` | `KarwanYieldPool.sol:174` | `==` to `<=` |
| `m-e7d2c188b0` | `KarwanYieldPool.sol:183` | `==` to `<=` |
| `m-02c10e9ee2` | `KarwanYieldPool.sol:242` | `==` to `<=` |
| `m-7297bbd276` | `KarwanYieldPool.sol:286` | `==` to `<=` |
| `m-c50f515226` | `KarwanYieldPool.sol:304` | `==` to `<=` |
| `m-feb7af21e2` | `KarwanYieldPool.sol:312` | `==` to `<=` |
| `m-dfd18eb0c2` | `KarwanYieldPool.sol:335` | `==` to `<=` |
| `m-523a8b2876` | `SigCheck.sol:25` | `!=` to `>` |
| `m-a4e0ab12b6` | `AgreementCommon.sol:30` | `==` to `<=` |
| `m-7e6a7eb445` | `AgreementCommon.sol:39` | `==` to `<=` |
| `m-2657aeae67` | `AgreementCommon.sol:60` | `==` to `<=` |
| `m-f0ce82bd63` | `AgreementCommon.sol:63` | `==` to `<=` |
| `m-46c460adcc` | `AgreementDeliveryLib.sol:45` | `==` to `<=` |
| `m-2cbebf5609` | `AgreementDeliveryLib.sol:45` | `!=` to `>` |
| `m-e330a985a8` | `AgreementDeliveryLib.sol:62` | `==` to `<=` |
| `m-c6fb75239b` | `AgreementDeliveryLib.sol:71` | `==` to `<=` |
| `m-98895cd909` | `AgreementDeliveryLib.sol:78` | `==` to `<=` |
| `m-1d7b4ef328` | `AgreementDeliveryLib.sol:92` | `==` to `<=` |
| `m-09a6e7fe64` | `AgreementDeliveryLib.sol:93` | `!=` to `>` |
| `m-4d2012e54f` | `AgreementDeliveryLib.sol:104` | `==` to `<=` |
| `m-e079c99e0d` | `AgreementDeliveryLib.sol:118` | `==` to `<=` |
| `m-747ff4fb7c` | `AgreementDisputeLib.sol:32` | `==` to `<=` |
| `m-253ad478da` | `AgreementDisputeLib.sol:34` | `==` to `<=` |
| `m-5d613bfb9b` | `AgreementDisputeLib.sol:36` | `==` to `<=` |
| `m-99e42fb538` | `AgreementDisputeLib.sol:123` | `!=` to `>` |
| `m-96ac96628f` | `AgreementLib.sol:92` | `!=` to `>` |
| `m-7dc716211a` | `AgreementLib.sol:96` | `!=` to `>` |
| `m-b2005cf540` | `AgreementLib.sol:157` | `!=` to `>` |
| `m-5e8ac48e1b` | `AgreementLib.sol:173` | `==` to `<=` |
| `m-0e6f9bea55` | `AgreementLib.sol:192` | `==` to `<=` |
| `m-a36f8e607a` | `AgreementLib.sol:368` | `==` to `<=` |
| `m-281c0019b8` | `AgreementTermsLib.sol:23` | `==` to `<=` |
| `m-d972ef861f` | `AgreementTermsLib.sol:28` | `!=` to `>` |
| `m-3e36126d07` | `AgreementTermsLib.sol:30` | `==` to `<=` |
| `m-06e4e387d7` | `AgreementTermsLib.sol:30` | `==` to `<=` |
| `m-e3c46a1cb9` | `AgreementTermsLib.sol:37` | `==` to `<=` |
| `m-7b328ba425` | `AgreementTermsLib.sol:41` | `==` to `<=` |
| `m-56b8fb988f` | `AgreementTermsLib.sol:53` | `==` to `<=` |
| `m-ceb708f4df` | `AgreementTermsLib.sol:58` | `!=` to `>` |
| `m-425d1738dc` | `AgreementTermsLib.sol:66` | `==` to `<=` |
| `m-977d65b399` | `AgreementTermsLib.sol:67` | `!=` to `>` |
| `m-687d800b96` | `AgreementTermsLib.sol:67` | `!=` to `>` |
| `m-e88d01d5b3` | `AgreementTermsLib.sol:71` | `==` to `<=` |
| `m-10a54484b1` | `DisputeLib.sol:70` | `!=` to `>` |
| `m-4a5c22751e` | `DisputeLib.sol:85` | `!=` to `>` |
| `m-e0ad57d132` | `DisputeLib.sol:85` | `==` to `<=` |
| `m-b37a638e0d` | `DisputeLib.sol:150` | `==` to `<=` |
| `m-32309c754d` | `BountyLib.sol:43` | `==` to `<=` |
| `m-dbb8d3e6d3` | `BountyLib.sol:43` | `==` to `<=` |
| `m-8a1b80b5bb` | `BountyLib.sol:46` | `==` to `<=` |
| `m-3ebb5c7d17` | `BountyLib.sol:82` | `!=` to `>` |
| `m-822e03bd7a` | `BountyLib.sol:84` | `==` to `<=` |
| `m-ecd6900c64` | `BountyLib.sol:85` | `==` to `<=` |
| `m-3743afd386` | `BountyLib.sol:104` | `==` to `<=` |
| `m-5b658740e9` | `BountyLib.sol:108` | `==` to `<=` |
| `m-5656b6265b` | `BountyLib.sol:147` | `!=` to `>` |
| `m-06e27a1b8c` | `BountyLib.sol:166` | `!=` to `>` |
| `m-4f744eb45f` | `BountyLib.sol:181` | `==` to `<=` |
| `m-a33ce6010b` | `JobLib.sol:110` | `==` to `<=` |
| `m-9d1c7f673c` | `JobLib.sol:120` | `!=` to `>` |
| `m-1650dbce2c` | `JobLib.sol:162` | `!=` to `>` |
| `m-00503b4d85` | `JobLib.sol:187` | `!=` to `>` |
| `m-02b93ef64c` | `JobLib.sol:202` | `==` to `<=` |
| `m-77c869cf43` | `JobLib.sol:213` | `==` to `<=` |
| `m-ee9c8f071d` | `JobLib.sol:238` | `==` to `<=` |
| `m-730ca28d81` | `JobLib.sol:240` | `==` to `<=` |
| `m-9b20857412` | `JobLib.sol:265` | `!=` to `>` |
| `m-979727f18b` | `JobLib.sol:266` | `!=` to `>` |
| `m-71d5455c9d` | `SettlementLib.sol:166` | `!=` to `>` |
| `m-a84e7015be` | `SettlementLib.sol:199` | `==` to `<=` |
| `m-779c01f324` | `SettlementLib.sol:201` | `!=` to `>` |
| `m-f4669110e7` | `SettlementLib.sol:215` | `!=` to `>` |
| `m-c15f31ddb5` | `SettlementLib.sol:232` | `==` to `<=` |
| `m-6437c24872` | `SettlementLib.sol:232` | `!=` to `>` |
| `m-c85451b09d` | `SettlementLib.sol:252` | `==` to `<=` |
| `m-7abb1300e9` | `SettlementLib.sol:266` | `!=` to `>` |
| `m-9028950d7a` | `SettlementLib.sol:267` | `!=` to `>` |
| `m-9a4c470e14` | `SettlementLib.sol:272` | `==` to `<=` |
| `m-dcd8167414` | `SettlementLib.sol:278` | `!=` to `>` |
| `m-8e2ec7fe93` | `SettlementLib.sol:284` | `==` to `<=` |
| `m-439883ea44` | `SettlementLib.sol:294` | `!=` to `>` |
| `m-225b8da94a` | `SettlementLib.sol:302` | `!=` to `>` |
| `m-35c4ad8c5e` | `SettlementLib.sol:323` | `==` to `<=` |
| `m-cd8edcb748` | `SettlementLib.sol:382` | `==` to `<=` |
| `m-c55ddd6565` | `SettlementLib.sol:403` | `==` to `<=` |
| `m-7ff53a3beb` | `SettlementLib.sol:438` | `==` to `<=` |
| `m-19f2e01aa3` | `SettlementLib.sol:440` | `==` to `<=` |
| `m-e147efef85` | `SettlementLib.sol:440` | `!=` to `>` |
| `m-057316b9e6` | `SettlementLib.sol:440` | `==` to `<=` |
| `m-53b3b8700a` | `SettlementLib.sol:463` | `==` to `<=` |
| `m-5b001f584d` | `SettlementLib.sol:501` | `==` to `<=` |
| `m-1fb0e21d8c` | `SettlementLib.sol:537` | `!=` to `>` |
| `m-4f6d42393e` | `SettlementLib.sol:551` | `!=` to `>` |
| `m-c18a435d71` | `SettlementLib.sol:563` | `==` to `<=` |
| `m-37ec67b506` | `TimeLib.sol:87` | `!=` to `>` |
| `m-bb6b70dab2` | `TimeLib.sol:195` | `==` to `<=` |
| `m-dee07106aa` | `TimeLib.sol:247` | `==` to `<=` |
| `m-f158e83c91` | `TimeLib.sol:275` | `!=` to `>` |
| `m-f2ef78eeaa` | `TimeLib.sol:280` | `==` to `<=` |
| `m-62f8207c7b` | `TimeLib.sol:333` | `!=` to `>` |
| `m-d132c1d58e` | `TimeLib.sol:469` | `!=` to `>` |
| `m-1723442ee1` | `TimeLib.sol:490` | `==` to `<=` |
| `m-1cdf1879ca` | `TimeLib.sol:490` | `==` to `<=` |
| `m-5ce9289009` | `TimeLib.sol:490` | `==` to `<=` |
| `m-ef0034ec98` | `TimeLib.sol:493` | `==` to `<=` |
| `m-45773d009a` | `TimeLib.sol:497` | `==` to `<=` |
| `m-5bb9fdcdc7` | `TimeLib.sol:500` | `==` to `<=` |

## R8. `internal` to `private`

The mutant compiles, so nothing outside the declaring contract or library calls the function; both visibilities compile the same call.

| Mutant | Where | Change |
|---|---|---|
| `m-92d7376fea` | `KarwanHub.sol:282` | `...ess family) internal view returns (F...` to `...ess family) private view returns (Fa...` |
| `m-6749312e76` | `KarwanIdentityRegistry.sol:229` | `...ddress who) internal view returns (u...` to `...ddress who) private view returns (ui...` |
| `m-aa6d627ca8` | `KarwanIdentityRegistry.sol:234` | `...ess wallet) internal view...` to `...ess wallet) private view...` |
| `m-5f78c0033f` | `KarwanIdentityRegistry.sol:239` | `function _setController(uint64 id, address next) internal` to `function _setController(uint64 id, address next) private` |
| `m-3b1b453874` | `KarwanRecord.sol:138` | `... uint64 at) internal view returns (b...` to `... uint64 at) private view returns (bo...` |
| `m-cd78b6ef55` | `KarwanStakeVault.sol:267` | `...ess wallet) internal view returns (u...` to `...ess wallet) private view returns (ui...` |
| `m-db1c6c7215` | `KarwanStakeVault.sol:273` | `... storage k) internal view returns (u...` to `... storage k) private view returns (ui...` |
| `m-e6ef5bee21` | `KarwanStakeVault.sol:277` | `function _release(address family, bytes32 ref) internal` to `function _release(address family, bytes32 ref) private` |
| `m-0d1eb23cd1` | `KarwanStakeVault.sol:287` | `...256 amount) internal...` to `...256 amount) private...` |
| `m-af82e825da` | `KarwanYieldPool.sol:266` | `...nt256 line) internal view returns (u...` to `...nt256 line) private view returns (ui...` |
| `m-de008cadfe` | `KarwanYieldPool.sol:275` | `function _subscribe(IYieldTeller t, uint256 excess) internal` to `function _subscribe(IYieldTeller t, uint256 excess) private` |
| `m-44018c3c71` | `KarwanYieldPool.sol:297` | `function _ensureCash(uint256 need) internal` to `function _ensureCash(uint256 need) private` |
| `m-84900f4b2d` | `KarwanYieldPool.sol:311` | `...256 assets) internal view returns (u...` to `...256 assets) private view returns (ui...` |
| `m-0339ceaa46` | `KarwanYieldPool.sol:321` | `...256 shares) internal returns (bool)...` to `...256 shares) private returns (bool)...` |
| `m-c2fc5009f9` | `KarwanYieldPool.sol:332` | `function _sharesWorth() internal view returns (uint256)` to `function _sharesWorth() private view returns (uint256)` |
| `m-0ef8712d58` | `KarwanYieldPool.sol:345` | `...nt256 held) internal view returns (u...` to `...nt256 held) private view returns (ui...` |
| `m-4a5d8e9b04` | `TimeLib.sol:350` | `... uint256 k) internal view returns (u...` to `... uint256 k) private view returns (ui...` |
| `m-19ebe6cdd0` | `TimeLib.sol:354` | `... uint256 k) internal view returns (u...` to `... uint256 k) private view returns (ui...` |

## R9. `pure` to `view`

The body is unchanged and reads no state, so every call returns the same value; only the compiler's check on the body is weaker.

| Mutant | Where | Change |
|---|---|---|
| `m-ad8f65b49a` | `KarwanAgreementEscrow.sol:53` | `...t) external pure returns (bytes32)...` to `...t) external view returns (bytes32)...` |
| `m-3bbeb5d43a` | `KarwanStakeVault.sol:247` | `...ref) public pure returns (bytes32)...` to `...ref) public view returns (bytes32)...` |
| `m-224c890ccf` | `KarwanTimeEscrow.sol:31` | `...t) external pure returns (bytes32)...` to `...t) external view returns (bytes32)...` |
| `m-4be8cca127` | `KarwanTimeEscrow.sol:35` | `...e) external pure returns (bytes32)...` to `...e) external view returns (bytes32)...` |
| `m-81899c1b0e` | `KarwanTimelock.sol:52` | `... a) private pure returns (address[] ...` to `... a) private view returns (address[] ...` |
| `m-529332b3c4` | `AgreementDeliveryLib.sol:158` | `function _revert(bytes4 e) private pure` to `function _revert(bytes4 e) private view` |
| `m-7ec2bc4190` | `AgreementLib.sol:303` | `...ine) public pure returns (bytes32)...` to `...ine) public view returns (bytes32)...` |
| `m-ad25751b59` | `AgreementLib.sol:518` | `... t) private pure returns (uint64)...` to `... t) private view returns (uint64)...` |
| `m-0035d28f38` | `JobLib.sol:47` | `...() internal pure returns (JobTerms m...` to `...() internal view returns (JobTerms m...` |
| `m-ba97b82555` | `SettlementLib.sol:511` | `...ne ) public pure returns (bytes32)...` to `...ne ) public view returns (bytes32)...` |
| `m-508536f119` | `SettlementLib.sol:601` | `function _band(uint256 amount) private pure returns (uint8)` to `function _band(uint256 amount) private view returns (uint8)` |
| `m-31f4bb2b6c` | `TimeLib.sol:342` | `...y t) public pure returns (uint256)...` to `...y t) public view returns (uint256)...` |
| `m-576f63588e` | `TimeLib.sol:368` | `...6 k) public pure returns (bytes32)...` to `...6 k) public view returns (bytes32)...` |
| `m-5b918507f2` | `TimeLib.sol:472` | `... k) private pure returns (uint64)...` to `... k) private view returns (uint64)...` |

## R10. A library function made `internal`

The function is inlined into the contracts that call it instead of reached by `DELEGATECALL`. The same code runs on the same storage with the same `msg.sender`, `msg.value` and `address(this)`, and a revert surfaces the same way. Each of these mutants was also built with the deploy profile and passes the size test (22 Oct 2026, 133 of 133), so every contract still deploys.

| Mutant | Where | Change |
|---|---|---|
| `m-36735592f5` | `AgreementDeliveryLib.sol:20` | `...4 holdUsed) external returns (bool s...` to `...4 holdUsed) internal returns (bool s...` |
| `m-163cdfbe5a` | `AgreementDeliveryLib.sol:44` | `... storage t) external...` to `... storage t) internal...` |
| `m-5280466a55` | `AgreementDeliveryLib.sol:58` | `...4 holdSecs) external returns (bool s...` to `...4 holdSecs) internal returns (bool s...` |
| `m-79fa9f10eb` | `AgreementDeliveryLib.sol:77` | `...4 holdSecs) external...` to `...4 holdSecs) internal...` |
| `m-dce4959fe2` | `AgreementDeliveryLib.sol:87` | `...4 holdSecs) public view returns (uin...` to `...4 holdSecs) internal view returns (u...` |
| `m-f65a48bfb4` | `AgreementDeliveryLib.sol:99` | `...4 holdSecs) public view returns (byt...` to `...4 holdSecs) internal view returns (b...` |
| `m-79a92f0451` | `AgreementDeliveryLib.sol:115` | `... storage t) public view returns (byt...` to `... storage t) internal view returns (b...` |
| `m-43a8d71538` | `AgreementDeliveryLib.sol:123` | `...4 holdSecs) external view...` to `...4 holdSecs) internal view...` |
| `m-6949c3f90b` | `AgreementDeliveryLib.sol:127` | `... storage t) external view...` to `... storage t) internal view...` |
| `m-7355a0ad26` | `AgreementDeliveryLib.sol:132` | `... storage t) external returns (uint25...` to `... storage t) internal returns (uint25...` |
| `m-7be7b15d66` | `AgreementDisputeLib.sol:29` | `...clauseHash) external...` to `...clauseHash) internal...` |
| `m-9c64d4514c` | `AgreementDisputeLib.sol:46` | `...rulingHash) external...` to `...rulingHash) internal...` |
| `m-6535fdff1e` | `AgreementDisputeLib.sol:51` | `...s32 dealId) external...` to `...s32 dealId) internal...` |
| `m-5271c64133` | `AgreementDisputeLib.sol:59` | `...s32 dealId) external...` to `...s32 dealId) internal...` |
| `m-8aec5a1284` | `AgreementDisputeLib.sol:68` | `...ulingHash ) external...` to `...ulingHash ) internal...` |
| `m-77c62dc6fd` | `AgreementDisputeLib.sol:81` | `...s32 dealId) external...` to `...s32 dealId) internal...` |
| `m-6c8238c691` | `AgreementDisputeLib.sol:93` | `...4 openedAt) public...` to `...4 openedAt) internal...` |
| `m-1f884f156d` | `AgreementLib.sol:59` | `...tes32 salt) public view returns (byt...` to `...tes32 salt) internal view returns (b...` |
| `m-ad94438ef0` | `AgreementLib.sol:111` | `...s32 dealId) external...` to `...s32 dealId) internal...` |
| `m-d3dbaba572` | `AgreementLib.sol:131` | `...s32 dealId) external...` to `...s32 dealId) internal...` |
| `m-5e2429152b` | `AgreementLib.sol:156` | `... termsHash) external...` to `... termsHash) internal...` |
| `m-4db91a1a63` | `AgreementLib.sol:163` | `...ldata sig ) external...` to `...ldata sig ) internal...` |
| `m-48d6295dec` | `AgreementLib.sol:190` | `...s32 dealId) external...` to `...s32 dealId) internal...` |
| `m-8072e081dc` | `AgreementLib.sol:212` | `...s32 dealId) external...` to `...s32 dealId) internal...` |
| `m-3c3bf1e3fa` | `AgreementLib.sol:228` | `... proofHash) external...` to `... proofHash) internal...` |
| `m-63c9e54912` | `AgreementLib.sol:240` | `...s32 dealId) external...` to `...s32 dealId) internal...` |
| `m-cd69ee1bcb` | `AgreementLib.sol:247` | `...denceHash ) external...` to `...denceHash ) internal...` |
| `m-674d9c9591` | `AgreementLib.sol:263` | `...s32 dealId) external...` to `...s32 dealId) internal...` |
| `m-7ae5365eb8` | `AgreementLib.sol:274` | `...s32 dealId) external...` to `...s32 dealId) internal...` |
| `m-34f82c4020` | `AgreementLib.sol:284` | `...ldata sig ) external...` to `...ldata sig ) internal...` |
| `m-693d8dcc92` | `AgreementLib.sol:303` | `...6 deadline) public pure returns (byt...` to `...6 deadline) internal pure returns (b...` |
| `m-f9240cec27` | `AgreementLib.sol:313` | `...s32 dealId) external...` to `...s32 dealId) internal...` |
| `m-61b2d530cd` | `AgreementLib.sol:323` | `...s32 dealId) external...` to `...s32 dealId) internal...` |
| `m-bf063871c7` | `AgreementLib.sol:338` | `...wDeadline ) external...` to `...wDeadline ) internal...` |
| `m-e4f488f922` | `AgreementLib.sol:349` | `...ewDeadline) external...` to `...ewDeadline) internal...` |
| `m-402ea8546a` | `AgreementLib.sol:359` | `...wDeadline ) external...` to `...wDeadline ) internal...` |
| `m-4a95998859` | `AgreementLib.sol:375` | `... sellerBps) external...` to `... sellerBps) internal...` |
| `m-11c095adbf` | `AgreementLib.sol:386` | `...s32 dealId) external...` to `...s32 dealId) internal...` |
| `m-006dd701fa` | `AgreementLib.sol:393` | `...sellerBps ) external...` to `...sellerBps ) internal...` |
| `m-b53f594030` | `AgreementLib.sol:413` | `...8 outcome ) public...` to `...8 outcome ) internal...` |
| `m-2230af2ad8` | `DisputeLib.sol:61` | `...s reviewer) external...` to `...s reviewer) internal...` |
| `m-251d6388ea` | `DisputeLib.sol:68` | `...clauseHash) external...` to `...clauseHash) internal...` |
| `m-50ddb45391` | `DisputeLib.sol:79` | `...partialBps) external...` to `...partialBps) internal...` |
| `m-01ed8304f4` | `DisputeLib.sol:95` | `...ol isParty) external...` to `...ol isParty) internal...` |
| `m-32badb8d1d` | `DisputeLib.sol:110` | `...s32 dealId) external returns (uint16...` to `...s32 dealId) internal returns (uint16...` |
| `m-199727060c` | `DisputeLib.sol:119` | `...rulingHash) external returns (uint64...` to `...rulingHash) internal returns (uint64...` |
| `m-4ca0e76fb2` | `DisputeLib.sol:133` | `...allbackBps) external returns (uint64...` to `...allbackBps) internal returns (uint64...` |
| `m-1171a7beaa` | `DisputeLib.sol:144` | `...s32 dealId) external...` to `...s32 dealId) internal...` |
| `m-4c08b37c8f` | `BountyLib.sol:37` | `...calldata t) external returns (uint25...` to `...calldata t) internal returns (uint25...` |
| `m-caa383b700` | `BountyLib.sol:76` | `...eliverable) external...` to `...eliverable) internal...` |
| `m-7617da3ecc` | `BountyLib.sol:95` | `...ta winners) external...` to `...ta winners) internal...` |
| `m-d1ee733d25` | `BountyLib.sol:163` | `...s32 reason) external...` to `...s32 reason) internal...` |
| `m-63edc0e960` | `BountyLib.sol:175` | `...uint256 id) external...` to `...uint256 id) internal...` |
| `m-bc5c236ff3` | `JobDisputeLib.sol:20` | `...rulingHash) external...` to `...rulingHash) internal...` |
| `m-ffe02894a4` | `JobDisputeLib.sol:25` | `function escalate(JobStore storage g, uint256 id) external` to `function escalate(JobStore storage g, uint256 id) internal` |
| `m-564291ef32` | `JobDisputeLib.sol:31` | `...uint256 id) external...` to `...uint256 id) internal...` |
| `m-53f9101079` | `JobDisputeLib.sol:38` | `...ulingHash ) external...` to `...ulingHash ) internal...` |
| `m-7cb29e9367` | `JobDisputeLib.sol:51` | `...uint256 id) external...` to `...uint256 id) internal...` |
| `m-ae03abecfe` | `JobLib.sol:52` | `... memory t ) external returns (uint25...` to `... memory t ) internal returns (uint25...` |
| `m-51220ffa79` | `JobLib.sol:82` | `...s provider) external...` to `...s provider) internal...` |
| `m-896328f1e0` | `JobLib.sol:93` | `...256 amount) external...` to `...256 amount) internal...` |
| `m-6510951d77` | `JobLib.sol:105` | `...6 expected) external...` to `...6 expected) internal...` |
| `m-44dfb8c38a` | `JobLib.sol:130` | `...eliverable) external...` to `...eliverable) internal...` |
| `m-84fa7c923a` | `JobLib.sol:144` | `...s32 reason) external...` to `...s32 reason) internal...` |
| `m-57a4e9d4fd` | `JobLib.sol:160` | `...uint256 id) external...` to `...uint256 id) internal...` |
| `m-b9910724eb` | `JobLib.sol:172` | `...s32 reason) external...` to `...s32 reason) internal...` |
| `m-071a49351b` | `JobLib.sol:199` | `...clauseHash) external...` to `...clauseHash) internal...` |
| `m-a3ff098fd2` | `JobLib.sol:211` | `...uint256 id) external...` to `...uint256 id) internal...` |
| `m-f083d2710e` | `JobLib.sol:223` | `...uint256 id) external...` to `...uint256 id) internal...` |
| `m-30996f0f79` | `JobLib.sol:234` | `...uint16 bps) public...` to `...uint16 bps) internal...` |
| `m-4e52bf5ff6` | `SettlementLib.sol:138` | `...4 horizon ) external returns (IKarwa...` to `...4 horizon ) internal returns (IKarwa...` |
| `m-33ca11fcb7` | `SettlementLib.sol:170` | `...ress payee) external...` to `...ress payee) internal...` |
| `m-3013db0ca4` | `SettlementLib.sol:177` | `...ress payee) external...` to `...ress payee) internal...` |
| `m-2a30338372` | `SettlementLib.sol:196` | `...256 amount) external...` to `...256 amount) internal...` |
| `m-5ae5cbb875` | `SettlementLib.sol:229` | `...256 amount) external...` to `...256 amount) internal...` |
| `m-181970a3a7` | `SettlementLib.sol:241` | `...ress asset) public view returns (boo...` to `...ress asset) internal view returns (b...` |
| `m-047b19f642` | `SettlementLib.sol:251` | `...256 amount) public...` to `...256 amount) internal...` |
| `m-0826d84d8f` | `SettlementLib.sol:271` | `...256 amount) external...` to `...256 amount) internal...` |
| `m-9a537d7ab9` | `SettlementLib.sol:282` | `...ress asset) external...` to `...ress asset) internal...` |
| `m-5ef02ccbcb` | `SettlementLib.sol:292` | `...s32 dealId) public...` to `...s32 dealId) internal...` |
| `m-db43e51501` | `SettlementLib.sol:310` | `...ldata sig ) external...` to `...ldata sig ) internal...` |
| `m-5bc394085c` | `SettlementLib.sol:338` | `...ress payee) external...` to `...ress payee) internal...` |
| `m-7cffb5978b` | `SettlementLib.sol:352` | `...ress asset) external...` to `...ress asset) internal...` |
| `m-386ec430fc` | `SettlementLib.sol:376` | `...reasonHash) external...` to `...reasonHash) internal...` |
| `m-bfa93ddbf6` | `SettlementLib.sol:390` | `...a toPayees) external view...` to `...a toPayees) internal view...` |
| `m-d21b73a1ca` | `SettlementLib.sol:406` | `... toPayees ) external...` to `... toPayees ) internal...` |
| `m-1a1479748b` | `SettlementLib.sol:430` | `...16 detail ) public...` to `...16 detail ) internal...` |
| `m-70b6e2e1c9` | `SettlementLib.sol:454` | `...t256 value) external...` to `...t256 value) internal...` |
| `m-5d067ede6a` | `SettlementLib.sol:460` | `...int8 party) external...` to `...int8 party) internal...` |
| `m-bbaa9c3885` | `SettlementLib.sol:476` | `...64 horizon) external...` to `...64 horizon) internal...` |
| `m-8f47c4dc2a` | `SettlementLib.sol:487` | `...s32 dealId) public view returns (Dea...` to `...s32 dealId) internal view returns (D...` |
| `m-765ef5ed39` | `SettlementLib.sol:492` | `...ddress who) public view returns (boo...` to `...ddress who) internal view returns (b...` |
| `m-aa0329165d` | `SettlementLib.sol:500` | `...int8 party) public view returns (uin...` to `...int8 party) internal view returns (u...` |
| `m-7d10c741e7` | `SettlementLib.sol:506` | `...s32 dealId) public view returns (uin...` to `...s32 dealId) internal view returns (u...` |
| `m-6c3b33a15a` | `SettlementLib.sol:511` | `... deadline ) public pure returns (byt...` to `... deadline ) internal pure returns (b...` |
| `m-d1459652ec` | `TimeDisputeLib.sol:19` | `...rulingHash) external...` to `...rulingHash) internal...` |
| `m-4d65ecf363` | `TimeDisputeLib.sol:25` | `..., uint16 k) external...` to `..., uint16 k) internal...` |
| `m-18264bc2c8` | `TimeDisputeLib.sol:31` | `..., uint16 k) external...` to `..., uint16 k) internal...` |
| `m-103a9c3fea` | `TimeDisputeLib.sol:38` | `...rulingHash) external...` to `...rulingHash) internal...` |
| `m-8ee9e11ce3` | `TimeDisputeLib.sol:46` | `..., uint16 k) external...` to `..., uint16 k) internal...` |
| `m-1d257cc164` | `TimeLib.sol:65` | `...tes32 salt) public view returns (byt...` to `...tes32 salt) internal view returns (b...` |
| `m-84d85e42b8` | `TimeLib.sol:70` | `...calldata t) external returns (bytes3...` to `...calldata t) internal returns (bytes3...` |
| `m-f677564f3c` | `TimeLib.sol:98` | `... termsHash) external...` to `... termsHash) internal...` |
| `m-731d9ddda2` | `TimeLib.sol:111` | `...bytes32 id) external...` to `...bytes32 id) internal...` |
| `m-dc351ad032` | `TimeLib.sol:129` | `...bytes32 id) external...` to `...bytes32 id) internal...` |
| `m-def675b92e` | `TimeLib.sol:140` | `...2 evidence) external...` to `...2 evidence) internal...` |
| `m-d31630bc36` | `TimeLib.sol:158` | `...nt32 units) external...` to `...nt32 units) internal...` |
| `m-3b4aa4d010` | `TimeLib.sol:171` | `..., uint16 k) external...` to `..., uint16 k) internal...` |
| `m-946aa85a9d` | `TimeLib.sol:185` | `...clauseHash) external...` to `...clauseHash) internal...` |
| `m-df0809b0de` | `TimeLib.sol:211` | `..., uint16 k) external...` to `..., uint16 k) internal...` |
| `m-b44e6d51fd` | `TimeLib.sol:224` | `... workerBps) public...` to `... workerBps) internal...` |
| `m-994acfce74` | `TimeLib.sol:242` | `...bytes32 id) external...` to `...bytes32 id) internal...` |
| `m-884d49ded4` | `TimeLib.sol:253` | `...bytes32 id) external...` to `...bytes32 id) internal...` |
| `m-71de418288` | `TimeLib.sol:272` | `...bytes32 id) external...` to `...bytes32 id) internal...` |
| `m-f7e33c493d` | `TimeLib.sol:294` | `...fromCycle ) external...` to `...fromCycle ) internal...` |
| `m-25b5fb2264` | `TimeLib.sol:311` | `...fromCycle ) external...` to `...fromCycle ) internal...` |
| `m-9d87704984` | `TimeLib.sol:342` | `...s memory t) public pure returns (uin...` to `...s memory t) internal pure returns (u...` |
| `m-59d56d8fdd` | `TimeLib.sol:346` | `...t256 units) public pure returns (uin...` to `...t256 units) internal pure returns (u...` |
| `m-fe6681963f` | `TimeLib.sol:361` | `..., uint16 k) public view returns (uin...` to `..., uint16 k) internal view returns (u...` |
| `m-b7aed624f0` | `TimeLib.sol:368` | `..., uint16 k) public pure returns (byt...` to `..., uint16 k) internal pure returns (b...` |

## R11. A loop bound `<` to `!=`

The counter starts at zero and steps by one, so it meets the bound before it can pass it, and `<` and `!=` stop the loop at the same step.

| Mutant | Where | Change |
|---|---|---|
| `m-3d4439642c` | `KarwanCheckVerifier.sol:39` | `<` to `!=` |
| `m-333a8e6fa3` | `KarwanCheckVerifier.sol:62` | `<` to `!=` |
| `m-d3c55c1d2f` | `KarwanRecord.sol:119` | `<` to `!=` |
| `m-804127e37b` | `KarwanRecord.sol:124` | `<` to `!=` |
| `m-a769617f3b` | `KarwanSettlementBase.sol:166` | `<` to `!=` |
| `m-c923c2eb0d` | `AgreementTermsLib.sol:21` | `<` to `!=` |
| `m-f2076f2071` | `BountyLib.sol:45` | `<` to `!=` |
| `m-2c34768584` | `BountyLib.sol:107` | `<` to `!=` |
| `m-393a37d046` | `BountyLib.sol:134` | `<` to `!=` |
| `m-1dc2b20dab` | `BountyLib.sol:144` | `<` to `!=` |
| `m-3128e8d379` | `BountyLib.sol:148` | `<` to `!=` |
| `m-bf61687ffb` | `BountyLib.sol:156` | `<` to `!=` |
| `m-bfa92bcf2c` | `SettlementLib.sol:159` | `<` to `!=` |
| `m-7a46be693f` | `SettlementLib.sol:180` | `<` to `!=` |
| `m-e1173b5b97` | `SettlementLib.sol:400` | `<` to `!=` |
| `m-9dc92e01a8` | `SettlementLib.sol:419` | `<` to `!=` |
| `m-5acae3ea30` | `SettlementLib.sol:494` | `<` to `!=` |

## R12. Equal at the boundary

At the one value where the two operators differ, both branches give the same result.

| Mutant | Where | Change |
|---|---|---|
| `m-7f0dfbc960` | `KarwanStakeVault.sol:190` | `<` to `<=`. At `amount == r.amount` both pick the same value. |
| `m-4c694ce846` | `KarwanTimelock.sol:44` | `>` to `>=`. At `delay == PROTECTED_DELAY` both pick the same delay. |
| `m-f82d1cc291` | `KarwanYieldPool.sol:172` | `>` to `>=`. At cash equal to `keep` both give zero. |
| `m-e5414909c7` | `KarwanYieldPool.sol:173` | `>` to `>=`. At `amount == spare` both leave the same amount. |
| `m-f4afb318ce` | `KarwanYieldPool.sol:250` | `>` to `>=`. At equality both return the same target. |
| `m-1d965bd2e1` | `KarwanYieldPool.sol:261` | `>=` to `>`. At `v == totalPrincipal` both give zero. |
| `m-27815ccd58` | `KarwanYieldPool.sol:283` | `>` to `>=`. At `excess == room` both leave the same amount. |
| `m-7fa061b37d` | `KarwanYieldPool.sol:285` | `>` to `>=`. At `cost == v - line` the subscription is scaled by one and stays the same. |
| `m-fa574eeb8b` | `KarwanYieldPool.sol:315` | `>=` to `>`. At `back == assets` both give zero. |
| `m-ed6ff6fa56` | `KarwanYieldPool.sol:351` | `>` to `>=`. At `want == held` both keep the same request. |
| `m-311ae20372` | `AgreementCommon.sol:51` | `>` to `>=`. At `horizon == cap` both pass the same value. |
| `m-ad0e4eab1c` | `AgreementDeliveryLib.sol:168` | `<` to `<=`. At `block.timestamp == latest` both pick the same time. |
| `m-c38d7c94a3` | `AgreementLib.sol:144` | `>` to `>=`. At `toSeller == balance` both leave the same amount. |
| `m-7fd89919b6` | `AgreementLib.sol:520` | `>` to `>=`. At `h` exactly the 64-bit maximum both return the same value. |
| `m-24af3a419a` | `SettlementLib.sol:261` | `<` to `<=`. At `amount == left` both take the same cut. |
| `m-6b3a56d6b3` | `SettlementLib.sol:360` | `>` to `>=`. At equality both leave the same target. |
| `m-7f1aa17474` | `SettlementLib.sol:381` | `>` to `>=`. At `holdUsed + step == HOLD_BUDGET` the step is set to the same value. |
| `m-c2f0b048e8` | `SettlementLib.sol:554` | `>` to `>=`. At `left == share` both give zero. |
| `m-9baa97147e` | `SettlementLib.sol:565` | `>` to `>=`. At `target == held` both leave the same target. |
| `m-8b2ca5b4b0` | `TimeLib.sol:384` | `<` to `<=`. At `carry == total` both pick the same amount. |
| `m-61d1a0ec02` | `TimeLib.sol:444` | `>` to `>=`. At `runs == e.runs` both keep the same count. |

## R13. A case that cannot happen

The mutant differs only in a state the contract never reaches, for the reason given.

| Mutant | Where | Change |
|---|---|---|
| `m-315cc4e195` | `KarwanAgreementEscrow.sol:94` | `>=` to `==`. `partsPaid` never passes `parts`: `payPart` refuses once every part is paid. |
| `m-bb7fc27e48` | `KarwanIdentityRegistry.sol:104` | `==` to `>=`. `Kind.Agent` is the enum's last value and the decoder refuses a larger one, so `>=` against it holds exactly when `==` does. |
| `m-2cddedb4f7` | `KarwanIdentityRegistry.sol:106` | `!=` to `<`. In this branch the kind is not `Agent`, and the decoder refuses a value past the enum, so it is `None` or `Wallet`, where `!=` and `<` against `Wallet` agree. |
| `m-afe0f941b8` | `KarwanIdentityRegistry.sol:114` | `==` to `>=`. `Kind.Agent` is the enum's last value and the decoder refuses a larger one, so `>=` against it holds exactly when `==` does. |
| `m-f0fc44d90d` | `KarwanIdentityRegistry.sol:189` | `!=` to `<`. `Kind.Agent` is the enum's last value and the decoder refuses a larger one, so `<` against it holds exactly when `!=` does. |
| `m-303e3a58ba` | `KarwanIdentityRegistry.sol:202` | `==` to `>=`. `Kind.Agent` is the enum's last value and the decoder refuses a larger one, so `>=` against it holds exactly when `==` does. |
| `m-21ab40f372` | `KarwanIdentityRegistry.sol:208` | `==` to `<=`. Only an agent binding has an expiry: a wallet binding with one is refused (line 106) and an unbound wallet's slot is zero. |
| `m-b248ffa80a` | `KarwanIdentityRegistry.sol:208` | `==` to `>=`. `Kind.Agent` is the enum's last value and the decoder refuses a larger one, so `>=` against it holds exactly when `==` does. |
| `m-d102db1fd1` | `KarwanIdentityRegistry.sol:236` | `!=` to `>`. `id` here is a controller's, so not zero, and every binding with a nonzero id has kind `Wallet` or `Agent` (bind refuses `None` at line 106), so `!=` and `>` against `Wallet` agree whenever `b.id == id`. |
| `m-2b948d412d` | `KarwanTradeFinance.sol:163` | `>=` to `==`. Here the assignment's amount equals `l.repay` (line 157), and `SettlementLib` never credits an assignee past its amount, so `paid` cannot exceed `l.repay`. |
| `m-b101e0605b` | `KarwanYieldPool.sol:152` | `<` to `!=`. This branch is reached only with cash at most the target (line 150), where `<` and `!=` agree. |
| `m-dfc9713128` | `SigCheck.sol:24` | `==` to `<=`. `NoError` is the first value of `ECDSA.RecoverError`, so `<=` against it holds exactly when `==` does. |
| `m-058e8ea839` | `AgreementCommon.sol:63` | `<=` to `==`. The vault's expiry for this deal is written only by this escrow: at acceptance and by `extend`, each time to `stakeExpiry`, and the horizon behind it only moves later. So `want` is never below `until`, where `<=` and `==` agree. |
| `m-d26001fd34` | `AgreementDeliveryLib.sol:24` | `<` to `!=`. `partsPaid` never passes `parts`: `fund` pays the first part and `payPart` refuses once every part is paid, so `<` and `!=` agree. |
| `m-c7778edf37` | `AgreementDeliveryLib.sol:35` | `==` to `<=`. `START_ON_DELIVERY` is the first value the field takes, zero, so `<=` against it holds exactly when `==` does. |
| `m-8028a16ff5` | `AgreementDeliveryLib.sol:46` | `t.reviewStarts == C.START_ON_DELIVERY` to `false`. For a review that starts on delivery, `mark` started it, so line 45 has already reverted `BadState` (`reviewStartAt` is set, or `deliveredAt` was cleared by a payment). |
| `m-df6077ef13` | `AgreementDeliveryLib.sol:46` | `==` to `<`. For a review that starts on delivery, `mark` started it, so line 45 has already reverted `BadState`. |
| `m-e4553a5f88` | `AgreementDeliveryLib.sol:46` | `==` to `<=`. `START_ON_DELIVERY` is zero, the field's first value, so `<=` against it holds exactly when `==` does. |
| `m-8b074d114c` | `AgreementDeliveryLib.sol:47` | `==` to `>=`. `START_ON_CHECK` is the largest value `AgreementTermsLib` accepts for the field, so `>=` against it holds exactly when `==` does. |
| `m-6ab946c594` | `AgreementDeliveryLib.sol:80` | `>=` to `==`. `extUsed` grows by one, is refused here at the maximum and is reset by each delivery and payment, so it never passes `maxExtensions`. |
| `m-7e4dd0acb0` | `AgreementDeliveryLib.sol:105` | `==` to `>=`. `SILENCE_REFUNDS_BUYER` is the largest value `AgreementTermsLib` accepts for the field, so `>=` against it holds exactly when `==` does. |
| `m-ef235833a1` | `AgreementDeliveryLib.sol:108` | `==` to `>=`. `START_ON_CHECK` is the largest value `AgreementTermsLib` accepts for the field, so `>=` against it holds exactly when `==` does. |
| `m-1711e9eb0a` | `AgreementDeliveryLib.sol:109` | `==` to `>=`. `FINAL_BY_BUYER` is the largest value `AgreementTermsLib` accepts for the field, so `>=` against it holds exactly when `==` does. |
| `m-3e05b492dc` | `AgreementDeliveryLib.sol:109` | `==` to `>=`. `FINAL_BY_BUYER` is the largest value `AgreementTermsLib` accepts for the field, so `>=` against it holds exactly when `==` does. |
| `m-dd17b25940` | `AgreementDeliveryLib.sol:116` | `<` to `!=`. `partsPaid` never passes `parts`: `fund` pays the first part and `payPart` refuses once every part is paid, so `<` and `!=` agree. |
| `m-7ecab781ee` | `AgreementDeliveryLib.sol:118` | `==` to `>=`. `SILENCE_REFUNDS_BUYER` is the largest value `AgreementTermsLib` accepts for the field, so `>=` against it holds exactly when `==` does. |
| `m-8046a36a72` | `AgreementDeliveryLib.sol:119` | `==` to `<=`. `reviewStarts` is at most `START_ON_CHECK`, so `<=` is always true; the two differ only where `checkFailed` is set on a deal without a check, and only a deal with a check has a verifier to fail it (`AgreementTermsLib` line 42, `attestCheck`). |
| `m-332241efe6` | `AgreementDeliveryLib.sol:119` | `==` to `>=`. `START_ON_CHECK` is the largest value `AgreementTermsLib` accepts for the field, so `>=` against it holds exactly when `==` does. |
| `m-b554c9b75d` | `AgreementDeliveryLib.sol:137` | `>=` to `==`. `paid` never passes `count`, so `>=` and `==` agree. |
| `m-d20b278c7b` | `AgreementDeliveryLib.sol:137` | `>=` to `>`. `paid` reaches `count` only with the last tranche, which settles the deal, so at `i == count` the state test has already reverted `BadState`. |
| `m-2fcc886c9c` | `AgreementDeliveryLib.sol:138` | `==` to `>=`. Line 137 refuses `i >= d.count`, so `i + 1` is at most `d.count`, where `>=` and `==` agree. |
| `m-1908c325ad` | `AgreementDeliveryLib.sol:159` | `==` to `>=`. `e` is zero or one of the three selectors, and `BadState`'s (0x8523b62a) is the largest, so `>=` against it holds exactly when `==` does. |
| `m-46e9f12492` | `AgreementDeliveryLib.sol:160` | `==` to `>=`. After line 159 `e` is zero, `NotAllowed` or `Early`, and `NotAllowed`'s selector (0x3d693ada) is above `Early`'s (0x3b334652), so `>=` holds exactly when `==` does. |
| `m-6b8bd22c1d` | `AgreementDeliveryLib.sol:161` | `==` to `>=`. After lines 159 and 160 `e` is zero or `Early`'s selector, which is above zero, so `>=` holds exactly when `==` does. |
| `m-e8e182b470` | `AgreementLib.sol:114` | `>=` to `==`. This line refuses a part once every part is paid, so `partsPaid` never passes `parts`. |
| `m-e421c72fa1` | `AgreementLib.sol:117` | `==` to `>=`. Line 114 has refused a part once every part is paid, so `partsPaid + 1` is at most `parts`. |
| `m-6d3a7d1e09` | `AgreementLib.sol:121` | `==` to `>=`. Line 114 refuses a part once every part is paid, so `partsPaid` reaches `parts` at most. |
| `m-019ec36b1d` | `AgreementLib.sol:137` | `>=` to `==`. `partsPaid` never passes `parts`. |
| `m-ce2a4d99fe` | `AgreementLib.sol:328` | `==` to `>=`. `SILENCE_REFUNDS_BUYER` is the largest value `AgreementTermsLib` accepts for the field, so `>=` against it holds exactly when `==` does. |
| `m-0b03b9ec45` | `AgreementLib.sol:353` | `>=` to `==`. `extRequests` only grows by one, and this line refuses it at the maximum, so it never passes `MAX_EXTENSION_REQUESTS`. |
| `m-a46229cb1d` | `AgreementLib.sol:403` | `!=` to `<`. The offer records `d.paid` when it is made and `d.paid` only grows, so `o.paid` is never above it and `!=` and `<` agree. |
| `m-0a82aadeee` | `AgreementLib.sol:468` | `<` to `!=`. `partsPaid` never passes `parts`: `fund` pays the first part and `payPart` refuses once every part is paid, so `<` and `!=` agree. |
| `m-31c2ab3619` | `AgreementLib.sol:478` | `>=` to `==`. `partsPaid` never passes `parts`. |
| `m-ef8125b82d` | `AgreementLib.sol:497` | `<` to `!=`. `partsPaid` never passes `parts`: `fund` pays the first part and `payPart` refuses once every part is paid, so `<` and `!=` agree. |
| `m-538cf452b3` | `AgreementTermsLib.sol:27` | `<` to `!=`. `count` is at most `MAX_TRANCHES` (the first loop stops there), and the counter steps by one from it, so `<` and `!=` stop the loop at the same step. |
| `m-5644271ac8` | `AgreementTermsLib.sol:37` | `!=` to `>`. `START_ON_DELIVERY` is zero, so `>` against it holds exactly when `!=` does. |
| `m-35623ba810` | `AgreementTermsLib.sol:40` | `==` to `>=`. `START_ON_CHECK` is the largest value `AgreementTermsLib` accepts for the field, so `>=` against it holds exactly when `==` does. |
| `m-dd5681550f` | `AgreementTermsLib.sol:59` | `!=` to `<`. `FINAL_BY_BUYER` is the largest value `AgreementTermsLib` accepts for the field, so `<` against it holds exactly when `!=` does. |
| `m-d14502fe8f` | `AgreementTermsLib.sol:59` | `!=` to `<`. `FINAL_BY_BUYER` is the largest value `AgreementTermsLib` accepts for the field, so `<` against it holds exactly when `!=` does. |
| `m-2168078442` | `AgreementTermsLib.sol:72` | `==` to `>=`. `SILENCE_REFUNDS_BUYER` is the largest value `AgreementTermsLib` accepts for the field, so `>=` against it holds exactly when `==` does. |
| `m-8848242ae0` | `BountyLib.sol:104` | `!=` to `<`. `n > places` has already reverted, so `n` is at most `places`, where `!=` and `<` agree. |
| `m-7421df7dd9` | `BountyLib.sol:196` | `!=` to `>`. A contest opens already `Funded`, so its status is never below it, where `>` and `!=` agree. |
| `m-adc04498af` | `JobLib.sol:85` | `!=` to `>`. `Open` is the first value of `JobStatus`, so `>` against it holds exactly when `!=` does. |
| `m-92b8467455` | `JobLib.sol:96` | `!=` to `>`. `Open` is the first value of `JobStatus`, so `>` against it holds exactly when `!=` does. |
| `m-e298f0d823` | `JobLib.sol:110` | `!=` to `>`. `Open` is the first value of `JobStatus`, so `>` against it holds exactly when `!=` does. |
| `m-88d0d28088` | `JobLib.sol:177` | `==` to `<=`. `Open` is the first value of `JobStatus`, so `<=` against it holds exactly when `==` does. |
| `m-0c94545ca5` | `JobLib.sol:181` | `==` to `<=`. After the `Open` branch the status is `Funded` or later, so `<=` and `==` agree. |
| `m-55d415c0d5` | `JobLib.sol:185` | `==` to `<=`. The escrow sends a bounty's reject to `BountyLib.cancel` (KarwanJobEscrow line 110), so a job here is never a bounty, and after the two branches above the status is `Submitted` or later, where `<=` and `==` agree. |
| `m-51954c8a0e` | `SettlementLib.sol:172` | `!=` to `<`. The balance only grows by funding, which grows `funded` with it, so it is never above `funded`, where `!=` and `<` agree. |
| `m-a96610c91c` | `SettlementLib.sol:259` | `<` to `!=`. `g.paid` never passes `g.amount`: the cut below is capped at what is left. |
| `m-de94567738` | `SettlementLib.sol:265` | `>` to `!=`. The cut is capped at the amount (line 261), so `>` and `!=` agree. |
| `m-187586b2e3` | `SettlementLib.sol:268` | `>` to `!=`. The cut is capped at the amount (line 261), so `>` and `!=` agree. |
| `m-4573c93048` | `SettlementLib.sol:369` | `>` to `!=`. This branch follows `parked < target`, so `parked` is at least `target`, where `>` and `!=` agree. |
| `m-873b703353` | `SettlementLib.sol:533` | `==` to `>=`. This line refuses a payee once there are `MAX_PAYEES`, so the count never passes it. |
| `m-ab010134ee` | `TimeLib.sol:203` | `>` to `!=`. `units` is at most `claimed - approved` (line 195), so `undisputed` is never below `approved`, where `>` and `!=` agree. |
| `m-e84a058902` | `TimeLib.sol:212` | `_live(g, id)` to `//_live(g, id)`. `dropObjection` needs a disputed cycle, a cycle is disputed only on a live engagement, and an engagement with a cycle still open cannot close, so `_live` always passes here. |
| `m-2a588d7338` | `TimeLib.sol:227` | `_live(g, id)` to `//_live(g, id)`. `payRuling` is reached only through `TimeDisputeLib` for a disputed cycle, and an engagement with a cycle still open cannot close (`close` refuses `open != 0`, `cancelOffer` runs only before acceptance), so `_live` always passes here. |
| `m-d8af8b052c` | `TimeLib.sol:259` | `!=` to `<`. `endAskedIn` is an earlier value of `cur`, the cycles started on the fixed first terms, which never decreases, so `!=` and `<` agree. |
| `m-1588e9f31e` | `TimeLib.sol:276` | `<` to `!=`. `nextCycle` never passes `runs`: funding stops at `runs`, notice cuts `nextCycle` back with it, and an amendment keeps `cycles` at least `fromCycle`, itself at least `nextCycle`. |
| `m-dd07244e15` | `TimeLib.sol:365` | `>` to `!=`. `approved` never passes `claimed`: approvals and silence take at most the units claimed, so `>` and `!=` agree. |
| `m-af2ba6766b` | `TimeLib.sol:377` | `>=` to `==`. `nextCycle` never passes `runs`, so `>=` and `==` agree. |
| `m-08d5eb962c` | `TimeLib.sol:391` | `>` to `!=`. `carried` is capped at `total` (line 384), so `>` and `!=` agree. |
| `m-bbf099e3c9` | `TimeLib.sol:412` | `==` to `<=`. Settling happens only while the engagement is `Active` or `Ending`, where `<=` against `Active` holds exactly when `==` does. |
| `m-c15a86eb1f` | `TimeLib.sol:412` | `<` to `!=`. `nextCycle` never passes `runs`, so `<` and `!=` agree. |
| `m-e864ba5dfe` | `TimeLib.sol:425` | `<=` to `==`. Every caller passes the gross of at least the units already approved, and what is paid is always the gross of the approved units, so `gross` is never below `old`. |
| `m-f6116f7ba3` | `TimeLib.sol:452` | `<` to `!=`. The loop starts at `runs`, below `funded` (line 449), and steps by one, so `<` and `!=` stop at the same step. |
| `m-be332b12c4` | `TimeLib.sol:484` | `>=` to `==`. `version` grows by one per accepted amendment and this line refuses it at the maximum, so it never passes `MAX_VERSIONS`. |

## R14. A type narrowed where the value fits

The value is bounded below the narrower type's maximum, for the reason given, so it is never truncated and the arithmetic gives the same result.

| Mutant | Where | Change |
|---|---|---|
| `m-c8d6f07d11` | `KarwanRecord.sol:118` | `uint256 n` to `uint128 n`. `n` counts entries of one array and never passes its length, which cannot reach 2^128. |
| `m-5d46548cbd` | `KarwanStakeVault.sol:127` | `uint256 amount = k.cooling` to `uint128 amount = k.cooling`. The value comes from `k.cooling`, a `uint128` field. |
| `m-91214381c8` | `KarwanStakeVault.sol:274` | `return uint256(k.active) - k.reserved - k.cooling` to `return uint128(k.active) - k.reserved - k.cooling`. All three fields are `uint128` and `active` always covers `reserved` plus `cooling`, so the difference is the same in either width, and both revert if it ever did not. |
| `m-3887a322a2` | `KarwanTradeFinance.sol:123` | `expiresAt < uint256(r.horizon) + LONGSTOP + SETTLE_WINDOW` to `expiresAt < uint128(r.horizon) + LONGSTOP + SETTLE_WINDOW`. The horizon is a `uint64` and the two constants are days, so the sum is far below 2^128. |
| `m-6986d28a54` | `KarwanTradeFinance.sol:169` | `uint256 shortfall = uint256(l.repay) - paid` to `uint128 shortfall = uint128(l.repay) - paid`. `l.repay` is a `uint128` and `paid` is below it here, so the difference fits. |
| `m-dad97bba36` | `KarwanYieldPool.sol:318` | `return type(uint256).max` to `return type(uint128).max`. The cost only meets `cost > v - line` and `excess * (v - line) / cost`; both sentinels exceed any value the pool holds, and the product stays below 2^128 unless amounts pass 2^64 (about 1.8e13 units of a 6-decimal token), so both give zero. |
| `m-007e6f3e23` | `AgreementDeliveryLib.sol:25` | `block.timestamp > uint256(d.deadline) + t.reclaimGrace` to `block.timestamp > uint128(d.deadline) + t.reclaimGrace`. The deadline is a `uint64` and the grace a bounded duration, so the sum is far below 2^128. |
| `m-101dc3effd` | `AgreementDeliveryLib.sol:65` | `...tamp >= uint256(d.deliveredAt) + t.s...` to `...tamp >= uint128(d.deliveredAt) + t.s...`. A `uint64` time plus bounded durations, far below 2^128. |
| `m-819f7b66d6` | `AgreementDeliveryLib.sol:79` | `block.timestamp >= uint256(d.reviewEnd) + holdSecs` to `block.timestamp >= uint128(d.reviewEnd) + holdSecs`. A `uint64` time plus bounded durations, far below 2^128. |
| `m-44ea4edaa4` | `AgreementDeliveryLib.sol:107` | `...tamp >= uint256(d.deliveredAt) + t.s...` to `...tamp >= uint128(d.deliveredAt) + t.s...`. The delivery time is a `uint64` and the longstop and holds are bounded durations, so the sum is far below 2^128. |
| `m-19d6e7a5f8` | `AgreementDeliveryLib.sol:117` | `block.timestamp <= uint256(d.deadline) + t.reclaimGrace` to `block.timestamp <= uint128(d.deadline) + t.reclaimGrace`. A `uint64` time plus a bounded duration, far below 2^128. |
| `m-d32a21ea6f` | `AgreementDisputeLib.sol:98` | `...dealId, uint256(d.deadline) + t.recl...` to `...dealId, uint128(d.deadline) + t.recl...`. The deadline is a `uint64` and the three durations are bounded, so the sum is far below 2^128. |
| `m-7a09be1a85` | `AgreementLib.sol:87` | `d.sellerNet = uint128(uint256(t.amount) - (fee - buyerFee))` to `d.sellerNet = uint128(uint128(t.amount) - (fee - buyerFee))`. `t.amount` is a `uint128` field. |
| `m-0fd6acd478` | `AgreementLib.sol:117` | `...uint256 amount = d.partsPaid...` to `...uint128 amount = d.partsPaid...`. Both sides are bounded by the deal's amount, a `uint128`. |
| `m-c0b9253515` | `AgreementLib.sol:140` | `uint256 balance = a.balance` to `uint128 balance = a.balance`. The value comes from the account's balance, a `uint128` field. |
| `m-15e78b2682` | `AgreementLib.sol:218` | `uint256 amount = s.accounts[dealId].balance` to `uint128 amount = s.accounts[dealId].balance`. The value comes from the account's balance, a `uint128` field. |
| `m-1d4b1568d4` | `AgreementLib.sol:234` | `...dealId, uint256(d.deliveredAt) + t.s...` to `...dealId, uint128(d.deliveredAt) + t.s...`. A `uint64` time plus bounded durations, far below 2^128. |
| `m-b0fc5c6043` | `AgreementLib.sol:329` | `uint256 amount = s.accounts[dealId].balance` to `uint128 amount = s.accounts[dealId].balance`. The value comes from the account's balance, a `uint128` field. |
| `m-84770196d3` | `AgreementLib.sol:423` | `uint256 net = d.sellerNet - d.released` to `uint128 net = d.sellerNet - d.released`. Both fields are `uint128` and `released` never passes `sellerNet`. |
| `m-d788cf19c5` | `AgreementLib.sol:424` | `uint256 fee = d.feeTotal - d.feeReleased` to `uint128 fee = d.feeTotal - d.feeReleased`. Both fields are `uint128` and `feeReleased` never passes `feeTotal`. |
| `m-98e2bac892` | `AgreementLib.sol:479` | `...uint256 due = uint256(d.fund...` to `...uint128 due = uint128(d.fund...`. `fundedAt` is a `uint64`, `partsPaid` a `uint8` and `partEvery` a `uint32`, so the sum is far below 2^128. |
| `m-8c972631a2` | `AgreementLib.sol:487` | `...uint256 lastDue = uint256(d....` to `...uint128 lastDue = uint128(d....`. `fundedAt` is a `uint64`, `parts - 1` fits a `uint8` and `partEvery` is a `uint32`, so the sum is far below 2^128. |
| `m-1edbec7891` | `AgreementLib.sol:490` | `...dealId, uint256(d.deadline) + t.recl...` to `...dealId, uint128(d.deadline) + t.recl...`. A `uint64` time plus bounded durations, far below 2^128. |
| `m-eee154cb5f` | `AgreementLib.sol:513` | `...dealId, uint256(newDeadline) + t.rec...` to `...dealId, uint128(newDeadline) + t.rec...`. A `uint64` deadline plus bounded durations, far below 2^128. |
| `m-28bb0fe381` | `AgreementLib.sol:519` | `...uint256 h = uint256(t.delive...` to `...uint128 h = uint128(t.delive...`. Each term is a `uint64` time or a bounded duration, so the sum is far below 2^128 and the cap on the next line compares the same value. |
| `m-ef5e1425b1` | `AgreementTermsLib.sol:20` | `uint256 sum` to `uint128 sum`. The sum of at most `MAX_TRANCHES` `uint16` shares. |
| `m-1d335b326b` | `AgreementTermsLib.sol:47` | `...gstop < uint256(t.startLongstop) + t...` to `...gstop < uint128(t.startLongstop) + t...`. Two bounded durations, far below 2^128, and the last term is a `uint256`. |
| `m-58ad7beaf2` | `AgreementTermsLib.sol:71` | `...stamp + uint256(t.parts - 1) * t.par...` to `...stamp + uint128(t.parts - 1) * t.par...`. `parts - 1` fits a `uint8` and `partEvery` is a `uint32`, so the product is far below 2^128. |
| `m-450513d436` | `DisputeLib.sol:101` | `block.timestamp >= uint256(x.proposedAt) + APPEAL_WINDOW` to `block.timestamp >= uint128(x.proposedAt) + APPEAL_WINDOW`. A `uint64` time plus bounded durations, far below 2^128. |
| `m-2acf8d3b86` | `DisputeLib.sol:102` | `block.timestamp < uint256(x.openedAt) + PROPOSAL_WINDOW` to `block.timestamp < uint128(x.openedAt) + PROPOSAL_WINDOW`. A `uint64` time plus a constant window, far below 2^128. |
| `m-ad822b32d7` | `DisputeLib.sol:113` | `block.timestamp < uint256(x.proposedAt) + APPEAL_WINDOW` to `block.timestamp < uint128(x.proposedAt) + APPEAL_WINDOW`. `proposedAt` is a `uint64` and the window a constant, so the sum is far below 2^128. |
| `m-4e89b86e7f` | `DisputeLib.sol:126` | `block.timestamp >= uint256(x.escalatedAt) + RULING_PERIOD` to `block.timestamp >= uint128(x.escalatedAt) + RULING_PERIOD`. A `uint64` time plus bounded durations, far below 2^128. |
| `m-b9c7fc822a` | `DisputeLib.sol:139` | `block.timestamp < uint256(x.escalatedAt) + RULING_PERIOD` to `block.timestamp < uint128(x.escalatedAt) + RULING_PERIOD`. A `uint64` time plus a constant period, far below 2^128. |
| `m-953217475a` | `BountyLib.sol:44` | `uint256 sum` to `uint128 sum`. The sum of at most `MAX_PLACES` `uint16` shares. |
| `m-e84f37b664` | `BountyLib.sol:134` | `uint256 i` to `uint128 i`. The counter runs to the number of winners, an array's length, which cannot reach 2^128. |
| `m-4393be610b` | `BountyLib.sol:186` | `uint256 back = s.accounts[key].balance` to `uint128 back = s.accounts[key].balance`. The value comes from the account's balance, a `uint128` field. |
| `m-5578ab7e8b` | `JobLib.sol:116` | `...uint64( uint256(j.expiredAt) + j.rev...` to `...uint64( uint128(j.expiredAt) + j.rev...`. A `uint64` time plus bounded durations, far below 2^128. |
| `m-d12bcda6ac` | `JobLib.sol:163` | `block.timestamp < uint256(j.submittedAt) + j.reviewWindow` to `block.timestamp < uint128(j.submittedAt) + j.reviewWindow`. `submittedAt` is a `uint64` and the review window a `uint32`, so the sum is far below 2^128. |
| `m-e4567ec80d` | `JobLib.sol:188` | `block.timestamp >= uint256(j.submittedAt) + j.reviewWindow` to `block.timestamp >= uint128(j.submittedAt) + j.reviewWindow`. A `uint64` time plus bounded durations, far below 2^128. |
| `m-eb1936c75c` | `JobLib.sol:203` | `block.timestamp >= uint256(j.rejectedAt) + REJECT_WINDOW` to `block.timestamp >= uint128(j.rejectedAt) + REJECT_WINDOW`. `rejectedAt` is a `uint64` and the window a constant, so the sum is far below 2^128. |
| `m-65be98b4aa` | `JobLib.sol:214` | `block.timestamp < uint256(j.rejectedAt) + REJECT_WINDOW` to `block.timestamp < uint128(j.rejectedAt) + REJECT_WINDOW`. `rejectedAt` is a `uint64` and the window a constant, so the sum is far below 2^128. |
| `m-3569218ecc` | `SettlementLib.sol:200` | `uint256 promised = a.promised` to `uint128 promised = a.promised`. The value comes from `a.promised`, a `uint128` field. |
| `m-1d99fbdc63` | `SettlementLib.sol:209` | `uint256(a.balance) + amount > a.perDealCap` to `uint128(a.balance) + amount > a.perDealCap`. The other operand is a `uint256`, so the expression is still computed in uint256. |
| `m-4388ccbefe` | `SettlementLib.sol:233` | `uint256(a.balance) + amount > a.perDealCap` to `uint128(a.balance) + amount > a.perDealCap`. The other operand is a `uint256`, so the expression is still computed in uint256. |
| `m-26e9633366` | `SettlementLib.sol:260` | `uint256 left = uint256(g.amount) - g.paid` to `uint128 left = uint128(g.amount) - g.paid`. `g.amount` is a `uint128` and `g.paid` never passes it. |
| `m-3b38b890be` | `SettlementLib.sol:301` | `uint256 promised = a.promised` to `uint128 promised = a.promised`. The value comes from `a.promised`, a `uint128` field. |
| `m-2a04421440` | `SettlementLib.sol:396` | `block.timestamp < uint256(a.horizon) + LONGSTOP` to `block.timestamp < uint128(a.horizon) + LONGSTOP`. A `uint64` horizon plus a constant, far below 2^128. |
| `m-f9b0d52583` | `TimeLib.sol:115` | `uint256 amount = s.accounts[id].balance` to `uint128 amount = s.accounts[id].balance`. The value comes from the account's balance, a `uint128` field. |
| `m-1468d82c75` | `TimeLib.sol:149` | `block.timestamp >= uint256(cycleEnd(t0, k)) + t.claimGrace` to `block.timestamp >= uint128(cycleEnd(t0, k)) + t.claimGrace`. A `uint64` time plus bounded durations, far below 2^128. |
| `m-22e1e4fa05` | `TimeLib.sol:192` | `...uint256 claimsEnd = uint256(...` to `...uint128 claimsEnd = uint128(...`. A `uint64` time plus a bounded grace, far below 2^128. |
| `m-4b8a1fb618` | `TimeLib.sol:247` | `...uint256 notice = g.terms[id]...` to `...uint128 notice = g.terms[id]...`. `noticeCycles` is a `uint8` field. |
| `m-5beffc6b8e` | `TimeLib.sol:277` | `uint256 refund = e.carry` to `uint128 refund = e.carry`. The value comes from `e.carry`, a `uint128` field. |
| `m-0a335a8fa7` | `TimeLib.sol:347` | `return (uint256(t.rate) * units) / t.unitScale` to `return (uint128(t.rate) * units) / t.unitScale`. The other operand is a `uint256`, so the expression is still computed in uint256. |
| `m-298d258995` | `TimeLib.sol:351` | `return uint64(uint256(t0.startsAt) + k * t0.cycleSecs)` to `return uint64(uint128(t0.startsAt) + k * t0.cycleSecs)`. The other operand is a `uint256`, so the expression is still computed in uint256. |
| `m-b962632d77` | `TimeLib.sol:355` | `return uint64(uint256(t0.startsAt) + (k + 1) * t0.cycleSecs)` to `return uint64(uint128(t0.startsAt) + (k + 1) * t0.cycleSecs)`. The other operand is a `uint256`, so the expression is still computed in uint256. |
| `m-46878754d8` | `TimeLib.sol:364` | `at = uint256(cycleEnd(g.terms[id][0], k)) + t.claimGrace` to `at = uint128(cycleEnd(g.terms[id][0], k)) + t.claimGrace`. A `uint64` time plus bounded durations, far below 2^128. |
| `m-6691874f64` | `TimeLib.sol:408` | `uint256 paid = c.paidGross` to `uint128 paid = c.paidGross`. The value comes from `c.paidGross`, a `uint128` field. |
| `m-eff3c6a5c6` | `TimeLib.sol:424` | `uint256 old = c.paidGross` to `uint128 old = c.paidGross`. The value comes from `c.paidGross`, a `uint128` field. |
| `m-2d87cc6862` | `TimeLib.sol:451` | `uint256 refund` to `uint128 refund`. `refund` adds up the funding of cycles still open, all of it held in the deal's account, whose balance is a `uint128`. |
| `m-ae7493aae1` | `TimeLib.sol:473` | `...uint64( uint256(t0.startsAt) + (k + ...` to `...uint64( uint128(t0.startsAt) + (k + ...`. The other operand is a `uint256`, so the expression is still computed in uint256. |

## R15. The same outcome either way

Both versions end in the same state and the same return, events and revert, for the reason given.

| Mutant | Where | Change |
|---|---|---|
| `m-538805827c` | `KarwanIdentityRegistry.sol:144` | `==` to `<`. Identity 0 is never anyone's: no step writes a controller, recovery wallet, pending controller or recovery request under it, so with `id` zero the second test fails the same way and the call reverts with the same error. |
| `m-eabd0b1b78` | `KarwanIdentityRegistry.sol:162` | `==` to `<`. Identity 0 is never anyone's: no step writes a controller, recovery wallet, pending controller or recovery request under it, so with `id` zero the second test fails the same way and the call reverts with the same error. |
| `m-7716fd5d61` | `KarwanIdentityRegistry.sol:177` | `==` to `<`. Identity 0 is never anyone's: no step writes a controller, recovery wallet, pending controller or recovery request under it, so with `id` zero the second test fails the same way and the call reverts with the same error. |
| `m-48016abd4e` | `KarwanIdentityRegistry.sol:231` | `==` to `<`. Identity 0 is never anyone's: no step writes a controller, recovery wallet, pending controller or recovery request under it, so with `id` zero the second test fails the same way and the call reverts with the same error. |
| `m-afdba3c921` | `KarwanTradeFinance.sol:132` | `replaced = 0` to `//replaced = 0`. When the seat's last line is not open it is zero or a closed line, and every step that closes a line (settle, waive, replacement) releases its reservation, so releasing it at line 141 finds nothing active and returns without a change or an event. |
| `m-185d34943b` | `KarwanTradeFinance.sol:141` | `replaced != 0` to `true`. With `replaced` zero, the vault holds no reservation under ref zero (a line id is a hash), so `release` returns without a change or an event. |
| `m-404b9190a6` | `KarwanTradeFinance.sol:141` | `!=` to `>=`. With `replaced` zero, the vault holds no reservation under ref zero (a line id is a hash), so `release` returns without a change or an event. |
| `m-1e992aec0d` | `KarwanYieldPool.sol:150` | `>` to `>=`. At cash equal to the target the mutant subscribes zero, and `_subscribe` returns before any deposit or event when the amount is zero (its `excess == 0` return). |
| `m-860145bb63` | `KarwanYieldPool.sol:152` | `!=` to `>=`. With no shares `_sharesFor` caps the request at what is held, zero, and line 154 redeems nothing. |
| `m-159b7304e3` | `KarwanYieldPool.sol:312` | `assets == 0` to `false`. With zero assets the mutant asks for quotes, but whatever they are the subscription stays zero (`excess * (v - line) / cost` is zero) and `_subscribe` returns at `excess == 0`. |
| `m-fb95c26c1e` | `KarwanYieldPool.sol:312` | `==` to `<`. With zero assets the mutant asks for quotes, but whatever they are the subscription stays zero (`excess * (v - line) / cost` is zero) and `_subscribe` returns at `excess == 0`. |
| `m-d518c39bab` | `KarwanYieldPool.sol:326` | `return false` to `//return false`. The function's unnamed return is already false. |
| `m-9a77316590` | `KarwanYieldPool.sol:338` | `catch { return type(uint256).max; }` to `catch { return type(uint128).max; }`. The value is only compared with `MIN_MARGIN` (line 194), which both sentinels exceed. |
| `m-f4ab5e1e3d` | `KarwanYieldPool.sol:339` | `return type(uint256).max` to `return type(uint128).max`. The value is only compared with `MIN_MARGIN` (line 194), which both sentinels exceed. |
| `m-d40e20625c` | `KarwanYieldPool.sol:349` | `return 0` to `//return 0`. `want` has not been assigned when the quote fails, so it is already zero. |
| `m-ddf944b405` | `SigCheck.sol:15` | `signer == address(0)` to `false`. For the zero address, `tryRecover` never reports `NoError` with a zero signer (OpenZeppelin returns `InvalidSignature` for a zero result), and the zero address has no code, so line 25 returns false as well. |
| `m-4a521c9806` | `SigCheck.sol:24` | `==` to `>=`. On any error OpenZeppelin's `tryRecover` returns the zero address, which line 15 has already ruled out as the signer, so `recovered == signer` fails either way. |
| `m-39bb00a700` | `SigCheck.sol:25` | `!=` to `>=`. For a wallet with no code the mutant asks it for ERC-1271, and OpenZeppelin's check of a call to an account with no code returns false, as line 25 does. |
| `m-13ebd34f09` | `AgreementCommon.sol:30` | `t.sellerStake == 0` to `false`. The hub's vault is wired once, before any deal can open, and a deal without a stake never reserves under its id (`acceptWithStake` needs a stake), so `release` finds nothing active and returns without a change or an event. |
| `m-74746063fb` | `AgreementCommon.sol:30` | `==` to `<`. The hub's vault is wired once, before any deal can open, and a deal without a stake never reserves under its id (`acceptWithStake` needs a stake), so `release` finds nothing active and returns without a change or an event. |
| `m-1b256f9cd6` | `AgreementCommon.sol:60` | `==` to `<`. For a deal without a stake the vault holds no reservation under its id, so `expiryOf` gives zero and line 63 returns. |
| `m-9393cafe9f` | `AgreementDeliveryLib.sol:45` | `!=` to `>`. Before acceptance there is no delivery, so `deliveredAt` is zero and the next test reverts `BadState` the same way. |
| `m-becd415b8b` | `AgreementDeliveryLib.sol:62` | `!=` to `>`. Before acceptance there is no delivery, so `deliveredAt` is zero and the next test reverts `BadState` the same way. |
| `m-64fd90e2d7` | `AgreementDeliveryLib.sol:78` | `!=` to `>`. Before acceptance no review has started, so the next test reverts `BadState` the same way. |
| `m-c1247a61ef` | `AgreementDeliveryLib.sol:104` | `!=` to `>`. Before acceptance there is no delivery, so `deliveredAt` is zero and the next test reverts `BadState` the same way. |
| `m-21873e37bb` | `AgreementDeliveryLib.sol:110` | `return 0` to `//return 0`. The function's unnamed return is already zero. |
| `m-57cd666808` | `AgreementDeliveryLib.sol:120` | `return 0` to `//return 0`. The function's unnamed return is already zero. |
| `m-1075225d63` | `AgreementDisputeLib.sol:32` | `!=` to `>`. Before acceptance there is no delivery, so `deliveredAt` is zero and the next test reverts `BadState` the same way. |
| `m-ba40328123` | `AgreementDisputeLib.sol:123` | `t.sellerStake != 0` to `true`. With no stake the slash works out to zero and `slashStake` returns at once. |
| `m-ed204d9f6e` | `AgreementDisputeLib.sol:123` | `!=` to `>=`. With no stake the slash works out to zero and `slashStake` returns at once. |
| `m-1c93408dbe` | `AgreementLib.sol:114` | `!=` to `>`. A deal that does not exist has no parts, so `partsPaid >= parts` reverts `BadState` the same way. |
| `m-bf6a9c4f94` | `AgreementLib.sol:114` | `!=` to `>`. A deal that does not exist has no parts, so `partsPaid >= parts` reverts `BadState` the same way. |
| `m-eaf8cf8f08` | `AgreementLib.sol:137` | `!=` to `>`. A deal that does not exist has no parts, so `partsPaid >= parts` reverts `BadState` the same way. |
| `m-3250fe6eb9` | `AgreementLib.sol:413` | `... outcome ) public...` to `... outcome ) private...`. Only `AgreementLib` calls `split`, and a public library function called from its own library is an internal jump, as an internal or private one is. |
| `m-fb02c13fa6` | `AgreementTermsLib.sol:30` | `==` to `<`. With no tranches the sum is zero, which `sum != C.BPS` on the same line refuses with the same `BadTerms`. |
| `m-05b8ca5382` | `AgreementTermsLib.sol:31` | `>` to `==`. At `acceptBy` exactly `now + maxHorizon`, line 51 refuses the deal anyway: the delivery deadline must be later than `acceptBy` and no later than `now + maxHorizon`. Same `BadTerms`. |
| `m-70d25cea39` | `AgreementTermsLib.sol:31` | `>` to `>=`. At `acceptBy` exactly `now + maxHorizon`, line 51 refuses the deal anyway: the delivery deadline must be later than `acceptBy` and no later than `now + maxHorizon`. Same `BadTerms`. |
| `m-81a964aaa9` | `AgreementTermsLib.sol:31` | `+` to `*`. With the bound multiplied it never binds, and line 50 refuses any `acceptBy` past `now + maxHorizon` with the same `BadTerms`. |
| `m-8ceb097abc` | `AgreementTermsLib.sol:37` | `>` to `==`. At `startLongstop` exactly `maxHorizon`, line 46 refuses the deal anyway: the silence longstop must cover it plus a review window of at least the escrow's nonzero minimum, and stay within `maxHorizon`. Same `BadTerms`. |
| `m-b8257f14b8` | `AgreementTermsLib.sol:37` | `>` to `>=`. At `startLongstop` exactly `maxHorizon`, line 46 refuses the deal anyway: the silence longstop must cover it plus a review window of at least the escrow's nonzero minimum, and stay within `maxHorizon`. Same `BadTerms`. |
| `m-952c2c37aa` | `DisputeLib.sol:85` | `==` to `<`. With no partial share the mutant still refuses any share but none or all: such a share differs from the partial share of zero, so the last test reverts `BadOutcome` the same way. |
| `m-3ba721adb0` | `BountyLib.sol:43` | `==` to `<`. With no places the shares sum to zero, which line 49 refuses with the same `BadTerms`. |
| `m-a437e6d2c5` | `JobLib.sol:202` | `!=` to `>`. A job before submission has no rejection time (only the `Submitted` branch of `reject` sets it), so the next test reverts `BadState` the same way. |
| `m-69371eb7f1` | `JobLib.sol:213` | `!=` to `<`. A job before submission has no rejection time (only the `Submitted` branch of `reject` sets it), so the next test reverts `BadState` the same way. |
| `m-65f8bd87b2` | `JobLib.sol:213` | `!=` to `>`. A job before submission has no rejection time (only the `Submitted` branch of `reject` sets it), so the next test reverts `BadState` the same way. |
| `m-11c0cf9f4c` | `SettlementLib.sol:153` | `payer == address(0) \|\| n > MAX_PAYEES` to `false`. Every family opens with its own caller as payer, never zero, and `_appendPayee` refuses a ninth payee with the same `BadParties`. |
| `m-6766c970ef` | `SettlementLib.sol:153` | `\|\|` to `&&`. Every family opens with its own caller as payer, never zero, and `_appendPayee` refuses a ninth payee with the same `BadParties`. |
| `m-80fec56f4e` | `SettlementLib.sol:180` | `<` to `<=`. The extra step reads the empty slot after the last payee, zero, and every caller passes its own caller or a bounty winner, never zero, so nothing more matches. |
| `m-d08b1fec12` | `SettlementLib.sol:215` | `a.yieldBps != 0` to `true`. With `yieldBps` zero the share added is zero. |
| `m-ad12907d68` | `SettlementLib.sol:215` | `!=` to `>=`. With `yieldBps` zero the share added is zero. |
| `m-56dc1c44e5` | `SettlementLib.sol:369` | `parked > target` to `true`. At equality the mutant pulls zero, which the pool refuses (`withdraw` reverts on zero), and `_pull` puts the books back and returns false, with no event. |
| `m-84a340758e` | `SettlementLib.sol:369` | `>` to `>=`. At equality the mutant pulls zero, which the pool refuses (`withdraw` reverts on zero), and `_pull` puts the books back and returns false, with no event. |
| `m-c8247c3752` | `SettlementLib.sol:381` | `-` to `%`. Holds use the budget only in 7-day steps up to 30 days, so `holdUsed` is 0, 7, 14, 21, 28 or 30 days; this line applies at 28 and 30, where `30 - 28` and `30 % 28` are both two days and `30 - 30` and `30 % 30` both zero. |
| `m-f1e9989a25` | `SettlementLib.sol:403` | `!=` to `<`. A split above the balance is refused when it is paid: `_take` reverts with the same `BadAmount` before anything moves. |
| `m-8612fd9047` | `SettlementLib.sol:448` | `\|` to `^`. `detail` is a `uint16` and the outcome is shifted past it, so the bits never overlap and `|` gives the same value as `^`. |
| `m-615326a46a` | `SettlementLib.sol:487` | `...32 dealId) public view returns (Deal...` to `...32 dealId) private view returns (Dea...`. Only `SettlementLib` calls `live`, and a public library function called from its own library is an internal jump, as a private one is. |
| `m-6a1311a40b` | `SettlementLib.sol:497` | `return false` to `//return false`. The function's unnamed return is already false. |
| `m-b24c44070f` | `SettlementLib.sol:500` | `...nt8 party) public view returns (uint...` to `...nt8 party) private view returns (uin...`. Only `SettlementLib` calls `subjectOf`, and a public library function called from its own library is an internal jump, as a private one is. |
| `m-e30d0eec78` | `SettlementLib.sol:551` | `a.yieldBps != 0` to `true`. With `yieldBps` zero the share taken off is zero, and `left - 0` is `left`. |
| `m-9a4264677b` | `SettlementLib.sol:551` | `!=` to `>=`. With `yieldBps` zero the share taken off is zero, and `left - 0` is `left`. |
| `m-70ffd11314` | `SettlementLib.sol:563` | `parked == 0` to `false`. With nothing parked, `parked > target` on line 566 is false, so nothing is pulled. |
| `m-fb4c9e2f94` | `SettlementLib.sol:563` | `==` to `<`. With nothing parked, `parked > target` on line 566 is false, so nothing is pulled. |
| `m-330930f059` | `SettlementLib.sol:566` | `>` to `>=`. At equality the mutant pulls zero, which the pool refuses (`withdraw` reverts on zero), and `_pull` puts the books back and returns false, with no event. |
| `m-70a5cec14b` | `SettlementLib.sol:593` | `return false` to `//return false`. The function's unnamed return is already false. |
| `m-95211b25a3` | `TimeLib.sol:203` | `undisputed > c.approved` to `true`. With `undisputed` equal to `approved` the mutant writes the same count and pays up to what is already paid, which `_book` turns into nothing. |
| `m-e1c44d6170` | `TimeLib.sol:203` | `>` to `>=`. With `undisputed` equal to `approved` the mutant writes the same count and pays up to what is already paid, which `_book` turns into nothing. |
| `m-e50bb73b69` | `TimeLib.sol:425` | `gross <= old` to `false`. At `gross == old` the mutant books nothing new and pays zero, which pays nothing. |
| `m-79b49df3cc` | `TimeLib.sol:425` | `<=` to `<`. At `gross == old` the mutant books nothing new and pays zero, which pays nothing. |
| `m-ab3569abe8` | `TimeLib.sol:449` | `<=` to `<`. At `funded == runs` the mutant writes the same `nextCycle`, loops over nothing and refunds zero, which pays nothing. |
| `m-60e43f1147` | `TimeLib.sol:469` | `!=` to `>=`. At version zero `versionFrom` is zero, never above `k`, so the loop stops there either way. |
| `m-2005e6549a` | `TimeLib.sol:490` | `==` to `<`. A zero rate or zero maximum units makes the budget zero, which line 500 refuses with the same `BadTerms`. |
| `m-748e06aa95` | `TimeLib.sol:490` | `==` to `<`. A zero rate or zero maximum units makes the budget zero, which line 500 refuses with the same `BadTerms`. |

## R16. A Teller that keeps its own quotes

The pool's Teller is an ERC-4626 vault (USYC's Teller on Arc, `MockTeller` in the tests). These mutants differ only if the Teller quotes or pays something for nothing, or pays more on a redemption than it quoted, and only at an exact equality, for the reason given. Where one call reaches such a guard, a test mocks the quote and kills the mutant; these are the rest.

| Mutant | Where | Change |
|---|---|---|
| `m-d96233333e` | `KarwanYieldPool.sol:166` | `<` to `<=`. At cash exactly `keep + amount` the mutant asks for a gap of zero. With a gap of zero the shares wanted are the Teller's `previewWithdraw(0)`, zero for an ERC-4626 vault, and nothing is redeemed. |
| `m-cf2aedcc5b` | `KarwanYieldPool.sol:268` | `<=` to `<`. At value exactly on the line the mutant returns zero instead of reverting. Its only caller, `sweepYield`, then reverts `NoYield` at line 174, unless a redemption on the way raised the value above the line, which takes a Teller paying more than its quote; the mutant would then sweep that gain in this call instead of the next. |
| `m-8558500053` | `KarwanYieldPool.sol:304` | `want == 0` to `false`. With zero shares wanted the mutant redeems zero, which pays nothing, so the balance check after it reverts `Busy` the same way. |
| `m-7fd6263f7a` | `KarwanYieldPool.sol:304` | `==` to `<`. With zero shares wanted the mutant redeems zero, which pays nothing, so the balance check after it reverts `Busy` the same way. |
