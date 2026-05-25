// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanTreasury} from "../src/KarwanTreasury.sol";
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

contract KarwanTreasuryTest is Test {
    MockUSDC usdc;
    MockUSYC usyc;
    KarwanTreasury treasury;

    address owner = address(this);
    address keeper = makeAddr("keeper");
    address eve = makeAddr("eve");
    uint256 constant ONE_USDC = 1e6;
    uint256 constant APY_BPS = 500;

    function setUp() public {
        usdc = new MockUSDC();
        usyc = new MockUSYC(address(usdc), APY_BPS);
        // testnet wiring: teller, token, and oracle are all the MockUSYC address.
        treasury = new KarwanTreasury(
            address(usdc),
            address(usyc),
            address(usyc),
            address(usyc),
            keeper,
            100 * ONE_USDC // idle threshold
        );
    }

    function _fundTreasury(uint256 amount) internal {
        usdc.mint(address(this), amount);
        usdc.approve(address(treasury), amount);
        treasury.deposit(amount);
    }

    function test_Deposit_PullsUsdc() public {
        _fundTreasury(500 * ONE_USDC);
        assertEq(usdc.balanceOf(address(treasury)), 500 * ONE_USDC);
    }

    function test_Sweep_LeavesIdle_BuysUsyc() public {
        _fundTreasury(500 * ONE_USDC);
        vm.prank(keeper);
        uint256 usycOut = treasury.sweepToUSYC();
        // 500 held, 100 idle threshold -> sweep 400 into USYC at $1.00.
        assertEq(usycOut, 400 * ONE_USDC);
        assertEq(usdc.balanceOf(address(treasury)), 100 * ONE_USDC);
        assertEq(usyc.balanceOf(address(treasury)), 400 * ONE_USDC);
    }

    function test_TotalReserves_AtPar() public {
        _fundTreasury(500 * ONE_USDC);
        vm.prank(keeper);
        treasury.sweepToUSYC();
        // 100 idle USDC + 400 USYC marked at $1.00 = 500.
        assertEq(treasury.totalReserves(), 500 * ONE_USDC);
    }

    function test_TotalReserves_GrowsWithYield() public {
        _fundTreasury(500 * ONE_USDC);
        vm.prank(keeper);
        treasury.sweepToUSYC();
        vm.warp(block.timestamp + 365 days); // USYC +5%
        // 100 idle + 400 * 1.05 = 100 + 420 = 520.
        assertEq(treasury.totalReserves(), 520 * ONE_USDC);
    }

    function test_Redeem_ReturnsUsdcToTreasury() public {
        _fundTreasury(500 * ONE_USDC);
        vm.prank(keeper);
        treasury.sweepToUSYC(); // 400 USYC held, 100 USDC idle
        treasury.redeemFromUSYC(400 * ONE_USDC); // owner is address(this)
        // Back to 500 USDC at par, 0 USYC.
        assertEq(usdc.balanceOf(address(treasury)), 500 * ONE_USDC);
        assertEq(usyc.balanceOf(address(treasury)), 0);
    }

    function test_Sweep_OnlyKeeperOrOwner() public {
        _fundTreasury(500 * ONE_USDC);
        vm.prank(eve);
        vm.expectRevert(KarwanTreasury.NotKeeper.selector);
        treasury.sweepToUSYC();
        // owner may also sweep.
        treasury.sweepToUSYC();
        assertEq(usyc.balanceOf(address(treasury)), 400 * ONE_USDC);
    }

    function test_Sweep_RevertsWhenNothingAboveThreshold() public {
        _fundTreasury(80 * ONE_USDC); // below the 100 idle threshold
        vm.prank(keeper);
        vm.expectRevert(KarwanTreasury.NothingToSweep.selector);
        treasury.sweepToUSYC();
    }

    function test_Redeem_OnlyOwner() public {
        _fundTreasury(500 * ONE_USDC);
        vm.prank(keeper);
        treasury.sweepToUSYC();
        vm.prank(eve);
        vm.expectRevert(KarwanTreasury.NotOwner.selector);
        treasury.redeemFromUSYC(100 * ONE_USDC);
    }

    function test_Payout_OnlyOwner_SendsUsdc() public {
        _fundTreasury(500 * ONE_USDC);
        treasury.payout(eve, 50 * ONE_USDC);
        assertEq(usdc.balanceOf(eve), 50 * ONE_USDC);

        vm.prank(eve);
        vm.expectRevert(KarwanTreasury.NotOwner.selector);
        treasury.payout(eve, 1 * ONE_USDC);
    }

    function test_Constructor_RejectsZeroAddress() public {
        vm.expectRevert(KarwanTreasury.ZeroAddress.selector);
        new KarwanTreasury(address(0), address(usyc), address(usyc), address(usyc), keeper, 0);
    }

    function test_Admin_SetKeeperAndThreshold() public {
        treasury.setKeeper(eve);
        assertEq(treasury.keeper(), eve);
        treasury.setIdleThreshold(42);
        assertEq(treasury.idleThreshold(), 42);
        vm.prank(eve);
        vm.expectRevert(KarwanTreasury.NotOwner.selector);
        treasury.setIdleThreshold(0);
    }
}
