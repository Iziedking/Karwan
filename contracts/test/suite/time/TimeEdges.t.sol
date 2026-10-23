// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TimeFixture} from "./TimeFixture.sol";
import {TimeTerms, TimeState} from "../../../src/suite/time/TimeTypes.sol";
import {TimeLib} from "../../../src/suite/time/TimeLib.sol";
import {TimeDisputeLib} from "../../../src/suite/time/TimeDisputeLib.sol";
import {DisputeLib} from "../../../src/suite/dispute/DisputeLib.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {Outcome} from "../../../src/suite/interfaces/IKarwanSuite.sol";

/// @notice The time escrow at its edges: who may call each step and in which
///         state, what taking an offer back ends, what a submission records,
///         the bounds on approvals and objections, when funding and closing are
///         allowed, and the books across cycles.
contract TimeEdgesTest is TimeFixture {
    bytes32 internal constant SALT = bytes32("edge");

    function setUp() public {
        _deployTime();
    }

    // ------------------------------- Callers ------------------------------

    /// Funding, approving, objecting and dropping an objection are the
    /// employer's alone.
    function test_only_the_employer_funds_approves_objects_and_drops() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 60);
        vm.prank(worker);
        vm.expectRevert(TimeLib.BadCaller.selector);
        time.fundCycle(id);
        vm.prank(stranger);
        vm.expectRevert(TimeLib.BadCaller.selector);
        time.approve(id, 0, 60);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(worker);
        vm.expectRevert(TimeLib.BadCaller.selector);
        time.object(id, 0, 30, bytes32("hours"));
        vm.prank(employer);
        time.object(id, 0, 30, bytes32("hours"));
        vm.prank(stranger);
        vm.expectRevert(TimeLib.BadCaller.selector);
        time.dropObjection(id, 0);
    }

    function _expectEveryStepRefused(bytes32 id, TimeTerms memory t) internal {
        vm.startPrank(employer);
        vm.expectRevert(TimeLib.BadState.selector);
        time.fundCycle(id);
        vm.expectRevert(TimeLib.BadState.selector);
        time.approve(id, 0, 1);
        vm.expectRevert(TimeLib.BadState.selector);
        time.object(id, 0, 1, bytes32("hours"));
        vm.expectRevert(TimeLib.BadState.selector);
        time.dropObjection(id, 0);
        vm.expectRevert(TimeLib.BadState.selector);
        time.giveNotice(id);
        vm.expectRevert(TimeLib.BadState.selector);
        time.endNow(id);
        vm.expectRevert(TimeLib.BadState.selector);
        time.proposeAmendment(id, t, 1);
        vm.stopPrank();
        vm.startPrank(worker);
        vm.expectRevert(TimeLib.BadState.selector);
        time.submit(id, 0, 1, bytes32("log"));
        vm.expectRevert(TimeLib.BadState.selector);
        time.acceptAmendment(id, t, 1);
        vm.stopPrank();
        vm.expectRevert(TimeLib.BadState.selector);
        time.settle(id, 0);
        vm.expectRevert(TimeLib.BadState.selector);
        time.close(id);
    }

    function test_nothing_runs_on_an_offer_not_yet_accepted() public {
        TimeTerms memory t = _terms();
        bytes32 id = _offer(t, SALT);
        vm.warp(_start(t, 0));
        _expectEveryStepRefused(id, t);
    }

    function test_nothing_runs_on_an_engagement_taken_back() public {
        TimeTerms memory t = _terms();
        bytes32 id = _offer(t, SALT);
        vm.prank(employer);
        time.cancelOffer(id);
        vm.warp(_start(t, 0));
        _expectEveryStepRefused(id, t);
    }

    function test_an_offer_is_accepted_once_and_taken_back_only_before() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        bytes32 h = time.termsHashOf(t);
        vm.prank(worker);
        vm.expectRevert(TimeLib.BadState.selector);
        time.accept(id, h);
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadState.selector);
        time.cancelOffer(id);
    }

    /// Accepted in the last second, and only with the exact terms: a hash
    /// below the real one is as wrong as one above it.
    function test_an_offer_is_accepted_up_to_its_last_second_with_the_exact_terms_only() public {
        TimeTerms memory t = _terms();
        bytes32 id = _offer(t, SALT);
        vm.warp(t.acceptBy);
        vm.prank(worker);
        vm.expectRevert(TimeLib.HashMismatch.selector);
        time.accept(id, bytes32(uint256(1)));
        bytes32 h = time.termsHashOf(t);
        vm.prank(worker);
        time.accept(id, h);
        assertEq(uint8(_engagement(id).state), uint8(TimeState.Active));
    }

    // ------------------------------- Offers -------------------------------

    /// Taking an offer back refunds it, leaves nothing open, closes the account
    /// and records a cancelled engagement for the employer.
    function test_taking_an_offer_back_closes_everything_and_records_it() public {
        bytes32 id = _offer(_terms(), SALT);
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(time), id, employerId, 0, Outcome.CANCELLED, 1, 0);
        vm.prank(employer);
        time.cancelOffer(id);
        assertEq(_engagement(id).open, 0);
        assertTrue(time.accountOf(id).closed);
    }

    // ------------------------------- Claims -------------------------------

    function test_a_submission_records_its_time_and_its_log_even_after_2106() public {
        vm.warp((uint256(1) << 32) + 1_000);
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        vm.prank(worker);
        time.submit(id, 0, 60, keccak256("log"));
        assertEq(_cycle(id, 0).claimedAt, vm.getBlockTimestamp());
        assertEq(_cycle(id, 0).evidence, keccak256("log"));
    }

    /// Approval only ever moves up, and never past what was submitted.
    function test_approval_only_moves_up() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 120);
        vm.startPrank(employer);
        time.approve(id, 0, 90);
        vm.expectRevert(TimeLib.BadUnits.selector);
        time.approve(id, 0, 90);
        vm.expectRevert(TimeLib.BadUnits.selector);
        time.approve(id, 0, 60);
        vm.stopPrank();
    }

    function test_settling_marks_every_submitted_unit_approved() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 120);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        assertEq(_cycle(id, 0).approved, 120);
    }

    /// A dropped objection holds nothing, and the cycle can be objected to
    /// again.
    function test_a_dropped_objection_holds_nothing_and_can_be_raised_again() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 120);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.startPrank(employer);
        time.object(id, 0, 60, bytes32("hours"));
        time.dropObjection(id, 0);
        assertEq(_cycle(id, 0).disputed, 0);
        time.object(id, 0, 30, bytes32("hours"));
        vm.stopPrank();
        assertEq(_cycle(id, 0).disputed, 30);
    }

    /// Two cycles under objection at once each have their own dispute.
    function test_objections_on_two_cycles_are_separate_disputes() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        _fund(id);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 120);
        vm.warp(_start(t, 1) + 1 days);
        _submit(id, 1, 120);
        vm.warp(_end(t, 1) + t.claimGrace);
        vm.startPrank(employer);
        time.object(id, 1, 60, bytes32("hours"));
        vm.stopPrank();
        assertEq(_cycle(id, 1).disputed, 60);
        assertEq(_cycle(id, 0).disputed, 0);
        assertTrue(time.disputeOf(id, 1).openedAt != 0);
        assertEq(time.disputeOf(id, 0).openedAt, 0);
    }

    // ------------------------------- Funding ------------------------------

    function test_a_cycle_can_be_funded_until_the_second_before_it_ends() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_end(t, 1) - 1);
        _fund(id);
        assertEq(_engagement(id).nextCycle, 2);
        vm.warp(_end(t, 2));
        vm.prank(employer);
        vm.expectRevert(TimeLib.Late.selector);
        time.fundCycle(id);
        vm.warp(_end(t, 2) + 1 days);
        vm.prank(employer);
        vm.expectRevert(TimeLib.Late.selector);
        time.fundCycle(id);
    }

    /// Funding a cycle moves the horizon to cover its claims, its review, a
    /// whole dispute and the hold budget.
    function test_funding_a_cycle_moves_the_horizon_to_cover_it() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        _fund(id);
        _fund(id);
        assertEq(
            time.accountOf(id).horizon,
            _end(t, 2) + t.claimGrace + t.reviewWindow + DisputeLib.LONGEST + 30 days
        );
    }

    function test_settling_one_of_two_funded_cycles_leaves_one_open() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        _fund(id);
        assertEq(_engagement(id).open, 2);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 60);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        assertEq(_engagement(id).open, 1);
    }

    /// Unused budget carried from two cycles adds up, and the cycle it pays
    /// into is announced with what was new and what was carried.
    function test_carried_budget_adds_up_and_is_announced_when_used() public {
        TimeTerms memory t = _terms();
        t.rollover = true;
        bytes32 id = _active(t, SALT);
        _fund(id);
        _fund(id);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 600);
        vm.warp(_start(t, 1) + 1 days);
        _submit(id, 1, 300);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        uint256 first = _engagement(id).carry;
        vm.warp(time.settleAtOf(id, 1));
        time.settle(id, 1);
        uint256 both = _engagement(id).carry;
        assertGt(first, 0);
        assertGt(both - first, first);
        uint256 total = WEEK_FUNDED;
        uint256 carried = both < total ? both : total;
        vm.expectEmit(address(time));
        emit TimeLib.CycleFunded(id, 3, total - carried, carried);
        _fund(id);
    }

    /// In the notice period, a settled cycle's unused budget goes back
    /// instead of carrying.
    function test_unused_budget_goes_back_once_notice_is_given() public {
        TimeTerms memory t = _terms();
        t.rollover = true;
        bytes32 id = _active(t, SALT);
        _fund(id);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 600);
        vm.prank(employer);
        time.giveNotice(id);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        assertEq(_engagement(id).carry, 0);
    }

    /// Notice given while a later cycle is still to be funded: the settled
    /// cycle's unused budget goes back all the same.
    function test_unused_budget_goes_back_in_the_notice_period_with_a_cycle_still_to_fund() public {
        TimeTerms memory t = _terms();
        t.rollover = true;
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 600);
        vm.prank(employer);
        time.giveNotice(id);
        assertLt(_engagement(id).nextCycle, _engagement(id).runs);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        assertEq(_engagement(id).carry, 0);
    }

    /// No engagement under an id is refused as its state, before any caller
    /// check, whether accepted, taken back or closed.
    function test_an_engagement_that_does_not_exist_is_refused_as_its_state() public {
        vm.prank(worker);
        vm.expectRevert(TimeLib.BadState.selector);
        time.accept(bytes32("none"), bytes32(0));
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadState.selector);
        time.cancelOffer(bytes32("none"));
        vm.expectRevert(TimeLib.BadState.selector);
        time.close(bytes32("none"));
    }

    // ------------------------------- Closing ------------------------------

    function test_an_engagement_with_a_cycle_still_open_cannot_close() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_end(t, 1) + 1 days);
        vm.expectRevert(TimeLib.BadState.selector);
        time.close(id);
    }

    /// Once the next cycle ended unfunded, anyone closes, any time after.
    function test_anyone_closes_any_time_after_the_next_cycle_ended_unfunded() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        vm.warp(_end(t, 1) + 3 days);
        vm.prank(stranger);
        time.close(id);
        assertEq(uint8(_engagement(id).state), uint8(TimeState.Closed));
    }

    // ---------------------------- Ending at once --------------------------

    /// The first call only asks; the other side's call in the same cycle
    /// ends it, and the ask is cleared.
    function test_ending_at_once_needs_both_sides_and_clears_the_ask() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        vm.prank(employer);
        time.endNow(id);
        assertEq(uint8(_engagement(id).state), uint8(TimeState.Active));
        vm.prank(worker);
        time.endNow(id);
        assertEq(uint8(_engagement(id).state), uint8(TimeState.Ending));
        assertEq(_engagement(id).endAsked, address(0));
    }

    // ----------------------------- Reviewers ------------------------------

    /// With no high-value line, an escalated objection goes to the ordinary
    /// reviewer.
    function test_without_a_high_value_line_the_ordinary_reviewer_rules() public {
        hub.setAsset(address(usdc), true, 0);
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 120);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(employer);
        time.object(id, 0, 60, bytes32("hours"));
        vm.prank(arbiter);
        time.escalate(id, 0);
        vm.prank(reviewSafe);
        time.rule(id, 0, 5_000, bytes32("half"));
    }

    // ----------------------------- Term bounds ----------------------------

    uint256 internal constant NOW = 1_800_000_000;
    uint256 internal nonce;

    function _at() internal returns (TimeTerms memory t) {
        vm.warp(NOW);
        t = _terms();
    }

    function _opens(TimeTerms memory t) internal {
        vm.prank(employer);
        time.open(bytes32(++nonce), t);
    }

    function _refusedTerms(TimeTerms memory t) internal {
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.open(bytes32("bad"), t);
    }

    function test_a_cycle_runs_one_to_thirty_one_days() public {
        TimeTerms memory t = _at();
        t.cycleSecs = 1 days;
        _opens(t);
        t.cycleSecs = 1 days - 1;
        _refusedTerms(t);
        t.cycleSecs = 31 days;
        _opens(t);
        t.cycleSecs = 31 days + 1;
        _refusedTerms(t);
    }

    function test_an_engagement_runs_one_to_520_cycles() public {
        TimeTerms memory t = _at();
        t.cycleSecs = 1 days;
        t.cycles = 520;
        _opens(t);
        t.cycles = 521;
        _refusedTerms(t);
        t.cycles = 0;
        _refusedTerms(t);
    }

    function test_review_grace_and_notice_take_their_bounds() public {
        TimeTerms memory t = _at();
        t.reviewWindow = 1 hours;
        _opens(t);
        t.reviewWindow = 1 hours - 1;
        _refusedTerms(t);
        t = _at();
        t.reviewWindow = 14 days;
        _opens(t);
        t.reviewWindow = 14 days + 1;
        _refusedTerms(t);
        t = _at();
        t.claimGrace = 7 days;
        _opens(t);
        t.claimGrace = 7 days + 1;
        _refusedTerms(t);
        t = _at();
        t.noticeCycles = 4;
        _opens(t);
        t.noticeCycles = 5;
        _refusedTerms(t);
    }

    function test_shares_and_the_agreement_take_their_bounds() public {
        TimeTerms memory t = _at();
        t.partialBps = 10_000;
        _refusedTerms(t);
        t.partialBps = 10_001;
        _refusedTerms(t);
        t = _at();
        t.fallbackBps = 10_000;
        _opens(t);
        t.fallbackBps = 10_001;
        _refusedTerms(t);
        t = _at();
        t.agreementHash = bytes32(0);
        _refusedTerms(t);
    }

    function test_a_worker_a_rate_a_scale_and_a_cap_are_required() public {
        TimeTerms memory t = _at();
        t.worker = address(0);
        _refusedTerms(t);
        t = _at();
        t.rate = 0;
        _refusedTerms(t);
        t = _at();
        t.unitScale = 0;
        _refusedTerms(t);
        t = _at();
        t.maxUnits = 0;
        _refusedTerms(t);
    }

    /// A budget of exactly the largest amount the books hold passes the terms
    /// check; it then meets the cap instead.
    function test_the_largest_budget_passes_the_terms_and_meets_the_cap() public {
        TimeTerms memory t = _at();
        t.rate = type(uint128).max;
        t.unitScale = 1;
        t.maxUnits = 1;
        vm.prank(employer);
        vm.expectRevert(bytes4(keccak256("OverCap()")));
        time.open(bytes32("max"), t);
    }

    function test_the_start_and_the_accept_deadline_take_their_bounds() public {
        TimeTerms memory t = _at();
        t.acceptBy = uint64(NOW - 1);
        _refusedTerms(t);
        t = _at();
        t.startsAt = uint64(NOW);
        t.acceptBy = uint64(NOW + 1 hours);
        _opens(t);
        t = _at();
        t.startsAt = uint64(NOW + 90 days);
        _opens(t);
        t.startsAt = uint64(NOW + 90 days + 1);
        _refusedTerms(t);
        t = _at();
        t.acceptBy = t.startsAt + t.cycleSecs;
        _opens(t);
        t.acceptBy = t.startsAt + t.cycleSecs + 1;
        _refusedTerms(t);
    }

    // ----------------------------- Amendments -----------------------------

    function _proposed(bytes32 id, TimeTerms memory n, uint16 fromCycle) internal {
        vm.prank(employer);
        time.proposeAmendment(id, n, fromCycle);
    }

    /// The asset, the worker, the cycle length and the start never change, even
    /// to a lower address, a shorter cycle or an earlier start, and an
    /// amendment meets the same bounds as an offer.
    function test_an_amendment_keeps_what_never_changes_and_meets_the_bounds() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        TimeTerms memory n = _terms();
        n.acceptBy = uint64(block.timestamp + 2 days);
        n.worker = address(1);
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.proposeAmendment(id, n, 2);
        n = _terms();
        n.acceptBy = uint64(block.timestamp + 2 days);
        n.asset = address(1);
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.proposeAmendment(id, n, 2);
        n = _terms();
        n.acceptBy = uint64(block.timestamp + 2 days);
        n.startsAt = t.startsAt - 1;
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.proposeAmendment(id, n, 2);
        n = _terms();
        n.acceptBy = uint64(block.timestamp + 2 days);
        n.cycleSecs = t.cycleSecs - 1 days;
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.proposeAmendment(id, n, 2);
        n = _terms();
        n.acceptBy = uint64(block.timestamp + 2 days);
        n.rate = 0;
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.proposeAmendment(id, n, 2);
    }

    function test_an_amendment_may_wait_thirty_days_for_an_answer_and_no_longer() public {
        TimeTerms memory t = _at();
        bytes32 id = _active(t, SALT);
        TimeTerms memory n = _terms();
        n.rate = 10e6;
        n.acceptBy = uint64(NOW + 30 days);
        _proposed(id, n, 2);
        n.acceptBy = uint64(NOW + 30 days + 1);
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.proposeAmendment(id, n, 2);
    }

    /// An accepted amendment sets the new length and clears the proposal so it
    /// cannot be accepted twice. In its accept deadline's own second the terms
    /// no longer pass their own check, so that second is refused as bad terms.
    function test_an_accepted_amendment_sets_the_length_and_clears_the_proposal() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        TimeTerms memory n = _terms();
        n.cycles = 6;
        n.acceptBy = uint64(block.timestamp + 2 days);
        _proposed(id, n, 2);
        vm.warp(n.acceptBy);
        vm.prank(worker);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.acceptAmendment(id, n, 2);
        vm.warp(n.acceptBy - 1);
        vm.prank(worker);
        time.acceptAmendment(id, n, 2);
        assertEq(_engagement(id).runs, 6);
        assertEq(_engagement(id).amendHash, bytes32(0));
        assertEq(_engagement(id).amendBy, address(0));
        vm.prank(worker);
        vm.expectRevert(TimeLib.BadCaller.selector);
        time.acceptAmendment(id, n, 2);
    }

    /// The accepted terms must be exactly the proposed ones: terms whose hash is
    /// lower than the proposal's are as wrong as higher ones.
    function test_an_amendment_with_any_other_terms_is_refused() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        TimeTerms memory n = _terms();
        n.rate = 10e6;
        n.acceptBy = uint64(block.timestamp + 2 days);
        _proposed(id, n, 2);
        bytes32 h = keccak256(abi.encode(n, uint16(2)));
        TimeTerms memory other = _terms();
        other.acceptBy = n.acceptBy;
        for (uint128 r = 11e6;; ++r) {
            other.rate = r;
            if (keccak256(abi.encode(other, uint16(2))) < h) break;
        }
        vm.prank(worker);
        vm.expectRevert(TimeLib.HashMismatch.selector);
        time.acceptAmendment(id, other, 2);
    }

    /// An amendment that brings the planned total to exactly the high-value
    /// line hands disputes to the senior reviewer; with no line, the ordinary
    /// reviewer keeps them.
    function test_an_amendment_reaching_the_high_value_line_hands_disputes_to_the_senior_reviewer() public {
        TimeTerms memory t = _terms();
        TimeTerms memory n = _terms();
        n.cycles = 6;
        hub.setAsset(address(usdc), true, 960e6);
        bytes32 id = _active(t, SALT);
        n.acceptBy = uint64(block.timestamp + 2 days);
        _proposed(id, n, 2);
        vm.prank(worker);
        time.acceptAmendment(id, n, 2);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 120);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(employer);
        time.object(id, 0, 60, bytes32("hours"));
        vm.prank(arbiter);
        time.escalate(id, 0);
        vm.prank(reviewSafe);
        vm.expectRevert(DisputeLib.NotReviewer.selector);
        time.rule(id, 0, 5_000, bytes32("half"));
        vm.prank(seniorSafe);
        time.rule(id, 0, 5_000, bytes32("half"));
    }

    function test_with_no_high_value_line_an_amendment_keeps_the_ordinary_reviewer() public {
        hub.setAsset(address(usdc), true, 0);
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        TimeTerms memory n = _terms();
        n.cycles = 6;
        n.acceptBy = uint64(block.timestamp + 2 days);
        _proposed(id, n, 2);
        vm.prank(worker);
        time.acceptAmendment(id, n, 2);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 120);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(employer);
        time.object(id, 0, 60, bytes32("hours"));
        vm.prank(arbiter);
        time.escalate(id, 0);
        vm.prank(reviewSafe);
        time.rule(id, 0, 5_000, bytes32("half"));
    }

    // -------------------------------- Notice ------------------------------

    /// Notice follows the terms in force for the last started cycle: an
    /// amendment from cycle 1 raised it to 3 cycles.
    function test_notice_follows_the_terms_in_force() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        TimeTerms memory n = _terms();
        n.noticeCycles = 3;
        n.cycles = 8;
        n.acceptBy = uint64(block.timestamp + 2 days);
        _proposed(id, n, 1);
        vm.prank(worker);
        time.acceptAmendment(id, n, 1);
        _fund(id);
        _fund(id);
        vm.warp(_start(t, 2) + 1 days);
        vm.prank(worker);
        time.giveNotice(id);
        assertEq(_engagement(id).runs, 3 + 3);
    }

    /// A long daily engagement past its 256th day: ending, notice and the
    /// cycles counted past it stay whole.
    function test_a_daily_engagement_past_its_256th_day_ends_on_the_right_cycle() public {
        TimeTerms memory t = _terms();
        t.cycleSecs = 1 days;
        t.cycles = 400;
        t.maxUnits = 60;
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 300) + 1 hours);
        vm.prank(employer);
        time.endNow(id);
        vm.prank(worker);
        time.endNow(id);
        assertEq(_engagement(id).runs, 301);
    }

    function test_notice_on_a_daily_engagement_past_its_256th_day_counts_every_cycle() public {
        TimeTerms memory t = _terms();
        t.cycleSecs = 1 days;
        t.cycles = 400;
        t.maxUnits = 60;
        t.noticeCycles = 2;
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 299) + 1 hours);
        vm.prank(employer);
        time.giveNotice(id);
        assertEq(_engagement(id).runs, 302);
    }

    /// Notice refunds every cycle funded beyond the new end, past cycle 255 too.
    function test_notice_refunds_cycles_funded_beyond_the_end_past_cycle_255() public {
        TimeTerms memory t = _terms();
        t.cycleSecs = 1 days;
        t.cycles = 400;
        t.maxUnits = 60;
        t.noticeCycles = 0;
        hub.setCaps(address(time), address(usdc), type(uint128).max, type(uint128).max);
        bytes32 id = _active(t, SALT);
        for (uint256 k = 1; k < 258; ++k) {
            _fund(id);
        }
        vm.warp(_start(t, 255) + 1 hours);
        assertEq(_engagement(id).open, 258);
        uint256 before = usdc.balanceOf(employer);
        vm.prank(employer);
        time.giveNotice(id);
        assertEq(_engagement(id).runs, 256);
        assertEq(_engagement(id).nextCycle, 256);
        assertEq(_engagement(id).open, 256);
        assertEq(usdc.balanceOf(employer), before + 2 * _cycle(id, 256).funded);
    }

    // ---------------------------- Clock and books -------------------------

    /// The third cycle opens exactly two cycle lengths after the start, past
    /// 2106 too.
    function test_a_later_cycle_opens_on_its_own_start_even_after_2106() public {
        vm.warp((uint256(1) << 32) + 1_000);
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        _fund(id);
        _fund(id);
        vm.warp(_start(t, 2) - 1);
        vm.prank(worker);
        vm.expectRevert(TimeLib.Early.selector);
        time.submit(id, 2, 60, bytes32("log"));
        vm.warp(_start(t, 2));
        _submit(id, 2, 60);
        assertEq(_cycle(id, 2).claimed, 60);
        assertEq(time.settleAtOf(id, 2), _end(t, 2) + t.claimGrace + t.reviewWindow);
    }

    /// A rate and unit count whose product passes 128 bits are still priced
    /// whole, and a gross beyond 64 bits is paid and booked whole.
    function test_huge_rates_are_priced_and_paid_whole() public {
        hub.setAsset(address(usdc), true, 0);
        hub.setCaps(address(time), address(usdc), type(uint128).max, type(uint128).max);
        usdc.mint(employer, uint256(1) << 120);
        TimeTerms memory t = _terms();
        t.rate = uint128(1) << 112;
        t.unitScale = 10_000;
        t.maxUnits = 100_000;
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 100_000);
        uint256 gross = (uint256(t.rate) * 100_000) / 10_000;
        vm.prank(employer);
        time.approve(id, 0, 100_000);
        assertEq(_cycle(id, 0).paidGross, gross);
        assertEq(_engagement(id).paidGross, gross);
        assertEq(usdc.balanceOf(worker), _net(gross));
    }

    /// Unused budget beyond 64 bits carries forward whole, and the next cycle
    /// spends it whole.
    function test_a_carry_beyond_64_bits_is_kept_whole() public {
        hub.setAsset(address(usdc), true, 0);
        hub.setCaps(address(time), address(usdc), type(uint128).max, type(uint128).max);
        usdc.mint(employer, uint256(1) << 120);
        TimeTerms memory t = _terms();
        t.rate = uint128(1) << 80;
        t.unitScale = 10_000;
        t.maxUnits = 100_000;
        t.rollover = true;
        bytes32 id = _active(t, SALT);
        _fund(id);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 10);
        uint256 funded = _cycle(id, 0).funded;
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        uint256 carry = _engagement(id).carry;
        assertGt(carry, type(uint64).max);
        assertLe(carry, funded);
        _fund(id);
        assertEq(_engagement(id).carry, 0);
    }

    // ------------------------------ Disputes ------------------------------

    function _objected(TimeTerms memory t) internal returns (bytes32 id) {
        id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 120);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(employer);
        time.object(id, 0, 60, bytes32("hours"));
    }

    /// Dispute steps on a cycle with no objection, or one already settled,
    /// are refused as not disputed.
    function test_dispute_steps_need_a_cycle_under_objection() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.prank(arbiter);
        vm.expectRevert(TimeDisputeLib.NotDisputed.selector);
        time.proposeRuling(id, 0, 5_000, bytes32("half"));
        vm.prank(arbiter);
        vm.expectRevert(TimeDisputeLib.NotDisputed.selector);
        time.escalate(id, 0);
        vm.expectRevert(TimeDisputeLib.NotDisputed.selector);
        time.executeRuling(id, 0);
        vm.prank(reviewSafe);
        vm.expectRevert(TimeDisputeLib.NotDisputed.selector);
        time.rule(id, 0, 5_000, bytes32("half"));
        vm.expectRevert(TimeDisputeLib.NotDisputed.selector);
        time.applyFallback(id, 0);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        vm.prank(reviewSafe);
        vm.expectRevert(TimeDisputeLib.NotDisputed.selector);
        time.rule(id, 0, 5_000, bytes32("half"));
    }

    /// The employer, calling through a relayer, appeals the arbiter's proposal.
    function test_the_employer_appeals_a_proposal_in_time() public {
        TimeTerms memory t = _terms();
        bytes32 id = _objected(t);
        vm.prank(arbiter);
        time.proposeRuling(id, 0, 10_000, bytes32("all"));
        vm.prank(employer, stranger);
        time.escalate(id, 0);
        assertTrue(time.disputeOf(id, 0).escalated);
    }

    function test_a_proposal_and_the_fallback_wait_out_a_hold() public {
        TimeTerms memory t = _terms();
        bytes32 id = _objected(t);
        vm.prank(arbiter);
        time.proposeRuling(id, 0, 10_000, bytes32("all"));
        vm.warp(vm.getBlockTimestamp() + 72 hours);
        vm.prank(guardian);
        time.hold(id, bytes32("scan"));
        vm.expectRevert(TimeLib.OnHold.selector);
        time.executeRuling(id, 0);
        vm.warp(vm.getBlockTimestamp() + 7 days);
        vm.prank(arbiter);
        time.escalate(id, 0);
        vm.warp(vm.getBlockTimestamp() + 5 days);
        vm.prank(guardian);
        time.hold(id, bytes32("scan"));
        vm.expectRevert(TimeLib.OnHold.selector);
        time.applyFallback(id, 0);
    }

    function test_the_fallback_waits_for_the_reviewer_to_run_out_of_time() public {
        TimeTerms memory t = _terms();
        bytes32 id = _objected(t);
        vm.prank(arbiter);
        time.escalate(id, 0);
        vm.expectRevert(DisputeLib.Early.selector);
        time.applyFallback(id, 0);
    }

    // ----------------------------- Cycle states ---------------------------

    /// Hours go only to a funded cycle that is neither under objection nor
    /// settled; the same holds for approving, settling and objecting.
    function test_each_cycle_step_needs_a_funded_cycle() public {
        TimeTerms memory t = _terms();
        bytes32 id = _objected(t);
        vm.prank(worker);
        vm.expectRevert(TimeLib.BadState.selector);
        time.submit(id, 0, 120, bytes32("log"));
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadState.selector);
        time.approve(id, 0, 90);
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadState.selector);
        time.object(id, 0, 10, bytes32("again"));
        vm.prank(worker);
        vm.expectRevert(TimeLib.BadState.selector);
        time.submit(id, 2, 60, bytes32("log"));
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadState.selector);
        time.approve(id, 2, 60);
        vm.expectRevert(TimeLib.BadState.selector);
        time.settle(id, 2);
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadState.selector);
        time.object(id, 2, 10, bytes32("none"));
    }

    function test_a_settled_cycle_takes_no_more_hours() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 60);
        vm.prank(employer);
        time.approve(id, 0, 60);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        vm.prank(worker);
        vm.expectRevert(TimeLib.BadState.selector);
        time.submit(id, 0, 60, bytes32("log"));
    }

    function test_the_worker_may_resubmit_exactly_what_was_approved() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 60);
        vm.prank(employer);
        time.approve(id, 0, 60);
        _submit(id, 0, 60);
        assertEq(_cycle(id, 0).claimed, 60);
    }

    function test_an_objection_long_after_the_review_is_late() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 120);
        vm.warp(time.settleAtOf(id, 0) + 1 days);
        vm.prank(employer);
        vm.expectRevert(TimeLib.Late.selector);
        time.object(id, 0, 60, bytes32("late"));
    }

    /// Only the two sides ask to end an engagement at once.
    function test_only_the_two_sides_ask_to_end_now() public {
        bytes32 id = _active(_terms(), SALT);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(TimeLib.BadCaller.selector);
        time.endNow(id);
    }

    /// A cycle's dispute is filed under the hash of the engagement and the
    /// cycle, encoded as published.
    function test_a_cycles_dispute_is_filed_under_its_published_key() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 120);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.expectEmit(address(time));
        emit DisputeLib.DisputeOpened(keccak256(abi.encode(id, uint16(0))), employer, bytes32("hours"));
        vm.prank(employer);
        time.object(id, 0, 60, bytes32("hours"));
    }

    /// Settling one of three funded cycles leaves two open.
    function test_settling_one_of_three_funded_cycles_leaves_two_open() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        _fund(id);
        _fund(id);
        assertEq(_engagement(id).open, 3);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        assertEq(_engagement(id).open, 2);
    }

    /// Only the two sides give notice or accept an amendment.
    function test_only_the_two_sides_give_notice_or_accept_an_amendment() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(TimeLib.BadCaller.selector);
        time.giveNotice(id);
        TimeTerms memory n = _terms();
        n.cycles = 6;
        n.acceptBy = uint64(block.timestamp + 2 days);
        _proposed(id, n, 2);
        vm.prank(stranger);
        vm.expectRevert(TimeLib.BadCaller.selector);
        time.acceptAmendment(id, n, 2);
    }

    /// Ending at once takes both sides: one side asking, even twice, ends
    /// nothing until the other asks too.
    function test_one_side_asking_twice_does_not_end_now() public {
        bytes32 id = _active(_terms(), SALT);
        vm.startPrank(employer);
        time.endNow(id);
        assertEq(uint8(_engagement(id).state), uint8(TimeState.Active));
        time.endNow(id);
        assertEq(uint8(_engagement(id).state), uint8(TimeState.Active));
        vm.stopPrank();
        vm.prank(worker);
        time.endNow(id);
        assertEq(uint8(_engagement(id).state), uint8(TimeState.Ending));
    }

    /// Notice in a daily engagement's 300th cycle uses the terms in force for
    /// that cycle and is announced with every run it keeps.
    function test_notice_past_cycle_256_uses_the_terms_in_force_and_counts_every_run() public {
        TimeTerms memory t = _terms();
        t.cycleSecs = 1 days;
        t.cycles = 520;
        bytes32 id = _active(t, SALT);
        TimeTerms memory n = t;
        n.noticeCycles = 3;
        n.acceptBy = uint64(block.timestamp + 2 days);
        _proposed(id, n, 100);
        vm.prank(worker);
        time.acceptAmendment(id, n, 100);
        vm.warp(uint256(t.startsAt) + 299 days + 1);
        vm.expectEmit(address(time));
        emit TimeLib.NoticeGiven(id, employer, 303);
        vm.prank(employer);
        time.giveNotice(id);
    }
}
