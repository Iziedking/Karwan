// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanEscrow} from "../src/KarwanEscrow.sol";
import {KarwanVault} from "../src/KarwanVault.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockUSDC is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    uint256 public override totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        if (allowance[from][msg.sender] < type(uint256).max) {
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @title H-1 is CLOSED in Escrow v2
/// @notice The v1 versions of these tests (git history) proved both exploits
///         live: the buyer's unilateral clawback and the seller's funds stuck
///         when the buyer vanished. v2 adds the delivery/review-window/seller-
///         claim path and an arbiter resolve, restricting refund to pre-accept.
///         These tests assert the fix.
contract KarwanEscrowH1AttackTest is Test {
    KarwanEscrow escrow;
    KarwanVault vault;
    KarwanReputation rep;
    MockUSDC usdc;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address treasury = makeAddr("treasury");
    address arbiter = makeAddr("arbiter");
    bytes32 constant JOB_ID = keccak256("h1-job");

    uint16 constant FEE_BPS = 150; // 1.5%
    uint16 constant RESERVATION_BPS = 5000; // 50%
    uint16 constant MAX_RESERVATION_BPS = 10000;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        rep = new KarwanReputation();
        escrow = new KarwanEscrow(
            address(usdc), FEE_BPS, treasury, address(vault), address(rep), MAX_RESERVATION_BPS
        );
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));
        escrow.setArbiter(arbiter);

        usdc.mint(buyer, 1000e18);
        usdc.mint(seller, 1000e18);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);

        // Seller stakes 400 so they can accept a 500 deal at 50% (250 reserve).
        vm.startPrank(seller);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(400e18);
        vm.stopPrank();
    }

    function _twoMilestones(uint8 a, uint8 b) internal pure returns (uint8[] memory pcts) {
        pcts = new uint8[](2);
        pcts[0] = a;
        pcts[1] = b;
    }

    function _fundAndAccept() internal {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50), RESERVATION_BPS);
        vm.prank(seller);
        escrow.acceptEscrow(JOB_ID);
    }

    /// FIX 1. The buyer can no longer unilaterally claw back a post-accept
    /// deal: refund reverts, so taking delivery then refunding+slashing is
    /// impossible. The only post-accept exits are a buyer release, a seller
    /// claim after the window, or a neutral arbiter's resolve.
    function test_H1_BuyerClawbackNowImpossible() public {
        _fundAndAccept();

        vm.prank(buyer);
        escrow.dispute(JOB_ID, "trying to claw back after delivery");

        // The unilateral refund path is gone for accepted deals.
        vm.prank(buyer);
        vm.expectRevert(KarwanEscrow.RefundAfterAccept.selector);
        escrow.refund(JOB_ID);

        // The seller's stake is untouched by the buyer's attempt; only the
        // arbiter can now resolve, and only they decide any slash.
        assertEq(vault.activeStakeOf(seller), 400e18, "no unilateral slash");
    }

    /// FIX 2. The buyer vanishing no longer traps the seller. After the seller
    /// marks delivery and the review window elapses with no buyer action, the
    /// seller claims each milestone and gets paid in full.
    function test_H1_SellerClaimsAfterWindowWhenBuyerVanishes() public {
        _fundAndAccept();
        uint256 sellerStart = usdc.balanceOf(seller);

        // Milestone 1: seller delivers, buyer ignores it, window elapses.
        vm.prank(seller);
        escrow.markDelivered(JOB_ID, "proof-1");
        vm.warp(block.timestamp + 5 days + 1);
        vm.prank(seller);
        escrow.claimMilestone(JOB_ID, 0);

        // Milestone 2 (final): same.
        vm.prank(seller);
        escrow.markDelivered(JOB_ID, "proof-2");
        vm.warp(block.timestamp + 5 days + 1);
        vm.prank(seller);
        escrow.claimMilestone(JOB_ID, 1);

        // Seller received the full sellerNet (496.25). Deal settled, reservation
        // released (stake back to free).
        assertEq(usdc.balanceOf(seller) - sellerStart, 496.25e18, "seller paid in full");
        KarwanEscrow.EscrowState state = escrow.getEscrow(JOB_ID).state;
        assertEq(uint8(state), uint8(KarwanEscrow.EscrowState.Settled), "settled");
        assertEq(vault.activeStakeOf(seller), 400e18, "reservation released on success");
    }

    /// The seller cannot claim before the review window closes: the buyer's
    /// window to release or dispute is protected.
    function test_H1_SellerClaimBlockedDuringWindow() public {
        _fundAndAccept();
        vm.prank(seller);
        escrow.markDelivered(JOB_ID, "proof");

        // One second before the deadline: too early.
        vm.warp(block.timestamp + 5 days - 1);
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.ReviewWindowOpen.selector);
        escrow.claimMilestone(JOB_ID, 0);
    }

    /// The seller cannot claim a milestone they never marked delivered.
    function test_H1_SellerClaimRequiresDelivery() public {
        _fundAndAccept();
        vm.warp(block.timestamp + 30 days);
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.NotDelivered.selector);
        escrow.claimMilestone(JOB_ID, 0);
    }
}
