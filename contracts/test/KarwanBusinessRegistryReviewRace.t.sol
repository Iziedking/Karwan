// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanBusinessRegistry} from "../src/KarwanBusinessRegistry.sol";

/// @notice Internal audit R1b, finding BR-01. The reviewer checks the document
///         behind one hash, then sends approve. If the applicant resubmits a
///         different hash first, approve verified a document nobody reviewed.
///         Approval must name the hash that was reviewed.
contract KarwanBusinessRegistryReviewRaceTest is Test {
    KarwanBusinessRegistry reg;
    address owner = makeAddr("owner");
    address reviewer = makeAddr("reviewer");
    address applicant = makeAddr("applicant");
    bytes32 constant REVIEWED = keccak256("real-registration.pdf");
    bytes32 constant SWAPPED = keccak256("forged.pdf");

    function setUp() public {
        reg = new KarwanBusinessRegistry(owner, reviewer);
        vm.prank(applicant);
        reg.submitRegistration(REVIEWED);
    }

    function test_BR01_ApprovalOfASwappedDocumentReverts() public {
        vm.prank(applicant);
        reg.submitRegistration(SWAPPED);

        vm.prank(reviewer);
        vm.expectRevert(KarwanBusinessRegistry.DocHashMismatch.selector);
        reg.approve(applicant, REVIEWED);
        assertFalse(reg.isVerified(applicant), "the swapped document is not verified");
    }

    function test_BR01_ApprovalOfTheReviewedDocumentWorks() public {
        vm.prank(reviewer);
        reg.approve(applicant, REVIEWED);
        assertTrue(reg.isVerified(applicant));
    }

    function test_BR01_RejectionAlsoBindsTheReviewedDocument() public {
        vm.prank(applicant);
        reg.submitRegistration(SWAPPED);
        vm.prank(reviewer);
        vm.expectRevert(KarwanBusinessRegistry.DocHashMismatch.selector);
        reg.reject(applicant, REVIEWED, keccak256("reason"));
    }
}
