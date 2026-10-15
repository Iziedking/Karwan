// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementLib} from "../../../src/suite/agreement/AgreementLib.sol";
import {AgreementDeliveryLib} from "../../../src/suite/agreement/AgreementDeliveryLib.sol";
import {SettlementLib} from "../../../src/suite/settlement/SettlementLib.sol";
import {KarwanIdentityRegistry} from "../../../src/suite/KarwanIdentityRegistry.sol";

/// @notice Lay-by: the buyer pays in parts, the seller delivers once the last
///         part is in, and a missed part ends the plan on the agreed terms.
contract AgreementInstalmentsTest is AgreementFixture {
    uint256 internal constant PLAN_TOTAL = PRICE + 0.5e6;
    uint256 internal constant PART = PLAN_TOTAL / 4;

    function setUp() public {
        _deployAgreement();
    }

    /// Four weekly parts, a 10% cancellation fee, delivery due after the last.
    function _plan() internal view returns (AgreementTerms memory t) {
        t = _terms();
        t.parts = 4;
        t.partEvery = 7 days;
        t.cancelFeeBps = 1_000;
        t.deliveryDeadline = uint64(block.timestamp + 30 days);
    }

    function _payPart(bytes32 id) internal {
        vm.prank(buyer);
        escrow.payPart(id);
    }

    function test_funding_takes_only_the_first_part_and_counts_the_rest() public {
        uint256 before = usdc.balanceOf(buyer);
        bytes32 id = _fund(_plan(), bytes32("i"));
        assertEq(before - usdc.balanceOf(buyer), PART);
        assertEq(escrow.accountOf(id).promised, PLAN_TOTAL - PART);
        assertEq(escrow.promisedTotal(address(usdc)), PLAN_TOTAL - PART);
        assertEq(_deal(id).partsPaid, 1);
    }

    function test_the_last_part_pays_whatever_is_left() public {
        AgreementTerms memory t = _plan();
        t.parts = 7;
        t.deliveryDeadline = uint64(block.timestamp + 60 days);
        bytes32 id = _fundAccepted(t, bytes32("i"));
        for (uint256 i; i < 6; ++i) _payPart(id);
        assertEq(usdc.balanceOf(address(escrow)), PLAN_TOTAL);
        assertEq(escrow.accountOf(id).promised, 0);
        assertEq(escrow.promisedTotal(address(usdc)), 0);
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.payPart(id);
    }

    function test_the_seller_delivers_only_after_the_last_part() public {
        bytes32 id = _fundAccepted(_plan(), bytes32("i"));
        vm.prank(seller);
        vm.expectRevert(AgreementDeliveryLib.BadState.selector);
        escrow.markDelivered(id, bytes32(0));
        for (uint256 i; i < 3; ++i) _payPart(id);
        _deliver(id);
        vm.warp(vm.getBlockTimestamp() + 3 days);
        escrow.claim(id);
        assertEq(usdc.balanceOf(seller), PRICE - 0.5e6);
        assertEq(uint8(_state(id)), uint8(AgreementState.Settled));
    }

    function test_release_and_splits_wait_for_the_last_part() public {
        bytes32 id = _fundAccepted(_plan(), bytes32("i"));
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.release(id);
        vm.prank(buyer);
        vm.expectRevert(AgreementLib.BadState.selector);
        escrow.proposeSplit(id, 5_000);
    }

    function test_a_missed_part_ends_the_plan_with_the_agreed_fee() public {
        bytes32 id = _fundAccepted(_plan(), bytes32("i"));
        uint256 before = usdc.balanceOf(buyer);
        vm.warp(vm.getBlockTimestamp() + 7 days + 2 days);
        vm.expectRevert(AgreementLib.Early.selector);
        escrow.cancelMissed(id);
        vm.warp(vm.getBlockTimestamp() + 1);
        vm.prank(stranger);
        escrow.cancelMissed(id);
        assertEq(usdc.balanceOf(seller), 10e6);
        assertEq(usdc.balanceOf(buyer), before + PART - 10e6);
        assertEq(usdc.balanceOf(feeSafe), 0);
        assertEq(uint8(_state(id)), uint8(AgreementState.Refunded));
        assertEq(escrow.promisedTotal(address(usdc)), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_a_late_part_paid_before_anyone_cancels_keeps_the_plan() public {
        bytes32 id = _fundAccepted(_plan(), bytes32("i"));
        vm.warp(vm.getBlockTimestamp() + 8 days);
        _payPart(id);
        vm.expectRevert(AgreementLib.Early.selector);
        escrow.cancelMissed(id);
        assertEq(_deal(id).partsPaid, 2);
    }

    function test_a_plan_the_seller_never_accepted_refunds_in_full() public {
        bytes32 id = _fund(_plan(), bytes32("i"));
        uint256 before = usdc.balanceOf(buyer);
        vm.warp(vm.getBlockTimestamp() + 9 days + 1);
        escrow.cancelMissed(id);
        assertEq(usdc.balanceOf(seller), 0);
        assertEq(usdc.balanceOf(buyer), before + PART);
    }

    function test_the_fee_never_exceeds_what_was_paid() public {
        AgreementTerms memory t = _plan();
        t.parts = 12;
        t.cancelFeeBps = 2_000;
        t.deliveryDeadline = uint64(block.timestamp + 90 days);
        bytes32 id = _fundAccepted(t, bytes32("i"));
        uint256 paid = PLAN_TOTAL / 12;
        vm.warp(vm.getBlockTimestamp() + 9 days + 1);
        escrow.cancelMissed(id);
        assertEq(usdc.balanceOf(seller), paid);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_a_pause_never_refuses_a_promised_part() public {
        bytes32 id = _fundAccepted(_plan(), bytes32("i"));
        vm.prank(guardian);
        hub.pauseFamily(address(escrow));
        _payPart(id);
        assertEq(_deal(id).partsPaid, 2);
        vm.prank(buyer);
        vm.expectRevert(SettlementLib.NotOpen.selector);
        escrow.fund(bytes32("new"), _terms());
    }

    function test_promised_parts_keep_their_room_under_the_total_cap() public {
        hub.setCaps(address(escrow), address(usdc), 120e6, 150e6);
        bytes32 id = _fundAccepted(_plan(), bytes32("i"));
        vm.prank(buyer);
        vm.expectRevert(SettlementLib.OverCap.selector);
        escrow.fund(bytes32("second"), _terms());
        for (uint256 i; i < 3; ++i) _payPart(id);
        assertEq(usdc.balanceOf(address(escrow)), PLAN_TOTAL);
    }

    function test_a_revoked_family_takes_no_part_and_charges_no_fee() public {
        bytes32 id = _fundAccepted(_plan(), bytes32("i"));
        uint256 before = usdc.balanceOf(buyer);
        hub.revokeFamily(address(escrow));
        vm.prank(buyer);
        vm.expectRevert(SettlementLib.NotOpen.selector);
        escrow.payPart(id);
        vm.warp(vm.getBlockTimestamp() + 9 days + 1);
        escrow.cancelMissed(id);
        assertEq(usdc.balanceOf(seller), 0);
        assertEq(usdc.balanceOf(buyer), before + PART);
    }

    function test_cancelling_before_acceptance_frees_the_promise() public {
        bytes32 id = _fund(_plan(), bytes32("i"));
        vm.prank(buyer);
        escrow.cancelUnaccepted(id);
        assertEq(escrow.promisedTotal(address(usdc)), 0);
        assertEq(escrow.accountOf(id).promised, 0);
    }

    function test_only_the_buyer_pays_a_part() public {
        bytes32 id = _fundAccepted(_plan(), bytes32("i"));
        usdc.mint(stranger, 100e6);
        vm.startPrank(stranger);
        usdc.approve(address(escrow), type(uint256).max);
        vm.expectRevert(SettlementLib.NotParty.selector);
        escrow.payPart(id);
        vm.stopPrank();
    }

    function test_an_unfinished_plan_is_never_reclaimed_at_the_deadline() public {
        AgreementTerms memory t = _plan();
        bytes32 id = _fundAccepted(t, bytes32("i"));
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        vm.expectRevert(AgreementDeliveryLib.BadState.selector);
        escrow.reclaim(id);
        escrow.cancelMissed(id);
        assertEq(usdc.balanceOf(seller), 10e6);
    }

    function test_a_late_last_part_moves_the_delivery_deadline_by_its_lateness() public {
        AgreementTerms memory t = _plan();
        bytes32 id = _fundAccepted(t, bytes32("i"));
        uint256 t0 = vm.getBlockTimestamp();
        _payPart(id);
        _payPart(id);
        vm.warp(t0 + 21 days + 5 days);
        _payPart(id);
        assertEq(_deal(id).deadline, t.deliveryDeadline + 5 days);
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        _deliver(id);
        assertEq(uint8(_state(id)), uint8(AgreementState.Accepted));
    }

    function test_a_seller_cannot_accept_a_plan_already_in_default() public {
        AgreementTerms memory t = _plan();
        t.acceptBy = uint64(block.timestamp + 20 days);
        bytes32 id = _fund(t, bytes32("i"));
        vm.warp(vm.getBlockTimestamp() + 9 days + 1);
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(seller);
        vm.expectRevert(AgreementLib.Late.selector);
        escrow.accept(id, h);
        escrow.cancelMissed(id);
        assertEq(usdc.balanceOf(seller), 0);
    }

    function _agentFor(uint128 perPayment, uint128 total, uint64 expiry) internal returns (address agent) {
        uint256 agentKey;
        (agent, agentKey) = makeAddrAndKey("planAgent");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = identity.bindDigest(buyerId, agent, KarwanIdentityRegistry.Kind.Agent, expiry, perPayment, total, deadline);
        bytes memory sig = _sig(agentKey, d);
        vm.prank(buyer);
        identity.bind(agent, KarwanIdentityRegistry.Kind.Agent, expiry, perPayment, total, deadline, sig);
        usdc.mint(agent, 1_000e6);
        vm.prank(agent);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function test_an_agent_plan_counts_its_whole_price_against_the_limits_at_opening() public {
        address small = _agentFor(50e6, 80e6, uint64(block.timestamp + 60 days));
        vm.prank(small);
        vm.expectRevert(KarwanIdentityRegistry.OverLimit.selector);
        escrow.fund(bytes32("a"), _plan());
    }

    function test_an_agent_plan_keeps_its_parts_after_the_agent_expires() public {
        address agent = _agentFor(200e6, 200e6, uint64(block.timestamp + 10 days));
        AgreementTerms memory t = _plan();
        vm.prank(agent);
        bytes32 id = escrow.fund(bytes32("a"), t);
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(seller);
        escrow.accept(id, h);
        vm.prank(agent);
        escrow.payPart(id);
        vm.warp(vm.getBlockTimestamp() + 12 days);
        vm.startPrank(agent);
        escrow.payPart(id);
        escrow.payPart(id);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(escrow)), PLAN_TOTAL);
    }
}
