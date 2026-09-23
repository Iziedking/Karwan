// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";

/// @notice Internal audit R1b, finding REP-01. distinctCounterparties is the
///         breadth signal the composite uses to keep farmed accounts below
///         ELITE. A buyer could buy breadth for gas alone: fund throwaway
///         sellers, let the deadline pass, reclaim everything (the fee comes
///         back too), and each Failed outcome still counted a new counterparty.
///         Dust deals did the same through Success, since a 1-unit deal pays a
///         zero fee. Breadth must come from real, creditable deals.
contract KarwanReputationFarmingAttackTest is Test {
    KarwanReputation rep;
    address escrow = makeAddr("escrow");
    address buyer = makeAddr("farming-buyer");
    uint256 constant U = 1e6;

    function setUp() public {
        rep = new KarwanReputation();
        rep.setEscrow(escrow);
    }

    function _seller(uint256 i) internal returns (address) {
        return makeAddr(string(abi.encodePacked("throwaway", vm.toString(i))));
    }

    function test_REP01_FailedDealsWithThrowawaySellersBuyNoBreadth() public {
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(escrow);
            rep.recordCompletion(keccak256(abi.encodePacked("f", i)), buyer, _seller(i), KarwanReputation.Outcome.Failed, 100 * U);
        }
        assertEq(rep.distinctCounterparties(buyer), 0, "failed deals add no breadth");
    }

    function test_REP01_DustDealsBuyNoBreadth() public {
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(escrow);
            rep.recordCompletion(keccak256(abi.encodePacked("d", i)), buyer, _seller(i), KarwanReputation.Outcome.Success, 1);
        }
        assertEq(rep.distinctCounterparties(buyer), 0, "deals below minCreditAmount add no breadth");
    }

    function test_REP01_RealDealsStillBuildBreadth() public {
        vm.prank(escrow);
        rep.recordCompletion(keccak256("real"), buyer, _seller(99), KarwanReputation.Outcome.Success, 100 * U);
        assertEq(rep.distinctCounterparties(buyer), 1, "a creditable settled deal counts");
    }

    function test_REP01_HonestBuyerStillCreditedOnFailedDeal() public {
        vm.prank(escrow);
        rep.recordCompletion(keccak256("victim"), buyer, _seller(1), KarwanReputation.Outcome.Failed, 100 * U);
        (uint256 success,,) = rep.scores(buyer);
        assertEq(success, 1, "the buyer who honoured the deal keeps their credit");
        (,, uint256 failed) = rep.scores(_seller(1));
        assertEq(failed, 1, "the seller takes the failure");
    }
}
