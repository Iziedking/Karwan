// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementDisputeLib} from "../../../src/suite/agreement/AgreementDisputeLib.sol";
import {AgreementCommon} from "../../../src/suite/agreement/AgreementCommon.sol";
import {AgreementDeliveryLib} from "../../../src/suite/agreement/AgreementDeliveryLib.sol";
import {DisputeLib} from "../../../src/suite/dispute/DisputeLib.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {Outcome} from "../../../src/suite/interfaces/IKarwanSuite.sol";

contract AgreementDisputeTest is AgreementFixture {
    uint256 internal constant NET = PRICE - 0.5e6;
    uint256 internal constant FEE = 1e6;

    function setUp() public {
        _deployAgreement();
    }

    function _disputed(AgreementTerms memory t, bytes32 salt) internal returns (bytes32 id) {
        id = _fundAccepted(t, salt);
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause 2"));
    }

    function _twoTranches() internal view returns (AgreementTerms memory t) {
        t = _terms();
        t.trancheBps[0] = 5_000;
        t.trancheBps[1] = 5_000;
    }

    // ------------------------------ Opening -------------------------------

    function test_a_dispute_stops_both_clocks() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _disputed(t, bytes32("d"));
        assertEq(uint8(_state(id)), uint8(AgreementState.Disputed));
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        vm.expectRevert(AgreementDeliveryLib.BadState.selector);
        escrow.claim(id);
        vm.expectRevert(AgreementDeliveryLib.BadState.selector);
        escrow.reclaim(id);
    }

    function test_buyer_cannot_dispute_once_the_seller_can_claim() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("d"));
        _deliver(id);
        vm.warp(vm.getBlockTimestamp() + 3 days);
        vm.prank(buyer);
        vm.expectRevert(AgreementDisputeLib.Late.selector);
        escrow.dispute(id, bytes32("late"));
    }

    function test_a_dispute_needs_a_delivery_and_a_party() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("d"));
        vm.prank(buyer);
        vm.expectRevert(AgreementDisputeLib.BadState.selector);
        escrow.dispute(id, bytes32("c"));
        _deliver(id);
        vm.prank(stranger);
        vm.expectRevert(AgreementDisputeLib.BadCaller.selector);
        escrow.dispute(id, bytes32("c"));
    }

    function test_one_dispute_at_a_time() public {
        bytes32 id = _disputed(_terms(), bytes32("d"));
        vm.prank(seller);
        vm.expectRevert(AgreementDisputeLib.BadState.selector);
        escrow.dispute(id, bytes32("c"));
    }

    function test_seller_disputes_a_deposit_only_before_the_buyer_can_reclaim() public {
        AgreementTerms memory t = _terms();
        t.silenceOutcome = 1;
        bytes32 id = _fundAccepted(t, bytes32("d1"));
        _deliver(id);
        vm.prank(seller);
        escrow.dispute(id, bytes32("buyer silent"));
        assertEq(uint8(_state(id)), uint8(AgreementState.Disputed));
        bytes32 late = _fundAccepted(t, bytes32("d2"));
        _deliver(late);
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        vm.prank(seller);
        vm.expectRevert(AgreementDisputeLib.Late.selector);
        escrow.dispute(late, bytes32("too late"));
    }

    // ------------------------------ Proposals -----------------------------

    function test_an_unappealed_proposal_applies_after_72_hours() public {
        bytes32 id = _disputed(_terms(), bytes32("d"));
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(arbiter);
        escrow.proposeRuling(id, 0, keccak256("no delivery"));
        vm.warp(vm.getBlockTimestamp() + 72 hours - 1);
        vm.expectRevert(DisputeLib.Early.selector);
        escrow.executeRuling(id);
        vm.warp(vm.getBlockTimestamp() + 1);
        vm.prank(stranger);
        escrow.executeRuling(id);
        assertEq(usdc.balanceOf(buyer), before + PRICE + 0.5e6);
        assertEq(usdc.balanceOf(seller), 0);
        assertEq(usdc.balanceOf(feeSafe), 0);
        assertEq(uint8(_state(id)), uint8(AgreementState.Ruled));
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_the_arbiter_proposes_only_what_the_terms_allow() public {
        bytes32 id = _disputed(_terms(), bytes32("d"));
        vm.prank(arbiter);
        vm.expectRevert(DisputeLib.BadOutcome.selector);
        escrow.proposeRuling(id, 3_000, bytes32(0));
        AgreementTerms memory t = _terms();
        t.partialBps = 3_000;
        bytes32 withPartial = _disputed(t, bytes32("p"));
        vm.prank(arbiter);
        escrow.proposeRuling(withPartial, 3_000, bytes32(0));
        vm.prank(arbiter);
        vm.expectRevert(DisputeLib.NotAllowed.selector);
        escrow.proposeRuling(withPartial, 10_000, bytes32(0));
        vm.prank(stranger);
        vm.expectRevert(DisputeLib.NotArbiter.selector);
        escrow.proposeRuling(id, 10_000, bytes32(0));
    }

    // ------------------------------ Escalation ----------------------------

    function test_a_party_appeals_in_time_and_the_reviewer_rules() public {
        bytes32 id = _disputed(_terms(), bytes32("d"));
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(arbiter);
        escrow.proposeRuling(id, 0, bytes32(0));
        vm.prank(stranger);
        vm.expectRevert(DisputeLib.NotAllowed.selector);
        escrow.escalate(id);
        vm.prank(seller);
        escrow.escalate(id);
        vm.warp(vm.getBlockTimestamp() + 72 hours);
        vm.expectRevert(DisputeLib.NotAllowed.selector);
        escrow.executeRuling(id);
        vm.expectEmit(address(record));
        emit KarwanRecord.OutcomeRecorded(address(escrow), id, sellerId, 1, Outcome.RULED, 1, 7_000);
        vm.prank(reviewSafe);
        escrow.rule(id, 7_000, keccak256("ruling"));
        uint256 toSeller = (NET * 7_000) / 10_000;
        uint256 feeCut = (FEE * 7_000) / 10_000;
        assertEq(usdc.balanceOf(seller), toSeller);
        assertEq(usdc.balanceOf(feeSafe), feeCut);
        assertEq(usdc.balanceOf(buyer), before + (NET - toSeller) + (FEE - feeCut));
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_an_appeal_after_the_window_is_refused() public {
        bytes32 id = _disputed(_terms(), bytes32("d"));
        vm.prank(arbiter);
        escrow.proposeRuling(id, 0, bytes32(0));
        vm.warp(vm.getBlockTimestamp() + 72 hours);
        vm.prank(seller);
        vm.expectRevert(DisputeLib.Late.selector);
        escrow.escalate(id);
    }

    function test_a_silent_arbiter_lets_anyone_escalate_after_five_days() public {
        bytes32 id = _disputed(_terms(), bytes32("d"));
        vm.warp(vm.getBlockTimestamp() + 5 days - 1);
        vm.prank(stranger);
        vm.expectRevert(DisputeLib.Early.selector);
        escrow.escalate(id);
        vm.warp(vm.getBlockTimestamp() + 1);
        vm.prank(stranger);
        escrow.escalate(id);
        assertTrue(escrow.disputeOf(id).escalated);
    }

    function test_the_arbiter_hands_a_dispute_to_the_reviewer() public {
        bytes32 id = _disputed(_terms(), bytes32("d"));
        vm.prank(arbiter);
        escrow.escalate(id);
        vm.prank(reviewSafe);
        escrow.rule(id, 10_000, bytes32(0));
        assertEq(usdc.balanceOf(seller), NET);
    }

    function test_the_fallback_applies_when_the_reviewer_misses_the_deadline() public {
        AgreementTerms memory t = _terms();
        t.fallbackBps = 5_000;
        bytes32 id = _disputed(t, bytes32("d"));
        vm.prank(arbiter);
        escrow.escalate(id);
        vm.warp(vm.getBlockTimestamp() + 5 days - 1);
        vm.expectRevert(DisputeLib.Early.selector);
        escrow.applyFallback(id);
        vm.warp(vm.getBlockTimestamp() + 1);
        vm.prank(reviewSafe);
        vm.expectRevert(DisputeLib.Late.selector);
        escrow.rule(id, 10_000, bytes32(0));
        vm.prank(stranger);
        escrow.applyFallback(id);
        assertEq(usdc.balanceOf(seller), NET / 2);
        assertEq(uint8(_state(id)), uint8(AgreementState.Ruled));
    }

    // ------------------------------ The panel -----------------------------

    function test_only_the_reviewer_fixed_at_opening_rules() public {
        bytes32 id = _disputed(_terms(), bytes32("d"));
        address newReview = makeAddr("newReview");
        hub.setReviewers(newReview, makeAddr("newSenior"));
        hub.setAutoArbiter(makeAddr("newArbiter"));
        vm.prank(arbiter);
        escrow.escalate(id);
        vm.prank(newReview);
        vm.expectRevert(DisputeLib.NotReviewer.selector);
        escrow.rule(id, 10_000, bytes32(0));
        vm.prank(reviewSafe);
        escrow.rule(id, 10_000, bytes32(0));
        assertEq(usdc.balanceOf(seller), NET);
    }

    function test_high_value_deals_go_to_the_senior_safe() public {
        address checker = makeAddr("checkVerifier");
        hub.setVerifier(checker, true);
        hub.setAsset(address(usdc), true, 50e6);
        AgreementTerms memory t = _terms();
        t.finalRelease = 1;
        t.reviewStarts = 2;
        t.startLongstop = 2 days;
        t.verifier = checker;
        t.checkPolicy = keccak256("policy");
        bytes32 id = _fundAccepted(t, bytes32("h"));
        assertEq(escrow.panelOf(id).reviewer, seniorSafe);
        AgreementTerms memory s = _terms();
        s.amount = 10e6;
        bytes32 small = _fundAccepted(s, bytes32("s"));
        assertEq(escrow.panelOf(small).reviewer, reviewSafe);
    }

    function test_without_an_arbiter_disputes_go_straight_to_the_reviewer() public {
        hub.setAutoArbiter(address(0));
        bytes32 id = _disputed(_terms(), bytes32("d"));
        assertTrue(escrow.disputeOf(id).escalated);
        vm.prank(reviewSafe);
        escrow.rule(id, 0, bytes32(0));
        assertEq(uint8(_state(id)), uint8(AgreementState.Ruled));
    }

    // --------------------------- How disputes end -------------------------

    function test_a_ruling_on_one_tranche_lets_the_rest_carry_on() public {
        AgreementTerms memory t = _twoTranches();
        bytes32 id = _disputed(t, bytes32("d"));
        uint256 opened = vm.getBlockTimestamp();
        vm.prank(arbiter);
        escrow.proposeRuling(id, 10_000, bytes32(0));
        vm.warp(opened + 72 hours);
        escrow.executeRuling(id);
        assertEq(usdc.balanceOf(seller), NET / 2);
        assertEq(uint8(_state(id)), uint8(AgreementState.Accepted));
        assertEq(_deal(id).paid, 1);
        assertEq(_deal(id).deadline, t.deliveryDeadline + 72 hours);
        _deliver(id);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(usdc.balanceOf(seller), NET);
        assertEq(uint8(_state(id)), uint8(AgreementState.Settled));
    }

    function test_the_buyer_releasing_ends_a_dispute() public {
        bytes32 id = _disputed(_terms(), bytes32("d"));
        vm.prank(buyer);
        escrow.release(id);
        assertEq(usdc.balanceOf(seller), NET);
        assertEq(escrow.disputeOf(id).openedAt, 0);
        vm.prank(arbiter);
        vm.expectRevert(AgreementDisputeLib.BadState.selector);
        escrow.proposeRuling(id, 0, bytes32(0));
    }

    function test_the_buyer_can_release_during_a_dispute_long_after_every_clock() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("d"));
        _deliver(id);
        vm.warp(vm.getBlockTimestamp() + 27 days);
        vm.prank(seller);
        escrow.dispute(id, bytes32("unpaid"));
        vm.prank(buyer);
        escrow.release(id);
        assertEq(usdc.balanceOf(seller), NET);
    }

    function test_an_agreed_split_ends_a_dispute() public {
        bytes32 id = _disputed(_terms(), bytes32("d"));
        vm.prank(seller);
        escrow.proposeSplit(id, 6_000);
        vm.prank(buyer);
        escrow.acceptSplit(id, 6_000);
        assertEq(usdc.balanceOf(seller), (NET * 6_000) / 10_000);
        assertEq(escrow.disputeOf(id).openedAt, 0);
        assertEq(uint8(_state(id)), uint8(AgreementState.Split));
    }

    function test_a_hold_delays_automatic_rulings_but_not_the_reviewer() public {
        AgreementTerms memory t = _terms();
        t.fallbackBps = 10_000;
        bytes32 id = _disputed(t, bytes32("d"));
        bytes32 other = _disputed(t, bytes32("e"));
        vm.prank(arbiter);
        escrow.proposeRuling(id, 10_000, bytes32(0));
        vm.warp(vm.getBlockTimestamp() + 72 hours);
        vm.prank(guardian);
        escrow.hold(id, bytes32("fraud"));
        vm.expectRevert(AgreementCommon.OnHold.selector);
        escrow.executeRuling(id);
        vm.prank(arbiter);
        escrow.escalate(other);
        vm.prank(guardian);
        escrow.hold(other, bytes32("fraud"));
        vm.prank(reviewSafe);
        escrow.rule(other, 0, bytes32(0));
        assertEq(uint8(_state(other)), uint8(AgreementState.Ruled));
    }

    function test_nothing_runs_after_the_longstop_closed_the_deal() public {
        bytes32 id = _disputed(_terms(), bytes32("d"));
        vm.prank(arbiter);
        escrow.proposeRuling(id, 10_000, bytes32(0));
        vm.warp(uint256(escrow.accountOf(id).horizon) + 180 days);
        uint256[] memory toPayees = new uint256[](1);
        toPayees[0] = NET;
        vm.prank(seniorSafe);
        escrow.longstopSplit(id, PRICE + 0.5e6 - NET, toPayees);
        vm.expectRevert(AgreementDisputeLib.BadState.selector);
        escrow.executeRuling(id);
        assertTrue(escrow.accountOf(id).closed);
        assertEq(uint8(_state(id)), uint8(AgreementState.Longstopped));
        assertEq(escrow.disputeOf(id).openedAt, 0);
    }
}
