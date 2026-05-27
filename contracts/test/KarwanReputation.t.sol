// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";

contract KarwanReputationTest is Test {
    KarwanReputation rep;
    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address escrow = makeAddr("escrow");

    function setUp() public {
        rep = new KarwanReputation();
        rep.setEscrow(escrow);
    }

    /* ============================= ADMIN ============================== */

    function test_SetEscrow_OnlyOnce() public {
        vm.expectRevert(KarwanReputation.NotDeployer.selector);
        rep.setEscrow(makeAddr("other-escrow"));
    }

    function test_RecordCompletion_RevertsBeforeEscrowBound() public {
        KarwanReputation fresh = new KarwanReputation();
        bytes32 jobId = keccak256("job-1");
        vm.expectRevert(KarwanReputation.NotEscrow.selector);
        fresh.recordCompletion(jobId, buyer, seller, KarwanReputation.Outcome.Success);
    }

    function test_RecordCompletion_NotEscrowReverts() public {
        bytes32 jobId = keccak256("job-1");
        vm.prank(makeAddr("eve"));
        vm.expectRevert(KarwanReputation.NotEscrow.selector);
        rep.recordCompletion(jobId, buyer, seller, KarwanReputation.Outcome.Success);
    }

    /* ====================== SYMMETRIC CREDITING ======================= */

    function test_Success_CreditsBothSides() public {
        bytes32 jobId = keccak256("job-1");
        vm.prank(escrow);
        rep.recordCompletion(jobId, buyer, seller, KarwanReputation.Outcome.Success);

        (uint256 buyerSuccess, , ) = rep.scores(buyer);
        (uint256 sellerSuccess, , ) = rep.scores(seller);
        assertEq(buyerSuccess, 1);
        assertEq(sellerSuccess, 1);
    }

    function test_DisputeResolved_CreditsBothDisputed() public {
        bytes32 jobId = keccak256("job-1");
        vm.prank(escrow);
        rep.recordCompletion(jobId, buyer, seller, KarwanReputation.Outcome.DisputeResolved);

        (, uint256 buyerDisputed, ) = rep.scores(buyer);
        (, uint256 sellerDisputed, ) = rep.scores(seller);
        assertEq(buyerDisputed, 1);
        assertEq(sellerDisputed, 1);
    }

    function test_Failed_OnlySellerFailed_BuyerStillGetsSuccess() public {
        // Buyer paid in good faith, got refunded; seller didn't deliver.
        bytes32 jobId = keccak256("job-1");
        vm.prank(escrow);
        rep.recordCompletion(jobId, buyer, seller, KarwanReputation.Outcome.Failed);

        (uint256 buyerSuccess, , uint256 buyerFailed) = rep.scores(buyer);
        (uint256 sellerSuccess, , uint256 sellerFailed) = rep.scores(seller);
        assertEq(buyerSuccess, 1, "buyer earns success on a failed deal");
        assertEq(buyerFailed, 0);
        assertEq(sellerSuccess, 0);
        assertEq(sellerFailed, 1, "seller takes the fail on their record");
    }

    function test_NeutralScoreForUnknownParty() public view {
        assertEq(rep.getReputationScore(seller), 5000);
    }

    function test_DuplicateRecord_Reverts() public {
        bytes32 jobId = keccak256("job-1");
        vm.startPrank(escrow);
        rep.recordCompletion(jobId, buyer, seller, KarwanReputation.Outcome.Success);
        vm.expectRevert(KarwanReputation.AlreadyRecorded.selector);
        rep.recordCompletion(jobId, buyer, seller, KarwanReputation.Outcome.Success);
        vm.stopPrank();
    }

    function test_InvalidOutcome_Reverts() public {
        bytes32 jobId = keccak256("job-1");
        vm.prank(escrow);
        vm.expectRevert(KarwanReputation.InvalidOutcome.selector);
        rep.recordCompletion(jobId, buyer, seller, KarwanReputation.Outcome.None);
    }
}
