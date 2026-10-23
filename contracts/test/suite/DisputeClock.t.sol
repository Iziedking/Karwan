// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DisputeLib} from "../../src/suite/dispute/DisputeLib.sol";
import {DisputeHarness} from "./mocks/DisputeHarness.sol";

/// @notice The shared dispute clock: who may act, and when.
contract DisputeClockTest is Test {
    DisputeHarness internal h;
    address internal arbiter = makeAddr("arbiter");
    address internal reviewer = makeAddr("reviewer");
    address internal party = makeAddr("party");
    bytes32 internal constant DEAL = bytes32("deal");

    function setUp() public {
        h = new DisputeHarness();
        h.setPanel(DEAL, arbiter, reviewer);
    }

    function _open() internal returns (uint256 at) {
        at = vm.getBlockTimestamp();
        vm.prank(party);
        h.open(DEAL);
    }

    function test_a_deal_has_one_open_dispute_at_a_time() public {
        _open();
        assertEq(h.disputeOf(DEAL).opener, party);
        vm.expectRevert(DisputeLib.DisputeOpen.selector);
        h.open(DEAL);
        h.setPanel(bytes32("other"), arbiter, reviewer);
        h.open(bytes32("other"));
    }

    function test_without_an_arbiter_a_dispute_opens_escalated() public {
        h.setPanel(DEAL, address(0), reviewer);
        _open();
        assertTrue(h.disputeOf(DEAL).escalated);
        vm.prank(reviewer);
        h.rule(DEAL, 2_500);
        assertEq(h.lastBps(), 2_500);
    }

    function test_only_the_arbiter_proposes_once_from_the_allowed_outcomes() public {
        _open();
        vm.expectRevert(DisputeLib.NotArbiter.selector);
        h.propose(DEAL, 0, 0);
        vm.startPrank(arbiter);
        vm.expectRevert(DisputeLib.BadOutcome.selector);
        h.propose(DEAL, 4_000, 0);
        vm.expectRevert(DisputeLib.BadOutcome.selector);
        h.propose(DEAL, 4_000, 3_000);
        h.propose(DEAL, 3_000, 3_000);
        vm.expectRevert(DisputeLib.NotAllowed.selector);
        h.propose(DEAL, 10_000, 3_000);
        vm.stopPrank();
    }

    function test_nothing_is_proposed_or_executed_without_an_open_dispute() public {
        vm.prank(arbiter);
        vm.expectRevert(DisputeLib.NoDispute.selector);
        h.propose(DEAL, 0, 0);
        vm.expectRevert(DisputeLib.NoDispute.selector);
        h.executeProposal(DEAL);
    }

    function test_a_proposal_applies_after_72_hours_and_closes_the_dispute() public {
        uint256 at = _open();
        vm.prank(arbiter);
        h.propose(DEAL, 10_000, 0);
        vm.warp(at + 72 hours - 1);
        vm.expectRevert(DisputeLib.Early.selector);
        h.executeProposal(DEAL);
        vm.warp(at + 72 hours);
        h.executeProposal(DEAL);
        assertEq(h.lastBps(), 10_000);
        assertEq(h.lastOpenedAt(), at);
        assertEq(h.disputeOf(DEAL).openedAt, 0);
    }

    function test_only_a_party_appeals_and_only_within_the_window() public {
        uint256 at = _open();
        vm.prank(arbiter);
        h.propose(DEAL, 0, 0);
        vm.expectRevert(DisputeLib.NotAllowed.selector);
        h.escalate(DEAL, false);
        vm.warp(at + 72 hours);
        vm.expectRevert(DisputeLib.Late.selector);
        h.escalate(DEAL, true);
    }

    function test_an_appeal_stops_the_proposal() public {
        _open();
        vm.prank(arbiter);
        h.propose(DEAL, 0, 0);
        h.escalate(DEAL, true);
        vm.warp(vm.getBlockTimestamp() + 72 hours);
        vm.expectRevert(DisputeLib.NotAllowed.selector);
        h.executeProposal(DEAL);
        vm.expectRevert(DisputeLib.NotAllowed.selector);
        h.escalate(DEAL, true);
    }

    function test_anyone_escalates_once_the_arbiter_lets_five_days_pass() public {
        uint256 at = _open();
        vm.warp(at + 5 days - 1);
        vm.expectRevert(DisputeLib.Early.selector);
        h.escalate(DEAL, false);
        vm.warp(at + 5 days);
        h.escalate(DEAL, false);
        assertTrue(h.disputeOf(DEAL).escalated);
    }

    function test_the_arbiter_escalates_at_any_time() public {
        _open();
        vm.prank(arbiter);
        h.escalate(DEAL, false);
        assertTrue(h.disputeOf(DEAL).escalated);
    }

    function test_only_the_reviewer_rules_only_an_escalated_dispute_within_five_days() public {
        _open();
        vm.prank(reviewer);
        vm.expectRevert(DisputeLib.NotAllowed.selector);
        h.rule(DEAL, 5_000);
        vm.prank(arbiter);
        h.escalate(DEAL, false);
        uint256 escalated = vm.getBlockTimestamp();
        vm.expectRevert(DisputeLib.NotReviewer.selector);
        h.rule(DEAL, 5_000);
        vm.prank(reviewer);
        vm.expectRevert(DisputeLib.BadOutcome.selector);
        h.rule(DEAL, 10_001);
        vm.warp(escalated + 5 days);
        vm.prank(reviewer);
        vm.expectRevert(DisputeLib.Late.selector);
        h.rule(DEAL, 5_000);
    }

    function test_the_fallback_applies_only_after_the_ruling_deadline() public {
        _open();
        vm.expectRevert(DisputeLib.NotAllowed.selector);
        h.applyFallback(DEAL, 5_000);
        vm.prank(arbiter);
        h.escalate(DEAL, false);
        uint256 escalated = vm.getBlockTimestamp();
        vm.warp(escalated + 5 days - 1);
        vm.expectRevert(DisputeLib.Early.selector);
        h.applyFallback(DEAL, 5_000);
        vm.warp(escalated + 5 days);
        h.applyFallback(DEAL, 5_000);
        assertEq(h.disputeOf(DEAL).openedAt, 0);
    }

    function test_dropping_a_dispute_clears_it() public {
        _open();
        h.drop(DEAL);
        assertEq(h.disputeOf(DEAL).openedAt, 0);
        h.open(DEAL);
    }

    // ------------------------------- Edges --------------------------------

    uint256 internal constant NOW = 1_800_000_000;

    function test_the_longest_dispute_is_the_proposal_appeal_and_ruling_windows_together() public pure {
        assertEq(DisputeLib.LONGEST, 5 days + 72 hours + 5 days);
    }

    function test_the_dispute_clock_keeps_its_times_past_2106() public {
        vm.warp((uint256(1) << 32) + 1_000);
        uint256 t0 = _open();
        assertEq(h.disputeOf(DEAL).openedAt, t0);
        vm.prank(arbiter);
        h.propose(DEAL, 0, 0);
        assertEq(h.disputeOf(DEAL).proposedAt, t0);
        vm.warp(t0 + 1 hours);
        vm.prank(party);
        h.escalate(DEAL, true);
        assertEq(h.disputeOf(DEAL).escalatedAt, t0 + 1 hours);
    }

    function test_a_proposal_and_an_escalation_announce_their_deadlines() public {
        vm.warp(NOW);
        _open();
        vm.expectEmit(address(h));
        emit DisputeLib.RulingProposed(DEAL, 0, keccak256("proposal"), uint64(NOW + 72 hours));
        vm.prank(arbiter);
        h.propose(DEAL, 0, 0);
        vm.expectEmit(address(h));
        emit DisputeLib.DisputeEscalated(DEAL, party, uint64(NOW + 5 days));
        vm.prank(party);
        h.escalate(DEAL, true);
    }

    function test_a_share_the_terms_do_not_allow_is_never_proposed() public {
        _open();
        vm.prank(arbiter);
        vm.expectRevert(DisputeLib.BadOutcome.selector);
        h.propose(DEAL, 7_000, 5_000);
    }

    function test_an_appeal_long_after_its_window_is_late() public {
        vm.warp(NOW);
        _open();
        vm.prank(arbiter);
        h.propose(DEAL, 0, 0);
        vm.warp(NOW + 72 hours + 1 days);
        vm.prank(party);
        vm.expectRevert(DisputeLib.Late.selector);
        h.escalate(DEAL, true);
    }

    function test_without_a_proposal_anyone_escalates_any_time_after_the_proposal_window() public {
        uint256 t0 = _open();
        vm.warp(t0 + 6 days);
        vm.prank(party);
        h.escalate(DEAL, false);
        assertTrue(h.disputeOf(DEAL).escalated);
    }

    function test_a_ruling_long_after_its_period_is_late_and_the_fallback_applies() public {
        vm.warp(NOW);
        _open();
        vm.prank(arbiter);
        h.escalate(DEAL, false);
        vm.warp(NOW + 5 days + 1 days);
        vm.prank(reviewer);
        vm.expectRevert(DisputeLib.Late.selector);
        h.rule(DEAL, 2_500);
        h.applyFallback(DEAL, 5_000);
        assertEq(h.lastBps(), 5_000);
    }

    /// Opening names the opener and the clause; each way a dispute ends names
    /// the outcome, its hash and how it was reached.
    function test_a_dispute_announces_its_opening_and_each_way_it_ends() public {
        vm.expectEmit(address(h));
        emit DisputeLib.DisputeOpened(DEAL, party, keccak256("clause"));
        uint256 t0 = _open();
        vm.prank(arbiter);
        h.propose(DEAL, 10_000, 0);
        vm.warp(t0 + 72 hours);
        vm.expectEmit(address(h));
        emit DisputeLib.DisputeResolved(DEAL, 10_000, bytes32(0), 1);
        h.executeProposal(DEAL);
        h.setPanel(bytes32("ruled"), arbiter, reviewer);
        h.open(bytes32("ruled"));
        vm.prank(arbiter);
        h.escalate(bytes32("ruled"), false);
        vm.expectEmit(address(h));
        emit DisputeLib.DisputeResolved(bytes32("ruled"), 2_500, keccak256("ruling"), 2);
        vm.prank(reviewer);
        h.rule(bytes32("ruled"), 2_500);
        h.setPanel(bytes32("fallback"), arbiter, reviewer);
        h.open(bytes32("fallback"));
        vm.prank(arbiter);
        h.escalate(bytes32("fallback"), false);
        vm.warp(vm.getBlockTimestamp() + 5 days);
        vm.expectEmit(address(h));
        emit DisputeLib.DisputeResolved(bytes32("fallback"), 5_000, bytes32(0), 3);
        h.applyFallback(bytes32("fallback"), 5_000);
    }
}
