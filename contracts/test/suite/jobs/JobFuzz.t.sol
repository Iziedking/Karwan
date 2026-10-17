// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {JobFixture} from "./JobFixture.sol";
import {JobStatus, JobTerms, BountyTerms} from "../../../src/suite/jobs/JobTypes.sol";
import {JobLib} from "../../../src/suite/jobs/JobLib.sol";
import {BountyLib} from "../../../src/suite/jobs/BountyLib.sol";
import {DisputeLib} from "../../../src/suite/dispute/DisputeLib.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {KarwanIdentityRegistry} from "../../../src/suite/KarwanIdentityRegistry.sol";
import {Outcome} from "../../../src/suite/interfaces/IKarwanSuite.sol";

/// @notice The Jobs family's money arithmetic under fuzzed budgets, fees,
///         shares and times: every unit funded comes out to the provider or
///         the winners, the fee, or the client, and nowhere else.
contract JobFuzzTest is JobFixture {
    uint16 internal constant BPS = 10_000;
    uint128 internal constant CAP = 1_000_000e6;
    uint256 internal constant HIGH_VALUE = 5_000e6;

    address[8] internal ws;
    uint64[8] internal wIds;

    struct Award {
        uint256[] gross;
        uint256[] net;
        uint256 paid;
        uint256 fee;
        uint256 toWinners;
        uint256 back;
    }

    function setUp() public {
        _deployJobs();
        hub.setCaps(address(jobs), address(usdc), CAP, 10 * CAP);
        usdc.mint(client, CAP);
        for (uint256 i; i < 8; ++i) {
            (ws[i],, wIds[i]) = _person(string.concat("winner", _digit(i)));
        }
    }

    // -------------------------------- Jobs --------------------------------

    function testFuzz_a_completed_job_pays_the_provider_the_budget_less_their_half_of_the_fee(
        uint256 budgetSeed,
        uint16 feeSeed,
        uint16 laterFeeSeed
    ) public {
        uint16 fee = _setFee(feeSeed);
        uint256 budget = bound(budgetSeed, 1, _maxAmount(fee));
        uint256 t0 = vm.getBlockTimestamp();
        uint256 clientBefore = usdc.balanceOf(client);
        uint256 id = _fundJob(budget, JobLib.defaultTerms(), t0 + 10 days);
        uint256 funded = _withClientHalf(budget, fee);
        uint256 feeCap = _checkFunded(id, funded, fee);
        _setFee(laterFeeSeed);
        vm.prank(provider);
        jobs.submit(id, keccak256("report"), "");
        vm.prank(evaluator);
        jobs.complete(id, bytes32("good"), "");

        (uint256 net, uint256 cut) = _split(budget, fee);
        uint256 back = _checkJobBooks(id, clientBefore, funded, net, cut, feeCap);
        assertEq(net + (cut - cut / 2), budget);
        assertEq(usdc.balanceOf(provider) + usdc.balanceOf(feeSafe), funded);
        assertEq(back, 0);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Completed));
    }

    function testFuzz_silence_pays_the_provider_exactly_once_the_review_window_ends(
        uint256 budgetSeed,
        uint16 feeSeed,
        uint256 reviewSeed,
        uint256 submitSeed,
        uint256 waitSeed
    ) public {
        uint16 fee = _setFee(feeSeed);
        uint256 budget = bound(budgetSeed, 1, _maxAmount(fee));
        uint32 review = uint32(bound(reviewSeed, 1 hours, 14 days));
        uint256 t0 = vm.getBlockTimestamp();
        uint256 clientBefore = usdc.balanceOf(client);
        uint256 id = _fundJob(budget, JobTerms(review, 0, 0), t0 + 10 days);
        uint256 funded = _withClientHalf(budget, fee);
        uint256 feeCap = _checkFunded(id, funded, fee);

        uint256 ts = t0 + bound(submitSeed, 0, 10 days - 1);
        vm.warp(ts);
        vm.prank(provider);
        jobs.submit(id, keccak256("report"), "");
        vm.warp(ts + review - 1);
        vm.expectRevert(JobLib.Early.selector);
        jobs.release(id);
        vm.warp(ts + review);
        vm.prank(evaluator);
        vm.expectRevert(JobLib.Late.selector);
        jobs.reject(id, bytes32("too late"), "");
        vm.warp(ts + review + bound(waitSeed, 0, 60 days));
        vm.prank(stranger);
        jobs.release(id);

        (uint256 net, uint256 cut) = _split(budget, fee);
        uint256 back = _checkJobBooks(id, clientBefore, funded, net, cut, feeCap);
        assertEq(net + (cut - cut / 2), budget);
        assertEq(back, 0);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Completed));
        vm.expectRevert(JobLib.BadState.selector);
        jobs.release(id);
    }

    /// path 0: the arbiter proposes none, all or the partial share and nobody
    /// appeals; 1: the reviewer rules any share; 2: the reviewer stays silent
    /// and the fallback applies.
    function testFuzz_a_ruling_on_a_disputed_rejection_pays_its_share_and_returns_the_rest(
        uint256 budgetSeed,
        uint16 feeSeed,
        uint16 partialSeed,
        uint16 fallbackSeed,
        uint8 path,
        uint16 choiceSeed,
        uint256 rejectSeed,
        uint256 disputeSeed
    ) public {
        uint16 fee = _setFee(feeSeed);
        uint256 budget = bound(budgetSeed, 1, _maxAmount(fee));
        JobTerms memory terms =
            JobTerms(5 days, uint16(bound(partialSeed, 0, 9_999)), uint16(bound(fallbackSeed, 0, 10_000)));
        uint256 t0 = vm.getBlockTimestamp();
        uint256 clientBefore = usdc.balanceOf(client);
        uint256 id = _fundJob(budget, terms, t0 + 10 days);
        uint256 funded = _withClientHalf(budget, fee);
        uint256 feeCap = _checkFunded(id, funded, fee);
        vm.prank(provider);
        jobs.submit(id, keccak256("report"), "");

        uint256 td = _disputeRejection(id, t0, rejectSeed, disputeSeed);
        uint16 bps = _rule(id, td, budget, path % 3, terms, choiceSeed);

        uint256 gross = (budget * bps) / BPS;
        (uint256 net, uint256 cut) = _split(gross, fee);
        uint256 back = _checkJobBooks(id, clientBefore, funded, net, cut, feeCap);
        assertEq(back, budget - gross + ((budget * fee) / BPS) / 2 - cut / 2);
        assertGe(back, budget - gross);
        assertEq(jobs.accountOf(bytes32(id)).recordValue, gross);
        assertEq(uint8(jobs.getJob(id).status), uint8(bps == 0 ? JobStatus.Rejected : JobStatus.Completed));
        assertEq(jobs.disputeOf(id).openedAt, 0);
    }

    /// path 0: nobody submitted by the expiry; 1: the evaluator rejects the
    /// funded job; 2: the provider lets a rejection of submitted work stand.
    function testFuzz_a_job_that_ends_unpaid_returns_exactly_what_the_client_funded(
        uint256 budgetSeed,
        uint16 feeSeed,
        uint8 path,
        uint256 expirySeed,
        uint256 waitSeed
    ) public {
        uint16 fee = _setFee(feeSeed);
        uint256 budget = bound(budgetSeed, 1, _maxAmount(fee));
        uint256 t0 = vm.getBlockTimestamp();
        uint256 expiry = bound(expirySeed, 1 hours, 365 days);
        uint256 wait = bound(waitSeed, 0, 30 days);
        uint256 clientBefore = usdc.balanceOf(client);
        uint256 id = _fundJob(budget, JobLib.defaultTerms(), t0 + expiry);
        uint256 funded = _withClientHalf(budget, fee);
        uint256 feeCap = _checkFunded(id, funded, fee);
        path %= 3;

        if (path == 0) {
            vm.warp(t0 + expiry - 1);
            vm.expectRevert(JobLib.Early.selector);
            jobs.claimRefund(id);
            vm.warp(t0 + expiry + wait);
            vm.prank(provider);
            vm.expectRevert(JobLib.Late.selector);
            jobs.submit(id, keccak256("too late"), "");
            _expectRecord(id, clientId, 0, Outcome.CANCELLED, 0, 0);
            vm.prank(stranger);
            jobs.claimRefund(id);
        } else if (path == 1) {
            _expectRecord(id, clientId, 0, Outcome.CANCELLED, 0, 0);
            vm.prank(evaluator);
            jobs.reject(id, bytes32("no longer needed"), "");
        } else {
            vm.prank(provider);
            jobs.submit(id, keccak256("report"), "");
            vm.prank(evaluator);
            jobs.reject(id, bytes32("off brief"), "");
            vm.warp(t0 + 3 days - 1);
            vm.expectRevert(JobLib.Early.selector);
            jobs.confirmRejection(id);
            vm.warp(t0 + 3 days + wait);
            _expectRecord(id, clientId, 0, Outcome.FAILED, 0, 0);
            vm.prank(stranger);
            jobs.confirmRejection(id);
        }

        uint256 back = _checkJobBooks(id, clientBefore, funded, 0, 0, feeCap);
        assertEq(back, funded);
        assertEq(usdc.balanceOf(client), clientBefore);
        assertEq(uint8(jobs.getJob(id).status), uint8(path == 0 ? JobStatus.Expired : JobStatus.Rejected));
    }

    // ------------------------------ Bounties ------------------------------

    function testFuzz_a_full_award_pays_every_place_its_share_less_its_half_of_the_fee(
        uint256 prizeSeed,
        uint16 feeSeed,
        uint256 placesSeed,
        uint256 shareSeed
    ) public {
        uint16 fee = _setFee(feeSeed);
        uint256 prize = bound(prizeSeed, 1, _maxAmount(fee));
        uint256 places = bound(placesSeed, 1, 8);
        uint16[] memory shares = _shares(places, shareSeed);
        uint256 clientBefore = usdc.balanceOf(client);
        uint256 id = _openBounty(prize, shares);
        uint256 funded = _withClientHalf(prize, fee);
        uint256 feeCap = _checkFunded(id, funded, fee);
        _enterAll(id);

        Award memory a = _award(prize, fee, shares, places);
        address[] memory winners = _first(places);
        _expectAwardRecords(id, shares, a, places);
        vm.prank(evaluator);
        jobs.award(id, winners);

        _checkAward(id, a, places, clientBefore, funded, feeCap);
        assertLe(prize - a.paid, places - 1);
    }

    function testFuzz_a_late_partial_award_returns_the_empty_places_to_the_client(
        uint256 prizeSeed,
        uint16 feeSeed,
        uint256 placesSeed,
        uint256 shareSeed,
        uint256 filledSeed,
        uint256 waitSeed
    ) public {
        uint16 fee = _setFee(feeSeed);
        uint256 prize = bound(prizeSeed, 1, _maxAmount(fee));
        uint256 places = bound(placesSeed, 1, 8);
        uint256 n = bound(filledSeed, 1, places);
        uint16[] memory shares = _shares(places, shareSeed);
        uint256 t0 = vm.getBlockTimestamp();
        uint256 clientBefore = usdc.balanceOf(client);
        uint256 id = _openBounty(prize, shares);
        uint256 funded = _withClientHalf(prize, fee);
        uint256 feeCap = _checkFunded(id, funded, fee);
        _enterAll(id);
        address[] memory winners = _first(n);

        if (n < places) {
            vm.prank(evaluator);
            vm.expectRevert(BountyLib.BadWinners.selector);
            jobs.award(id, winners);
        }
        vm.warp(t0 + 7 days + bound(waitSeed, 0, 3 days - 1));
        Award memory a = _award(prize, fee, shares, n);
        _expectAwardRecords(id, shares, a, n);
        vm.prank(evaluator);
        jobs.award(id, winners);

        _checkAward(id, a, n, clientBefore, funded, feeCap);
        uint256 empty;
        for (uint256 i = n; i < places; ++i) {
            empty += shares[i];
        }
        assertGe(prize - a.paid, (prize * empty) / BPS);
        assertLe(prize - a.paid, (prize * empty) / BPS + n);
    }

    function testFuzz_no_wallet_of_the_clients_identity_can_enter_and_the_unawarded_prize_goes_back_whole(
        uint256 prizeSeed,
        uint16 feeSeed,
        uint256 altKeySeed,
        bool asAgent,
        bool othersEnter,
        uint256 waitSeed
    ) public {
        uint16 fee = _setFee(feeSeed);
        uint256 prize = bound(prizeSeed, 1, _maxAmount(fee));
        uint256 altKey = boundPrivateKey(altKeySeed);
        address alt = vm.addr(altKey);
        vm.assume(identity.identityOf(alt) == 0 && alt.code.length == 0 && alt != evaluator && alt != stranger);
        uint256 t0 = vm.getBlockTimestamp();
        uint256 clientBefore = usdc.balanceOf(client);
        uint256 id = _openBounty(prize, _contestTerms().shares);
        uint256 funded = _withClientHalf(prize, fee);
        uint256 feeCap = _checkFunded(id, funded, fee);

        _bindToClient(alt, altKey, asAgent, t0);
        assertEq(identity.identityOf(alt), clientId);
        vm.prank(alt);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.enter(id, keccak256("mine"));
        vm.prank(client);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.enter(id, keccak256("mine"));
        vm.prank(evaluator);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.enter(id, keccak256("mine"));
        assertEq(jobs.jobOf(id).entries, 0);
        assertEq(jobs.entryOf(id, alt), bytes32(0));
        if (othersEnter) _enter(id, ws[0]);

        vm.warp(t0 + 10 days - 1);
        vm.expectRevert(JobLib.Early.selector);
        jobs.claimRefund(id);
        vm.warp(t0 + 10 days + bound(waitSeed, 0, 30 days));
        _expectRecord(id, clientId, 0, othersEnter ? Outcome.FAILED : Outcome.CANCELLED, 0, 0);
        vm.prank(stranger);
        jobs.claimRefund(id);

        uint256 back = _checkJobBooks(id, clientBefore, funded, 0, 0, feeCap);
        assertEq(back, funded);
        assertEq(usdc.balanceOf(client), clientBefore);
        assertEq(usdc.balanceOf(alt), 0);
        assertEq(usdc.balanceOf(ws[0]), 0);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Expired));
    }

    // ------------------------------- Helpers ------------------------------

    function _setFee(uint16 seed) internal returns (uint16 fee) {
        fee = uint16(bound(seed, 0, 1_000));
        hub.setFamilyFee(address(jobs), fee);
    }

    /// The budget plus the client's half of the fee on it, as funded.
    function _withClientHalf(uint256 amount, uint16 fee) internal pure returns (uint256) {
        return amount + ((amount * fee) / BPS) / 2;
    }

    /// The largest budget whose funding fits the per-deal cap at `fee`.
    function _maxAmount(uint16 fee) internal pure returns (uint256 b) {
        b = (uint256(CAP) * 20_000) / (20_000 + fee);
        while (_withClientHalf(b + 1, fee) <= CAP) ++b;
        while (_withClientHalf(b, fee) > CAP) --b;
    }

    /// What a payee nets from `gross`, and the whole fee on it.
    function _split(uint256 gross, uint16 fee) internal pure returns (uint256 net, uint256 cut) {
        cut = (gross * fee) / BPS;
        net = gross - (cut - cut / 2);
    }

    function _band(uint256 value) internal pure returns (uint8) {
        if (value < 100e6) return 0;
        if (value < 1_000e6) return 1;
        if (value < 10_000e6) return 2;
        return 3;
    }

    function _fundJob(uint256 budget, JobTerms memory t, uint256 expiredAt) internal returns (uint256 id) {
        vm.prank(client);
        id = jobs.createJobWithTerms(provider, evaluator, expiredAt, "write the report", t);
        vm.prank(provider);
        jobs.setBudget(id, budget, "");
        vm.prank(client);
        jobs.fund(id, budget, "");
    }

    /// Checks the account took exactly `funded` at the opening fee, and
    /// returns the fee room fixed at opening.
    function _checkFunded(uint256 id, uint256 funded, uint16 fee) internal view returns (uint256 feeCap) {
        assertEq(usdc.balanceOf(address(jobs)), funded);
        assertEq(jobs.held(address(usdc)), funded);
        assertEq(jobs.accountOf(bytes32(id)).funded, funded);
        assertEq(jobs.accountOf(bytes32(id)).feeBps, fee);
        feeCap = jobs.feeLeft(bytes32(id));
        assertEq(feeCap, (funded * fee) / BPS);
    }

    /// Checks the provider got `net`, the fee recipient `cut`, nobody else a
    /// unit, and the escrow nothing; returns what came back to the client.
    function _checkJobBooks(
        uint256 id,
        uint256 clientBefore,
        uint256 funded,
        uint256 net,
        uint256 cut,
        uint256 feeCap
    ) internal view returns (uint256 back) {
        back = usdc.balanceOf(client) + funded - clientBefore;
        assertEq(usdc.balanceOf(provider), net);
        assertEq(usdc.balanceOf(feeSafe), cut);
        assertEq(jobs.accountOf(bytes32(id)).feePaid, cut);
        assertLe(cut, feeCap);
        assertEq(net + cut + back, funded);
        _checkEmptyEscrow(id);
    }

    function _checkEmptyEscrow(uint256 id) internal view {
        assertEq(usdc.balanceOf(address(jobs)), 0);
        assertEq(jobs.held(address(usdc)), 0);
        assertEq(jobs.owedTotal(address(usdc)), 0);
        assertEq(jobs.accountOf(bytes32(id)).balance, 0);
        assertTrue(jobs.accountOf(bytes32(id)).closed);
        assertEq(usdc.balanceOf(stranger), 0);
        assertEq(usdc.balanceOf(evaluator), 0);
        assertEq(usdc.balanceOf(arbiter), 0);
        assertEq(usdc.balanceOf(reviewSafe), 0);
        assertEq(usdc.balanceOf(seniorSafe), 0);
        assertEq(usdc.balanceOf(guardian), 0);
    }

    function _expectRecord(uint256 id, uint64 subject, uint8 role, uint8 outcome, uint8 band, uint16 detail)
        internal
    {
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(jobs), bytes32(id), subject, role, outcome, band, detail);
    }

    /// The evaluator rejects within the review window and the provider
    /// disputes within 3 days; returns when the dispute opened.
    function _disputeRejection(uint256 id, uint256 t0, uint256 rejectSeed, uint256 disputeSeed)
        internal
        returns (uint256 td)
    {
        uint256 tr = t0 + bound(rejectSeed, 0, 5 days - 1);
        vm.warp(tr);
        vm.prank(evaluator);
        jobs.reject(id, bytes32("off brief"), "");
        td = tr + bound(disputeSeed, 0, 3 days - 1);
        vm.warp(td);
        vm.prank(provider);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.expectRevert(JobLib.BadState.selector);
        jobs.confirmRejection(id);
    }

    /// Ends the dispute by `path` and returns the provider's share it paid.
    function _rule(uint256 id, uint256 td, uint256 budget, uint8 path, JobTerms memory terms, uint16 choiceSeed)
        internal
        returns (uint16 bps)
    {
        if (path == 0) {
            uint256 pick = choiceSeed % 3;
            bps = pick == 0 ? uint16(0) : pick == 1 ? BPS : terms.partialBps;
            vm.prank(arbiter);
            jobs.proposeRuling(id, bps, bytes32("proposal"));
            vm.warp(td + 72 hours - 1);
            vm.expectRevert(DisputeLib.Early.selector);
            jobs.executeRuling(id);
            vm.warp(td + 72 hours);
            _expectRulingRecords(id, budget, bps);
            vm.prank(stranger);
            jobs.executeRuling(id);
        } else if (path == 1) {
            bps = uint16(bound(choiceSeed, 0, BPS));
            vm.prank(arbiter);
            jobs.escalate(id);
            _expectRulingRecords(id, budget, bps);
            vm.prank(budget >= HIGH_VALUE ? seniorSafe : reviewSafe);
            jobs.rule(id, bps, bytes32("ruling"));
        } else {
            bps = terms.fallbackBps;
            vm.prank(arbiter);
            jobs.escalate(id);
            vm.warp(td + 5 days);
            _expectRulingRecords(id, budget, bps);
            vm.prank(stranger);
            jobs.applyFallback(id);
        }
    }

    /// Both sides are recorded at what the provider was ruled, in its band.
    function _expectRulingRecords(uint256 id, uint256 budget, uint16 bps) internal {
        uint8 band = _band((budget * bps) / BPS);
        _expectRecord(id, clientId, 0, Outcome.RULED, band, bps);
        _expectRecord(id, providerId, 1, Outcome.RULED, band, bps);
    }

    /// `places` shares of at least 1 basis point each, summing to 10,000.
    function _shares(uint256 places, uint256 seed) internal pure returns (uint16[] memory s) {
        s = new uint16[](places);
        uint256 left = BPS;
        for (uint256 i; i + 1 < places; ++i) {
            uint256 x = _bound(uint256(keccak256(abi.encode(seed, i))), 1, left - (places - 1 - i));
            s[i] = uint16(x);
            left -= x;
        }
        s[places - 1] = uint16(left);
    }

    function _openBounty(uint256 prize, uint16[] memory shares) internal returns (uint256 id) {
        BountyTerms memory t = _contestTerms();
        t.prize = uint128(prize);
        t.shares = shares;
        vm.prank(client);
        id = jobs.openBounty(t);
    }

    /// All eight registered entrants enter, and so does the stranger.
    function _enterAll(uint256 id) internal {
        for (uint256 i; i < 8; ++i) {
            _enter(id, ws[i]);
        }
        _enter(id, stranger);
        assertEq(jobs.jobOf(id).entries, 9);
    }

    function _first(uint256 n) internal view returns (address[] memory w) {
        w = new address[](n);
        for (uint256 i; i < n; ++i) {
            w[i] = ws[i];
        }
    }

    /// What the first `n` places are paid, worked out apart from the escrow.
    function _award(uint256 prize, uint16 fee, uint16[] memory shares, uint256 n)
        internal
        pure
        returns (Award memory a)
    {
        a.gross = new uint256[](n);
        a.net = new uint256[](n);
        uint256 halves;
        for (uint256 i; i < n; ++i) {
            a.gross[i] = (prize * shares[i]) / BPS;
            uint256 cut;
            (a.net[i], cut) = _split(a.gross[i], fee);
            a.paid += a.gross[i];
            a.fee += cut;
            a.toWinners += a.net[i];
            halves += cut / 2;
        }
        a.back = prize - a.paid + ((prize * fee) / BPS) / 2 - halves;
    }

    /// The client is recorded at what the bounty paid, each winner at their
    /// own gross and share.
    function _expectAwardRecords(uint256 id, uint16[] memory shares, Award memory a, uint256 n) internal {
        _expectRecord(id, clientId, 0, Outcome.COMPLETED, _band(a.paid), 0);
        for (uint256 i; i < n; ++i) {
            _expectRecord(id, wIds[i], uint8(i + 1), Outcome.COMPLETED, _band(a.gross[i]), shares[i]);
        }
    }

    function _checkAward(
        uint256 id,
        Award memory a,
        uint256 n,
        uint256 clientBefore,
        uint256 funded,
        uint256 feeCap
    ) internal view {
        for (uint256 i; i < n; ++i) {
            assertEq(usdc.balanceOf(ws[i]), a.net[i]);
        }
        for (uint256 i = n; i < 8; ++i) {
            assertEq(usdc.balanceOf(ws[i]), 0);
        }
        uint256 back = usdc.balanceOf(client) + funded - clientBefore;
        assertEq(back, a.back);
        assertEq(usdc.balanceOf(feeSafe), a.fee);
        assertEq(jobs.accountOf(bytes32(id)).feePaid, a.fee);
        assertLe(a.fee, feeCap);
        assertEq(a.toWinners + a.fee + back, funded);
        assertEq(jobs.accountOf(bytes32(id)).recordValue, a.gross[n - 1]);
        assertEq(jobs.payeesOf(bytes32(id)).length, n);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Completed));
        _checkEmptyEscrow(id);
    }

    function _bindToClient(address alt, uint256 altKey, bool asAgent, uint256 t0) internal {
        KarwanIdentityRegistry.Kind kind =
            asAgent ? KarwanIdentityRegistry.Kind.Agent : KarwanIdentityRegistry.Kind.Wallet;
        uint64 expiry = asAgent ? uint64(t0 + 60 days) : uint64(0);
        uint128 limit = asAgent ? uint128(1) : uint128(0);
        uint256 deadline = t0 + 1 hours;
        bytes32 d = identity.bindDigest(clientId, alt, kind, expiry, limit, limit, deadline);
        bytes memory sig = _sig(altKey, d);
        vm.prank(client);
        identity.bind(alt, kind, expiry, limit, limit, deadline, sig);
    }
}
