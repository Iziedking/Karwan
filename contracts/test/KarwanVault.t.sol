// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanVault} from "../src/KarwanVault.sol";

/// @notice Minimal ERC-20 mock to exercise the vault without depending on
///         the real USDC interface or a fork.
contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "INSUFFICIENT");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "ALLOWANCE");
        require(balanceOf[from] >= amount, "INSUFFICIENT");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract KarwanVaultTest is Test {
    KarwanVault vault;
    MockUSDC usdc;
    address alice = makeAddr("alice");
    uint256 constant ONE_USDC = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        usdc.mint(alice, 1_000 * ONE_USDC);
    }

    function _deposit(address from, uint256 amount) internal returns (uint256) {
        vm.startPrank(from);
        usdc.approve(address(vault), amount);
        uint256 id = vault.deposit(amount);
        vm.stopPrank();
        return id;
    }

    function test_Deposit_OpensActivePosition() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        (
            address owner,
            uint256 principal,
            uint64 depositedAt,
            uint64 cooldownStartedAt,
            uint64 claimableAt,
            KarwanVault.PositionState state
        ) = vault.positions(id);
        assertEq(owner, alice);
        assertEq(principal, 100 * ONE_USDC);
        assertEq(depositedAt, uint64(block.timestamp));
        assertEq(cooldownStartedAt, 0);
        assertEq(claimableAt, 0);
        assertEq(uint8(state), uint8(KarwanVault.PositionState.Active));
        assertEq(usdc.balanceOf(address(vault)), 100 * ONE_USDC);
        assertEq(usdc.balanceOf(alice), 900 * ONE_USDC);
    }

    function test_Deposit_RevertsBelowMinPrincipal() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), ONE_USDC - 1);
        vm.expectRevert(KarwanVault.InvalidPrincipal.selector);
        vault.deposit(ONE_USDC - 1);
        vm.stopPrank();
    }

    function test_RequestWithdraw_StartsCooldown_AndPausesSignal() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        // Stake counts before the request.
        assertEq(vault.activePrincipal(id), 100 * ONE_USDC);
        assertTrue(vault.isActive(id));

        uint64 now64 = uint64(block.timestamp);
        vm.prank(alice);
        vault.requestWithdraw(id);

        (, , , uint64 cooldownStartedAt, uint64 claimableAt, KarwanVault.PositionState state) =
            vault.positions(id);
        assertEq(cooldownStartedAt, now64);
        assertEq(claimableAt, now64 + 7 days);
        assertEq(uint8(state), uint8(KarwanVault.PositionState.Cooling));
        // Stake signal goes to 0 during cooling, even though USDC is still held.
        assertEq(vault.activePrincipal(id), 0);
        assertEq(vault.tenureSeconds(id), 0);
        assertFalse(vault.isActive(id));
        // USDC still in vault until claim.
        assertEq(usdc.balanceOf(address(vault)), 100 * ONE_USDC);
    }

    function test_CancelWithdraw_RestoresActive_AndKeepsTenure() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        uint64 originalDeposit = uint64(block.timestamp);

        // Advance two days, request withdraw, advance another two days, cancel.
        vm.warp(block.timestamp + 2 days);
        vm.prank(alice);
        vault.requestWithdraw(id);

        vm.warp(block.timestamp + 2 days);
        vm.prank(alice);
        vault.cancelWithdraw(id);

        (, , uint64 depositedAt, uint64 cooldownStartedAt, uint64 claimableAt, KarwanVault.PositionState state) =
            vault.positions(id);
        // Tenure clock survives the cancellation: depositedAt unchanged.
        assertEq(depositedAt, originalDeposit);
        assertEq(cooldownStartedAt, 0);
        assertEq(claimableAt, 0);
        assertEq(uint8(state), uint8(KarwanVault.PositionState.Active));
        // Tenure counts the full window including cool-down time, since the
        // user kept the position open.
        assertEq(vault.tenureSeconds(id), 4 days);
    }

    function test_Claim_BeforeCooldown_Reverts() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        vm.prank(alice);
        vault.requestWithdraw(id);
        vm.warp(block.timestamp + 6 days);
        vm.prank(alice);
        vm.expectRevert(KarwanVault.StillCooling.selector);
        vault.claim(id);
    }

    function test_Claim_AfterCooldown_ReturnsPrincipal() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        vm.prank(alice);
        vault.requestWithdraw(id);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        vault.claim(id);
        assertEq(usdc.balanceOf(alice), 1_000 * ONE_USDC);
        assertEq(usdc.balanceOf(address(vault)), 0);
        (, , , , , KarwanVault.PositionState state) = vault.positions(id);
        assertEq(uint8(state), uint8(KarwanVault.PositionState.Withdrawn));
    }

    function test_Claim_WithoutRequest_Reverts() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        vm.prank(alice);
        vm.expectRevert(KarwanVault.NotCooling.selector);
        vault.claim(id);
    }

    function test_RequestWithdraw_OnlyByOwner() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        vm.prank(makeAddr("eve"));
        vm.expectRevert(KarwanVault.NotOwner.selector);
        vault.requestWithdraw(id);
    }

    function test_CancelWithdraw_OnlyByOwner() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        vm.prank(alice);
        vault.requestWithdraw(id);
        vm.prank(makeAddr("eve"));
        vm.expectRevert(KarwanVault.NotOwner.selector);
        vault.cancelWithdraw(id);
    }

    function test_Claim_OnlyByOwner() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        vm.prank(alice);
        vault.requestWithdraw(id);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(makeAddr("eve"));
        vm.expectRevert(KarwanVault.NotOwner.selector);
        vault.claim(id);
    }

    function test_DoubleRequestWithdraw_Reverts() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        vm.startPrank(alice);
        vault.requestWithdraw(id);
        vm.expectRevert(KarwanVault.NotActive.selector);
        vault.requestWithdraw(id);
        vm.stopPrank();
    }

    function test_CancelWithoutRequest_Reverts() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        vm.prank(alice);
        vm.expectRevert(KarwanVault.NotCooling.selector);
        vault.cancelWithdraw(id);
    }

    function test_DoubleClaim_Reverts() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        vm.prank(alice);
        vault.requestWithdraw(id);
        vm.warp(block.timestamp + 7 days + 1);
        vm.startPrank(alice);
        vault.claim(id);
        vm.expectRevert(KarwanVault.NotCooling.selector);
        vault.claim(id);
        vm.stopPrank();
    }

    function test_MultiplePositions_TrackTenureIndependently() public {
        uint256 first = _deposit(alice, 50 * ONE_USDC);
        vm.warp(block.timestamp + 10 days);
        uint256 second = _deposit(alice, 50 * ONE_USDC);
        // First position has 10 days of tenure, second has 0.
        assertEq(vault.tenureSeconds(first), 10 days);
        assertEq(vault.tenureSeconds(second), 0);
        assertEq(vault.activePrincipal(first), 50 * ONE_USDC);
        assertEq(vault.activePrincipal(second), 50 * ONE_USDC);
    }

    function test_TenureGrowsWithTime() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        vm.warp(block.timestamp + 30 days);
        assertEq(vault.tenureSeconds(id), 30 days);
        vm.warp(block.timestamp + 365 days);
        assertEq(vault.tenureSeconds(id), 395 days);
    }
}
