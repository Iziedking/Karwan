// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanBusinessRegistry} from "../src/KarwanBusinessRegistry.sol";

contract KarwanBusinessRegistryTest is Test {
    KarwanBusinessRegistry reg;

    address owner = makeAddr("owner");
    address reviewer = makeAddr("reviewer");
    address applicant = makeAddr("applicant");
    address rando = makeAddr("rando");

    bytes32 constant DOC = keccak256("cac_certificate.pdf");
    bytes32 constant DOC2 = keccak256("tax_clearance.pdf");
    bytes32 constant REASON = keccak256("document illegible");

    event BusinessRegistrationSubmitted(address indexed applicant, bytes32 docHash, uint64 ts);
    event BusinessVerified(address indexed applicant, address indexed reviewer, uint64 ts);
    event BusinessRejected(
        address indexed applicant, address indexed reviewer, bytes32 reasonHash, uint64 ts
    );

    function setUp() public {
        reg = new KarwanBusinessRegistry(owner, reviewer);
    }

    /* ============================ DEPLOYMENT ============================= */

    function test_Constructor_SetsOwnerAndReviewer() public view {
        assertEq(reg.owner(), owner);
        assertEq(reg.reviewer(), reviewer);
    }

    function test_Constructor_RevertsOnZeroOwner() public {
        vm.expectRevert(KarwanBusinessRegistry.ZeroAddress.selector);
        new KarwanBusinessRegistry(address(0), reviewer);
    }

    function test_Constructor_RevertsOnZeroReviewer() public {
        vm.expectRevert(KarwanBusinessRegistry.ZeroAddress.selector);
        new KarwanBusinessRegistry(owner, address(0));
    }

    /* ============================ SUBMIT ================================ */

    function test_Submit_SetsSubmittedAndEmits() public {
        vm.expectEmit(true, false, false, true);
        emit BusinessRegistrationSubmitted(applicant, DOC, uint64(block.timestamp));
        vm.prank(applicant);
        reg.submitRegistration(DOC);

        (uint8 status, bytes32 docHash, uint64 verifiedAt) = reg.statusOf(applicant);
        assertEq(status, 1);
        assertEq(docHash, DOC);
        assertEq(verifiedAt, 0);
        assertFalse(reg.isVerified(applicant));
    }

    function test_Submit_RevertsOnEmptyHash() public {
        vm.prank(applicant);
        vm.expectRevert(KarwanBusinessRegistry.EmptyHash.selector);
        reg.submitRegistration(bytes32(0));
    }

    function test_Submit_VerifiedCannotResubmit() public {
        _submitAndApprove(applicant, DOC);
        vm.prank(applicant);
        vm.expectRevert(KarwanBusinessRegistry.AlreadyVerified.selector);
        reg.submitRegistration(DOC2);
    }

    /* ============================ APPROVE ============================== */

    function test_Approve_ByReviewerSetsVerified() public {
        vm.prank(applicant);
        reg.submitRegistration(DOC);

        vm.expectEmit(true, true, false, true);
        emit BusinessVerified(applicant, reviewer, uint64(block.timestamp));
        vm.prank(reviewer);
        reg.approve(applicant);

        (uint8 status,, uint64 verifiedAt) = reg.statusOf(applicant);
        assertEq(status, 2);
        assertEq(verifiedAt, uint64(block.timestamp));
        assertTrue(reg.isVerified(applicant));
    }

    function test_Approve_RevertsForNonReviewer() public {
        vm.prank(applicant);
        reg.submitRegistration(DOC);
        vm.prank(rando);
        vm.expectRevert(KarwanBusinessRegistry.NotReviewer.selector);
        reg.approve(applicant);
    }

    function test_Approve_RevertsWhenNotSubmitted() public {
        // applicant never submitted: status None.
        vm.prank(reviewer);
        vm.expectRevert(KarwanBusinessRegistry.NotSubmitted.selector);
        reg.approve(applicant);
    }

    /* ============================ REJECT =============================== */

    function test_Reject_ByReviewerSetsRejected() public {
        vm.prank(applicant);
        reg.submitRegistration(DOC);

        vm.expectEmit(true, true, false, true);
        emit BusinessRejected(applicant, reviewer, REASON, uint64(block.timestamp));
        vm.prank(reviewer);
        reg.reject(applicant, REASON);

        KarwanBusinessRegistry.Registration memory r = reg.registrationOf(applicant);
        assertEq(r.status, 3);
        assertEq(r.reasonHash, REASON);
        assertFalse(reg.isVerified(applicant));
    }

    function test_Reject_RevertsForNonReviewer() public {
        vm.prank(applicant);
        reg.submitRegistration(DOC);
        vm.prank(rando);
        vm.expectRevert(KarwanBusinessRegistry.NotReviewer.selector);
        reg.reject(applicant, REASON);
    }

    function test_Reject_ThenResubmitThenApprove() public {
        vm.prank(applicant);
        reg.submitRegistration(DOC);
        vm.prank(reviewer);
        reg.reject(applicant, REASON);

        // A rejected applicant can resubmit with a fresh document.
        vm.prank(applicant);
        reg.submitRegistration(DOC2);
        (uint8 status, bytes32 docHash,) = reg.statusOf(applicant);
        assertEq(status, 1);
        assertEq(docHash, DOC2);

        vm.prank(reviewer);
        reg.approve(applicant);
        assertTrue(reg.isVerified(applicant));
    }

    /* ============================ REVIEWER ============================= */

    function test_SetReviewer_OwnerRotates() public {
        address newReviewer = makeAddr("newReviewer");
        vm.prank(owner);
        reg.setReviewer(newReviewer);
        assertEq(reg.reviewer(), newReviewer);

        // The old reviewer can no longer approve.
        vm.prank(applicant);
        reg.submitRegistration(DOC);
        vm.prank(reviewer);
        vm.expectRevert(KarwanBusinessRegistry.NotReviewer.selector);
        reg.approve(applicant);

        vm.prank(newReviewer);
        reg.approve(applicant);
        assertTrue(reg.isVerified(applicant));
    }

    function test_SetReviewer_RevertsForNonOwner() public {
        vm.prank(rando);
        vm.expectRevert(KarwanBusinessRegistry.NotOwner.selector);
        reg.setReviewer(rando);
    }

    function test_SetReviewer_RevertsOnZero() public {
        vm.prank(owner);
        vm.expectRevert(KarwanBusinessRegistry.ZeroAddress.selector);
        reg.setReviewer(address(0));
    }

    /* ============================ OWNERSHIP =========================== */

    function test_Ownership_TwoStepHandover() public {
        address newOwner = makeAddr("newOwner");
        vm.prank(owner);
        reg.transferOwnership(newOwner);
        assertEq(reg.pendingOwner(), newOwner);
        assertEq(reg.owner(), owner);

        vm.prank(newOwner);
        reg.acceptOwnership();
        assertEq(reg.owner(), newOwner);
        assertEq(reg.pendingOwner(), address(0));
    }

    function test_Ownership_AcceptRevertsForNonPending() public {
        vm.prank(owner);
        reg.transferOwnership(makeAddr("newOwner"));
        vm.prank(rando);
        vm.expectRevert(KarwanBusinessRegistry.NotPendingOwner.selector);
        reg.acceptOwnership();
    }

    /* ============================ HELPERS ============================= */

    function _submitAndApprove(address who, bytes32 doc) internal {
        vm.prank(who);
        reg.submitRegistration(doc);
        vm.prank(reviewer);
        reg.approve(who);
    }
}
