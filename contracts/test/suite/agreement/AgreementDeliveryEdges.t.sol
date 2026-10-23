// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementDeliveryLib} from "../../../src/suite/agreement/AgreementDeliveryLib.sol";
import {AgreementLib} from "../../../src/suite/agreement/AgreementLib.sol";

/// @notice The delivery steps at their edges: which states take a delivery or
///         a review start, the late mark to the second, what a new delivery and
///         a paid tranche reset, clocks a guardian hold moves, and amounts far
///         beyond any cap the hub sets today.
contract AgreementDeliveryEdgesTest is AgreementFixture {
    function setUp() public {
        _deployAgreement();
    }

    function _arrival() internal view returns (AgreementTerms memory t) {
        t = _terms();
        t.reviewStarts = 1;
        t.startLongstop = 4 days;
    }

    function _twoTranches(AgreementTerms memory t) internal pure returns (AgreementTerms memory) {
        t.trancheBps[0] = 5_000;
        t.trancheBps[1] = 5_000;
        return t;
    }

    function test_a_deal_not_yet_accepted_takes_no_delivery() public {
        bytes32 id = _fund(_terms(), bytes32("d"));
        vm.prank(seller);
        vm.expectRevert(AgreementDeliveryLib.BadState.selector);
        escrow.markDelivered(id, keccak256("proof"));
    }

    function test_a_disputed_deal_takes_no_new_delivery_and_no_review_start() public {
        bytes32 id = _fundAccepted(_arrival(), bytes32("d"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        assertEq(uint8(_state(id)), uint8(AgreementState.Disputed));
        vm.prank(seller);
        vm.expectRevert(AgreementDeliveryLib.BadState.selector);
        escrow.markDelivered(id, keccak256("again"));
        vm.prank(buyer);
        vm.expectRevert(AgreementDeliveryLib.BadState.selector);
        escrow.startReview(id);
    }

    function test_nothing_can_be_reviewed_before_it_is_delivered() public {
        bytes32 id = _fundAccepted(_arrival(), bytes32("d"));
        vm.prank(buyer);
        vm.expectRevert(AgreementDeliveryLib.BadState.selector);
        escrow.startReview(id);
    }

    /// Before the deadline a delivery is on time, at the deadline too; after
    /// it, late, and still accepted up to the last second of the grace.
    function test_the_late_mark_follows_the_deadline_to_the_second() public {
        AgreementTerms memory t = _arrival();
        bytes32 id = _fundAccepted(t, bytes32("d"));
        uint256 deadline = _deal(id).deadline;
        vm.warp(deadline - 1);
        _deliver(id);
        assertFalse(_deal(id).lateMark);
        vm.warp(deadline);
        _deliver(id);
        assertFalse(_deal(id).lateMark);
        vm.warp(deadline + 1);
        _deliver(id);
        assertTrue(_deal(id).lateMark);
        vm.warp(deadline + t.reclaimGrace);
        _deliver(id);
        assertTrue(_deal(id).lateMark);
        assertEq(_deal(id).revision, 4);
    }

    function test_a_delivery_after_2106_keeps_its_time() public {
        vm.warp((uint256(1) << 32) + 1_000);
        bytes32 id = _fundAccepted(_terms(), bytes32("d"));
        _deliver(id);
        assertEq(_deal(id).deliveredAt, vm.getBlockTimestamp());
    }

    /// A new delivery starts its review over: no start, no end, no extension.
    function test_a_new_delivery_clears_the_review_and_its_extensions() public {
        bytes32 id = _fundAccepted(_arrival(), bytes32("d"));
        _deliver(id);
        vm.startPrank(buyer);
        escrow.startReview(id);
        escrow.requestMoreTime(id);
        vm.stopPrank();
        assertEq(_deal(id).extUsed, 1);
        assertGt(_deal(id).reviewEnd, 0);
        _deliver(id);
        assertEq(_deal(id).reviewStartAt, 0);
        assertEq(_deal(id).reviewEnd, 0);
        assertEq(_deal(id).extUsed, 0);
    }

    function test_confirming_arrival_never_marks_a_check_passed() public {
        bytes32 id = _fundAccepted(_arrival(), bytes32("d"));
        _deliver(id);
        vm.prank(buyer);
        escrow.startReview(id);
        assertFalse(_deal(id).checkPassed);
    }

    /// A guardian hold of 7 days moves the review clock: more time can still be
    /// asked a day after the review would have ended, and not after the hold.
    function test_a_hold_moves_the_last_moment_to_ask_for_more_time() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("d"));
        _deliver(id);
        vm.prank(guardian);
        escrow.hold(id, bytes32("scan"));
        uint256 end = _deal(id).reviewEnd;
        vm.warp(end + 1 days);
        vm.prank(buyer);
        escrow.requestMoreTime(id);
        vm.warp(_deal(id).reviewEnd + 7 days + 1);
        vm.prank(buyer);
        vm.expectRevert(AgreementDeliveryLib.Late.selector);
        escrow.requestMoreTime(id);
    }

    /// Delivered but not yet started, the review ends after the start
    /// longstop and the review window, plus any hold.
    function test_an_unstarted_review_ends_after_the_longstop_the_window_and_the_hold() public {
        AgreementTerms memory t = _arrival();
        bytes32 id = _fundAccepted(t, bytes32("d"));
        _deliver(id);
        vm.prank(guardian);
        escrow.hold(id, bytes32("scan"));
        assertEq(escrow.reviewEndOf(id), _deal(id).deliveredAt + t.startLongstop + t.reviewWindow + 7 days);
    }

    /// With the buyer releasing only the last tranche, earlier tranches still
    /// pay on the timer.
    function test_only_the_last_tranche_waits_for_the_buyer() public {
        AgreementTerms memory t = _twoTranches(_terms());
        t.finalRelease = 1;
        bytes32 id = _fundAccepted(t, bytes32("d"));
        _deliver(id);
        vm.warp(escrow.reviewEndOf(id));
        escrow.claim(id);
        assertEq(_deal(id).paid, 1);
        _deliver(id);
        vm.warp(escrow.reviewEndOf(id));
        vm.expectRevert(AgreementDeliveryLib.Early.selector);
        escrow.claim(id);
    }

    function test_a_deal_never_accepted_is_not_reclaimed_through_the_deadline_path() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fund(t, bytes32("d"));
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        vm.expectRevert(AgreementDeliveryLib.BadState.selector);
        escrow.reclaim(id);
    }

    function test_a_reclaimed_deal_pays_no_tranche() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("d"));
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        escrow.reclaim(id);
        vm.prank(buyer);
        vm.expectRevert(AgreementDeliveryLib.BadState.selector);
        escrow.release(id);
    }

    /// Tranche cuts of an amount near the top of its type are worked out and
    /// booked whole.
    function test_tranches_of_a_huge_amount_are_cut_and_booked_whole() public {
        hub.setAsset(address(usdc), true, 0);
        hub.setCaps(address(escrow), address(usdc), type(uint128).max, type(uint128).max);
        uint128 huge = uint128(1) << 125;
        usdc.mint(buyer, uint256(huge) * 2);
        AgreementTerms memory t = _twoTranches(_terms());
        t.amount = huge;
        bytes32 id = _fundAccepted(t, bytes32("d"));
        uint256 net = _deal(id).sellerNet;
        uint256 fee = _deal(id).feeTotal;
        assertGt(net, type(uint64).max);
        assertGt(fee, type(uint64).max);
        _deliver(id);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(_deal(id).released, (net * 5_000) / 10_000);
        assertEq(_deal(id).feeReleased, (fee * 5_000) / 10_000);
    }

    /// Paying a tranche starts the next one clean.
    function test_a_paid_tranche_leaves_the_next_one_clean() public {
        bytes32 id = _fundAccepted(_twoTranches(_arrival()), bytes32("d"));
        _deliver(id);
        vm.startPrank(buyer);
        escrow.startReview(id);
        escrow.requestMoreTime(id);
        escrow.release(id);
        vm.stopPrank();
        assertEq(_deal(id).paid, 1);
        assertEq(_deal(id).reviewStartAt, 0);
        assertEq(_deal(id).reviewEnd, 0);
        assertEq(_deal(id).extUsed, 0);
        assertEq(_deal(id).deliveredAt, 0);
    }

    // ----------------------------- Receivable -----------------------------

    function test_a_deal_that_does_not_exist_is_neither_open_nor_financeable() public view {
        assertFalse(escrow.receivableOf(bytes32("none")).open);
        assertFalse(escrow.receivableOf(bytes32("none")).financeable);
    }

    function test_a_disputed_deal_is_open_but_not_financeable() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("d"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        assertTrue(escrow.receivableOf(id).open);
        assertFalse(escrow.receivableOf(id).financeable);
    }

    function test_what_the_seller_is_still_owed_falls_by_each_paid_tranche() public {
        bytes32 id = _fundAccepted(_twoTranches(_terms()), bytes32("d"));
        _deliver(id);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(escrow.receivableOf(id).unpaid, _deal(id).sellerNet - _deal(id).released);
        assertGt(_deal(id).released, 0);
    }

    /// A claim on a disputed deal is refused as its state, before any clock.
    function test_a_claim_on_a_disputed_deal_is_refused_as_its_state() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("cd"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        vm.expectRevert(AgreementDeliveryLib.BadState.selector);
        escrow.claim(id);
    }

    /// A registered verifier that fails a delivery and then passes it leaves
    /// only the pass standing: the seller claims when the review ends.
    function test_a_pass_after_a_fail_on_the_same_delivery_clears_the_fail() public {
        address checker = makeAddr("other checker");
        hub.setVerifier(checker, true);
        AgreementTerms memory t = _terms();
        t.reviewStarts = 2;
        t.startLongstop = 4 days;
        t.silentLongstop = 20 days;
        t.verifier = checker;
        t.checkPolicy = keccak256("policy");
        bytes32 id = _fundAccepted(t, bytes32("pf"));
        _deliver(id);
        vm.startPrank(checker);
        escrow.attestCheck(id, 1, false, keccak256("fail"));
        escrow.attestCheck(id, 1, true, keccak256("pass"));
        vm.stopPrank();
        vm.warp(_deal(id).reviewEnd);
        vm.prank(seller);
        escrow.claim(id);
        assertEq(uint8(_deal(id).state), uint8(AgreementState.Settled));
    }

    function _checked(address checker, bytes32 salt) internal returns (bytes32 id) {
        hub.setVerifier(checker, true);
        AgreementTerms memory t = _terms();
        t.reviewStarts = 2;
        t.startLongstop = 4 days;
        t.silentLongstop = 20 days;
        t.verifier = checker;
        t.checkPolicy = keccak256("policy");
        id = _fundAccepted(t, salt);
        _deliver(id);
    }

    /// Once a delivery has passed its check, a later fail for it changes
    /// nothing: the seller claims when the review ends.
    function test_a_fail_after_a_pass_on_the_same_delivery_changes_nothing() public {
        address checker = makeAddr("other checker");
        bytes32 id = _checked(checker, bytes32("pf2"));
        vm.startPrank(checker);
        escrow.attestCheck(id, 1, true, keccak256("pass"));
        escrow.attestCheck(id, 1, false, keccak256("fail"));
        vm.stopPrank();
        vm.warp(_deal(id).reviewEnd);
        vm.prank(seller);
        escrow.claim(id);
        assertEq(uint8(_deal(id).state), uint8(AgreementState.Settled));
    }

    /// A failed check starts no review and announces none.
    function test_a_failed_check_announces_no_review() public {
        address checker = makeAddr("other checker");
        bytes32 id = _checked(checker, bytes32("nf"));
        vm.recordLogs();
        vm.prank(checker);
        escrow.attestCheck(id, 1, false, keccak256("fail"));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            assertTrue(logs[i].topics[0] != AgreementLib.ReviewStarted.selector);
        }
        assertEq(_deal(id).reviewStartAt, 0);
    }
}
