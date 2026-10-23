// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms, AgreementBounds} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementTermsLib} from "../../../src/suite/agreement/AgreementTermsLib.sol";
import {KarwanAgreementEscrow} from "../../../src/suite/KarwanAgreementEscrow.sol";

contract AgreementTermsTest is AgreementFixture {
    function setUp() public {
        _deployAgreement();
    }

    function _refused(AgreementTerms memory t) internal {
        vm.prank(buyer);
        vm.expectRevert(AgreementTermsLib.BadTerms.selector);
        escrow.fund(bytes32("t"), t);
    }

    function test_default_terms_fund() public {
        _fund(_terms(), bytes32("ok"));
    }

    function test_twelve_tranches_fund() public {
        AgreementTerms memory t = _terms();
        for (uint256 i; i < 12; ++i) t.trancheBps[i] = i < 11 ? 800 : 1_200;
        _fund(t, bytes32("twelve"));
        assertEq(escrow.getDeal(escrow.dealIdFor(buyer, bytes32("twelve"))).count, 12);
    }

    function test_tranches_must_sum_to_the_whole_without_gaps() public {
        AgreementTerms memory t = _terms();
        t.trancheBps[0] = 9_999;
        _refused(t);
        t = _terms();
        t.trancheBps[0] = 5_000;
        t.trancheBps[2] = 5_000;
        _refused(t);
    }

    function test_price_and_seller_are_required() public {
        AgreementTerms memory t = _terms();
        t.amount = 0;
        _refused(t);
    }

    function test_accept_by_must_be_ahead() public {
        AgreementTerms memory t = _terms();
        t.acceptBy = uint64(block.timestamp);
        _refused(t);
    }

    function test_review_window_within_bounds() public {
        AgreementTerms memory t = _terms();
        t.reviewWindow = 59 minutes;
        _refused(t);
        t.reviewWindow = 31 days;
        _refused(t);
    }

    function test_review_on_arrival_or_check_needs_a_longstop() public {
        AgreementTerms memory t = _terms();
        t.reviewStarts = 1;
        _refused(t);
    }

    function test_check_needs_a_verifier_and_a_policy_and_only_checks_have_one() public {
        AgreementTerms memory t = _terms();
        t.reviewStarts = 2;
        t.startLongstop = 2 days;
        _refused(t);
        t = _terms();
        t.verifier = makeAddr("verifier");
        _refused(t);
    }

    function test_unregistered_verifier_is_refused() public {
        AgreementTerms memory t = _terms();
        t.reviewStarts = 2;
        t.startLongstop = 2 days;
        t.verifier = makeAddr("unregistered");
        t.checkPolicy = keccak256("policy");
        vm.prank(buyer);
        vm.expectRevert(AgreementTermsLib.BadTerms.selector);
        escrow.fund(bytes32("v"), t);
    }

    function test_extensions_bounded() public {
        AgreementTerms memory t = _terms();
        t.extensionSecs = 4 days;
        _refused(t);
        t = _terms();
        t.maxExtensions = 4;
        _refused(t);
    }

    function test_silence_longstop_covers_review_and_extensions() public {
        AgreementTerms memory t = _terms();
        t.silentLongstop = 4 days;
        _refused(t);
    }

    function test_deadline_must_be_ahead() public {
        AgreementTerms memory t = _terms();
        t.deliveryDeadline = uint64(block.timestamp);
        _refused(t);
    }

    function test_agreement_hash_required_and_partial_below_whole() public {
        AgreementTerms memory t = _terms();
        t.agreementHash = bytes32(0);
        _refused(t);
        t = _terms();
        t.partialBps = 10_000;
        _refused(t);
    }

    function test_high_value_needs_buyer_final_release_and_a_check() public {
        hub.setAsset(address(usdc), true, 50e6);
        _refused(_terms());
    }

    function test_every_deal_needs_a_deadline() public {
        AgreementTerms memory t = _terms();
        t.deliveryDeadline = 0;
        _refused(t);
        t.silenceOutcome = 1;
        _refused(t);
    }

    function test_deadline_comes_after_the_accept_deadline() public {
        AgreementTerms memory t = _terms();
        t.deliveryDeadline = t.acceptBy;
        _refused(t);
    }

    function test_silence_longstop_covers_the_start_longstop_too() public {
        AgreementTerms memory t = _terms();
        t.reviewStarts = 1;
        t.startLongstop = 10 days;
        _refused(t);
    }

    function _plan() internal view returns (AgreementTerms memory t) {
        t = _terms();
        t.parts = 4;
        t.partEvery = 7 days;
        t.deliveryDeadline = uint64(block.timestamp + 30 days);
    }

    function test_instalments_need_two_to_twelve_parts_and_a_schedule() public {
        AgreementTerms memory t = _plan();
        t.parts = 1;
        _refused(t);
        t = _plan();
        t.parts = 13;
        t.deliveryDeadline = uint64(block.timestamp + 120 days);
        _refused(t);
        t = _plan();
        t.partEvery = 0;
        _refused(t);
    }

    function test_a_deposit_is_never_paid_in_parts() public {
        AgreementTerms memory t = _plan();
        t.silenceOutcome = 1;
        _refused(t);
    }

    function test_delivery_falls_due_after_the_last_part_and_its_grace() public {
        AgreementTerms memory t = _plan();
        t.deliveryDeadline = uint64(block.timestamp + 21 days + t.reclaimGrace);
        _refused(t);
    }

    function test_cancellation_fee_at_most_twenty_percent_and_only_on_a_plan() public {
        AgreementTerms memory t = _plan();
        t.cancelFeeBps = 2_001;
        _refused(t);
        t = _terms();
        t.cancelFeeBps = 1_000;
        _refused(t);
        t = _terms();
        t.partEvery = 7 days;
        _refused(t);
    }

    function test_fallback_share_at_most_the_whole() public {
        AgreementTerms memory t = _terms();
        t.fallbackBps = 10_001;
        _refused(t);
    }

    function _badBounds(AgreementBounds memory b) internal {
        vm.expectRevert(KarwanAgreementEscrow.BadBounds.selector);
        new KarwanAgreementEscrow(address(hub), b);
    }

    function test_the_escrow_refuses_review_bounds_that_leave_no_window() public {
        _badBounds(AgreementBounds(0, 30 days, 365 days));
        _badBounds(AgreementBounds(30 days, 30 days, 365 days));
        _badBounds(AgreementBounds(31 days, 30 days, 365 days));
    }

    function test_the_escrow_refuses_a_horizon_of_zero_or_past_the_base_limit() public {
        uint64 limit = escrow.MAX_HORIZON();
        _badBounds(AgreementBounds(1 hours, 30 days, 0));
        _badBounds(AgreementBounds(1 hours, 30 days, limit + 1));
        KarwanAgreementEscrow edge = new KarwanAgreementEscrow(address(hub), AgreementBounds(1 hours, 30 days, limit));
        assertEq(edge.maxHorizon(), limit);
    }

    /// The family's own minimum refuses a short review, with no extension
    /// rule in the way, and the minimum itself is accepted.
    function test_the_minimum_review_is_the_familys_own_bound() public {
        assertEq(escrow.minReview(), 1 hours);
        AgreementTerms memory t = _terms();
        t.maxExtensions = 0;
        t.extensionSecs = 0;
        t.reviewWindow = 1 hours - 1;
        _refused(t);
        t.reviewWindow = 1 hours;
        vm.prank(buyer);
        escrow.fund(bytes32("at-the-minimum"), t);
    }

    // ------------------------------ Boundaries ----------------------------

    /// A realistic clock, so a bound written as `now + limit` cannot pass for
    /// `now * limit`. The escrow's bounds: review 1 hour to 30 days, horizon
    /// 365 days.
    uint256 internal constant NOW = 1_800_000_000;
    uint256 internal salt;

    function _ok(AgreementTerms memory t) internal {
        vm.prank(buyer);
        escrow.fund(bytes32(++salt), t);
    }

    function _at() internal returns (AgreementTerms memory t) {
        vm.warp(NOW);
        t = _terms();
    }

    function test_a_tranche_after_a_gap_is_refused_even_when_the_first_make_the_whole() public {
        AgreementTerms memory t = _at();
        t.trancheBps[2] = 1;
        _refused(t);
    }

    function test_tranches_adding_up_to_more_than_the_whole_are_refused() public {
        AgreementTerms memory t = _at();
        t.trancheBps[0] = 6_000;
        t.trancheBps[1] = 6_000;
        _refused(t);
    }

    function test_an_accept_deadline_already_past_is_refused() public {
        AgreementTerms memory t = _at();
        t.acceptBy = uint64(NOW - 1);
        _refused(t);
    }

    function test_the_review_window_takes_its_bounds_and_nothing_outside_them() public {
        AgreementTerms memory t = _at();
        t.extensionSecs = 1 hours;
        t.reviewWindow = 1 hours;
        _ok(t);
        t.reviewWindow = 1 hours - 1;
        t.extensionSecs = 1 hours - 1;
        _refused(t);
        t = _at();
        t.reviewWindow = 30 days;
        t.silentLongstop = 40 days;
        _ok(t);
        t.reviewWindow = 30 days + 1;
        _refused(t);
    }

    /// Each policy code is checked on its own; the deal is otherwise valid.
    function test_each_policy_code_is_bounded_on_its_own() public {
        AgreementTerms memory t = _at();
        t.startLongstop = 1 days;
        t.reviewStarts = 3;
        _refused(t);
        t = _at();
        t.finalRelease = 2;
        _refused(t);
        t = _at();
        t.silenceOutcome = 2;
        _refused(t);
        t = _at();
        t.maxExtensions = 4;
        t.silentLongstop = 30 days;
        _refused(t);
        t.maxExtensions = 3;
        _ok(t);
    }

    function test_a_checked_deal_needs_both_a_verifier_and_a_policy() public {
        AgreementTerms memory t = _at();
        t.reviewStarts = 2;
        t.startLongstop = 4 days;
        t.verifier = makeAddr("verifier");
        _refused(t);
        t.verifier = address(0);
        t.checkPolicy = keccak256("policy");
        _refused(t);
    }

    function test_a_deal_reviewed_without_a_check_names_no_verifier() public {
        AgreementTerms memory t = _at();
        t.verifier = makeAddr("verifier");
        _refused(t);
    }

    function test_extensions_and_the_reclaim_grace_take_their_bounds() public {
        AgreementTerms memory t = _at();
        t.extensionSecs = 3 days;
        _ok(t);
        t = _at();
        t.reclaimGrace = 30 days;
        _ok(t);
        t.reclaimGrace = 30 days + 1;
        _refused(t);
    }

    /// The silence longstop must cover the review and every extension, to the
    /// second, and stay inside the horizon.
    function test_the_silence_longstop_covers_review_and_extensions_to_the_second() public {
        AgreementTerms memory t = _at();
        t.silentLongstop = 3 days + 2 * 1 days;
        _ok(t);
        t.silentLongstop = 3 days + 2 * 1 days - 1;
        _refused(t);
        t = _at();
        t.silentLongstop = 365 days;
        _ok(t);
        t.silentLongstop = 365 days + 1;
        _refused(t);
    }

    function test_the_delivery_deadline_may_fall_on_the_horizon_and_no_later() public {
        AgreementTerms memory t = _at();
        t.deliveryDeadline = uint64(NOW + 365 days);
        _ok(t);
        t.deliveryDeadline = uint64(NOW + 365 days + 1);
        _refused(t);
    }

    function test_a_partial_share_above_the_whole_is_refused() public {
        AgreementTerms memory t = _at();
        t.partialBps = 10_001;
        _refused(t);
    }

    /// At exactly the high-value line, a deal needs the buyer to release the
    /// last part and a check to start the review; with no line, any deal funds.
    function test_the_high_value_line_applies_from_the_line_itself() public {
        AgreementTerms memory t = _at();
        hub.setAsset(address(usdc), true, PRICE);
        _refused(t);
        t.finalRelease = 1;
        t.reviewStarts = 1;
        t.startLongstop = 4 days;
        _refused(t);
        t = _at();
        t.reviewStarts = 2;
        t.startLongstop = 4 days;
        t.verifier = makeAddr("verifier");
        t.checkPolicy = keccak256("policy");
        _refused(t);
        hub.setAsset(address(usdc), true, 0);
        _ok(_at());
    }

    function test_a_plan_whose_deadline_falls_inside_its_schedule_is_refused() public {
        vm.warp(NOW);
        AgreementTerms memory t = _plan();
        t.deliveryDeadline = uint64(NOW + uint256(t.parts - 1) * t.partEvery + t.reclaimGrace - 1);
        _refused(t);
    }
}
