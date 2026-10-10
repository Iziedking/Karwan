// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanPOFinancing} from "../src/KarwanPOFinancing.sol";
import {MockUSDC, MockRegistry, MockVault} from "./KarwanPOAssignment.t.sol";

/// Escrow whose deal is still running until the test settles it.
contract LiveEscrow {
    struct Assignment {
        address assignee;
        uint128 amount;
        uint128 paid;
    }

    mapping(bytes32 => address) public sellers;
    mapping(bytes32 => Assignment) public assignmentOf;
    mapping(bytes32 => bool) public isFinal;

    function seedDeal(bytes32 jobId, address seller) external {
        sellers[jobId] = seller;
    }

    function sellerOf(bytes32 jobId) external view returns (address) {
        return sellers[jobId];
    }

    function assignPayout(bytes32 jobId, address assignee, uint128 amount) external {
        require(assignmentOf[jobId].assignee == address(0), "assigned");
        assignmentOf[jobId] = Assignment({assignee: assignee, amount: amount, paid: 0});
    }

    /// The escrow settling: the assignee is paid first, as KarwanDealEscrow does.
    function settle(bytes32 jobId, MockUSDC usdc) external {
        Assignment storage a = assignmentOf[jobId];
        uint128 due = a.amount - a.paid;
        a.paid += due;
        usdc.mint(a.assignee, due);
        isFinal[jobId] = true;
    }
}

/// @title The financier is repaid once
/// @notice claimRepayment runs while the deal is still live. With the seller's
///         standing approval (poWatcher sets it for Circle sellers), it pulls
///         the whole repay from the seller and settles the line, but the
///         escrow assignment stays live, so the escrow pays the financier the
///         repay a second time at settlement.
contract KarwanPOEarlyClaimAttackTest is Test {
    KarwanPOFinancing po;
    MockUSDC usdc;
    LiveEscrow escrow;

    address seller = makeAddr("seller");
    address financier = makeAddr("financier");

    bytes32 constant JOB = keccak256("po-early-claim");
    uint128 constant PRINCIPAL = 1_890e6;
    uint128 constant REPAY = 2_100e6;
    uint64 constant WINDOW = 30 days;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new LiveEscrow();
        po = new KarwanPOFinancing(address(usdc), address(new MockRegistry()), address(escrow), address(new MockVault()));
        escrow.seedDeal(JOB, seller);

        usdc.mint(financier, PRINCIPAL);
        usdc.mint(seller, 5_000e6);
        vm.prank(financier);
        usdc.approve(address(po), type(uint256).max);
        vm.prank(seller);
        usdc.approve(address(po), type(uint256).max);

        bytes32 h = po.offerHash(JOB, PRINCIPAL, REPAY, WINDOW, 0, address(0));
        vm.prank(seller);
        po.offerFinancing(JOB, h);
        vm.prank(financier);
        po.fund(JOB, PRINCIPAL, REPAY, WINDOW, 0);
    }

    function test_ClaimWaitsForTheDealToEnd() public {
        vm.prank(financier);
        vm.expectRevert(KarwanPOFinancing.DealStillLive.selector);
        po.claimRepayment(JOB);
    }

    function test_FinancierNeverCollectsMoreThanTheRepay() public {
        vm.prank(financier);
        try po.claimRepayment(JOB) {} catch {}
        escrow.settle(JOB, usdc);

        assertLe(usdc.balanceOf(financier), REPAY, "financier collected more than the repay");
    }
}
