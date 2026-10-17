// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {JobFixture} from "./JobFixture.sol";
import {KarwanJobEscrow} from "../../../src/suite/KarwanJobEscrow.sol";
import {Job, JobStatus, JobTerms} from "../../../src/suite/jobs/JobTypes.sol";
import {JobLib} from "../../../src/suite/jobs/JobLib.sol";
import {IAgenticCommerce} from "../../../src/suite/interfaces/IAgenticCommerce.sol";
import {SettlementLib} from "../../../src/suite/settlement/SettlementLib.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {Outcome} from "../../../src/suite/interfaces/IKarwanSuite.sol";

/// @notice An ERC-8183 job, and every way it can end: completed, paid by the
///         evaluator's silence, rejected and disputed, refunded at expiry.
contract JobEscrowTest is JobFixture {
    function setUp() public {
        _deployJobs();
    }

    // ------------------------------ The flow ------------------------------

    function test_a_job_follows_the_erc_8183_flow_through_the_standard_interface() public {
        IAgenticCommerce acp = IAgenticCommerce(address(jobs));
        vm.prank(client);
        uint256 id = acp.createJob(provider, evaluator, block.timestamp + 10 days, "write the report", address(0));
        assertEq(uint8(acp.getJob(id).status), uint8(JobStatus.Open));
        vm.prank(provider);
        acp.setBudget(id, BUDGET, "");
        vm.prank(client);
        acp.fund(id, BUDGET, "");
        assertEq(usdc.balanceOf(address(jobs)), FUNDED);
        vm.prank(provider);
        acp.submit(id, keccak256("report"), "");
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.JobCompleted(id, evaluator, bytes32("good"));
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.PaymentReleased(id, provider, _net(BUDGET));
        vm.prank(evaluator);
        acp.complete(id, bytes32("good"), "");
        Job memory job = acp.getJob(id);
        assertEq(uint8(job.status), uint8(JobStatus.Completed));
        assertEq(job.budget, BUDGET);
        assertEq(usdc.balanceOf(provider), _net(BUDGET));
        assertEq(usdc.balanceOf(feeSafe), 2e6);
        assertEq(usdc.balanceOf(address(jobs)), 0);
        assertTrue(record.outcomeRecorded(record.outcomeKey(address(jobs), bytes32(id), clientId, 0)));
        assertTrue(record.outcomeRecorded(record.outcomeKey(address(jobs), bytes32(id), providerId, 1)));
    }

    function test_the_client_funds_only_the_budget_it_expects() public {
        uint256 id = _job();
        vm.prank(provider);
        jobs.setBudget(id, BUDGET, "");
        vm.prank(provider);
        jobs.setBudget(id, BUDGET + 1, "");
        vm.prank(client);
        vm.expectRevert(JobLib.BudgetChanged.selector);
        jobs.fund(id, BUDGET, "");
        vm.prank(stranger);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.setBudget(id, 1, "");
    }

    function test_hooks_are_not_taken() public {
        vm.prank(client);
        vm.expectRevert(JobLib.HooksOff.selector);
        jobs.createJob(provider, evaluator, block.timestamp + 10 days, "x", makeAddr("hook"));
    }

    function test_parties_and_expiry_are_checked() public {
        vm.startPrank(client);
        vm.expectRevert(JobLib.BadParties.selector);
        jobs.createJob(provider, address(0), block.timestamp + 10 days, "x", address(0));
        vm.expectRevert(JobLib.BadParties.selector);
        jobs.createJob(client, evaluator, block.timestamp + 10 days, "x", address(0));
        vm.expectRevert(JobLib.BadParties.selector);
        jobs.createJob(provider, provider, block.timestamp + 10 days, "x", address(0));
        vm.expectRevert(JobLib.BadTerms.selector);
        jobs.createJob(provider, evaluator, block.timestamp + 30 minutes, "x", address(0));
        vm.expectRevert(JobLib.BadTerms.selector);
        jobs.createJob(provider, evaluator, block.timestamp + 366 days, "x", address(0));
        vm.expectRevert(JobLib.BadTerms.selector);
        jobs.createJobWithTerms(provider, evaluator, block.timestamp + 10 days, "x", JobTerms(15 days, 0, 0));
        vm.stopPrank();
    }

    function test_an_escrow_needs_an_asset() public {
        vm.expectRevert(KarwanJobEscrow.NoAsset.selector);
        new KarwanJobEscrow(address(hub), address(0));
    }

    function test_a_description_over_2048_bytes_is_refused() public {
        vm.prank(client);
        vm.expectRevert(JobLib.BadTerms.selector);
        jobs.createJob(provider, evaluator, block.timestamp + 10 days, string(new bytes(2_049)), address(0));
        vm.prank(client);
        uint256 id =
            jobs.createJob(provider, evaluator, block.timestamp + 10 days, string(new bytes(2_048)), address(0));
        assertEq(bytes(_core(id).description).length, 2_048);
    }

    function test_dispute_shares_stay_within_the_budget() public {
        vm.startPrank(client);
        vm.expectRevert(JobLib.BadTerms.selector);
        jobs.createJobWithTerms(provider, evaluator, block.timestamp + 10 days, "x", JobTerms(5 days, 10_000, 0));
        vm.expectRevert(JobLib.BadTerms.selector);
        jobs.createJobWithTerms(provider, evaluator, block.timestamp + 10 days, "x", JobTerms(5 days, 0, 10_001));
        uint256 id =
            jobs.createJobWithTerms(provider, evaluator, block.timestamp + 10 days, "x", JobTerms(5 days, 9_999, 10_000));
        vm.stopPrank();
        assertEq(_core(id).partialBps, 9_999);
        assertEq(_core(id).fallbackBps, 10_000);
    }

    function test_the_provider_can_be_named_later() public {
        vm.prank(client);
        uint256 id = jobs.createJob(address(0), evaluator, block.timestamp + 10 days, "open call", address(0));
        vm.prank(client);
        jobs.setBudget(id, BUDGET, "");
        vm.prank(client);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.fund(id, BUDGET, "");
        vm.prank(stranger);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.setProvider(id, provider, "");
        vm.prank(client);
        vm.expectRevert(JobLib.BadParties.selector);
        jobs.setProvider(id, evaluator, "");
        vm.prank(client);
        jobs.setProvider(id, provider, "");
        vm.prank(client);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.setProvider(id, stranger, "");
        vm.prank(client);
        jobs.fund(id, BUDGET, "");
        assertEq(jobs.payeesOf(bytes32(id))[0], provider);
    }

    function test_a_funded_budget_cannot_change() public {
        uint256 id = _fundedJob();
        vm.prank(provider);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.setBudget(id, BUDGET * 2, "");
        assertEq(jobs.getJob(id).budget, BUDGET);
    }

    function test_a_budget_past_the_ledger_limit_is_refused() public {
        uint256 id = _job();
        vm.prank(provider);
        vm.expectRevert(JobLib.BadTerms.selector);
        jobs.setBudget(id, uint256(type(uint128).max) + 1, "");
        assertEq(jobs.getJob(id).budget, 0);
    }

    function test_only_the_client_funds_a_job() public {
        uint256 id = _job();
        vm.prank(provider);
        jobs.setBudget(id, BUDGET, "");
        vm.prank(stranger);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.fund(id, BUDGET, "");
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Open));
    }

    function test_a_job_cannot_be_funded_once_it_expired() public {
        uint256 t0 = vm.getBlockTimestamp();
        uint256 id = _job();
        vm.prank(provider);
        jobs.setBudget(id, BUDGET, "");
        vm.warp(t0 + 10 days);
        vm.prank(client);
        vm.expectRevert(JobLib.Late.selector);
        jobs.fund(id, BUDGET, "");
        assertEq(usdc.balanceOf(address(jobs)), 0);
    }

    // ------------------------------ Silence -------------------------------

    function test_silence_pays_once_the_review_window_ends() public {
        uint256 id = _submitted();
        vm.expectRevert(JobLib.Early.selector);
        jobs.release(id);
        vm.warp(block.timestamp + 5 days);
        vm.prank(stranger);
        jobs.release(id);
        assertEq(usdc.balanceOf(provider), _net(BUDGET));
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Completed));
        assertEq(usdc.balanceOf(stranger), 0);
    }

    function test_submitted_work_never_expires_into_a_refund() public {
        uint256 id = _job();
        vm.prank(provider);
        jobs.setBudget(id, BUDGET, "");
        vm.prank(client);
        jobs.fund(id, BUDGET, "");
        uint256 t0 = vm.getBlockTimestamp();
        vm.warp(t0 + 10 days - 1);
        vm.prank(provider);
        jobs.submit(id, keccak256("late but in time"), "");
        vm.warp(t0 + 11 days);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.claimRefund(id);
        vm.warp(t0 + 15 days - 1);
        jobs.release(id);
        assertEq(usdc.balanceOf(provider), _net(BUDGET));
    }

    // ----------------------------- Rejection ------------------------------

    function test_a_rejection_of_submitted_work_waits_for_the_provider() public {
        uint256 id = _submitted();
        uint256 t0 = vm.getBlockTimestamp();
        uint256 before = usdc.balanceOf(client);
        vm.prank(evaluator);
        jobs.reject(id, bytes32("off brief"), "");
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Submitted));
        vm.expectRevert(JobLib.Early.selector);
        jobs.confirmRejection(id);
        vm.warp(t0 + 5 days);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.release(id);
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(jobs), bytes32(id), clientId, 0, Outcome.FAILED, 0, 0);
        vm.prank(stranger);
        jobs.confirmRejection(id);
        assertEq(usdc.balanceOf(client), before + FUNDED);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Rejected));
    }

    function test_the_evaluator_rejects_only_within_the_review_window() public {
        uint256 id = _submitted();
        vm.warp(block.timestamp + 5 days);
        vm.prank(evaluator);
        vm.expectRevert(JobLib.Late.selector);
        jobs.reject(id, bytes32("too late"), "");
        vm.prank(client);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.reject(id, bytes32("not mine to judge"), "");
    }

    function test_only_the_evaluator_completes_submitted_work() public {
        uint256 id = _submitted();
        vm.prank(client);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.complete(id, bytes32("good"), "");
        assertEq(usdc.balanceOf(provider), 0);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Submitted));
    }

    function test_a_disputed_rejection_can_pay_part_of_the_budget() public {
        uint256 id = _submitted();
        uint256 t0 = vm.getBlockTimestamp();
        vm.prank(evaluator);
        jobs.reject(id, bytes32("off brief"), "");
        vm.prank(stranger);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.prank(provider);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.warp(t0 + 3 days);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.confirmRejection(id);
        vm.prank(arbiter);
        jobs.proposeRuling(id, 5_000, bytes32("half"));
        vm.warp(t0 + 3 days + 72 hours);
        uint256 before = usdc.balanceOf(client);
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(jobs), bytes32(id), clientId, 0, Outcome.RULED, 1, 5_000);
        jobs.executeRuling(id);
        assertEq(usdc.balanceOf(provider), _net(100e6));
        assertEq(usdc.balanceOf(client), before + 100.5e6);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Completed));
        assertEq(usdc.balanceOf(address(jobs)), 0);
    }

    function test_the_dispute_must_come_within_three_days() public {
        uint256 id = _submitted();
        vm.prank(evaluator);
        jobs.reject(id, bytes32("off brief"), "");
        vm.warp(block.timestamp + 3 days);
        vm.prank(provider);
        vm.expectRevert(JobLib.Late.selector);
        jobs.disputeRejection(id, bytes32("clause"));
    }

    function test_the_reviewer_rules_and_otherwise_the_fallback_applies() public {
        uint256 id = _submitted();
        vm.prank(evaluator);
        jobs.reject(id, bytes32("off brief"), "");
        vm.prank(provider);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.prank(arbiter);
        jobs.escalate(id);
        vm.prank(reviewSafe);
        jobs.rule(id, 0, bytes32("none"));
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Rejected));
        assertEq(usdc.balanceOf(provider), 0);

        uint256 second = _submitted();
        vm.prank(evaluator);
        jobs.reject(second, bytes32("off brief"), "");
        vm.prank(provider);
        jobs.disputeRejection(second, bytes32("clause"));
        vm.prank(arbiter);
        jobs.escalate(second);
        vm.warp(block.timestamp + 5 days);
        vm.prank(stranger);
        jobs.applyFallback(second);
        assertEq(usdc.balanceOf(provider), _net(100e6));
    }

    function test_completion_ends_a_pending_rejection_and_its_dispute() public {
        uint256 id = _submitted();
        vm.prank(evaluator);
        jobs.reject(id, bytes32("off brief"), "");
        vm.prank(provider);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.prank(evaluator);
        jobs.complete(id, bytes32("on reflection"), "");
        assertEq(usdc.balanceOf(provider), _net(BUDGET));
        assertEq(jobs.disputeOf(id).openedAt, 0);
    }

    function test_the_evaluator_rejects_a_funded_job_and_it_is_refunded_at_once() public {
        uint256 id = _fundedJob();
        uint256 before = usdc.balanceOf(client);
        vm.prank(client);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.reject(id, bytes32("changed my mind"), "");
        vm.prank(evaluator);
        jobs.reject(id, bytes32("no longer needed"), "");
        assertEq(usdc.balanceOf(client), before + FUNDED);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Rejected));
    }

    function test_the_client_rejects_an_open_job() public {
        uint256 id = _job();
        vm.prank(evaluator);
        vm.expectRevert(JobLib.BadCaller.selector);
        jobs.reject(id, bytes32("x"), "");
        vm.prank(client);
        jobs.reject(id, bytes32("not needed"), "");
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Rejected));
        vm.prank(client);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.fund(id, 0, "");
    }

    // ------------------------------- Expiry -------------------------------

    function test_a_funded_job_nobody_submitted_expires_into_a_refund() public {
        uint256 id = _fundedJob();
        vm.expectRevert(JobLib.Early.selector);
        jobs.claimRefund(id);
        vm.warp(block.timestamp + 10 days);
        vm.prank(provider);
        vm.expectRevert(JobLib.Late.selector);
        jobs.submit(id, keccak256("too late"), "");
        uint256 before = usdc.balanceOf(client);
        vm.prank(stranger);
        jobs.claimRefund(id);
        assertEq(usdc.balanceOf(client), before + FUNDED);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Expired));
    }

    // ------------------------------- Safety -------------------------------

    function test_a_hold_delays_timeouts_but_not_the_evaluator() public {
        uint256 id = _submitted();
        vm.warp(block.timestamp + 5 days);
        vm.prank(guardian);
        jobs.hold(bytes32(id), bytes32("check"));
        vm.expectRevert(JobLib.OnHold.selector);
        jobs.release(id);
        vm.prank(evaluator);
        jobs.complete(id, bytes32("good"), "");
        assertEq(usdc.balanceOf(provider), _net(BUDGET));
    }

    function test_a_paused_family_takes_no_new_jobs_but_exits_run() public {
        uint256 id = _fundedJob();
        uint256 second = _job();
        vm.prank(provider);
        jobs.setBudget(second, BUDGET, "");
        vm.prank(guardian);
        hub.pauseFamily(address(jobs));
        vm.prank(client);
        vm.expectRevert(SettlementLib.NotOpen.selector);
        jobs.fund(second, BUDGET, "");
        vm.warp(block.timestamp + 10 days);
        jobs.claimRefund(id);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Expired));
    }

    function test_the_senior_reviewer_judges_a_high_value_job() public {
        hub.setCaps(address(jobs), address(usdc), 10_000e6, 100_000e6);
        uint256 id = _job();
        vm.prank(provider);
        jobs.setBudget(id, 5_000e6, "");
        vm.prank(client);
        jobs.fund(id, 5_000e6, "");
        vm.prank(provider);
        jobs.submit(id, keccak256("big report"), "");
        vm.prank(evaluator);
        jobs.reject(id, bytes32("off brief"), "");
        vm.prank(provider);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.prank(arbiter);
        jobs.escalate(id);
        vm.prank(reviewSafe);
        vm.expectRevert();
        jobs.rule(id, 10_000, bytes32("all"));
        vm.prank(seniorSafe);
        jobs.rule(id, 10_000, bytes32("all"));
        assertEq(usdc.balanceOf(provider), _net(5_000e6));
    }

    function test_a_blocked_provider_is_owed_and_nothing_else_stops() public {
        uint256 id = _submitted();
        usdc.setBlocked(provider, true);
        vm.prank(evaluator);
        jobs.complete(id, bytes32("good"), "");
        assertEq(jobs.owed(address(usdc), provider), _net(BUDGET));
        usdc.setBlocked(provider, false);
        vm.prank(provider);
        jobs.withdrawOwed(address(usdc));
        assertEq(usdc.balanceOf(provider), _net(BUDGET));
    }

    function test_the_per_deal_cap_counts_the_budget_and_the_fee_half() public {
        uint256 id = _job();
        vm.prank(provider);
        jobs.setBudget(id, PER_DEAL, "");
        vm.prank(client);
        vm.expectRevert(SettlementLib.OverCap.selector);
        jobs.fund(id, PER_DEAL, "");
    }

    function test_a_job_that_was_never_created_takes_no_steps() public {
        vm.prank(client);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.reject(1, bytes32("x"), "");
        vm.expectRevert(JobLib.BadState.selector);
        jobs.claimRefund(1);
        assertEq(jobs.jobCount(), 0);
    }

    // --------------------------- Review findings --------------------------

    function test_erc_8183_events_name_the_jobs_evaluator() public {
        uint256 id = _submitted();
        uint256 t0 = vm.getBlockTimestamp();
        vm.prank(evaluator);
        jobs.reject(id, bytes32("off brief"), "");
        vm.prank(provider);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.prank(arbiter);
        jobs.proposeRuling(id, 10_000, bytes32("all"));
        vm.warp(t0 + 72 hours);
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.JobCompleted(id, evaluator, bytes32("ruling"));
        vm.prank(stranger);
        jobs.executeRuling(id);
    }

    function test_the_longstop_ends_a_job_and_its_dispute() public {
        uint256 id = _submitted();
        vm.prank(evaluator);
        jobs.reject(id, bytes32("off brief"), "");
        vm.prank(provider);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.warp(uint256(jobs.accountOf(bytes32(id)).horizon) + jobs.LONGSTOP());
        uint256[] memory toPayees = new uint256[](1);
        toPayees[0] = 100e6;
        vm.prank(seniorSafe);
        jobs.longstopSplit(bytes32(id), FUNDED - 100e6, toPayees);
        assertEq(uint8(jobs.getJob(id).status), uint8(JobStatus.Expired));
        assertEq(jobs.disputeOf(id).openedAt, 0);
        assertFalse(_core(id).disputed);
        vm.prank(evaluator);
        vm.expectRevert(JobLib.BadState.selector);
        jobs.complete(id, bytes32("late"), "");
    }

    function test_every_exit_runs_while_the_family_is_paused() public {
        uint256 silent = _submitted();
        uint256 rejected = _submitted();
        uint256 bounty = _contest();
        uint256 t0 = vm.getBlockTimestamp();
        vm.prank(evaluator);
        jobs.reject(rejected, bytes32("off brief"), "");
        vm.prank(guardian);
        hub.pauseFamily(address(jobs));
        vm.warp(t0 + 10 days);
        jobs.release(silent);
        jobs.confirmRejection(rejected);
        jobs.claimRefund(bounty);
        assertEq(uint8(jobs.getJob(silent).status), uint8(JobStatus.Completed));
        assertEq(uint8(jobs.getJob(rejected).status), uint8(JobStatus.Rejected));
        assertEq(uint8(jobs.getJob(bounty).status), uint8(JobStatus.Expired));
    }

    function test_the_job_count_and_a_contests_shares_can_be_read() public {
        _job();
        uint256 id = _contest();
        assertEq(jobs.jobCount(), 2);
        uint16[] memory shares = jobs.sharesOf(id);
        assertEq(shares.length, 3);
        assertEq(shares[0], 6_000);
        assertEq(shares[1], 3_000);
        assertEq(shares[2], 1_000);
    }
}
