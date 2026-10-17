// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {JobFixture} from "./JobFixture.sol";
import {JobLib} from "../../../src/suite/jobs/JobLib.sol";
import {BountyLib} from "../../../src/suite/jobs/BountyLib.sol";
import {BountyTerms} from "../../../src/suite/jobs/JobTypes.sol";
import {IAgenticCommerce} from "../../../src/suite/interfaces/IAgenticCommerce.sol";

/// @notice Every step of a job or a bounty is announced with every field, in
///         the ERC-8183 events where the standard has one. Callers are
///         relayed, so msg.sender is not tx.origin.
contract JobEventsTest is JobFixture {
    address internal relayer = makeAddr("relayer");
    uint256 internal constant CONTEST_FUNDED = 300e6 + 1.5e6;

    function setUp() public {
        _deployJobs();
    }

    function _rejected() internal returns (uint256 id) {
        id = _submitted();
        vm.prank(evaluator);
        jobs.reject(id, bytes32("off brief"), "");
    }

    // -------------------------------- A job --------------------------------

    function test_creating_pricing_funding_and_submitting_are_announced() public {
        uint256 expiredAt = vm.getBlockTimestamp() + 10 days;
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.JobCreated(1, client, address(0), evaluator, expiredAt, address(0));
        vm.prank(client, relayer);
        uint256 id = jobs.createJob(address(0), evaluator, expiredAt, "open call", address(0));
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.ProviderSet(id, provider);
        vm.prank(client, relayer);
        jobs.setProvider(id, provider, "");
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.BudgetSet(id, BUDGET);
        vm.prank(provider, relayer);
        jobs.setBudget(id, BUDGET, "");
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.JobFunded(id, client, BUDGET);
        vm.prank(client, relayer);
        jobs.fund(id, BUDGET, "");
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.JobSubmitted(id, provider, keccak256("report"));
        vm.prank(provider, relayer);
        jobs.submit(id, keccak256("report"), "");
    }

    function test_the_client_rejecting_an_open_job_is_announced() public {
        uint256 id = _job();
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.JobRejected(id, client, bytes32("changed my mind"));
        vm.prank(client, relayer);
        jobs.reject(id, bytes32("changed my mind"), "");
    }

    function test_rejecting_a_funded_job_announces_the_refund() public {
        uint256 id = _fundedJob();
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.JobRejected(id, evaluator, bytes32("cancelled"));
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.Refunded(id, client, FUNDED);
        vm.prank(evaluator, relayer);
        jobs.reject(id, bytes32("cancelled"), "");
    }

    function test_a_pending_rejection_and_its_dispute_are_announced() public {
        uint256 id = _submitted();
        vm.expectEmit(address(jobs));
        emit JobLib.RejectionPending(id, bytes32("off brief"), uint64(vm.getBlockTimestamp() + 3 days));
        vm.prank(evaluator, relayer);
        jobs.reject(id, bytes32("off brief"), "");
        vm.expectEmit(address(jobs));
        emit JobLib.RejectionDisputed(id, bytes32("clause"));
        vm.prank(provider, relayer);
        jobs.disputeRejection(id, bytes32("clause"));
    }

    function test_an_expiry_announces_the_refund() public {
        uint256 id = _fundedJob();
        vm.warp(vm.getBlockTimestamp() + 10 days);
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.JobExpired(id);
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.Refunded(id, client, FUNDED);
        vm.prank(stranger);
        jobs.claimRefund(id);
    }

    function test_a_ruling_that_pays_half_announces_both_sides() public {
        uint256 id = _rejected();
        vm.prank(provider);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.prank(arbiter);
        jobs.escalate(id);
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.PaymentReleased(id, provider, _net(100e6));
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.Refunded(id, client, FUNDED - _net(100e6) - 1e6);
        vm.prank(reviewSafe);
        jobs.rule(id, 5_000, bytes32("half"));
    }

    // ------------------------------- Bounties ------------------------------

    function test_a_bounty_its_entries_and_a_partial_award_are_announced() public {
        BountyTerms memory t = _contestTerms();
        vm.expectEmit(address(jobs));
        emit BountyLib.BountyOpened(1, client, evaluator, 300e6, t.entriesBy, t.awardBy);
        vm.prank(client, relayer);
        uint256 id = jobs.openBounty(t);
        address[] memory winners = new address[](2);
        for (uint256 i; i < 2; ++i) {
            (winners[i],,) = _person(string(abi.encodePacked("entrant", vm.toString(i))));
            bytes32 work = keccak256(abi.encode("entry", i));
            vm.expectEmit(address(jobs));
            emit BountyLib.Entered(id, winners[i], work);
            vm.prank(winners[i], relayer);
            jobs.enter(id, work);
        }
        vm.warp(vm.getBlockTimestamp() + 7 days);
        vm.expectEmit(address(jobs));
        emit BountyLib.BountyAwarded(id, winners, 270e6);
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.PaymentReleased(id, winners[0], _net(180e6));
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.PaymentReleased(id, winners[1], _net(90e6));
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.Refunded(id, client, CONTEST_FUNDED - _net(180e6) - _net(90e6) - 2.7e6);
        vm.prank(evaluator, relayer);
        jobs.award(id, winners);
    }

    function test_a_cancelled_bounty_announces_the_refund() public {
        uint256 id = _contest();
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.JobRejected(id, client, bytes32("no longer needed"));
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.Refunded(id, client, CONTEST_FUNDED);
        vm.prank(client, relayer);
        jobs.reject(id, bytes32("no longer needed"), "");
    }

    function test_an_expired_bounty_announces_the_refund() public {
        uint256 id = _contest();
        vm.warp(vm.getBlockTimestamp() + 10 days);
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.JobExpired(id);
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.Refunded(id, client, CONTEST_FUNDED);
        vm.prank(stranger);
        jobs.claimRefund(id);
    }

    function test_the_silence_release_names_the_evaluator() public {
        uint256 id = _submitted();
        vm.warp(vm.getBlockTimestamp() + 5 days);
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.JobCompleted(id, evaluator, bytes32("silence"));
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.PaymentReleased(id, provider, _net(BUDGET));
        vm.prank(stranger, relayer);
        jobs.release(id);
    }

    /// Anyone confirms an undisputed rejection; the event names the
    /// evaluator who rejected and their reason, never the caller.
    function test_a_confirmed_rejection_names_the_evaluator_and_their_reason() public {
        uint256 id = _rejected();
        vm.warp(vm.getBlockTimestamp() + 3 days);
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.JobRejected(id, evaluator, bytes32("off brief"));
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.Refunded(id, client, FUNDED);
        vm.prank(stranger, relayer);
        jobs.confirmRejection(id);
    }

    function test_a_ruling_of_nothing_is_announced_as_a_rejection() public {
        uint256 id = _rejected();
        vm.prank(provider);
        jobs.disputeRejection(id, bytes32("clause"));
        vm.prank(arbiter);
        jobs.escalate(id);
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.JobRejected(id, evaluator, bytes32("ruling"));
        vm.expectEmit(address(jobs));
        emit IAgenticCommerce.Refunded(id, client, FUNDED);
        vm.prank(reviewSafe, relayer);
        jobs.rule(id, 0, bytes32("none"));
    }
}
