// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementLib} from "../../../src/suite/agreement/AgreementLib.sol";
import {AgreementDeliveryLib} from "../../../src/suite/agreement/AgreementDeliveryLib.sol";

/// @notice Clocks that cannot be reopened, holds that stay with their
///         tranche, split offers that lapse, timeouts anyone can trigger, and
///         payouts that reach assignees and blocked parties correctly.
contract AgreementHardeningTest is AgreementFixture {
    address internal financier = makeAddr("financier");

    function setUp() public {
        _deployAgreement();
    }

    function _twoTranches() internal view returns (AgreementTerms memory t) {
        t = _terms();
        t.trancheBps[0] = 5_000;
        t.trancheBps[1] = 5_000;
    }

    function _assign(bytes32 id, uint128 amount) internal {
        vm.prank(seller);
        escrow.assignPayout(id, seller, financier, amount, 1, block.timestamp + 1 days, "");
    }

    function test_a_late_arrival_confirmation_does_not_reopen_the_review() public {
        AgreementTerms memory t = _terms();
        t.reviewStarts = 1;
        t.startLongstop = 5 days;
        bytes32 id = _fundAccepted(t, bytes32("h"));
        _deliver(id);
        uint256 t0 = vm.getBlockTimestamp();
        vm.warp(t0 + 8 days);
        vm.prank(buyer);
        escrow.startReview(id);
        assertEq(escrow.reviewEndOf(id), uint64(t0 + 8 days));
        vm.prank(buyer);
        vm.expectRevert(AgreementDeliveryLib.Late.selector);
        escrow.requestMoreTime(id);
        vm.prank(seller);
        escrow.claim(id);
        assertEq(usdc.balanceOf(seller), PRICE - 0.5e6);
    }

    function test_a_hold_delays_only_the_tranche_it_fell_in() public {
        bytes32 id = _fundAccepted(_twoTranches(), bytes32("h"));
        _deliver(id);
        uint256 t0 = vm.getBlockTimestamp();
        vm.startPrank(guardian);
        escrow.hold(id, bytes32("check"));
        escrow.releaseHold(id);
        vm.stopPrank();
        assertEq(escrow.reviewEndOf(id), uint64(t0 + 10 days));
        vm.warp(t0 + 10 days);
        vm.prank(seller);
        escrow.claim(id);
        _deliver(id);
        assertEq(escrow.reviewEndOf(id), uint64(t0 + 13 days));
    }

    function test_a_split_offer_lapses_once_a_tranche_is_paid() public {
        bytes32 id = _fundAccepted(_twoTranches(), bytes32("s"));
        vm.prank(buyer);
        escrow.proposeSplit(id, 5_000);
        _deliver(id);
        vm.warp(vm.getBlockTimestamp() + 3 days);
        vm.prank(seller);
        escrow.claim(id);
        vm.prank(seller);
        vm.expectRevert(AgreementLib.HashMismatch.selector);
        escrow.acceptSplit(id, 5_000);
    }

    function test_the_proposer_withdraws_a_split_offer() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("s"));
        vm.prank(buyer);
        escrow.proposeSplit(id, 5_000);
        vm.prank(seller);
        vm.expectRevert(AgreementLib.BadCaller.selector);
        escrow.cancelSplit(id);
        vm.prank(buyer);
        escrow.cancelSplit(id);
        vm.prank(seller);
        vm.expectRevert(AgreementLib.HashMismatch.selector);
        escrow.acceptSplit(id, 5_000);
    }

    function test_anyone_triggers_the_sellers_claim_once_the_review_ends() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("k"));
        _deliver(id);
        vm.prank(stranger);
        vm.expectRevert(AgreementDeliveryLib.Early.selector);
        escrow.claim(id);
        vm.warp(vm.getBlockTimestamp() + 3 days);
        vm.prank(stranger);
        escrow.claim(id);
        assertEq(usdc.balanceOf(seller), PRICE - 0.5e6);
        assertEq(usdc.balanceOf(stranger), 0);
    }

    function test_anyone_triggers_the_buyers_refund_after_the_deadline() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("k"));
        uint256 before = usdc.balanceOf(buyer);
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        vm.prank(stranger);
        escrow.reclaim(id);
        assertEq(usdc.balanceOf(buyer), before + PRICE + 0.5e6);
        assertEq(usdc.balanceOf(stranger), 0);
    }

    function test_the_assignee_is_paid_first_on_a_timer_claim() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("a"));
        _assign(id, 60e6);
        _deliver(id);
        vm.warp(vm.getBlockTimestamp() + 3 days);
        vm.prank(stranger);
        escrow.claim(id);
        assertEq(usdc.balanceOf(financier), 60e6);
        assertEq(usdc.balanceOf(seller), PRICE - 0.5e6 - 60e6);
    }

    function test_the_assignee_is_paid_first_on_a_split() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("a"));
        _assign(id, 60e6);
        vm.prank(buyer);
        escrow.proposeSplit(id, 5_000);
        vm.prank(seller);
        escrow.acceptSplit(id, 5_000);
        assertEq(usdc.balanceOf(financier), (uint256(PRICE - 0.5e6) * 5_000) / 10_000);
        assertEq(usdc.balanceOf(seller), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_the_assignee_is_paid_first_on_the_longstop() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("a"));
        _assign(id, 60e6);
        vm.warp(uint256(escrow.accountOf(id).horizon) + 180 days);
        uint256[] memory toPayees = new uint256[](1);
        toPayees[0] = 80e6;
        vm.prank(seniorSafe);
        escrow.longstopSplit(id, PRICE + 0.5e6 - 80e6, toPayees);
        assertEq(usdc.balanceOf(financier), 60e6);
        assertEq(usdc.balanceOf(seller), 20e6);
    }

    function test_a_blocked_buyer_is_owed_the_refund_at_the_deadline() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("b"));
        usdc.setBlocked(buyer, true);
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        vm.prank(stranger);
        escrow.reclaim(id);
        assertEq(escrow.owed(address(usdc), buyer), PRICE + 0.5e6);
        assertEq(usdc.balanceOf(address(escrow)), PRICE + 0.5e6);
        assertEq(uint8(_state(id)), uint8(AgreementState.Reclaimed));
    }

    function test_a_blocked_buyer_is_owed_a_cancelled_deal() public {
        bytes32 id = _fund(_terms(), bytes32("b"));
        usdc.setBlocked(buyer, true);
        vm.prank(buyer);
        escrow.cancelUnaccepted(id);
        assertEq(escrow.owed(address(usdc), buyer), PRICE + 0.5e6);
    }

    function test_a_blocked_fee_recipient_never_stops_the_sellers_claim() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("f"));
        _deliver(id);
        usdc.setBlocked(feeSafe, true);
        vm.warp(vm.getBlockTimestamp() + 3 days);
        vm.prank(seller);
        escrow.claim(id);
        assertEq(usdc.balanceOf(seller), PRICE - 0.5e6);
        assertEq(escrow.owed(address(usdc), feeSafe), 1e6);
    }
}
