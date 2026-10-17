// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementLib} from "../../../src/suite/agreement/AgreementLib.sol";
import {AgreementDeliveryLib} from "../../../src/suite/agreement/AgreementDeliveryLib.sol";
import {KarwanCheckVerifier} from "../../../src/suite/KarwanCheckVerifier.sol";

contract AgreementCheckTest is AgreementFixture {
    KarwanCheckVerifier internal verifier;
    address[3] internal checkers;
    uint256[3] internal checkerKeys;

    function setUp() public {
        _deployAgreement();
        address[] memory list = new address[](3);
        for (uint256 i; i < 3; ++i) {
            (checkers[i], checkerKeys[i]) = makeAddrAndKey(string(abi.encodePacked("checker", vm.toString(i))));
        }
        // ascending order, so reports can list signers in order
        for (uint256 i; i < 3; ++i) {
            for (uint256 j = i + 1; j < 3; ++j) {
                if (checkers[j] < checkers[i]) {
                    (checkers[i], checkers[j]) = (checkers[j], checkers[i]);
                    (checkerKeys[i], checkerKeys[j]) = (checkerKeys[j], checkerKeys[i]);
                }
            }
        }
        for (uint256 i; i < 3; ++i) list[i] = checkers[i];
        verifier = new KarwanCheckVerifier(list, 2);
        hub.setVerifier(address(verifier), true);
    }

    function _checkedTerms() internal view returns (AgreementTerms memory t) {
        t = _terms();
        t.reviewStarts = 2;
        t.startLongstop = 4 days;
        t.verifier = address(verifier);
        t.checkPolicy = keccak256("policy:v1");
    }

    function _signed(bytes32 id, uint32 revision, bool pass, uint256 a, uint256 b)
        internal
        view
        returns (address[] memory who, bytes[] memory sigs)
    {
        bytes32 d = verifier.reportDigest(address(escrow), id, revision, pass, keccak256("evidence"));
        who = new address[](2);
        sigs = new bytes[](2);
        who[0] = checkers[a];
        who[1] = checkers[b];
        sigs[0] = _sig(checkerKeys[a], d);
        sigs[1] = _sig(checkerKeys[b], d);
    }

    function _report(bytes32 id, uint32 revision, bool pass, uint256 a, uint256 b) internal {
        (address[] memory who, bytes[] memory sigs) = _signed(id, revision, pass, a, b);
        verifier.report(address(escrow), id, revision, pass, keccak256("evidence"), who, sigs);
    }

    function test_a_late_pass_does_not_restart_the_review() public {
        bytes32 id = _fundAccepted(_checkedTerms(), bytes32("c"));
        _deliver(id);
        uint256 t0 = vm.getBlockTimestamp();
        vm.warp(t0 + 9 days);
        _report(id, 1, true, 0, 1);
        assertEq(escrow.reviewEndOf(id), uint64(t0 + 7 days));
        vm.prank(seller);
        escrow.claim(id);
        assertEq(uint8(_state(id)), uint8(AgreementState.Settled));
    }

    function test_a_fail_after_the_silence_longstop_cannot_block_the_claim() public {
        bytes32 id = _fundAccepted(_checkedTerms(), bytes32("c"));
        _deliver(id);
        vm.warp(vm.getBlockTimestamp() + 14 days);
        (address[] memory who, bytes[] memory sigs) = _signed(id, 1, false, 0, 1);
        vm.expectRevert(AgreementDeliveryLib.Late.selector);
        verifier.report(address(escrow), id, 1, false, keccak256("evidence"), who, sigs);
        vm.prank(seller);
        escrow.claim(id);
        assertEq(uint8(_state(id)), uint8(AgreementState.Settled));
    }

    function test_verifier_needs_a_sane_threshold() public {
        address[] memory list = new address[](2);
        list[0] = checkers[0];
        list[1] = checkers[1];
        vm.expectRevert(KarwanCheckVerifier.BadSigners.selector);
        new KarwanCheckVerifier(list, 3);
        vm.expectRevert(KarwanCheckVerifier.BadSigners.selector);
        new KarwanCheckVerifier(list, 0);
        list[1] = checkers[0];
        vm.expectRevert(KarwanCheckVerifier.BadSigners.selector);
        new KarwanCheckVerifier(list, 1);
    }

    function test_two_of_three_pass_starts_the_review() public {
        bytes32 id = _fundAccepted(_checkedTerms(), bytes32("c"));
        _deliver(id);
        _report(id, 1, true, 0, 2);
        assertTrue(_deal(id).checkPassed);
        assertEq(escrow.reviewEndOf(id), uint64(block.timestamp + 3 days));
        vm.warp(block.timestamp + 3 days);
        vm.prank(seller);
        escrow.claim(id);
    }

    function test_one_signature_is_not_enough() public {
        bytes32 id = _fundAccepted(_checkedTerms(), bytes32("c"));
        _deliver(id);
        bytes32 d = verifier.reportDigest(address(escrow), id, 1, true, bytes32(0));
        address[] memory who = new address[](1);
        bytes[] memory sigs = new bytes[](1);
        who[0] = checkers[0];
        sigs[0] = _sig(checkerKeys[0], d);
        vm.expectRevert(KarwanCheckVerifier.NotEnough.selector);
        verifier.report(address(escrow), id, 1, true, bytes32(0), who, sigs);
    }

    function test_the_same_checker_counts_once() public {
        bytes32 id = _fundAccepted(_checkedTerms(), bytes32("c"));
        _deliver(id);
        bytes32 d = verifier.reportDigest(address(escrow), id, 1, true, bytes32(0));
        address[] memory who = new address[](2);
        bytes[] memory sigs = new bytes[](2);
        who[0] = checkers[0];
        who[1] = checkers[0];
        sigs[0] = _sig(checkerKeys[0], d);
        sigs[1] = sigs[0];
        vm.expectRevert(KarwanCheckVerifier.BadSigners.selector);
        verifier.report(address(escrow), id, 1, true, bytes32(0), who, sigs);
    }

    function test_strangers_and_forged_signatures_are_refused() public {
        bytes32 id = _fundAccepted(_checkedTerms(), bytes32("c"));
        _deliver(id);
        (address eve, uint256 eveKey) = makeAddrAndKey("eve");
        bytes32 d = verifier.reportDigest(address(escrow), id, 1, true, bytes32(0));
        address[] memory who = new address[](2);
        bytes[] memory sigs = new bytes[](2);
        (who[0], who[1]) = eve < checkers[0] ? (eve, checkers[0]) : (checkers[0], eve);
        sigs[0] = who[0] == eve ? _sig(eveKey, d) : _sig(checkerKeys[0], d);
        sigs[1] = who[1] == eve ? _sig(eveKey, d) : _sig(checkerKeys[0], d);
        vm.expectRevert(KarwanCheckVerifier.BadSigners.selector);
        verifier.report(address(escrow), id, 1, true, bytes32(0), who, sigs);
    }

    function test_only_the_deals_verifier_reports() public {
        bytes32 id = _fundAccepted(_checkedTerms(), bytes32("c"));
        _deliver(id);
        vm.prank(guardian);
        vm.expectRevert(AgreementLib.BadCaller.selector);
        escrow.attestCheck(id, 1, true, bytes32(0));
    }

    function test_report_for_an_old_revision_is_refused() public {
        bytes32 id = _fundAccepted(_checkedTerms(), bytes32("c"));
        _deliver(id);
        _deliver(id);
        vm.expectRevert(AgreementDeliveryLib.HashMismatch.selector);
        this.reportExternal(id, 1);
    }

    function reportExternal(bytes32 id, uint32 revision) external {
        _report(id, revision, true, 0, 1);
    }

    function test_without_a_pass_the_seller_waits_for_the_silence_longstop() public {
        bytes32 id = _fundAccepted(_checkedTerms(), bytes32("c"));
        _deliver(id);
        uint256 t0 = vm.getBlockTimestamp();
        vm.warp(t0 + 7 days);
        vm.prank(seller);
        vm.expectRevert(AgreementDeliveryLib.Early.selector);
        escrow.claim(id);
        vm.warp(t0 + 14 days);
        vm.prank(seller);
        escrow.claim(id);
    }

    function test_a_failed_check_stops_timer_claims() public {
        bytes32 id = _fundAccepted(_checkedTerms(), bytes32("c"));
        _deliver(id);
        _report(id, 1, false, 0, 1);
        assertTrue(_deal(id).checkFailed);
        vm.warp(block.timestamp + 30 days);
        vm.prank(seller);
        vm.expectRevert(AgreementDeliveryLib.NotAllowed.selector);
        escrow.claim(id);
    }

    function test_failed_check_at_the_deadline_refunds_the_buyer() public {
        AgreementTerms memory t = _checkedTerms();
        bytes32 id = _fundAccepted(t, bytes32("c"));
        _deliver(id);
        _report(id, 1, false, 1, 2);
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(buyer);
        escrow.reclaim(id);
        assertEq(usdc.balanceOf(buyer), before + PRICE + 0.5e6);
        assertEq(uint8(_state(id)), uint8(AgreementState.Reclaimed));
    }

    function test_a_new_delivery_clears_the_failure_and_can_pass() public {
        bytes32 id = _fundAccepted(_checkedTerms(), bytes32("c"));
        _deliver(id);
        _report(id, 1, false, 0, 1);
        _deliver(id);
        assertFalse(_deal(id).checkFailed);
        _report(id, 2, true, 0, 1);
        assertTrue(_deal(id).checkPassed);
    }

    /// No checker can overturn another's result for the same delivery; a
    /// seller who disagrees delivers again or disputes.
    function test_the_first_result_for_a_delivery_is_final() public {
        bytes32 id = _fundAccepted(_checkedTerms(), bytes32("c"));
        _deliver(id);
        _report(id, 1, false, 0, 1);
        (address[] memory who, bytes[] memory sigs) = _signed(id, 1, true, 1, 2);
        vm.expectRevert(KarwanCheckVerifier.AlreadyReported.selector);
        verifier.report(address(escrow), id, 1, true, keccak256("evidence"), who, sigs);
        (who, sigs) = _signed(id, 1, false, 0, 1);
        vm.expectRevert(KarwanCheckVerifier.AlreadyReported.selector);
        verifier.report(address(escrow), id, 1, false, keccak256("evidence"), who, sigs);
        assertTrue(_deal(id).checkFailed);
        assertFalse(_deal(id).checkPassed);
    }

    function test_buyer_may_review_without_the_check() public {
        bytes32 id = _fundAccepted(_checkedTerms(), bytes32("c"));
        _deliver(id);
        vm.prank(buyer);
        escrow.startReview(id);
        assertTrue(_deal(id).checkPassed);
        vm.warp(block.timestamp + 3 days);
        vm.prank(seller);
        escrow.claim(id);
    }

    /// A report is announced, and its revision is marked under the ABI encoding
    /// of family, deal and revision, so anyone can check it was reported.
    function test_a_report_is_announced_and_marked_under_its_abi_key() public {
        bytes32 id = _fundAccepted(_checkedTerms(), bytes32("c"));
        _deliver(id);
        (address[] memory who, bytes[] memory sigs) = _signed(id, 1, true, 0, 2);
        vm.expectEmit(true, true, true, true, address(verifier));
        emit KarwanCheckVerifier.Reported(address(escrow), id, 1, true, keccak256("evidence"));
        verifier.report(address(escrow), id, 1, true, keccak256("evidence"), who, sigs);
        assertTrue(verifier.reported(keccak256(abi.encode(address(escrow), id, uint32(1)))));
    }

    function test_a_check_result_and_the_review_it_starts_are_announced() public {
        bytes32 id = _fundAccepted(_checkedTerms(), bytes32("c"));
        _deliver(id);
        (address[] memory who, bytes[] memory sigs) = _signed(id, 1, true, 0, 2);
        vm.expectEmit(address(escrow));
        emit AgreementLib.CheckReported(id, 1, true, keccak256("evidence"));
        vm.expectEmit(address(escrow));
        emit AgreementLib.ReviewStarted(id, 0, uint64(vm.getBlockTimestamp() + 3 days));
        verifier.report(address(escrow), id, 1, true, keccak256("evidence"), who, sigs);
    }
}
