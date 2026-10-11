// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanDealEscrow} from "../src/KarwanDealEscrow.sol";
import {DealTerms} from "../src/KarwanDealTypes.sol";
import {KarwanStakeVault} from "../src/KarwanStakeVault.sol";
import {BlockUSDC} from "./KarwanDealEscrow.t.sol";

/// Audit finding C-02: assignPayout trusts any address the owner names as an
/// assigner, with no consent from the seller whose payout it redirects. The
/// docs say no role can send deal money anywhere but to the parties, a
/// financier the seller assigned, or the treasury. The safe behaviour asserted
/// here: an assignment the seller never agreed to pays nobody but the seller.
contract AuditOwnerAssignerDiversionTest is Test {
    BlockUSDC usdc;
    KarwanDealEscrow escrow;
    KarwanStakeVault vault;
    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address treasury = makeAddr("treasury");
    address reviewSafe = makeAddr("review");
    address seniorSafe = makeAddr("senior");
    address attacker = makeAddr("assigner-eoa");

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
        escrow.setRoles(treasury, address(0), reviewSafe, seniorSafe);
        escrow.setFeeBps(150);
        escrow.setCaps(1_000e6, 10_000e6, 5_000e6);
        usdc.mint(buyer, 10_000e6);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function test_C02_PayoutCannotBeAssignedWithoutTheSeller() public {
        DealTerms memory t;
        t.seller = seller;
        t.amount = 1_000e6;
        t.pcts[0] = 100;
        t.deliveryDeadline = uint64(block.timestamp + 10 days);
        t.reclaimGrace = 1 days;
        t.reviewWindow = 1 hours;
        t.silentLongstop = 9 days;
        t.agreementHash = keccak256("agreement");
        vm.prank(buyer);
        bytes32 id = escrow.fund(keccak256("deal-1"), t);
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(seller);
        escrow.accept(id, h);

        // One owner call, no timelock in the beta: a plain address becomes an
        // assigner and redirects the seller's whole payout to itself.
        escrow.setAssigner(attacker, true);
        vm.prank(attacker);
        escrow.assignPayout(id, attacker, 992.5e6);

        vm.prank(seller);
        escrow.markDelivered(id, keccak256("proof"));
        vm.prank(buyer);
        escrow.release(id);

        assertEq(usdc.balanceOf(attacker), 0, "an address the seller never assigned was paid the seller's money");
        assertEq(usdc.balanceOf(seller), 992.5e6, "the seller was paid");
    }
}
