// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanDealEscrow} from "../src/KarwanDealEscrow.sol";
import {DealTerms, DealState} from "../src/KarwanDealTypes.sol";
import {KarwanStakeVault} from "../src/KarwanStakeVault.sol";
import {BlockUSDC} from "./KarwanDealEscrow.t.sol";

/// Audit finding C-03 (evidence, expected to pass): on the beta terms a chat
/// service deal has a one-hour review, the final milestone releases on a
/// timer, and the buyer gets one dispute per milestone. With no automatic
/// arbiter and a review Safe that does not rule inside the 14-day dispute
/// timeout, a buyer who disputed a bad delivery is paid out to the seller by
/// party actions alone. This test records that timeline exactly.
contract AuditSilentReviewTimelineTest is Test {
    BlockUSDC usdc;
    KarwanDealEscrow escrow;
    KarwanStakeVault vault;
    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address treasury = makeAddr("treasury");
    address reviewSafe = makeAddr("review");
    address seniorSafe = makeAddr("senior");

    function setUp() public {
        usdc = new BlockUSDC();
        vault = new KarwanStakeVault(address(usdc), address(this));
        escrow = new KarwanDealEscrow(
            address(usdc),
            address(vault),
            address(this),
            KarwanDealEscrow.Bounds({
                maxReservationBps: 10_000,
                minReview: 1 hours,
                maxReview: 180 days,
                maxHorizon: 730 days,
                disputeTimeout: 14 days,
                appealWindow: 3 days,
                autoRulingSla: 5 days
            })
        );
        vault.setConsumer(address(escrow), true);
        // AUTO_ARBITER unset, as the beta deploy allows.
        escrow.setRoles(treasury, address(0), reviewSafe, seniorSafe);
        escrow.setFeeBps(150);
        escrow.setCaps(1_000e6, 10_000e6, 5_000e6);
        usdc.mint(buyer, 10_000e6);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    /// The terms backend/src/chain/dealTermsV3.ts builds for a chat service deal
    /// with the config defaults (DEAL_REVIEW_WINDOW_MS 300000, no terms floor):
    /// review max(1h, 5m) = 1h, one extension of 1h, longstop 2h + 7d, final on timer.
    function _betaTerms() internal view returns (DealTerms memory t) {
        t.seller = seller;
        t.amount = 90e6;
        t.pcts[0] = 100;
        t.deliveryDeadline = uint64(block.timestamp + 7 days);
        t.reclaimGrace = 1 days;
        t.reviewWindow = 1 hours;
        t.maxExtensions = 1;
        t.extensionSecs = 1 hours;
        t.finalRelease = 0;
        t.silentLongstop = 2 hours + 7 days;
        t.agreementHash = keccak256("agreement");
    }

    function test_C03_OneHourReviewThenSellerClaimsWithoutTheBuyer() public {
        DealTerms memory t = _betaTerms();
        vm.prank(buyer);
        bytes32 id = escrow.fund(keccak256("deal-1"), t);
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(seller);
        escrow.accept(id, h);
        vm.prank(seller);
        escrow.markDelivered(id, keccak256("anything"));
        // The buyer does nothing for 61 minutes.
        vm.warp(block.timestamp + 61 minutes);
        vm.prank(seller);
        escrow.claim(id, address(0));
        assertEq(uint8(escrow.getDeal(id).state), uint8(DealState.Settled));
        assertEq(usdc.balanceOf(seller), 89.325e6, "paid in full after one silent hour");
    }

    function test_C03_DisputedBadDeliveryPaysTheSellerWhenNobodyRules() public {
        DealTerms memory t = _betaTerms();
        vm.prank(buyer);
        bytes32 id = escrow.fund(keccak256("deal-2"), t);
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(seller);
        escrow.accept(id, h);
        vm.prank(seller);
        escrow.markDelivered(id, keccak256("garbage"));
        // The buyer disputes inside the hour.
        vm.warp(block.timestamp + 10 minutes);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("not what we agreed"));
        // No arbiter is configured. After the SLA the buyer escalates to admin review.
        vm.warp(block.timestamp + 5 days);
        vm.prank(buyer);
        escrow.escalate(id);
        // The review Safe never rules. After the dispute timeout the seller lapses it.
        vm.warp(block.timestamp + 9 days);
        vm.prank(seller);
        escrow.lapseDispute(id);
        // The buyer cannot dispute this milestone again.
        vm.prank(buyer);
        vm.expectRevert();
        escrow.dispute(id, keccak256("again"));
        // A fresh one-hour review, then the seller claims.
        vm.warp(block.timestamp + 61 minutes);
        vm.prank(seller);
        escrow.claim(id, address(0));
        assertEq(uint8(escrow.getDeal(id).state), uint8(DealState.Settled));
        assertEq(usdc.balanceOf(seller), 89.325e6, "paid in full although the buyer disputed and nobody ruled");
    }
}
