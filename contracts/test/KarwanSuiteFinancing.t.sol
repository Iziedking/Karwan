// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {DealEscrowBase} from "./KarwanDealEscrow.t.sol";
import {DealTerms} from "../src/KarwanDealTypes.sol";
import {KarwanPOFinancing} from "../src/KarwanPOFinancing.sol";
import {KarwanInvoiceRegistry} from "../src/KarwanInvoiceRegistry.sol";

/// @notice PO financing on the mainnet suite: real DealEscrow, StakeVault,
///         InvoiceRegistry and POFinancing. The seller must offer the line; the
///         escrow pays the financier first; a default slashes only the seller's
///         reserved stake, to the financier.
contract KarwanSuiteFinancingTest is DealEscrowBase {
    KarwanPOFinancing po;
    KarwanInvoiceRegistry registry;
    address financier = makeAddr("financier");
    bytes32 jobId;

    function setUp() public override {
        super.setUp();
        registry = new KarwanInvoiceRegistry(address(this));
        registry.setEscrow(address(escrow));
        po = new KarwanPOFinancing(address(usdc), address(registry), address(escrow), address(vault));
        escrow.setAssigner(address(po), true);
        vault.setConsumer(address(po), true);

        usdc.mint(financier, 100_000e6);
        vm.prank(financier);
        usdc.approve(address(po), type(uint256).max);
        usdc.mint(seller, 1_000e6);
        vm.startPrank(seller);
        usdc.approve(address(vault), type(uint256).max);
        vault.stake(1_000e6);
        vm.stopPrank();

        jobId = _open(_terms());
    }

    function _offer(uint128 principal, uint128 repay, uint64 window, uint128 stake) internal {
        bytes32 h = po.offerHash(jobId, principal, repay, window, stake, financier);
        vm.prank(seller);
        po.offerFinancing(jobId, h);
    }

    function test_F1_NoLineWithoutTheSellersOffer() public {
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.NoMatchingOffer.selector);
        po.fund(jobId, 1, 1_000e6, 7 days, 0);
    }

    function test_OfferedLinePaysTheFinancierFirstThenTheSeller() public {
        _offer(800e6, 850e6, 7 days, 200e6);
        vm.prank(financier);
        po.fund(jobId, 800e6, 850e6, 7 days, 200e6);
        assertEq(usdc.balanceOf(seller), 800e6, "advance reached the seller");

        _deliver(jobId);
        vm.prank(buyer);
        escrow.release(jobId);
        _deliver(jobId);
        vm.prank(buyer);
        escrow.release(jobId);

        assertEq(usdc.balanceOf(financier), 100_000e6 - 800e6 + 850e6, "financier repaid from the escrow");
        assertEq(usdc.balanceOf(seller), 800e6 + 992.5e6 - 850e6, "seller gets the rest");
        vm.prank(financier);
        po.claimRepayment(jobId);
        assertEq(vault.freeStakeOf(seller), 1_000e6, "collateral released");
    }

    function test_F2_AReceivableCannotBeFinancedTwice() public {
        _offer(800e6, 850e6, 7 days, 0);
        vm.prank(financier);
        po.fund(jobId, 800e6, 850e6, 7 days, 0);
        bytes32 h = po.offerHash(jobId, 100e6, 120e6, 7 days, 0, address(0));
        vm.prank(seller);
        vm.expectRevert(KarwanPOFinancing.AlreadyFunded.selector);
        po.offerFinancing(jobId, h);
    }

    /// F4: a line can only default once the deal is final and the escrow paid
    ///     short. While the deal is live the receivable may still pay in full,
    ///     and defaulting early let the financier take the stake AND later the
    ///     full assignment.
    function test_F4_NoDefaultWhileTheDealCanStillPay() public {
        _offer(800e6, 850e6, 7 days, 200e6);
        vm.prank(financier);
        po.fund(jobId, 800e6, 850e6, 7 days, 200e6);
        vm.warp(block.timestamp + 7 days);
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.DealStillLive.selector);
        po.markDefaulted(jobId);

        uint256 before = usdc.balanceOf(financier);
        _deliver(jobId);
        vm.prank(buyer);
        escrow.release(jobId);
        _deliver(jobId);
        vm.prank(buyer);
        escrow.release(jobId);
        assertEq(usdc.balanceOf(financier) - before, 850e6, "repaid exactly once, from the escrow");
    }

    function test_F3_DefaultAfterAShortDealSlashesOnlyTheShortfall() public {
        _offer(800e6, 850e6, 7 days, 200e6);
        vm.prank(financier);
        po.fund(jobId, 800e6, 850e6, 7 days, 200e6);
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.StillWithinWindow.selector);
        po.markDefaulted(jobId);
        // the seller never delivers; the buyer reclaims, so the escrow pays the financier nothing
        vm.warp(block.timestamp + 11 days + 1);
        vm.prank(buyer);
        escrow.reclaim(jobId, address(0));
        uint256 before = usdc.balanceOf(financier);
        vm.prank(financier);
        po.markDefaulted(jobId);
        assertEq(usdc.balanceOf(financier) - before, 200e6, "slash capped at the reserved stake");
        assertEq(vault.freeStakeOf(seller), 800e6);
    }
}
