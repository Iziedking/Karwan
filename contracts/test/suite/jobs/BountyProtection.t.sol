// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {JobFixture} from "./JobFixture.sol";
import {JobStatus} from "../../../src/suite/jobs/JobTypes.sol";
import {JobLib} from "../../../src/suite/jobs/JobLib.sol";
import {BountyLib} from "../../../src/suite/jobs/BountyLib.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {Outcome} from "../../../src/suite/interfaces/IKarwanSuite.sol";

/// @notice View 88 (owner, 16 Nov 2026): once someone has entered, the prize
///         goes to entrants. A buyer who picks nobody by the award date gets a
///         3-day wait; after it anyone pays the earliest valid entries. The
///         buyer can mark an entry not valid, with a reason, and a marked
///         entry is never paid. Written before the rule, exploits first.
contract BountyProtectionTest is JobFixture {
    address internal ann;
    address internal bob;
    address internal cat;
    address internal dan;

    /// The prize plus the client's half of the 1% fee on it.
    uint256 internal constant CONTEST_FUNDED = 300e6 + 1.5e6;
    /// The fixture contest: entries 7 days, awards by day 10.
    uint256 internal constant AWARD_BY = 10 days;
    uint256 internal constant WAIT = 3 days;

    uint256 internal t0;

    function setUp() public {
        _deployJobs();
        (ann,,) = _person("ann");
        (bob,,) = _person("bob");
        (cat,,) = _person("cat");
        dan = makeAddr("dan");
        t0 = vm.getBlockTimestamp();
    }

    // ------------------------------- Exploits -----------------------------

    /// The buyer collects entries, picks nobody and waits: the prize does not
    /// come back to them, it goes to the earliest entries.
    function test_exploit_a_buyer_who_picks_nobody_does_not_get_the_prize_back() public {
        uint256 id = _contest();
        _enter(id, ann);
        vm.warp(t0 + 1 hours);
        _enter(id, bob);
        vm.warp(t0 + 2 hours);
        _enter(id, cat);
        vm.warp(t0 + 3 hours);
        _enter(id, dan);
        uint256 clientBefore = usdc.balanceOf(client);
        vm.warp(t0 + AWARD_BY + WAIT);
        vm.prank(stranger);
        jobs.claimRefund(id);
        assertEq(usdc.balanceOf(ann), _net(180e6), "first place to the first entry");
        assertEq(usdc.balanceOf(bob), _net(90e6));
        assertEq(usdc.balanceOf(cat), _net(30e6));
        assertEq(usdc.balanceOf(dan), 0, "only as many entries as places");
        assertEq(usdc.balanceOf(client), clientBefore, "nothing back to the buyer");
        assertEq(usdc.balanceOf(address(jobs)), 0);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Completed));
    }

    /// Resending an entry never moves it up the order.
    function test_exploit_an_entrant_cannot_resend_to_move_up() public {
        uint256 id = _contest();
        _enter(id, ann);
        vm.warp(t0 + 1 hours);
        _enter(id, bob);
        vm.warp(t0 + 2 hours);
        vm.prank(bob);
        jobs.enter(id, keccak256("bob, better"));
        vm.warp(t0 + AWARD_BY + WAIT);
        jobs.claimRefund(id);
        assertEq(usdc.balanceOf(ann), _net(_share(6_000, 9_000)), "ann first");
        assertEq(usdc.balanceOf(bob), _net(_share(3_000, 9_000)), "bob kept his place, not a better one");
    }

    /// An entry marked not valid and then resent goes to the back: an empty
    /// early entry cannot hold a place for later work.
    function test_exploit_a_marked_entry_resent_goes_to_the_back() public {
        uint256 id = _contest();
        _enter(id, ann);
        vm.warp(t0 + 1 hours);
        _enter(id, bob);
        vm.warp(t0 + 2 hours);
        _enter(id, cat);
        _reject(id, ann);
        vm.warp(t0 + 3 hours);
        _enter(id, ann);
        vm.warp(t0 + AWARD_BY + WAIT);
        jobs.claimRefund(id);
        assertEq(usdc.balanceOf(bob), _net(180e6));
        assertEq(usdc.balanceOf(cat), _net(90e6));
        assertEq(usdc.balanceOf(ann), _net(30e6), "back of the line");
    }

    /// The payout cannot be triggered before the wait ends, nor twice.
    function test_exploit_the_payout_waits_and_runs_once() public {
        uint256 id = _contest();
        _enter(id, ann);
        vm.warp(t0 + AWARD_BY + WAIT - 1);
        vm.expectRevert(JobLib.Early.selector);
        jobs.claimRefund(id);
        vm.warp(t0 + AWARD_BY + WAIT);
        jobs.claimRefund(id);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.claimRefund(id);
        assertEq(usdc.balanceOf(ann), _net(300e6), "one entry takes the whole prize");
    }

    /// Only the buyer's evaluator marks entries, only real entries, and not
    /// once the payout is open.
    function test_exploit_only_the_evaluator_marks_and_only_before_the_payout() public {
        uint256 id = _contest();
        _enter(id, ann);
        vm.prank(bob);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.rejectEntry(id, ann, keccak256("spam"));
        vm.prank(evaluator);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.rejectEntry(id, bob, keccak256("never entered"));
        vm.warp(t0 + AWARD_BY + WAIT);
        vm.prank(evaluator);
        vm.expectRevert(JobLib.Late.selector);
        jobs.rejectEntry(id, ann, keccak256("too late"));
    }

    /// A marked entry cannot be picked as a winner either.
    function test_exploit_a_marked_entry_cannot_win() public {
        uint256 id = _contest();
        _enter(id, ann);
        _enter(id, bob);
        _reject(id, ann);
        vm.warp(t0 + 7 days);
        address[] memory w = new address[](1);
        w[0] = ann;
        vm.prank(evaluator);
        vm.expectRevert(BountyLib.BadWinners.selector);
        jobs.award(id, w);
    }

    /// Marking every entry not valid gives the prize back, and the buyer's
    /// record shows the contest failed.
    function test_every_entry_marked_not_valid_goes_back_and_is_recorded() public {
        uint256 id = _contest();
        _enter(id, ann);
        _enter(id, bob);
        _reject(id, ann);
        _reject(id, bob);
        uint256 before = usdc.balanceOf(client);
        vm.warp(t0 + AWARD_BY + WAIT);
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(jobs), bytes32(id), clientId, 0, Outcome.FAILED, 0, 0);
        jobs.claimRefund(id);
        assertEq(usdc.balanceOf(client), before + CONTEST_FUNDED);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Expired));
    }

    // ------------------------------ The rule ------------------------------

    /// The buyer may still pick during the wait.
    function test_the_buyer_may_still_pick_during_the_wait() public {
        uint256 id = _contest();
        _enter(id, ann);
        _enter(id, bob);
        vm.warp(t0 + AWARD_BY + 1 days);
        address[] memory w = new address[](1);
        w[0] = bob;
        vm.prank(evaluator);
        jobs.award(id, w);
        assertEq(usdc.balanceOf(bob), _net(180e6));
        vm.warp(t0 + AWARD_BY + WAIT);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.claimRefund(id);
    }

    /// With fewer valid entries than places, the shares of the empty places
    /// go to the entries there are, in proportion.
    function test_fewer_entries_than_places_share_the_whole_prize() public {
        uint256 id = _contest();
        _enter(id, ann);
        vm.warp(t0 + 1 hours);
        _enter(id, bob);
        vm.warp(t0 + AWARD_BY + WAIT);
        jobs.claimRefund(id);
        assertEq(usdc.balanceOf(ann), _net(200e6));
        assertEq(usdc.balanceOf(bob), _net(100e6));
        assertEq(usdc.balanceOf(feeSafe), 3e6);
        assertEq(usdc.balanceOf(address(jobs)), 0);
    }

    /// The buyer's record shows the contest was not judged; each entrant
    /// paid is recorded as a completed place.
    function test_the_payout_records_the_buyer_as_not_judged() public {
        uint256 id = _contest();
        _enter(id, ann);
        vm.warp(t0 + AWARD_BY + WAIT);
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(jobs), bytes32(id), clientId, 0, Outcome.FAILED, 0, 0);
        jobs.claimRefund(id);
    }

    /// Nobody entered: the buyer takes it back after the wait, as cancelled.
    function test_nobody_entered_goes_back_as_cancelled() public {
        uint256 id = _contest();
        uint256 before = usdc.balanceOf(client);
        vm.warp(t0 + AWARD_BY + WAIT);
        jobs.claimRefund(id);
        assertEq(usdc.balanceOf(client), before + CONTEST_FUNDED);
    }

    /// The order is capped, so the payout always fits in a block.
    function test_entries_stop_at_the_cap() public {
        uint256 id = _contest();
        for (uint256 i; i < BountyLib.MAX_SLOTS; ++i) {
            address a = address(uint160(0x10000 + i));
            vm.prank(a);
            jobs.enter(id, keccak256(abi.encode(i)));
        }
        vm.prank(address(uint160(0x9999999)));
        vm.expectRevert(BountyLib.Full.selector);
        jobs.enter(id, keccak256("one too many"));
        vm.warp(t0 + AWARD_BY + WAIT);
        uint256 g = gasleft();
        jobs.claimRefund(id);
        assertLt(g - gasleft(), 3_000_000, "fits well inside a 30M block");
    }

    // ------------------------------- Helpers ------------------------------

    function _reject(uint256 id, address who) internal {
        vm.prank(evaluator);
        jobs.rejectEntry(id, who, keccak256(abi.encode("not valid", who)));
    }

    /// A place's share of the 300 USDC prize when only `sum` of the shares are filled.
    function _share(uint256 bps, uint256 sum) internal pure returns (uint256) {
        return (300e6 * bps) / sum;
    }
}
