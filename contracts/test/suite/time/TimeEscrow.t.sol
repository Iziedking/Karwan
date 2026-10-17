// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TimeFixture} from "./TimeFixture.sol";
import {TimeTerms, TimeState} from "../../../src/suite/time/TimeTypes.sol";
import {TimeLib} from "../../../src/suite/time/TimeLib.sol";
import {TimeDisputeLib} from "../../../src/suite/time/TimeDisputeLib.sol";
import {DisputeLib} from "../../../src/suite/dispute/DisputeLib.sol";
import {SettlementLib} from "../../../src/suite/settlement/SettlementLib.sol";
import {KarwanSettlementBase} from "../../../src/suite/KarwanSettlementBase.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {Outcome} from "../../../src/suite/interfaces/IKarwanSuite.sol";

/// @notice A week of hourly work, and every way it can go: silence pays, the
///         employer approves or objects to some hours, unused budget goes back
///         or carries forward, and the engagement ends with notice.
contract TimeEscrowTest is TimeFixture {
    bytes32 internal constant SALT = bytes32("week");

    function setUp() public {
        _deployTime();
    }

    function _refused(TimeTerms memory t) internal {
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.open(SALT, t);
    }

    // ------------------------------- Opening ------------------------------

    function test_an_offer_funds_the_first_week_and_the_worker_accepts_the_exact_terms() public {
        TimeTerms memory t = _terms();
        bytes32 id = _offer(t, SALT);
        assertEq(usdc.balanceOf(address(time)), WEEK_FUNDED);
        assertEq(_cycle(id, 0).funded, WEEK_FUNDED);
        assertEq(uint8(_engagement(id).state), uint8(TimeState.Offered));
        bytes32 h = time.termsHashOf(t);
        vm.prank(stranger);
        vm.expectRevert(TimeLib.BadCaller.selector);
        time.accept(id, h);
        vm.prank(worker);
        vm.expectRevert(TimeLib.HashMismatch.selector);
        time.accept(id, bytes32("other"));
        vm.warp(uint256(t.acceptBy) + 1);
        vm.prank(worker);
        vm.expectRevert(TimeLib.Late.selector);
        time.accept(id, h);
    }

    function test_the_employer_takes_an_offer_back_before_acceptance() public {
        bytes32 id = _offer(_terms(), SALT);
        uint256 before = usdc.balanceOf(employer);
        vm.prank(employer);
        time.cancelOffer(id);
        assertEq(usdc.balanceOf(employer), before + WEEK_FUNDED);
        assertEq(uint8(_engagement(id).state), uint8(TimeState.Closed));
    }

    function test_the_worker_cannot_be_the_employer() public {
        TimeTerms memory t = _terms();
        t.worker = employer;
        vm.prank(employer);
        vm.expectRevert(SettlementLib.BadParties.selector);
        time.open(SALT, t);
    }

    function test_terms_out_of_bounds_are_refused() public {
        TimeTerms memory t = _terms();
        t.cycleSecs = 12 hours;
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.open(SALT, t);
        t = _terms();
        t.noticeCycles = 5;
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.open(SALT, t);
        t = _terms();
        t.reviewWindow = 15 days;
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.open(SALT, t);
    }

    function test_terms_with_no_worker_rate_scale_or_cap_are_refused() public {
        TimeTerms memory t = _terms();
        t.worker = address(0);
        _refused(t);
        t = _terms();
        t.rate = 0;
        _refused(t);
        t = _terms();
        t.unitScale = 0;
        _refused(t);
        t = _terms();
        t.unitScale = 10_001;
        _refused(t);
        t = _terms();
        t.maxUnits = 0;
        _refused(t);
    }

    function test_a_budget_of_nothing_or_past_the_ledger_limit_is_refused() public {
        TimeTerms memory t = _terms();
        t.rate = 1;
        t.maxUnits = 1;
        _refused(t);
        t = _terms();
        t.rate = type(uint128).max;
        t.unitScale = 1;
        t.maxUnits = 2;
        _refused(t);
    }

    function test_an_offer_already_past_its_acceptance_time_is_refused() public {
        TimeTerms memory t = _terms();
        t.acceptBy = uint64(block.timestamp);
        _refused(t);
    }

    function test_the_first_week_starts_within_90_days_and_is_accepted_before_it_ends() public {
        uint256 t0 = vm.getBlockTimestamp();
        TimeTerms memory t = _terms();
        t.startsAt = uint64(t0 - 1);
        _refused(t);
        t = _terms();
        t.startsAt = uint64(t0 + 90 days + 1);
        _refused(t);
        t = _terms();
        t.acceptBy = t.startsAt + t.cycleSecs + 1;
        _refused(t);
    }

    function test_a_high_value_engagement_is_judged_by_the_senior_reviewer_from_the_start() public {
        TimeTerms memory t = _terms();
        t.rate = 10e6;
        t.cycles = 25;
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(employer);
        time.object(id, 0, 4 * 60, bytes32("hours"));
        vm.prank(arbiter);
        time.escalate(id, 0);
        vm.prank(reviewSafe);
        vm.expectRevert(DisputeLib.NotReviewer.selector);
        time.rule(id, 0, 5_000, bytes32("half"));
        vm.prank(seniorSafe);
        time.rule(id, 0, 5_000, bytes32("half"));
        assertEq(usdc.balanceOf(worker), _net(140e6));
    }

    function test_a_cancelled_offer_cannot_be_accepted() public {
        TimeTerms memory t = _terms();
        bytes32 id = _offer(t, SALT);
        vm.prank(employer);
        time.cancelOffer(id);
        bytes32 h = time.termsHashOf(t);
        vm.prank(worker);
        vm.expectRevert(TimeLib.BadState.selector);
        time.accept(id, h);
        assertEq(uint8(_engagement(id).state), uint8(TimeState.Closed));
    }

    function test_an_accepted_offer_cannot_be_taken_back() public {
        bytes32 id = _active(_terms(), SALT);
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadState.selector);
        time.cancelOffer(id);
        assertEq(usdc.balanceOf(address(time)), WEEK_FUNDED);
        assertEq(uint8(_engagement(id).state), uint8(TimeState.Active));
    }

    // ------------------------------- A week -------------------------------

    function test_silence_pays_the_hours_submitted_and_returns_the_rest() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 3 days);
        _submit(id, 0, 16 * 60);
        vm.expectRevert(TimeLib.Early.selector);
        time.settle(id, 0);
        uint256 employerBefore = usdc.balanceOf(employer);
        vm.warp(time.settleAtOf(id, 0));
        vm.prank(stranger);
        time.settle(id, 0);
        assertEq(usdc.balanceOf(worker), _net(128e6));
        assertEq(usdc.balanceOf(feeSafe), 1.28e6);
        assertEq(usdc.balanceOf(employer), employerBefore + WEEK_FUNDED - 128e6 - 0.64e6);
        assertEq(usdc.balanceOf(address(time)), 0);
        assertEq(usdc.balanceOf(stranger), 0);
    }

    function test_approval_pays_at_once_and_in_parts() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        vm.prank(employer);
        time.approve(id, 0, 10 * 60);
        assertEq(usdc.balanceOf(worker), _net(80e6));
        vm.prank(employer);
        time.approve(id, 0, 16 * 60);
        assertEq(usdc.balanceOf(worker), _net(128e6));
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadUnits.selector);
        time.approve(id, 0, 17 * 60);
        vm.warp(_end(t, 0) + t.claimGrace);
        time.settle(id, 0);
        assertEq(usdc.balanceOf(worker), _net(128e6));
    }

    function test_an_objection_pays_the_rest_at_once_and_holds_only_the_objected_hours() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(employer);
        time.object(id, 0, 4 * 60, bytes32("hours"));
        assertEq(usdc.balanceOf(worker), _net(96e6));
        vm.prank(arbiter);
        time.proposeRuling(id, 0, 0, bytes32("no"));
        vm.warp(block.timestamp + 72 hours);
        time.executeRuling(id, 0);
        assertEq(usdc.balanceOf(worker), _net(96e6));
        assertEq(usdc.balanceOf(address(time)), 0);
        assertTrue(_engagement(id).ruled);
    }

    function test_the_reviewer_splits_the_objected_hours() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(employer);
        time.object(id, 0, 4 * 60, bytes32("hours"));
        vm.prank(arbiter);
        time.escalate(id, 0);
        vm.prank(reviewSafe);
        time.rule(id, 0, 5_000, bytes32("half"));
        assertEq(usdc.balanceOf(worker), _net(112e6));
    }

    function test_the_fallback_applies_when_the_reviewer_misses_the_deadline() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(employer);
        time.object(id, 0, 4 * 60, bytes32("hours"));
        vm.prank(arbiter);
        time.escalate(id, 0);
        vm.warp(block.timestamp + 5 days);
        vm.prank(stranger);
        time.applyFallback(id, 0);
        assertEq(usdc.balanceOf(worker), _net(112e6));
    }

    function test_a_dropped_objection_lets_silence_pay() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(employer);
        time.object(id, 0, 4 * 60, bytes32("hours"));
        vm.prank(employer);
        time.dropObjection(id, 0);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        assertEq(usdc.balanceOf(worker), _net(128e6));
    }

    function test_silence_does_not_pay_objected_hours() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(employer);
        time.object(id, 0, 4 * 60, bytes32("hours"));
        uint256 at = time.settleAtOf(id, 0);
        vm.warp(at);
        vm.expectRevert(TimeLib.BadState.selector);
        time.settle(id, 0);
        assertEq(usdc.balanceOf(worker), _net(96e6));
    }

    function test_an_objection_names_at_least_one_hour() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadUnits.selector);
        time.object(id, 0, 0, bytes32("hours"));
        assertEq(_cycle(id, 0).disputed, 0);
    }

    function test_an_objection_covers_only_hours_not_yet_approved() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        vm.prank(employer);
        time.approve(id, 0, 10 * 60);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadUnits.selector);
        time.object(id, 0, 6 * 60 + 1, bytes32("hours"));
        vm.prank(employer);
        time.object(id, 0, 6 * 60, bytes32("hours"));
        assertEq(_cycle(id, 0).disputed, 6 * 60);
        assertEq(usdc.balanceOf(worker), _net(80e6));
    }

    function test_the_worker_cannot_approve_their_own_hours() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 60);
        vm.prank(worker);
        vm.expectRevert(TimeLib.BadCaller.selector);
        time.approve(id, 0, 60);
        assertEq(usdc.balanceOf(worker), 0);
    }

    function test_a_ruling_needs_objected_hours() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 60);
        vm.prank(arbiter);
        vm.expectRevert(TimeDisputeLib.NotDisputed.selector);
        time.proposeRuling(id, 0, 10_000, bytes32("all"));
        assertEq(time.disputeOf(id, 0).openedAt, 0);
    }

    function test_hours_are_submitted_only_in_their_window_and_within_the_cap() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.prank(worker);
        vm.expectRevert(TimeLib.Early.selector);
        time.submit(id, 0, 60, bytes32(0));
        vm.warp(_start(t, 0) + 1 days);
        vm.prank(worker);
        vm.expectRevert(TimeLib.BadUnits.selector);
        time.submit(id, 0, WEEK_MAX + 1, bytes32(0));
        vm.prank(stranger);
        vm.expectRevert(TimeLib.BadCaller.selector);
        time.submit(id, 0, 60, bytes32(0));
        _submit(id, 0, 120);
        vm.prank(employer);
        time.approve(id, 0, 120);
        vm.prank(worker);
        vm.expectRevert(TimeLib.BadUnits.selector);
        time.submit(id, 0, 60, bytes32(0));
        vm.warp(_end(t, 0) + t.claimGrace + 1);
        vm.prank(worker);
        vm.expectRevert(TimeLib.Late.selector);
        time.submit(id, 0, 180, bytes32(0));
    }

    function test_an_objection_comes_after_the_claim_grace_and_before_the_review_ends() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 3 days);
        _submit(id, 0, 600);
        vm.warp(_end(t, 0) + t.claimGrace - 1);
        vm.prank(employer);
        vm.expectRevert(TimeLib.Early.selector);
        time.object(id, 0, 60, bytes32("hours"));
        assertEq(time.settleAtOf(id, 0), _end(t, 0) + t.claimGrace + t.reviewWindow);
        vm.warp(time.settleAtOf(id, 0));
        vm.prank(employer);
        vm.expectRevert(TimeLib.Late.selector);
        time.object(id, 0, 60, bytes32("hours"));
    }

    function test_no_hours_by_the_end_of_the_grace_returns_the_whole_week() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        uint256 before = usdc.balanceOf(employer);
        vm.warp(_end(t, 0) + t.claimGrace);
        time.settle(id, 0);
        assertEq(usdc.balanceOf(employer), before + WEEK_FUNDED);
    }

    function test_a_retainer_pays_the_cycle_unless_objected() public {
        TimeTerms memory t = _terms();
        t.rate = 300e6;
        t.unitScale = 1;
        t.maxUnits = 1;
        t.cycleSecs = 30 days;
        bytes32 id = _active(t, SALT);
        assertEq(_cycle(id, 0).funded, 300e6 + 1.5e6);
        vm.warp(_end(t, 0));
        _submit(id, 0, 1);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        assertEq(usdc.balanceOf(worker), _net(300e6));
    }

    // ----------------------------- Many weeks -----------------------------

    function test_unused_budget_carries_forward_when_the_terms_say_so() public {
        TimeTerms memory t = _terms();
        t.rollover = true;
        bytes32 id = _active(t, SALT);
        _fund(id);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        uint256 unused = WEEK_FUNDED - 128e6 - 0.64e6;
        assertEq(_engagement(id).carry, unused);
        uint256 before = usdc.balanceOf(employer);
        _fund(id);
        assertEq(before - usdc.balanceOf(employer), WEEK_FUNDED - unused);
        assertEq(_cycle(id, 2).funded, WEEK_FUNDED);
    }

    function test_weeks_can_be_funded_ahead_and_notice_refunds_those_beyond_it() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        _fund(id);
        _fund(id);
        _fund(id);
        assertEq(usdc.balanceOf(address(time)), 4 * WEEK_FUNDED);
        vm.warp(_start(t, 0) + 2 days);
        uint256 before = usdc.balanceOf(employer);
        vm.prank(worker);
        time.giveNotice(id);
        assertEq(_engagement(id).runs, 2);
        assertEq(usdc.balanceOf(employer), before + 2 * WEEK_FUNDED);
        assertEq(uint8(_engagement(id).state), uint8(TimeState.Ending));
        vm.warp(_start(t, 1) + 1 days);
        _submit(id, 1, 60);
    }

    function test_both_sides_end_at_once_and_the_current_week_still_settles() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        _fund(id);
        vm.warp(_start(t, 0) + 2 days);
        vm.prank(employer);
        time.endNow(id);
        assertEq(_engagement(id).runs, 4);
        vm.prank(worker);
        time.endNow(id);
        assertEq(_engagement(id).runs, 1);
        assertEq(usdc.balanceOf(address(time)), WEEK_FUNDED);
        _submit(id, 0, 10 * 60);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        time.close(id);
        assertEq(usdc.balanceOf(worker), _net(80e6));
        assertEq(uint8(_engagement(id).state), uint8(TimeState.Closed));
    }

    function test_an_amendment_changes_only_cycles_not_yet_funded() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        TimeTerms memory n = _terms();
        n.rate = 10e6;
        n.acceptBy = uint64(block.timestamp + 2 days);
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.proposeAmendment(id, n, 0);
        vm.prank(stranger);
        vm.expectRevert(TimeLib.BadCaller.selector);
        time.proposeAmendment(id, n, 2);
        vm.prank(employer);
        time.proposeAmendment(id, n, 2);
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadCaller.selector);
        time.acceptAmendment(id, n, 2);
        TimeTerms memory other = _terms();
        other.rate = 11e6;
        other.acceptBy = n.acceptBy;
        vm.prank(worker);
        vm.expectRevert(TimeLib.HashMismatch.selector);
        time.acceptAmendment(id, other, 2);
        vm.prank(worker);
        time.acceptAmendment(id, n, 2);
        _fund(id);
        assertEq(_cycle(id, 1).funded, WEEK_FUNDED);
        _fund(id);
        assertEq(_cycle(id, 2).funded, 200e6 + 1e6);
        assertEq(_cycle(id, 2).version, 1);
    }

    function test_an_amendment_never_changes_the_worker_or_the_calendar() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        TimeTerms memory n = _terms();
        n.worker = stranger;
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.proposeAmendment(id, n, 1);
        n = _terms();
        n.cycleSecs = 14 days;
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.proposeAmendment(id, n, 1);
        n = _terms();
        n.asset = address(0xBEEF);
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.proposeAmendment(id, n, 1);
        n = _terms();
        n.startsAt = t.startsAt + 1 days;
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.proposeAmendment(id, n, 1);
    }

    function test_the_per_deal_cap_counts_what_the_engagement_holds_at_once() public {
        TimeTerms memory t = _terms();
        t.cycles = 10;
        bytes32 id = _active(t, SALT);
        for (uint16 k; k < 9; ++k) {
            vm.warp(_end(t, k) + t.claimGrace);
            time.settle(id, k);
            _fund(id);
        }
        assertGt(time.accountOf(id).funded, PER_DEAL);
        TimeTerms memory ahead = _terms();
        ahead.cycles = 10;
        bytes32 second = _active(ahead, bytes32("ahead"));
        for (uint256 i; i < 5; ++i) _fund(second);
        vm.prank(employer);
        vm.expectRevert(SettlementLib.OverCap.selector);
        time.fundCycle(second);
    }

    function test_closing_records_one_outcome_for_the_relationship() public {
        TimeTerms memory t = _terms();
        t.cycles = 2;
        bytes32 id = _active(t, SALT);
        _fund(id);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 60);
        vm.warp(_start(t, 1) + 1 days);
        _submit(id, 1, 60);
        vm.warp(time.settleAtOf(id, 1));
        time.settle(id, 0);
        time.settle(id, 1);
        time.close(id);
        assertTrue(record.outcomeRecorded(record.outcomeKey(address(time), id, employerId, 0)));
        assertTrue(record.outcomeRecorded(record.outcomeKey(address(time), id, workerId, 1)));
        assertEq(usdc.balanceOf(address(time)), 0);
    }

    function test_anyone_closes_once_the_next_week_ended_unfunded() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_end(t, 0) + t.claimGrace);
        time.settle(id, 0);
        vm.expectRevert(TimeLib.Early.selector);
        time.close(id);
        vm.warp(_end(t, 1));
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(time), id, employerId, 0, Outcome.CANCELLED, 0, 0);
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(time), id, workerId, 1, Outcome.CANCELLED, 0, 0);
        vm.prank(stranger);
        time.close(id);
        assertEq(uint8(_engagement(id).state), uint8(TimeState.Closed));
    }

    // ------------------------------- Safety -------------------------------

    function test_a_hold_delays_settling_and_a_pause_stops_only_new_weeks() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 60);
        vm.prank(guardian);
        hub.pauseFamily(address(time));
        vm.prank(employer);
        vm.expectRevert(SettlementLib.NotOpen.selector);
        time.fundCycle(id);
        vm.warp(time.settleAtOf(id, 0));
        vm.prank(guardian);
        time.hold(id, bytes32("check"));
        vm.expectRevert(TimeLib.OnHold.selector);
        time.settle(id, 0);
        vm.warp(block.timestamp + 7 days);
        time.settle(id, 0);
        assertEq(usdc.balanceOf(worker), _net(8e6));
    }

    function test_nothing_runs_after_the_longstop() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(uint256(time.accountOf(id).horizon) + time.LONGSTOP());
        uint256[] memory toPayees = new uint256[](1);
        vm.prank(seniorSafe);
        time.longstopSplit(id, WEEK_FUNDED, toPayees);
        vm.expectRevert(TimeLib.BadState.selector);
        time.settle(id, 0);
    }

    // ----------------------- Claims, review and record --------------------

    function test_the_worker_keeps_the_whole_claim_grace() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 15 * 60);
        vm.warp(_end(t, 0) + 1);
        vm.prank(employer);
        vm.expectRevert(TimeLib.Early.selector);
        time.object(id, 0, 1, bytes32("hours"));
        vm.warp(_end(t, 0) + 1 days);
        _submit(id, 0, 20 * 60);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(worker);
        vm.expectRevert(TimeLib.Late.selector);
        time.submit(id, 0, 20 * 60, bytes32(0));
        vm.prank(employer);
        time.object(id, 0, 60, bytes32("hours"));
        assertEq(usdc.balanceOf(worker), _net(152e6));
    }

    function test_the_employer_gets_the_whole_review_after_the_claim_grace() public {
        TimeTerms memory t = _terms();
        t.claimGrace = 0;
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 10 * 60);
        assertEq(time.settleAtOf(id, 0), _end(t, 0) + t.reviewWindow);
        vm.warp(_end(t, 0) + t.reviewWindow - 1);
        vm.prank(employer);
        time.object(id, 0, 60, bytes32("hours"));
        assertEq(usdc.balanceOf(worker), _net(72e6));
    }

    function test_the_record_carries_what_the_worker_was_paid_not_what_was_funded() public {
        TimeTerms memory t = _terms();
        t.rate = 45e6;
        t.cycles = 1;
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 1);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(time), id, employerId, 0, Outcome.COMPLETED, 0, 0);
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(time), id, workerId, 1, Outcome.COMPLETED, 0, 0);
        time.close(id);
    }

    function test_a_ruling_that_pays_nothing_still_records_ruled() public {
        TimeTerms memory t = _terms();
        t.cycles = 1;
        bytes32 id = _active(t, SALT);
        vm.warp(_start(t, 0) + 1 days);
        _submit(id, 0, 60);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(employer);
        time.object(id, 0, 60, bytes32("hours"));
        vm.prank(arbiter);
        time.proposeRuling(id, 0, 0, bytes32("no"));
        vm.warp(block.timestamp + 72 hours);
        time.executeRuling(id, 0);
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(time), id, employerId, 0, Outcome.RULED, 0, 0);
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(time), id, workerId, 1, Outcome.RULED, 0, 0);
        time.close(id);
    }

    function test_an_end_request_lapses_with_its_week() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        _fund(id);
        vm.warp(_start(t, 0) + 1 days);
        vm.prank(worker);
        time.endNow(id);
        vm.warp(_start(t, 1) + 1 days);
        vm.prank(employer);
        time.endNow(id);
        assertEq(_engagement(id).runs, 4);
        assertEq(_engagement(id).endAsked, employer);
    }

    function test_carry_goes_back_at_once_when_nothing_is_left_to_fund() public {
        TimeTerms memory t = _terms();
        t.rollover = true;
        t.cycles = 2;
        bytes32 id = _active(t, SALT);
        _fund(id);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        uint256 before = usdc.balanceOf(employer);
        vm.warp(time.settleAtOf(id, 0));
        time.settle(id, 0);
        assertEq(_engagement(id).carry, 0);
        assertEq(usdc.balanceOf(employer), before + WEEK_FUNDED - 128e6 - 0.64e6);
    }

    function test_an_engagement_takes_at_most_32_amendments() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        TimeTerms memory n = _terms();
        for (uint256 i; i < 32; ++i) {
            n.rate = uint128(RATE + i + 1);
            vm.prank(employer);
            time.proposeAmendment(id, n, 1);
            vm.prank(worker);
            time.acceptAmendment(id, n, 1);
        }
        n.rate = RATE;
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.proposeAmendment(id, n, 1);
    }

    function test_an_amendment_waits_at_most_30_days_for_the_other_side() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        TimeTerms memory n = _terms();
        n.rate = 10e6;
        n.acceptBy = uint64(block.timestamp + 30 days + 1);
        vm.prank(employer);
        vm.expectRevert(TimeLib.BadTerms.selector);
        time.proposeAmendment(id, n, 1);
    }

    function test_an_amendment_accepted_after_its_deadline_is_refused() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        TimeTerms memory n = _terms();
        n.rate = 10e6;
        n.acceptBy = uint64(block.timestamp + 2 days);
        vm.prank(employer);
        time.proposeAmendment(id, n, 2);
        vm.warp(uint256(n.acceptBy) + 1);
        vm.prank(worker);
        vm.expectRevert(TimeLib.Late.selector);
        time.acceptAmendment(id, n, 2);
        assertEq(_engagement(id).version, 0);
    }

    function test_notice_ends_a_pending_amendment() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        TimeTerms memory n = _terms();
        n.rate = 10e6;
        vm.prank(employer);
        time.proposeAmendment(id, n, 2);
        vm.prank(worker);
        time.giveNotice(id);
        vm.prank(worker);
        vm.expectRevert(TimeLib.BadState.selector);
        time.acceptAmendment(id, n, 2);
        assertEq(_engagement(id).version, 0);
    }

    function test_the_latest_amendment_applies_from_its_own_cycle() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        TimeTerms memory a = _terms();
        a.rate = 10e6;
        vm.prank(employer);
        time.proposeAmendment(id, a, 2);
        vm.prank(worker);
        time.acceptAmendment(id, a, 2);
        TimeTerms memory b = _terms();
        b.rate = 12e6;
        vm.prank(worker);
        time.proposeAmendment(id, b, 3);
        vm.prank(employer);
        time.acceptAmendment(id, b, 3);
        _fund(id);
        _fund(id);
        _fund(id);
        assertEq(_cycle(id, 1).version, 0);
        assertEq(_cycle(id, 2).version, 1);
        assertEq(_cycle(id, 3).version, 2);
        assertEq(_cycle(id, 3).funded, 240e6 + 1.2e6);
    }

    function test_an_amendment_past_the_high_value_line_brings_the_senior_reviewer() public {
        TimeTerms memory t = _terms();
        bytes32 id = _active(t, SALT);
        TimeTerms memory n = _terms();
        n.cycles = 40;
        vm.prank(employer);
        time.proposeAmendment(id, n, 1);
        vm.prank(worker);
        time.acceptAmendment(id, n, 1);
        vm.warp(_start(t, 0) + 6 days);
        _submit(id, 0, 16 * 60);
        vm.warp(_end(t, 0) + t.claimGrace);
        vm.prank(employer);
        time.object(id, 0, 4 * 60, bytes32("hours"));
        vm.prank(arbiter);
        time.escalate(id, 0);
        vm.prank(reviewSafe);
        vm.expectRevert();
        time.rule(id, 0, 5_000, bytes32("half"));
        vm.prank(seniorSafe);
        time.rule(id, 0, 5_000, bytes32("half"));
        assertEq(usdc.balanceOf(worker), _net(112e6));
    }
}
