// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanEscrow} from "../src/KarwanEscrow.sol";
import {KarwanVault} from "../src/KarwanVault.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";
import {Guardable} from "../src/Guardable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockUSDC is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    uint256 public override totalSupply;

    function mint(address to, uint256 a) external { balanceOf[to] += a; totalSupply += a; }
    function approve(address s, uint256 a) external override returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external override returns (bool) { balanceOf[msg.sender] -= a; balanceOf[to] += a; return true; }
    function transferFrom(address f, address t, uint256 a) external override returns (bool) {
        if (allowance[f][msg.sender] < type(uint256).max) allowance[f][msg.sender] -= a;
        balanceOf[f] -= a; balanceOf[t] += a; return true;
    }
}

/// @title Guardian (security agent) surface
/// @notice The escrow's delivery hold + attestation, the cumulative-cap
///         auto-expiry, and the "pause never confiscate" guarantees.
contract KarwanGuardianTest is Test {
    KarwanEscrow escrow;
    KarwanVault vault;
    KarwanReputation rep;
    MockUSDC usdc;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address treasury = makeAddr("treasury");
    address arbiter = makeAddr("arbiter");
    address guardian = makeAddr("guardian");
    address eve = makeAddr("eve");
    bytes32 constant JOB = keccak256("guard-job");

    uint256 constant SELLER_NET = 496.25e18;
    uint256 constant FUNDED = 503.75e18;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        rep = new KarwanReputation();
        escrow = new KarwanEscrow(address(usdc), 150, treasury, address(vault), address(rep), 10000);
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));
        escrow.setArbiter(arbiter);
        escrow.setGuardian(guardian); // owner (this) wires the guardian

        usdc.mint(buyer, 1000e18);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _two() internal pure returns (uint8[] memory p) {
        p = new uint8[](2);
        p[0] = 50; p[1] = 50;
    }

    function _fundAcceptDeliver() internal {
        vm.prank(buyer);
        escrow.fundEscrow(JOB, seller, 500e18, _two(), 0);
        vm.prank(seller);
        escrow.acceptEscrow(JOB);
        vm.prank(seller);
        escrow.markDelivered(JOB, "proof");
    }

    // ============================ Access =============================

    function test_Guardian_OnlyAdminSets_OnlyGuardianHolds() public {
        vm.prank(eve);
        vm.expectRevert(Guardable.NotGuardianAdmin.selector);
        escrow.setGuardian(eve);

        vm.prank(eve);
        vm.expectRevert(Guardable.NotGuardian.selector);
        escrow.hold(JOB, "x");
    }

    // ======================= Hold blocks payout ======================

    function test_Hold_FreezesSellerPayingPaths() public {
        _fundAcceptDeliver();
        vm.warp(block.timestamp + 5 days + 1); // window elapsed, claim would be allowed

        vm.prank(guardian);
        escrow.hold(JOB, keccak256("suspicious-link"));
        assertTrue(escrow.isHeld(JOB));

        // Seller claim and buyer release are both frozen.
        vm.prank(seller);
        vm.expectRevert(Guardable.Frozen.selector);
        escrow.claimMilestone(JOB, 0);
        vm.prank(buyer);
        vm.expectRevert(Guardable.Frozen.selector);
        escrow.releaseProgress(JOB, 0);

        // Guardian clears it. N-2: the hold pushed the claim deadline out by the
        // hold budget (default 7d), so the seller can't claim the instant the
        // hold lifts — a flagged delivery faces the extra review window. Warp
        // past the extended deadline, then the claim goes through.
        vm.prank(guardian);
        escrow.releaseHold(JOB);
        assertFalse(escrow.isHeld(JOB));
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(seller);
        escrow.claimMilestone(JOB, 0);
        assertEq(usdc.balanceOf(seller), SELLER_NET / 2, "paid after hold cleared + extended window");
    }

    /// The buyer's protective exit (reclaim) is NEVER frozen by a hold: a hold
    /// protects the buyer from paying a scammer, it can't trap the buyer's money.
    function test_Hold_DoesNotFreezeBuyerReclaim() public {
        vm.prank(buyer);
        escrow.fundEscrow(
            JOB, seller, 500e18, _two(), 0,
            KarwanEscrow.Timing({deliveryDeadline: uint64(block.timestamp) + 10 days, reviewWindow: 0, reclaimGrace: 1 days})
        );
        vm.prank(seller);
        escrow.acceptEscrow(JOB);

        vm.prank(guardian);
        escrow.hold(JOB, "fraud");

        vm.warp(block.timestamp + 11 days + 1);
        vm.prank(buyer);
        escrow.reclaimAfterDeadline(JOB, address(0)); // not frozen
        assertEq(usdc.balanceOf(buyer), 1000e18, "buyer recovered principal despite the hold");
    }

    // ===================== Cumulative cap + expiry ====================

    function test_Hold_AutoExpiresAtBudget_AndCannotRehold() public {
        _fundAcceptDeliver();
        vm.warp(block.timestamp + 5 days + 1);

        escrow.setMaxHoldSecs(1 days); // small budget for the test
        vm.prank(guardian);
        escrow.hold(JOB, "r");
        assertTrue(escrow.isHeld(JOB));

        // After the budget elapses the hold auto-expires with no further action.
        vm.warp(block.timestamp + 1 days + 1);
        assertFalse(escrow.isHeld(JOB), "auto-expired");
        assertEq(escrow.holdBudgetLeft(JOB), 0, "budget spent");

        // The guardian can't re-hold the same id: budget exhausted.
        vm.prank(guardian);
        vm.expectRevert(Guardable.HoldBudgetExhausted.selector);
        escrow.hold(JOB, "r2");

        // And the seller can now claim (the game resumes, ball never taken).
        vm.prank(seller);
        escrow.claimMilestone(JOB, 0);
        assertEq(usdc.balanceOf(seller), SELLER_NET / 2);
    }

    function test_Hold_MaxHoldSecsBounded() public {
        vm.expectRevert(Guardable.InvalidHoldWindow.selector);
        escrow.setMaxHoldSecs(0);
        vm.expectRevert(Guardable.InvalidHoldWindow.selector);
        escrow.setMaxHoldSecs(31 days); // over the 30d ceiling
    }

    // ========================= attestDelivery ========================

    function test_Attest_PassShortensWindow() public {
        _fundAcceptDeliver(); // 5-day default window
        escrow.setAttestedWindow(1 days);

        vm.prank(guardian);
        escrow.attestDelivery(JOB, 0, true, "clean-scan");

        // The claim deadline collapsed to ~24h; before that it's still closed.
        vm.warp(block.timestamp + 1 days - 10);
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.ReviewWindowOpen.selector);
        escrow.claimMilestone(JOB, 0);

        // Just after the shortened window, the seller claims early.
        vm.warp(block.timestamp + 20);
        vm.prank(seller);
        escrow.claimMilestone(JOB, 0);
        assertEq(usdc.balanceOf(seller), SELLER_NET / 2, "agent-verified fast claim");
    }

    function test_Attest_FailPlacesHold() public {
        _fundAcceptDeliver();
        vm.warp(block.timestamp + 5 days + 1);

        vm.prank(guardian);
        escrow.attestDelivery(JOB, 0, false, "malware");
        assertTrue(escrow.isHeld(JOB), "failed attestation freezes settlement");

        vm.prank(seller);
        vm.expectRevert(Guardable.Frozen.selector);
        escrow.claimMilestone(JOB, 0);
    }

    function test_Attest_OnlyGuardian() public {
        _fundAcceptDeliver();
        vm.prank(eve);
        vm.expectRevert(Guardable.NotGuardian.selector);
        escrow.attestDelivery(JOB, 0, true, "x");
    }

    // ========================= Vault guardian ========================

    function test_Vault_HoldFreezesFlaggedStakerClaim() public {
        // Seller stakes, requests withdraw, cools down.
        usdc.mint(seller, 400e18);
        vm.startPrank(seller);
        usdc.approve(address(vault), type(uint256).max);
        uint256 pid = vault.deposit(400e18);
        vault.requestWithdraw(pid);
        vm.stopPrank();

        // Let the 3-day cooldown elapse so the claim is otherwise ready.
        vm.warp(block.timestamp + 3 days + 1);

        // Operator (admin) wires a guardian; guardian freezes this staker. The
        // hold is fresh, well inside its 7-day budget.
        vault.setGuardian(guardian);
        vm.prank(guardian);
        vault.hold(bytes32(uint256(uint160(seller))), "gaming-probe");

        vm.prank(seller);
        vm.expectRevert(Guardable.Frozen.selector);
        vault.claim(pid);

        // Cleared -> claim works.
        vm.prank(guardian);
        vault.releaseHold(bytes32(uint256(uint160(seller))));
        vm.prank(seller);
        vault.claim(pid);
        assertEq(usdc.balanceOf(seller), 400e18, "claim after the freeze lifts");
    }
}
