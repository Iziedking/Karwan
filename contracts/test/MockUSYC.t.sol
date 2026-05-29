// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {MockUSYC} from "../src/MockUSYC.sol";

/// @notice Minimal ERC-20 mock standing in for USDC (6 decimals).
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

contract MockUSYCTest is Test {
    MockUSDC usdc;
    MockUSYC usyc;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    uint256 constant ONE_USDC = 1e6;
    uint256 constant APY_BPS = 500; // 5%

    function setUp() public {
        usdc = new MockUSDC();
        usyc = new MockUSYC(address(usdc), APY_BPS);
        usdc.mint(alice, 1_000 * ONE_USDC);
    }

    function _deposit(address from, uint256 usdcAmount, address receiver)
        internal
        returns (uint256)
    {
        vm.startPrank(from);
        usdc.approve(address(usyc), usdcAmount);
        uint256 out = usyc.deposit(usdcAmount, receiver);
        vm.stopPrank();
        return out;
    }

    function test_Metadata() public view {
        assertEq(usyc.decimals(), 6);
        assertEq(usyc.symbol(), "USYC");
        assertEq(usyc.price(), 1e8); // $1.00 at deploy
    }

    function test_Deposit_MintsAtParAtDeploy() public {
        uint256 out = _deposit(alice, 100 * ONE_USDC, alice);
        // At $1.00, 100 USDC buys 100 USYC (both 6 decimals).
        assertEq(out, 100 * ONE_USDC);
        assertEq(usyc.balanceOf(alice), 100 * ONE_USDC);
        assertEq(usyc.totalSupply(), 100 * ONE_USDC);
        assertEq(usdc.balanceOf(address(usyc)), 100 * ONE_USDC);
    }

    function test_Deposit_CreditsArbitraryReceiver() public {
        // alice deposits USDC, bob receives the USYC. This is the call shape
        // a smart-contract subscriber would use when entitled itself to be
        // the receiver. The real Teller exposes exactly this signature.
        uint256 out = _deposit(alice, 100 * ONE_USDC, bob);
        assertEq(out, 100 * ONE_USDC);
        assertEq(usyc.balanceOf(bob), 100 * ONE_USDC);
        assertEq(usyc.balanceOf(alice), 0);
    }

    function test_Redeem_SelfAtDeploy_PreservesUsdc() public {
        uint256 minted = _deposit(alice, 100 * ONE_USDC, alice);
        vm.prank(alice);
        uint256 back = usyc.redeem(minted, alice, alice);
        assertEq(back, 100 * ONE_USDC);
        assertEq(usdc.balanceOf(alice), 1_000 * ONE_USDC);
        assertEq(usyc.balanceOf(alice), 0);
        assertEq(usyc.totalSupply(), 0);
    }

    function test_Redeem_OnBehalf_ConsumesAllowance() public {
        // bob holds USYC. alice tries to redeem on his behalf — must hold an
        // ERC-20 allowance from bob, mirroring the real Teller's expectation
        // of an on-chain approval pattern when caller != owner.
        _deposit(alice, 100 * ONE_USDC, bob);
        // No allowance set yet -> revert.
        vm.prank(alice);
        vm.expectRevert(MockUSYC.InsufficientAllowance.selector);
        usyc.redeem(100 * ONE_USDC, alice, bob);

        // bob grants alice an allowance; the redeem now succeeds.
        vm.prank(bob);
        usyc.approve(alice, 100 * ONE_USDC);
        vm.prank(alice);
        uint256 back = usyc.redeem(100 * ONE_USDC, alice, bob);
        assertEq(back, 100 * ONE_USDC);
        assertEq(usdc.balanceOf(alice), 1_000 * ONE_USDC); // got USDC back
        assertEq(usyc.balanceOf(bob), 0);
    }

    function test_Redeem_InfiniteAllowance_NotDecremented() public {
        _deposit(alice, 100 * ONE_USDC, bob);
        vm.prank(bob);
        usyc.approve(alice, type(uint256).max);
        vm.prank(alice);
        usyc.redeem(40 * ONE_USDC, alice, bob);
        // type(uint256).max remains untouched.
        assertEq(usyc.allowance(bob, alice), type(uint256).max);
    }

    function test_Price_RampsWithApy() public {
        // After one year the price is ~ +5%.
        vm.warp(block.timestamp + 365 days);
        assertEq(usyc.price(), 1e8 + (1e8 * APY_BPS) / 10_000); // 1.05e8
    }

    function test_Deposit_AfterYield_MintsLessUsyc() public {
        vm.warp(block.timestamp + 365 days); // price 1.05
        uint256 out = _deposit(alice, 105 * ONE_USDC, alice);
        // 105 USDC / 1.05 price = 100 USYC.
        assertEq(out, 100 * ONE_USDC);
    }

    function test_Redeem_AfterYield_ReturnsMoreUsdc_WhenFunded() public {
        uint256 minted = _deposit(alice, 100 * ONE_USDC, alice); // 100 USYC, $1.00
        // Pre-fund the simulated yield so the redemption is fully solvent.
        usdc.mint(address(this), 10 * ONE_USDC);
        usdc.approve(address(usyc), 10 * ONE_USDC);
        usyc.fund(10 * ONE_USDC);

        vm.warp(block.timestamp + 365 days); // price 1.05
        vm.prank(alice);
        uint256 back = usyc.redeem(minted, alice, alice);
        // 100 USYC * 1.05 = 105 USDC.
        assertEq(back, 105 * ONE_USDC);
    }

    function test_Redeem_CapsAtBackingWhenUnderfunded() public {
        uint256 minted = _deposit(alice, 100 * ONE_USDC, alice); // backing = 100 USDC
        vm.warp(block.timestamp + 365 days); // price 1.05, wants 105 USDC
        vm.prank(alice);
        uint256 back = usyc.redeem(minted, alice, alice);
        // Capped at the 100 USDC actually held.
        assertEq(back, 100 * ONE_USDC);
    }

    function test_Deposit_RevertsOnZero() public {
        vm.prank(alice);
        vm.expectRevert(MockUSYC.ZeroAmount.selector);
        usyc.deposit(0, alice);
    }

    function test_Deposit_RevertsOnZeroReceiver() public {
        vm.prank(alice);
        usdc.approve(address(usyc), ONE_USDC);
        vm.prank(alice);
        vm.expectRevert(MockUSYC.ZeroAddress.selector);
        usyc.deposit(ONE_USDC, address(0));
    }

    function test_Redeem_RevertsWithoutBalance() public {
        vm.prank(alice);
        vm.expectRevert(MockUSYC.InsufficientBalance.selector);
        usyc.redeem(ONE_USDC, alice, alice);
    }

    function test_LatestAnswer_TracksPrice() public {
        assertEq(uint256(uint256(int256(usyc.latestAnswer()))), 1e8);
        vm.warp(block.timestamp + 365 days);
        assertEq(usyc.latestAnswer(), int256(usyc.price()));
    }
}
