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
}
