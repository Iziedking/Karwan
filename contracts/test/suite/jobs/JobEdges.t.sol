// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {JobFixture} from "./JobFixture.sol";
import {JobTerms, JobStatus, BountyTerms} from "../../../src/suite/jobs/JobTypes.sol";
import {BountyLib} from "../../../src/suite/jobs/BountyLib.sol";
import {JobLib} from "../../../src/suite/jobs/JobLib.sol";
import {DisputeLib} from "../../../src/suite/dispute/DisputeLib.sol";
import {JobDisputeLib} from "../../../src/suite/jobs/JobDisputeLib.sol";
import {IAgenticCommerce} from "../../../src/suite/interfaces/IAgenticCommerce.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {Outcome} from "../../../src/suite/interfaces/IKarwanSuite.sol";

/// @notice The job escrow at its edges: the default and shortest review, the
///         expiry bounds, a job with no provider, budgets near the top of their
///         type, which states take each step, the rejection clock, holds, and
///         payouts of nothing.
contract JobEdgesTest is JobFixture {
    uint256 internal constant NOW = 1_800_000_000;

    function setUp() public {
        _deployJobs();
    }

    function _terms(uint32 review) internal pure returns (JobTerms memory t) {
        t.reviewWindow = review;
        t.partialBps = 5_000;
        t.fallbackBps = 5_000;
    }

    function _noProvider() internal returns (uint256 id) {
        vm.prank(client);
        id = jobs.createJob(address(0), evaluator, block.timestamp + 10 days, "write the report", address(0));
    }

    function _rejected() internal returns (uint256 id) {
        id = _submitted();
        vm.prank(evaluator);
        jobs.reject(id, bytes32("off brief"), "");
    }

    function _count(Vm.Log[] memory logs, bytes32 sig) internal view returns (uint256 n) {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(jobs) && logs[i].topics[0] == sig) ++n;
        }
    }

    // -------------------------------- Terms -------------------------------

    function test_a_plain_job_gets_the_default_five_day_review() public {
        assertEq(_core(_job()).reviewWindow, 5 days);
    }

    function test_the_shortest_review_is_one_hour() public {
        vm.startPrank(client);
        jobs.createJobWithTerms(provider, evaluator, block.timestamp + 10 days, "r", _terms(1 hours));
        vm.expectRevert(JobLib.BadTerms.selector);
        jobs.createJobWithTerms(provider, evaluator, block.timestamp + 10 days, "r", _terms(1 hours - 1));
        vm.stopPrank();
    }

    function test_an_expiry_may_be_a_year_away_and_no_more() public {
        vm.warp(NOW);
        vm.startPrank(client);
        jobs.createJob(provider, evaluator, NOW + 365 days, "r", address(0));
        vm.expectRevert(JobLib.BadTerms.selector);
        jobs.createJob(provider, evaluator, NOW + 365 days + 1, "r", address(0));
        vm.stopPrank();
    }

    function test_a_partial_share_above_the_whole_is_refused() public {
        JobTerms memory t = _terms(5 days);
        t.partialBps = 10_001;
        vm.prank(client);
        vm.expectRevert(JobLib.BadTerms.selector);
        jobs.createJobWithTerms(provider, evaluator, block.timestamp + 10 days, "r", t);
    }

    /// Expiry, submission and rejection keep their times past 2106.
    function test_a_jobs_times_survive_2106() public {
        vm.warp((uint256(1) << 32) + 1_000);
        uint256 id = _rejected();
        assertEq(_core(id).expiredAt, vm.getBlockTimestamp() + 10 days);
        assertEq(_core(id).submittedAt, vm.getBlockTimestamp());
        assertEq(_core(id).rejectedAt, vm.getBlockTimestamp());
    }

    // ------------------------------- Opening ------------------------------

    function test_a_job_turned_down_while_open_takes_no_provider_budget_or_funding() public {
        uint256 id = _noProvider();
        vm.startPrank(client);
        jobs.reject(id, bytes32("changed my mind"), "");
        vm.expectRevert(JobLib.BadState.selector);
        jobs.setProvider(id, provider, "");
        vm.expectRevert(JobLib.BadState.selector);
        jobs.setBudget(id, BUDGET, "");
        vm.expectRevert(JobLib.BadState.selector);
        jobs.fund(id, 0, "");
        vm.stopPrank();
    }

    function test_the_provider_is_neither_the_client_nor_the_evaluator() public {
        uint256 id = _noProvider();
        vm.startPrank(client);
        vm.expectRevert(JobLib.BadParties.selector);
        jobs.setProvider(id, evaluator, "");
        vm.expectRevert(JobLib.BadParties.selector);
        jobs.setProvider(id, client, "");
        vm.stopPrank();
    }

    function test_budgets_near_the_top_of_their_type_are_kept_whole() public {
        uint256 id = _job();
        vm.startPrank(provider);
        jobs.setBudget(id, type(uint128).max, "");
        assertEq(_core(id).budget, type(uint128).max);
        jobs.setBudget(id, (uint256(1) << 64) + 1, "");
        vm.stopPrank();
        assertEq(_core(id).budget, (uint256(1) << 64) + 1);
    }

    function test_a_job_with_no_budget_cannot_be_funded() public {
        uint256 id = _job();
        vm.prank(client);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.fund(id, 0, "");
    }

    /// The provider lowered the budget after the client agreed a higher one:
    /// the client's funding is refused rather than silently taking the new one.
    function test_funding_refuses_any_budget_but_the_one_expected() public {
        uint256 id = _job();
        vm.startPrank(provider);
        jobs.setBudget(id, BUDGET, "");
        jobs.setBudget(id, BUDGET - 50e6, "");
        vm.stopPrank();
        vm.prank(client);
        vm.expectRevert(JobLib.BudgetChanged.selector);
        jobs.fund(id, BUDGET, "");
    }

    function test_funding_after_the_expiry_is_late() public {
        uint256 id = _job();
        vm.prank(provider);
        jobs.setBudget(id, BUDGET, "");
        vm.warp(_core(id).expiredAt + 1 days);
        vm.prank(client);
        vm.expectRevert(JobLib.Late.selector);
        jobs.fund(id, BUDGET, "");
    }

    function test_funding_sets_a_horizon_covering_review_rejection_dispute_and_holds() public {
        uint256 id = _fundedJob();
        assertEq(
            jobs.accountOf(bytes32(id)).horizon,
            uint256(_core(id).expiredAt) + 5 days + 3 days + DisputeLib.LONGEST + 30 days
        );
    }

    // -------------------------------- Work --------------------------------

    function test_work_is_submitted_once_and_only_on_a_funded_job() public {
        uint256 id = _job();
        vm.prank(provider);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.submit(id, keccak256("report"), "");
        id = _submitted();
        vm.prank(provider);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.submit(id, keccak256("again"), "");
        assertEq(_core(id).deliverable, keccak256("report"));
    }

    /// A settled job takes no further step.
    function test_a_completed_job_takes_no_release_rejection_dispute_confirmation_or_refund() public {
        uint256 id = _submitted();
        vm.prank(evaluator);
        jobs.complete(id, bytes32("good"), "");
        vm.expectRevert(JobLib.BadState.selector);
        jobs.release(id);
        vm.prank(evaluator);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.reject(id, bytes32("late"), "");
        vm.prank(provider);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.expectRevert(JobLib.BadState.selector);
        jobs.confirmRejection(id);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.claimRefund(id);
    }

    // ------------------------------ Rejection -----------------------------

    function test_work_is_rejected_once_and_only_within_its_review() public {
        uint256 id = _rejected();
        vm.prank(evaluator);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.reject(id, bytes32("again"), "");
        uint256 other = _submitted();
        vm.warp(_core(other).submittedAt + 5 days + 1 days);
        vm.prank(evaluator);
        vm.expectRevert(JobLib.Late.selector);
        jobs.reject(other, bytes32("late"), "");
    }

    function test_a_rejection_announces_when_its_dispute_window_ends() public {
        vm.warp(NOW);
        uint256 id = _submitted();
        vm.expectEmit(address(jobs));
        emit JobLib.RejectionPending(id, bytes32("off brief"), uint64(NOW + 3 days));
        vm.prank(evaluator);
        jobs.reject(id, bytes32("off brief"), "");
    }

    function test_a_rejection_is_disputed_once_and_only_within_its_window() public {
        vm.warp(NOW);
        uint256 id = _rejected();
        vm.startPrank(provider);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.expectRevert(JobLib.BadState.selector);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.stopPrank();
        uint256 other = _rejected();
        vm.warp(NOW + 3 days + 1 days);
        vm.prank(provider);
        vm.expectRevert(JobLib.Late.selector);
        jobs.disputeRejection(other, bytes32("clause"));
    }

    function test_a_rejection_is_confirmed_only_when_made_undisputed_and_unheld() public {
        uint256 id = _submitted();
        vm.warp(vm.getBlockTimestamp() + 4 days);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.confirmRejection(id);
        uint256 disputed = _rejected();
        vm.prank(provider);
        jobs.disputeRejection(disputed, bytes32("clause"));
        vm.warp(vm.getBlockTimestamp() + 4 days);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.confirmRejection(disputed);
        uint256 held = _rejected();
        vm.warp(vm.getBlockTimestamp() + 3 days);
        vm.prank(guardian);
        jobs.hold(bytes32(held), bytes32("scan"));
        vm.expectRevert(JobLib.OnHold.selector);
        jobs.confirmRejection(held);
    }

    // -------------------------------- Holds -------------------------------

    /// A funded job is not funded again.
    function test_a_funded_job_is_not_funded_again() public {
        uint256 id = _fundedJob();
        vm.prank(client);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.fund(id, BUDGET, "");
    }

    /// A job never funded has nothing to refund, before or after its expiry.
    function test_an_unfunded_job_takes_no_refund() public {
        uint256 id = _job();
        vm.expectRevert(JobLib.BadState.selector);
        jobs.claimRefund(id);
        vm.warp(vm.getBlockTimestamp() + 11 days);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.claimRefund(id);
    }

    function test_a_refund_waits_out_a_hold() public {
        uint256 id = _fundedJob();
        vm.warp(_core(id).expiredAt);
        vm.prank(guardian);
        jobs.hold(bytes32(id), bytes32("scan"));
        vm.expectRevert(JobLib.OnHold.selector);
        jobs.claimRefund(id);
    }

    function test_a_release_goes_through_from_the_second_a_hold_ends() public {
        uint256 id = _submitted();
        vm.prank(guardian);
        jobs.hold(bytes32(id), bytes32("scan"));
        vm.warp(jobs.accountOf(bytes32(id)).holdUntil);
        jobs.release(id);
        assertEq(uint8(_core(id).status), uint8(JobStatus.Completed));
    }

    // ------------------------------- Payouts ------------------------------

    /// Completed work refunds nothing and a confirmed rejection pays nothing,
    /// and neither announces a payout of nothing.
    function test_payouts_of_nothing_are_not_announced() public {
        uint256 id = _submitted();
        vm.recordLogs();
        vm.prank(evaluator);
        jobs.complete(id, bytes32("good"), "");
        assertEq(_count(vm.getRecordedLogs(), IAgenticCommerce.Refunded.selector), 0);
        uint256 other = _rejected();
        vm.warp(vm.getBlockTimestamp() + 3 days);
        vm.recordLogs();
        jobs.confirmRejection(other);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(_count(logs, IAgenticCommerce.PaymentReleased.selector), 0);
        assertEq(_count(logs, IAgenticCommerce.Refunded.selector), 1);
    }

    function test_without_a_high_value_line_the_ordinary_reviewer_rules_a_job() public {
        hub.setAsset(address(usdc), true, 0);
        uint256 id = _rejected();
        vm.prank(provider);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.prank(arbiter);
        jobs.escalate(id);
        vm.prank(reviewSafe);
        jobs.rule(id, 5_000, bytes32("half"));
        assertEq(usdc.balanceOf(provider), _net(BUDGET / 2));
    }

    /// A ruling on a budget whose share passes 128 bits before dividing is
    /// still priced whole.
    function test_a_ruling_on_a_huge_budget_is_priced_whole() public {
        hub.setAsset(address(usdc), true, 0);
        hub.setCaps(address(jobs), address(usdc), type(uint128).max, type(uint128).max);
        uint256 budget = uint256(1) << 125;
        usdc.mint(client, budget * 2);
        uint256 id = _job();
        vm.prank(provider);
        jobs.setBudget(id, budget, "");
        vm.prank(client);
        jobs.fund(id, budget, "");
        vm.prank(provider);
        jobs.submit(id, keccak256("report"), "");
        vm.prank(evaluator);
        jobs.reject(id, bytes32("off brief"), "");
        vm.prank(provider);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.prank(arbiter);
        jobs.escalate(id);
        vm.prank(reviewSafe);
        jobs.rule(id, 5_000, bytes32("half"));
        assertEq(usdc.balanceOf(provider), _net(budget / 2));
    }

    // ------------------------------- Bounties -----------------------------

    function _openContest(BountyTerms memory t) internal returns (uint256 id) {
        vm.prank(client);
        id = jobs.openBounty(t);
    }

    function _refusedContest(BountyTerms memory t) internal {
        vm.prank(client);
        vm.expectRevert(JobLib.BadTerms.selector);
        jobs.openBounty(t);
    }

    function _three() internal returns (address a, address b, address c) {
        (a,,) = _person("first");
        (b,,) = _person("second");
        (c,,) = _person("third");
    }

    function test_a_contest_needs_a_prize_and_shares_that_make_the_whole() public {
        BountyTerms memory t = _contestTerms();
        t.prize = 0;
        _refusedContest(t);
        t = _contestTerms();
        t.shares[0] = 6_000;
        t.shares[1] = 6_000;
        t.shares[2] = 1_000;
        _refusedContest(t);
    }

    /// Entries close between an hour and a year away, and awards within 60
    /// days after, on a realistic clock.
    function test_a_contests_deadlines_take_their_bounds() public {
        vm.warp(NOW);
        BountyTerms memory t = _contestTerms();
        t.entriesBy = uint64(NOW + 1 hours);
        t.awardBy = uint64(NOW + 2 hours);
        uint256 id = _openContest(t);
        assertEq(jobs.accountOf(bytes32(id)).horizon, NOW + 2 hours + 30 days);
        t.entriesBy = uint64(NOW + 1 hours - 1);
        _refusedContest(t);
        t = _contestTerms();
        t.entriesBy = uint64(NOW + 365 days);
        t.awardBy = uint64(NOW + 366 days);
        _openContest(t);
        t.entriesBy = uint64(NOW + 365 days + 1);
        t.awardBy = uint64(NOW + 366 days + 1);
        _refusedContest(t);
        t = _contestTerms();
        t.awardBy = t.entriesBy;
        _refusedContest(t);
        t.awardBy = t.entriesBy + 60 days;
        _openContest(t);
        t.awardBy = t.entriesBy + 60 days + 1;
        _refusedContest(t);
    }

    /// A client with no identity still lets anyone in, and an entrant whose
    /// identity is older than the client's enters too.
    function test_entrants_are_judged_by_identity_only_against_the_client() public {
        address anon = makeAddr("anon");
        usdc.mint(anon, 1_000e6);
        vm.prank(anon);
        usdc.approve(address(jobs), type(uint256).max);
        BountyTerms memory t = _contestTerms();
        vm.prank(anon);
        uint256 id = jobs.openBounty(t);
        vm.prank(makeAddr("walker"));
        jobs.enter(id, keccak256("entry"));
        (address late,,) = _person("late client");
        usdc.mint(late, 1_000e6);
        vm.startPrank(late);
        usdc.approve(address(jobs), type(uint256).max);
        uint256 other = jobs.openBounty(t);
        vm.stopPrank();
        vm.prank(provider);
        jobs.enter(other, keccak256("entry"));
        assertEq(jobs.jobOf(other).entries, 1);
    }

    function test_entries_and_awards_after_their_deadlines_are_late() public {
        uint256 id = _contest();
        (address a,,) = _three();
        vm.warp(jobs.jobOf(id).expiredAt + 1 days);
        vm.prank(a);
        vm.expectRevert(JobLib.Late.selector);
        jobs.enter(id, keccak256("late"));
        uint256 other = _contest();
        _enter(other, a);
        vm.warp(jobs.jobOf(other).awardBy + 1 days);
        address[] memory w = new address[](1);
        w[0] = a;
        vm.prank(evaluator);
        vm.expectRevert(JobLib.Late.selector);
        jobs.award(other, w);
    }

    function test_an_award_names_at_least_one_winner_and_no_more_than_the_places() public {
        uint256 id = _contest();
        (address a, address b, address c) = _three();
        (address d,,) = _person("fourth");
        _enter(id, a);
        _enter(id, b);
        _enter(id, c);
        _enter(id, d);
        vm.warp(jobs.jobOf(id).expiredAt);
        vm.startPrank(evaluator);
        vm.expectRevert(BountyLib.BadWinners.selector);
        jobs.award(id, new address[](0));
        address[] memory four = new address[](4);
        four[0] = a;
        four[1] = b;
        four[2] = c;
        four[3] = d;
        vm.expectRevert(BountyLib.BadWinners.selector);
        jobs.award(id, four);
        vm.stopPrank();
    }

    function test_an_early_award_fills_every_place() public {
        uint256 id = _contest();
        (address a, address b,) = _three();
        _enter(id, a);
        _enter(id, b);
        address[] memory two = new address[](2);
        two[0] = a;
        two[1] = b;
        vm.prank(evaluator);
        vm.expectRevert(BountyLib.BadWinners.selector);
        jobs.award(id, two);
    }

    /// Every winner is announced with their own net share; a full award
    /// refunds nothing, a short one refunds exactly the empty places.
    function test_each_winner_is_announced_and_only_empty_places_go_back() public {
        uint256 id = _contest();
        (address a, address b, address c) = _three();
        _enter(id, a);
        _enter(id, b);
        _enter(id, c);
        address[] memory w = new address[](3);
        w[0] = a;
        w[1] = b;
        w[2] = c;
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.PaymentReleased(id, a, _net(180e6));
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.PaymentReleased(id, b, _net(90e6));
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.PaymentReleased(id, c, _net(30e6));
        vm.recordLogs();
        vm.prank(evaluator);
        jobs.award(id, w);
        assertEq(_count(vm.getRecordedLogs(), IAgenticCommerce.Refunded.selector), 0);
        uint256 other = _contest();
        _enter(other, a);
        vm.warp(jobs.jobOf(other).expiredAt);
        address[] memory one = new address[](1);
        one[0] = a;
        uint256 back = jobs.accountOf(bytes32(other)).balance - _net(180e6) - (uint256(180e6) * FEE_BPS) / 10_000;
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.Refunded(other, client, back);
        vm.prank(evaluator);
        jobs.award(other, one);
    }

    function test_only_the_client_cancels_a_contest_and_it_ends_rejected() public {
        uint256 id = _contest();
        vm.prank(stranger);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.reject(id, bytes32("mine"), "");
        vm.prank(client);
        jobs.reject(id, bytes32("changed my mind"), "");
        assertEq(uint8(jobs.jobOf(id).status), uint8(JobStatus.Rejected));
    }

    function test_an_unawarded_contest_waits_out_a_hold_before_going_back() public {
        uint256 id = _contest();
        vm.warp(jobs.jobOf(id).awardBy);
        vm.prank(guardian);
        jobs.hold(bytes32(id), bytes32("scan"));
        vm.expectRevert(JobLib.OnHold.selector);
        jobs.claimRefund(id);
    }

    /// Only a running contest takes entries: never an ordinary job, never one
    /// already awarded.
    function test_only_a_running_contest_takes_entries() public {
        uint256 job = _fundedJob();
        (address a, address b, address c) = _three();
        vm.prank(a);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.enter(job, keccak256("entry"));
        uint256 id = _contest();
        _enter(id, a);
        _enter(id, b);
        _enter(id, c);
        address[] memory w = new address[](3);
        w[0] = a;
        w[1] = b;
        w[2] = c;
        vm.prank(evaluator);
        jobs.award(id, w);
        (address d,,) = _person("fourth");
        vm.prank(d);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.enter(id, keccak256("late entry"));
    }

    /// A contest opened after 2106 keeps its whole horizon.
    function test_a_contest_opened_after_2106_keeps_its_horizon() public {
        vm.warp((uint256(1) << 32) + 1_000);
        uint256 now_ = vm.getBlockTimestamp();
        BountyTerms memory t = _contestTerms();
        t.entriesBy = uint64(now_ + 7 days);
        t.awardBy = uint64(now_ + 10 days);
        uint256 id = _openContest(t);
        assertEq(jobs.accountOf(bytes32(id)).horizon, now_ + 10 days + 30 days);
    }

    /// A prize whose shares pass 128 bits before dividing is split whole.
    function test_a_huge_prize_is_split_whole() public {
        hub.setAsset(address(usdc), true, 0);
        hub.setCaps(address(jobs), address(usdc), type(uint128).max, type(uint128).max);
        usdc.mint(client, uint256(1) << 127);
        BountyTerms memory t = _contestTerms();
        t.prize = uint128(1) << 125;
        uint256 id = _openContest(t);
        (address a, address b, address c) = _three();
        _enter(id, a);
        _enter(id, b);
        _enter(id, c);
        address[] memory w = new address[](3);
        w[0] = a;
        w[1] = b;
        w[2] = c;
        vm.prank(evaluator);
        jobs.award(id, w);
        assertEq(usdc.balanceOf(a), _net((uint256(t.prize) * 6_000) / 10_000));
    }

    // ------------------------------ Disputes ------------------------------

    function test_dispute_steps_need_a_disputed_rejection() public {
        uint256 id = _rejected();
        vm.prank(arbiter);
        vm.expectRevert(JobDisputeLib.NotDisputed.selector);
        jobs.proposeRuling(id, 10_000, bytes32("all"));
        vm.prank(arbiter);
        vm.expectRevert(JobDisputeLib.NotDisputed.selector);
        jobs.escalate(id);
        vm.expectRevert(JobDisputeLib.NotDisputed.selector);
        jobs.executeRuling(id);
        vm.prank(reviewSafe);
        vm.expectRevert(JobDisputeLib.NotDisputed.selector);
        jobs.rule(id, 5_000, bytes32("half"));
        vm.expectRevert(JobDisputeLib.NotDisputed.selector);
        jobs.applyFallback(id);
    }

    /// The client, calling through a relayer, appeals the arbiter's proposal.
    function test_the_client_appeals_a_proposal_in_time() public {
        uint256 id = _rejected();
        vm.prank(provider);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.prank(arbiter);
        jobs.proposeRuling(id, 10_000, bytes32("all"));
        vm.prank(client, stranger);
        jobs.escalate(id);
        assertTrue(jobs.disputeOf(id).escalated);
    }

    function test_a_proposal_and_the_fallback_wait_out_a_hold() public {
        uint256 id = _rejected();
        vm.prank(provider);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.prank(arbiter);
        jobs.proposeRuling(id, 10_000, bytes32("all"));
        vm.warp(vm.getBlockTimestamp() + 72 hours);
        vm.prank(guardian);
        jobs.hold(bytes32(id), bytes32("scan"));
        vm.expectRevert(JobLib.OnHold.selector);
        jobs.executeRuling(id);
        uint256 other = _rejected();
        vm.prank(provider);
        jobs.disputeRejection(other, bytes32("clause"));
        vm.prank(arbiter);
        jobs.escalate(other);
        vm.warp(vm.getBlockTimestamp() + 5 days);
        vm.prank(guardian);
        jobs.hold(bytes32(other), bytes32("scan"));
        vm.expectRevert(JobLib.OnHold.selector);
        jobs.applyFallback(other);
    }

    /// A funded job nobody submitted is never paid by silence, however long
    /// it waits.
    function test_an_unsubmitted_job_is_never_released_by_silence() public {
        uint256 id = _fundedJob();
        vm.warp(vm.getBlockTimestamp() + 9 days);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.release(id);
    }

    /// A rejection after 2106 announces its whole dispute deadline.
    function test_a_rejection_after_2106_announces_its_whole_dispute_deadline() public {
        vm.warp((uint256(1) << 32) + 1_000);
        uint256 id = _submitted();
        uint256 now_ = vm.getBlockTimestamp();
        vm.expectEmit(address(jobs));
        emit JobLib.RejectionPending(id, bytes32("not done"), uint64(now_ + 3 days));
        vm.prank(evaluator);
        jobs.reject(id, bytes32("not done"), "");
    }

    /// Prizes whose shares are whole multiples of 2^64 are recorded in the top
    /// band, from their whole value.
    function test_prizes_beyond_64_bits_are_recorded_in_the_top_band() public {
        hub.setAsset(address(usdc), true, 0);
        hub.setCaps(address(jobs), address(usdc), type(uint128).max, type(uint128).max);
        usdc.mint(client, uint256(1) << 127);
        BountyTerms memory t = _contestTerms();
        t.prize = uint128(5) << 66;
        uint256 id = _openContest(t);
        (address a,, uint64 aId) = _person("first");
        (address b,,) = _person("second");
        (address c,,) = _person("third");
        _enter(id, a);
        _enter(id, b);
        _enter(id, c);
        address[] memory w = new address[](3);
        w[0] = a;
        w[1] = b;
        w[2] = c;
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(jobs), bytes32(id), aId, 1, Outcome.COMPLETED, 3, 6_000);
        vm.prank(evaluator);
        jobs.award(id, w);
    }
}
