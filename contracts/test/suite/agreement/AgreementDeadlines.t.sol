// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementLib} from "../../../src/suite/agreement/AgreementLib.sol";
import {AgreementDeliveryLib} from "../../../src/suite/agreement/AgreementDeliveryLib.sol";

contract AgreementDeadlinesTest is AgreementFixture {
    function setUp() public {
        _deployAgreement();
    }

    function test_reclaim_waits_for_deadline_and_grace() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("d"));
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace);
        vm.prank(buyer);
        vm.expectRevert(AgreementDeliveryLib.Early.selector);
        escrow.reclaim(id);
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(buyer);
        escrow.reclaim(id);
        assertEq(usdc.balanceOf(buyer), before + PRICE + 0.5e6);
        assertEq(uint8(_state(id)), uint8(AgreementState.Reclaimed));
        assertTrue(record.outcomeRecorded(record.outcomeKey(address(escrow), id, sellerId, 1)));
    }

    function test_a_pending_delivery_blocks_reclaim() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("d"));
        _deliver(id);
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        vm.prank(buyer);
        vm.expectRevert(AgreementDeliveryLib.NotAllowed.selector);
        escrow.reclaim(id);
    }

    function test_no_delivery_after_deadline_and_grace() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("d"));
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        vm.prank(seller);
        vm.expectRevert(AgreementDeliveryLib.Late.selector);
        escrow.markDelivered(id, bytes32(0));
    }

    function test_deposit_comes_back_at_the_deadline_and_the_seller_cannot_claim() public {
        AgreementTerms memory t = _terms();
        t.silenceOutcome = 1;
        bytes32 id = _fundAccepted(t, bytes32("d"));
        _deliver(id);
        vm.warp(block.timestamp + 20 days);
        vm.prank(seller);
        vm.expectRevert(AgreementDeliveryLib.NotAllowed.selector);
        escrow.claim(id);
        vm.prank(buyer);
        escrow.reclaim(id);
        assertEq(uint8(_state(id)), uint8(AgreementState.Reclaimed));
    }

    function test_buyer_moves_the_deadline_only_later() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("d"));
        vm.startPrank(buyer);
        vm.expectRevert(AgreementLib.BadTerms.selector);
        escrow.extendDeadline(id, t.deliveryDeadline);
        escrow.extendDeadline(id, t.deliveryDeadline + 5 days);
        vm.stopPrank();
        assertEq(_deal(id).deadline, t.deliveryDeadline + 5 days);
        vm.prank(seller);
        vm.expectRevert(AgreementLib.BadCaller.selector);
        escrow.extendDeadline(id, t.deliveryDeadline + 6 days);
    }

    function test_seller_asks_for_more_time_and_the_buyer_grants_it() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("d"));
        uint64 later = t.deliveryDeadline + 3 days;
        vm.prank(seller);
        escrow.requestExtension(id, later);
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.HashMismatch.selector);
        escrow.approveExtension(id, later + 1);
        vm.prank(buyer);
        escrow.approveExtension(id, later);
        assertEq(_deal(id).deadline, later);
    }

    function test_three_extension_requests_at_most() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("d"));
        vm.startPrank(seller);
        escrow.requestExtension(id, t.deliveryDeadline + 1 days);
        escrow.requestExtension(id, t.deliveryDeadline + 2 days);
        escrow.requestExtension(id, t.deliveryDeadline + 3 days);
        vm.expectRevert(AgreementLib.Late.selector);
        escrow.requestExtension(id, t.deliveryDeadline + 4 days);
        vm.stopPrank();
    }

    function test_moving_the_deadline_moves_the_longstop() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("d"));
        uint64 h = escrow.accountOf(id).horizon;
        vm.prank(buyer);
        escrow.extendDeadline(id, t.deliveryDeadline + 30 days);
        assertEq(escrow.accountOf(id).horizon, h + 30 days);
    }

    function test_no_extension_request_before_the_seller_accepts() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fund(t, bytes32("d"));
        vm.prank(seller);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.requestExtension(id, t.deliveryDeadline + 1 days);
    }

    function test_an_extension_request_must_move_the_deadline_later() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("d"));
        vm.prank(seller);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.requestExtension(id, t.deliveryDeadline);
        assertEq(_deal(id).requestedDeadline, 0);
    }

    function test_the_buyer_cannot_move_the_deadline_before_the_seller_accepts() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fund(t, bytes32("d"));
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.extendDeadline(id, t.deliveryDeadline + 1 days);
    }

    function test_an_approved_extension_waits_while_the_deal_is_disputed() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("d"));
        uint64 later = t.deliveryDeadline + 3 days;
        vm.prank(seller);
        escrow.requestExtension(id, later);
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, bytes32("clause"));
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.approveExtension(id, later);
        assertEq(_deal(id).deadline, t.deliveryDeadline);
        assertEq(_deal(id).requestedDeadline, later);
    }
}
