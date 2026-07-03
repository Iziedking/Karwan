// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";

/// @title KarwanReputation v2 additions
/// @notice Value-weighted scoring, arbiter recordResolution, penalty
///         annulment, backfill migration, two-step ownership.
contract KarwanReputationV2Test is Test {
    KarwanReputation rep;
    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address escrow = makeAddr("escrow");
    address council = makeAddr("council");
    address eve = makeAddr("eve");
    uint256 constant U = 1e6;

    function setUp() public {
        rep = new KarwanReputation();
        rep.setEscrow(escrow);
        rep.setSecurityCouncil(council);
    }

    // ======================= Value weighting (M-1) ======================

    function test_Value_CreditsSettledValueOnSuccess() public {
        vm.prank(escrow);
        rep.recordCompletion(keccak256("j1"), buyer, seller, KarwanReputation.Outcome.Success, 1000 * U);
        assertEq(rep.settledValue(seller), 1000 * U, "seller value credited");
        assertEq(rep.settledValue(buyer), 1000 * U, "buyer value credited");
    }

    function test_Value_BelowMinCreditsCountButZeroValue() public {
        // Default minCreditAmount is 25 USDC; a 10 USDC deal counts but adds no value.
        vm.prank(escrow);
        rep.recordCompletion(keccak256("j1"), buyer, seller, KarwanReputation.Outcome.Success, 10 * U);
        (uint256 sSuccess, , ) = rep.scores(seller);
        assertEq(sSuccess, 1, "still counted");
        assertEq(rep.settledValue(seller), 0, "no value weight below the floor");
    }

    function test_Value_FailedAndDisputeAddNoValue() public {
        vm.startPrank(escrow);
        rep.recordCompletion(keccak256("j1"), buyer, seller, KarwanReputation.Outcome.Failed, 1000 * U);
        rep.recordCompletion(keccak256("j2"), buyer, seller, KarwanReputation.Outcome.DisputeResolved, 1000 * U);
        vm.stopPrank();
        assertEq(rep.settledValue(seller), 0, "no value on failed/disputed");
    }

    function test_Value_OwnerCanSetMinCredit() public {
        rep.setMinCreditAmount(500 * U);
        vm.prank(escrow);
        rep.recordCompletion(keccak256("j1"), buyer, seller, KarwanReputation.Outcome.Success, 100 * U);
        assertEq(rep.settledValue(seller), 0, "100 below the new 500 floor");
    }

    // ======================= Arbiter resolution =========================

    function test_Resolution_BandsSellerBps() public {
        // Seller-favoured (>= 8000) -> Success + value.
        vm.prank(escrow);
        rep.recordResolution(keccak256("r1"), buyer, seller, 9000, 1000 * U);
        (uint256 sSuccess, , ) = rep.scores(seller);
        assertEq(sSuccess, 1, "high bps -> success");
        assertEq(rep.settledValue(seller), 1000 * U, "value credited on a seller-favoured ruling");

        // Buyer-favoured (<= 2000) -> Failed for the seller.
        vm.prank(escrow);
        rep.recordResolution(keccak256("r2"), buyer, seller, 1000, 1000 * U);
        (, , uint256 sFailed) = rep.scores(seller);
        assertEq(sFailed, 1, "low bps -> seller failed");

        // Middle -> DisputeResolved.
        vm.prank(escrow);
        rep.recordResolution(keccak256("r3"), buyer, seller, 5000, 1000 * U);
        (, uint256 sDisputed, ) = rep.scores(seller);
        assertEq(sDisputed, 1, "mid bps -> disputed");
    }

    function test_Resolution_EscrowOnly_And_NoDoubleRecord() public {
        vm.prank(eve);
        vm.expectRevert(KarwanReputation.NotEscrow.selector);
        rep.recordResolution(keccak256("r1"), buyer, seller, 5000, 100 * U);

        vm.prank(escrow);
        rep.recordResolution(keccak256("r1"), buyer, seller, 5000, 100 * U);
        vm.prank(escrow);
        vm.expectRevert(KarwanReputation.AlreadyRecorded.selector);
        rep.recordResolution(keccak256("r1"), buyer, seller, 5000, 100 * U);
    }

    function test_Resolution_RejectsBadBps() public {
        vm.prank(escrow);
        vm.expectRevert(KarwanReputation.InvalidBps.selector);
        rep.recordResolution(keccak256("r1"), buyer, seller, 10001, 100 * U);
    }

    // ====================== Penalty annulment (L-3) =====================

    function test_Penalty_AnnulReversesSeverity() public {
        address signer = makeAddr("sa-signer");
        rep.setSecurityAgentSigner(signer);
        vm.prank(signer);
        uint256 id = rep.recordPenalty(seller, 3, keccak256("scam"));
        assertEq(rep.penaltySeverity(seller), 3);

        // Only the council can annul.
        vm.prank(eve);
        vm.expectRevert(KarwanReputation.NotSecurityCouncil.selector);
        rep.annulPenalty(id);

        vm.prank(council);
        rep.annulPenalty(id);
        assertEq(rep.penaltySeverity(seller), 0, "severity reversed");

        // Can't annul twice.
        vm.prank(council);
        vm.expectRevert(KarwanReputation.AlreadyAnnulled.selector);
        rep.annulPenalty(id);
    }

    function test_Penalty_AnnulUnknownReverts() public {
        vm.prank(council);
        vm.expectRevert(KarwanReputation.UnknownPenalty.selector);
        rep.annulPenalty(999);
    }

    // ========================== Backfill (mig) ==========================

    function test_Backfill_SeedsThenLocks() public {
        rep.backfill(seller, 5, 1, 2, 5000 * U);
        (uint256 s, uint256 d, uint256 f) = rep.scores(seller);
        assertEq(s, 5);
        assertEq(d, 1);
        assertEq(f, 2);
        assertEq(rep.settledValue(seller), 5000 * U);

        rep.lockBackfill();
        vm.expectRevert(KarwanReputation.BackfillLockedError.selector);
        rep.backfill(seller, 1, 0, 0, 0);
    }

    function test_Backfill_OwnerOnly() public {
        vm.prank(eve);
        vm.expectRevert(KarwanReputation.NotOwner.selector);
        rep.backfill(seller, 1, 0, 0, 0);
    }

    // ========================= Two-step owner ==========================

    function test_TwoStepOwnership() public {
        rep.transferOwnership(eve);
        assertEq(rep.owner(), address(this));
        vm.prank(eve);
        rep.acceptOwnership();
        assertEq(rep.owner(), eve);
    }
}
