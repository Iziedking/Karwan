// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {JobFixture} from "./JobFixture.sol";
import {KarwanSettlementBase} from "../../../src/suite/KarwanSettlementBase.sol";
import {BlocklistToken} from "../mocks/BlocklistToken.sol";
import {ReenteringToken} from "../mocks/ReenteringToken.sol";

/// @notice Every guarded Jobs step that moves money is closed to re-entry: a
///         token that calls back into the escrow mid-payment is refused.
contract JobReentrancyTest is JobFixture {
    function setUp() public {
        _deployJobs();
    }

    function _newToken() internal override returns (BlocklistToken) {
        return new ReenteringToken();
    }

    function _arm() internal {
        ReenteringToken(address(usdc)).arm(
            address(jobs), abi.encodeCall(KarwanSettlementBase.withdrawOwed, (address(usdc)))
        );
    }

    function _assertRefused() internal view {
        ReenteringToken t = ReenteringToken(address(usdc));
        assertTrue(t.attempted());
        assertFalse(t.succeeded());
        assertEq(t.reason(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector));
    }

    function _disputed() internal returns (uint256 id) {
        id = _submitted();
        vm.prank(evaluator);
        jobs.reject(id, bytes32("off brief"), "");
        vm.prank(provider);
        jobs.disputeRejection(id, bytes32("clause"));
    }

    function test_funding_is_closed_to_reentry() public {
        uint256 id = _job();
        vm.prank(provider);
        jobs.setBudget(id, BUDGET, "");
        _arm();
        vm.prank(client);
        jobs.fund(id, BUDGET, "");
        _assertRefused();
    }

    function test_completing_is_closed_to_reentry() public {
        uint256 id = _submitted();
        _arm();
        vm.prank(evaluator);
        jobs.complete(id, bytes32("good"), "");
        _assertRefused();
    }

    function test_the_silence_release_is_closed_to_reentry() public {
        uint256 id = _submitted();
        vm.warp(vm.getBlockTimestamp() + 5 days);
        _arm();
        vm.prank(stranger);
        jobs.release(id);
        _assertRefused();
    }

    function test_rejecting_a_funded_job_is_closed_to_reentry() public {
        uint256 id = _fundedJob();
        _arm();
        vm.prank(evaluator);
        jobs.reject(id, bytes32("cancelled"), "");
        _assertRefused();
    }

    function test_confirming_a_rejection_is_closed_to_reentry() public {
        uint256 id = _submitted();
        uint256 t0 = vm.getBlockTimestamp();
        vm.prank(evaluator);
        jobs.reject(id, bytes32("off brief"), "");
        vm.warp(t0 + 5 days);
        _arm();
        vm.prank(stranger);
        jobs.confirmRejection(id);
        _assertRefused();
    }

    function test_an_expiry_refund_is_closed_to_reentry() public {
        uint256 id = _fundedJob();
        vm.warp(vm.getBlockTimestamp() + 10 days);
        _arm();
        vm.prank(stranger);
        jobs.claimRefund(id);
        _assertRefused();
    }

    function test_opening_a_bounty_is_closed_to_reentry() public {
        _arm();
        _contest();
        _assertRefused();
    }

    function test_awarding_a_bounty_is_closed_to_reentry() public {
        uint256 id = _contest();
        address[] memory winners = new address[](3);
        for (uint256 i; i < 3; ++i) {
            (winners[i],,) = _person(string(abi.encodePacked("entrant", vm.toString(i))));
            _enter(id, winners[i]);
        }
        vm.warp(vm.getBlockTimestamp() + 7 days);
        _arm();
        vm.prank(evaluator);
        jobs.award(id, winners);
        _assertRefused();
    }

    function test_executing_a_ruling_is_closed_to_reentry() public {
        uint256 id = _disputed();
        vm.prank(arbiter);
        jobs.proposeRuling(id, 10_000, bytes32("all"));
        vm.warp(vm.getBlockTimestamp() + 72 hours);
        _arm();
        vm.prank(stranger);
        jobs.executeRuling(id);
        _assertRefused();
    }

    function test_the_reviewers_ruling_is_closed_to_reentry() public {
        uint256 id = _disputed();
        vm.prank(arbiter);
        jobs.escalate(id);
        _arm();
        vm.prank(reviewSafe);
        jobs.rule(id, 0, bytes32("none"));
        _assertRefused();
    }

    function test_the_fallback_is_closed_to_reentry() public {
        uint256 id = _disputed();
        vm.prank(arbiter);
        jobs.escalate(id);
        vm.warp(vm.getBlockTimestamp() + 5 days);
        _arm();
        vm.prank(stranger);
        jobs.applyFallback(id);
        _assertRefused();
    }
}
