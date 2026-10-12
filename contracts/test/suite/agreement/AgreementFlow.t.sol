// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementLib} from "../../../src/suite/agreement/AgreementLib.sol";
import {AgreementDeliveryLib} from "../../../src/suite/agreement/AgreementDeliveryLib.sol";
import {KarwanSettlementBase} from "../../../src/suite/KarwanSettlementBase.sol";

contract AgreementFlowTest is AgreementFixture {
    function setUp() public {
        _deployAgreement();
    }

    function test_fund_takes_price_plus_half_the_fee() public {
        bytes32 id = _fund(_terms(), bytes32("a"));
        assertEq(usdc.balanceOf(address(escrow)), PRICE + 0.5e6);
        assertEq(_deal(id).sellerNet, PRICE - 0.5e6);
        assertEq(_deal(id).feeTotal, 1e6);
        assertEq(uint8(_state(id)), uint8(AgreementState.Funded));
    }

    function test_deal_id_is_bound_to_the_buyer() public {
        bytes32 id = _fund(_terms(), bytes32("a"));
        assertEq(id, escrow.dealIdFor(buyer, bytes32("a")));
        assertTrue(id != escrow.dealIdFor(stranger, bytes32("a")));
    }

    function test_only_the_seller_accepts_the_exact_terms_in_time() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fund(t, bytes32("a"));
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(stranger);
        vm.expectRevert(AgreementLib.BadCaller.selector);
        escrow.accept(id, h);
        vm.prank(seller);
        vm.expectRevert(AgreementLib.HashMismatch.selector);
        escrow.accept(id, keccak256("other"));
        vm.warp(t.acceptBy + 1);
        vm.prank(seller);
        vm.expectRevert(AgreementLib.Late.selector);
        escrow.accept(id, h);
    }

    function test_accepting_records_the_sellers_consent() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("a"));
        assertEq(escrow.accountOf(id).consentMask, 1);
        assertEq(uint8(_state(id)), uint8(AgreementState.Accepted));
    }

    function test_buyer_cancels_before_acceptance() public {
        bytes32 id = _fund(_terms(), bytes32("a"));
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(seller);
        vm.expectRevert(AgreementLib.BadCaller.selector);
        escrow.cancelUnaccepted(id);
        vm.prank(buyer);
        escrow.cancelUnaccepted(id);
        assertEq(usdc.balanceOf(buyer), before + PRICE + 0.5e6);
        assertEq(uint8(_state(id)), uint8(AgreementState.Refunded));
        assertTrue(record.outcomeRecorded(record.outcomeKey(address(escrow), id, buyerId, 0)));
        assertFalse(record.outcomeRecorded(record.outcomeKey(address(escrow), id, sellerId, 1)));
    }

    function test_no_cancel_after_acceptance() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("a"));
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.cancelUnaccepted(id);
    }

    function test_seller_claims_after_the_review_window() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("a"));
        _deliver(id);
        vm.prank(seller);
        vm.expectRevert(AgreementDeliveryLib.Early.selector);
        escrow.claim(id);
        vm.warp(block.timestamp + 3 days);
        vm.prank(seller);
        escrow.claim(id);
        assertEq(usdc.balanceOf(seller), PRICE - 0.5e6);
        assertEq(usdc.balanceOf(feeSafe), 1e6);
        assertEq(uint8(_state(id)), uint8(AgreementState.Settled));
        assertTrue(record.outcomeRecorded(record.outcomeKey(address(escrow), id, sellerId, 1)));
        assertTrue(record.outcomeRecorded(record.outcomeKey(address(escrow), id, buyerId, 0)));
    }

    function test_buyer_releases_at_any_time_while_the_deal_runs() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("a"));
        vm.prank(buyer);
        escrow.release(id);
        assertEq(usdc.balanceOf(seller), PRICE - 0.5e6);
        vm.prank(stranger);
        vm.expectRevert(AgreementLib.BadCaller.selector);
        escrow.release(id);
    }

    function test_three_tranches_pay_in_order_and_the_last_takes_the_rest() public {
        AgreementTerms memory t = _terms();
        t.trancheBps[0] = 3_333;
        t.trancheBps[1] = 3_333;
        t.trancheBps[2] = 3_334;
        bytes32 id = _fundAccepted(t, bytes32("a"));
        for (uint256 i; i < 3; ++i) {
            vm.prank(buyer);
            escrow.release(id);
        }
        assertEq(usdc.balanceOf(seller), PRICE - 0.5e6);
        assertEq(usdc.balanceOf(feeSafe), 1e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_final_release_by_buyer_waits_for_the_silence_longstop() public {
        AgreementTerms memory t = _terms();
        t.finalRelease = 1;
        bytes32 id = _fundAccepted(t, bytes32("a"));
        _deliver(id);
        uint256 t0 = vm.getBlockTimestamp();
        vm.warp(t0 + 3 days);
        vm.prank(seller);
        vm.expectRevert(AgreementDeliveryLib.Early.selector);
        escrow.claim(id);
        vm.warp(t0 + 14 days);
        vm.prank(seller);
        escrow.claim(id);
    }

    function test_arrival_review_starts_on_confirmation_or_the_longstop() public {
        AgreementTerms memory t = _terms();
        t.reviewStarts = 1;
        t.startLongstop = 5 days;
        bytes32 id = _fundAccepted(t, bytes32("a"));
        _deliver(id);
        uint256 t0 = vm.getBlockTimestamp();
        assertEq(escrow.reviewEndOf(id), uint64(t0 + 8 days));
        vm.warp(t0 + 1 days);
        vm.prank(buyer);
        escrow.startReview(id);
        assertEq(escrow.reviewEndOf(id), uint64(t0 + 4 days));
    }

    function test_buyer_cannot_start_review_on_delivery_terms() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("a"));
        _deliver(id);
        vm.prank(buyer);
        vm.expectRevert(AgreementDeliveryLib.BadState.selector);
        escrow.startReview(id);
    }

    function test_extensions_move_the_review_end_up_to_the_limit() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("a"));
        _deliver(id);
        vm.startPrank(buyer);
        escrow.requestMoreTime(id);
        escrow.requestMoreTime(id);
        vm.expectRevert(AgreementDeliveryLib.Exhausted.selector);
        escrow.requestMoreTime(id);
        vm.stopPrank();
        assertEq(escrow.reviewEndOf(id), uint64(block.timestamp + 5 days));
    }

    function test_hold_blocks_the_claim_and_extends_the_review() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("a"));
        _deliver(id);
        vm.prank(guardian);
        escrow.hold(id, bytes32("scan"));
        uint256 t0 = vm.getBlockTimestamp();
        assertEq(escrow.reviewEndOf(id), uint64(t0 + 10 days));
        vm.warp(t0 + 7 days);
        vm.prank(seller);
        vm.expectRevert(AgreementDeliveryLib.Early.selector);
        escrow.claim(id);
        vm.warp(t0 + 10 days);
        vm.prank(seller);
        escrow.claim(id);
    }

    function test_held_deal_refuses_the_claim_while_the_hold_runs() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("a"));
        _deliver(id);
        vm.warp(block.timestamp + 3 days);
        vm.prank(guardian);
        escrow.hold(id, bytes32("scan"));
        vm.prank(seller);
        vm.expectRevert(AgreementLib.OnHold.selector);
        escrow.claim(id);
        vm.prank(buyer);
        escrow.release(id);
    }

    function test_only_the_seller_marks_delivery() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("a"));
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.BadCaller.selector);
        escrow.markDelivered(id, bytes32(0));
    }

    function test_paused_family_keeps_every_exit() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("a"));
        _deliver(id);
        vm.prank(guardian);
        hub.pauseFamily(address(escrow));
        vm.prank(buyer);
        vm.expectRevert(KarwanSettlementBase.NotOpen.selector);
        escrow.fund(bytes32("b"), _terms());
        vm.warp(block.timestamp + 3 days);
        vm.prank(seller);
        escrow.claim(id);
        assertEq(uint8(_state(id)), uint8(AgreementState.Settled));
    }

    function test_longstop_ends_an_agreement_deal() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("a"));
        vm.warp(uint256(escrow.accountOf(id).horizon) + 180 days);
        uint256[] memory toPayees = new uint256[](1);
        toPayees[0] = 50e6;
        vm.prank(seniorSafe);
        escrow.longstopSplit(id, PRICE + 0.5e6 - 50e6, toPayees);
        assertEq(uint8(_state(id)), uint8(AgreementState.Longstopped));
        assertTrue(record.outcomeRecorded(record.outcomeKey(address(escrow), id, sellerId, 1)));
    }
}
