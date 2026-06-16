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

    /* ==================== v2.E recordPenalty + signer =================== */

    function test_v2E_RecordPenalty_RevertsWhenSignerUnset() public {
        // Default state: signer slot is empty. Any call reverts.
        vm.expectRevert(KarwanReputation.SignerNotSet.selector);
        rep.recordPenalty(seller, 1, keccak256("reason"));
    }

    function test_v2E_SetSecurityAgentSigner_OneShot() public {
        address signer = makeAddr("security-signer");
        rep.setSecurityAgentSigner(signer);
        assertEq(rep.securityAgentSigner(), signer);
        // penaltyAdmin self-zeroed after binding.
        assertEq(rep.penaltyAdmin(), address(0));
        // Second call reverts.
        vm.expectRevert(KarwanReputation.NotPenaltyAdmin.selector);
        rep.setSecurityAgentSigner(signer);
    }

    function test_v2E_SetSecurityAgentSigner_OnlyPenaltyAdmin() public {
        address rando = makeAddr("rando");
        vm.prank(rando);
        vm.expectRevert(KarwanReputation.NotPenaltyAdmin.selector);
        rep.setSecurityAgentSigner(rando);
    }

    function test_v2E_RecordPenalty_OnlyFromSigner() public {
        address signer = makeAddr("security-signer");
        rep.setSecurityAgentSigner(signer);
        address rando = makeAddr("rando");
        vm.prank(rando);
        vm.expectRevert(KarwanReputation.NotSecurityAgentSigner.selector);
        rep.recordPenalty(seller, 1, keccak256("reason"));
    }

    function test_v2E_RecordPenalty_IncrementsSeverity() public {
        address signer = makeAddr("security-signer");
        rep.setSecurityAgentSigner(signer);
        assertEq(rep.penaltySeverity(seller), 0);
        vm.prank(signer);
        rep.recordPenalty(seller, 2, keccak256("malicious-delivery"));
        assertEq(rep.penaltySeverity(seller), 2);
        vm.prank(signer);
        rep.recordPenalty(seller, 1, keccak256("repeat"));
        assertEq(rep.penaltySeverity(seller), 3);
    }

    function test_v2E_RecordPenalty_RevertsOnZeroSeverity() public {
        address signer = makeAddr("security-signer");
        rep.setSecurityAgentSigner(signer);
        vm.prank(signer);
        vm.expectRevert(KarwanReputation.InvalidSeverity.selector);
        rep.recordPenalty(seller, 0, keccak256("zero-severity"));
    }

    function test_v2E_RecordPenalty_RevertsOnZeroSubject() public {
        address signer = makeAddr("security-signer");
        rep.setSecurityAgentSigner(signer);
        vm.prank(signer);
        vm.expectRevert(KarwanReputation.ZeroAddress.selector);
        rep.recordPenalty(address(0), 1, keccak256("zero-subj"));
    }

    /* ================== financier reputation (recordFinancing) ========= */

    address financier = makeAddr("financier");

    function test_Finance_SetSigner_OneShot() public {
        address signer = makeAddr("finance-signer");
        rep.setFinanceSigner(signer);
        assertEq(rep.financeSigner(), signer);
        // financeAdmin self-zeros on the first bind, so a second call trips the
        // admin gate first. The one-shot is enforced either way.
        vm.expectRevert(KarwanReputation.NotFinanceAdmin.selector);
        rep.setFinanceSigner(signer);
    }

    function test_Finance_SetSigner_OnlyFinanceAdmin() public {
        address rando = makeAddr("rando");
        vm.prank(rando);
        vm.expectRevert(KarwanReputation.NotFinanceAdmin.selector);
        rep.setFinanceSigner(makeAddr("finance-signer"));
    }

    function test_Finance_Record_RevertsWhenSignerUnset() public {
        vm.expectRevert(KarwanReputation.SignerNotSet.selector);
        rep.recordFinancing(keccak256("f1"), financier, KarwanReputation.FinanceOutcome.Repaid);
    }

    function test_Finance_Record_OnlyFromSigner() public {
        address signer = makeAddr("finance-signer");
        rep.setFinanceSigner(signer);
        vm.prank(makeAddr("rando"));
        vm.expectRevert(KarwanReputation.NotFinanceSigner.selector);
        rep.recordFinancing(keccak256("f1"), financier, KarwanReputation.FinanceOutcome.Repaid);
    }

    function test_Finance_Record_RepaidAndDefaultedIncrement() public {
        address signer = makeAddr("finance-signer");
        rep.setFinanceSigner(signer);

        vm.startPrank(signer);
        rep.recordFinancing(keccak256("f1"), financier, KarwanReputation.FinanceOutcome.Repaid);
        rep.recordFinancing(keccak256("f2"), financier, KarwanReputation.FinanceOutcome.Repaid);
        rep.recordFinancing(keccak256("f3"), financier, KarwanReputation.FinanceOutcome.Defaulted);
        vm.stopPrank();

        (uint256 funded, uint256 repaid, uint256 defaulted) = rep.financiers(financier);
        assertEq(funded, 3);
        assertEq(repaid, 2);
        assertEq(defaulted, 1);
    }

    function test_Finance_Record_DuplicateFundingReverts() public {
        address signer = makeAddr("finance-signer");
        rep.setFinanceSigner(signer);
        vm.startPrank(signer);
        rep.recordFinancing(keccak256("f1"), financier, KarwanReputation.FinanceOutcome.Repaid);
        vm.expectRevert(KarwanReputation.AlreadyRecorded.selector);
        rep.recordFinancing(keccak256("f1"), financier, KarwanReputation.FinanceOutcome.Defaulted);
        vm.stopPrank();
    }

    function test_Finance_Record_NoneOutcomeReverts() public {
        address signer = makeAddr("finance-signer");
        rep.setFinanceSigner(signer);
        vm.prank(signer);
        vm.expectRevert(KarwanReputation.InvalidOutcome.selector);
        rep.recordFinancing(keccak256("f1"), financier, KarwanReputation.FinanceOutcome.None);
    }

    function test_Finance_Record_ZeroFinancierReverts() public {
        address signer = makeAddr("finance-signer");
        rep.setFinanceSigner(signer);
        vm.prank(signer);
        vm.expectRevert(KarwanReputation.ZeroAddress.selector);
        rep.recordFinancing(keccak256("f1"), address(0), KarwanReputation.FinanceOutcome.Repaid);
    }
}
