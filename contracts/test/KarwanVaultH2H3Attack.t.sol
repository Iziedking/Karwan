// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanVault} from "../src/KarwanVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal ERC-20 mock (mirrors KarwanVault.t.sol's MockUSDC).
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
        require(balanceOf[msg.sender] >= amount, "INSUFFICIENT");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        require(allowance[from][msg.sender] >= amount, "ALLOWANCE");
        require(balanceOf[from] >= amount, "INSUFFICIENT");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @title H-2 + H-3 are CLOSED in v2
/// @notice v1 versions of these tests proved the exploits live (git history).
///         Here they assert the fixes:
///         H-2: withdrawForYield can no longer drain USDC that reservations or
///              cooling positions depend on.
///         H-3: dust-position griefing of slash is impossible because the
///              per-owner position count is capped and the slash walk is
///              bounded.
contract KarwanVaultH2H3AttackTest is Test {
    KarwanVault vault;
    MockUSDC usdc;

    address staker = makeAddr("staker");
    address escrow = makeAddr("escrow");
    address buyer = makeAddr("buyer");

    uint256 constant ONE_USDC = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        vault.setEscrow(escrow);
        // operator is the deployer (this test contract).
        usdc.mint(staker, 5_000 * ONE_USDC);
    }

    function _depositAs(address who, uint256 amount) internal returns (uint256) {
        vm.startPrank(who);
        usdc.approve(address(vault), amount);
        uint256 id = vault.deposit(amount);
        vm.stopPrank();
        return id;
    }

    /* ------------------------------------------------------------------ H-2 */

    /// The operator can no longer withdraw USDC that backs a reservation: the
    /// coverage floor makes withdrawForYield revert. The insurance stays whole.
    function test_H2_YieldWithdrawCannotDrainReserved() public {
        _depositAs(staker, 100 * ONE_USDC);
        bytes32 jobId = keccak256("insured-deal");
        vm.prank(escrow);
        vault.reserve(jobId, staker, 100 * ONE_USDC, buyer);

        // Attempt to pull the reserved USDC out for yield -> reverts.
        vm.expectRevert(KarwanVault.InsufficientLiquidUsdc.selector);
        vault.withdrawForYield(100 * ONE_USDC);

        // The insurance is intact: the slash still pays the buyer.
        vm.prank(escrow);
        vault.slash(jobId);
        assertEq(usdc.balanceOf(buyer), 100 * ONE_USDC, "buyer insured");
    }

    /// Only the genuine surplus above the coverage floor can leave. With 100
    /// staked and 60 reserved, at most 40 is withdrawable for yield.
    function test_H2_OnlySurplusAboveCoverageLeaves() public {
        _depositAs(staker, 100 * ONE_USDC);
        vm.prank(escrow);
        vault.reserve(keccak256("d"), staker, 60 * ONE_USDC, buyer);

        // 41 is over the surplus (100 - 60 = 40) -> reverts.
        vm.expectRevert(KarwanVault.InsufficientLiquidUsdc.selector);
        vault.withdrawForYield(41 * ONE_USDC);

        // 40 is exactly the surplus -> succeeds, and the reservation is still
        // fully covered by the remaining balance.
        vault.withdrawForYield(40 * ONE_USDC);
        assertEq(usdc.balanceOf(address(vault)), 60 * ONE_USDC, "reserved coverage remains");
    }

    /// Cooling principal is also protected: a position in its cooldown window
    /// must stay claimable, so its USDC can't be routed to yield.
    function test_H2_CoolingIsAlsoCovered() public {
        uint256 id = _depositAs(staker, 100 * ONE_USDC);
        vm.prank(staker);
        vault.requestWithdraw(id); // now cooling; 100 must stay liquid to claim

        vm.expectRevert(KarwanVault.InsufficientLiquidUsdc.selector);
        vault.withdrawForYield(1 * ONE_USDC);
    }

    /* ------------------------------------------------------------------ H-3 */

    /// The dust attack can't even be set up: deposits revert once an owner
    /// holds MAX_POSITIONS_PER_OWNER live positions.
    function test_H3_PositionCountIsCapped() public {
        uint256 cap = vault.MAX_POSITIONS_PER_OWNER();
        vm.startPrank(staker);
        usdc.approve(address(vault), (cap + 1) * ONE_USDC);
        for (uint256 i = 0; i < cap; i++) {
            vault.deposit(1 * ONE_USDC);
        }
        // The (cap+1)th deposit reverts.
        vm.expectRevert(KarwanVault.TooManyPositions.selector);
        vault.deposit(1 * ONE_USDC);
        vm.stopPrank();
    }

    /// slash at the maximum position count is bounded and lands well within a
    /// realistic gas stipend — the v1 griefing (600 positions -> OOG) is gone
    /// because 600 positions can never be created (previous test).
    function test_H3_SlashAtMaxPositionsIsBounded() public {
        uint256 cap = vault.MAX_POSITIONS_PER_OWNER();
        vm.startPrank(staker);
        usdc.approve(address(vault), cap * ONE_USDC);
        for (uint256 i = 0; i < cap; i++) {
            vault.deposit(1 * ONE_USDC);
        }
        vm.stopPrank();

        bytes32 jobId = keccak256("full-slash");
        vm.prank(escrow);
        vault.reserve(jobId, staker, cap * ONE_USDC, buyer);

        // The full slash walks every one of the cap positions; even so it lands
        // inside a generous-but-bounded stipend. (v1 OOG'd here at 600.)
        vm.prank(escrow);
        (bool ok,) = address(vault).call{gas: 3_000_000}(
            abi.encodeWithSelector(vault.slash.selector, jobId)
        );
        assertTrue(ok, "slash bounded at the position cap");
        assertEq(usdc.balanceOf(buyer), cap * ONE_USDC, "buyer fully insured");
    }

    /// Swap-and-pop keeps the array tight: claiming a position removes it, so
    /// closed positions never accumulate iteration cost.
    function test_H3_ClaimRemovesPositionFromArray() public {
        uint256 a = _depositAs(staker, 10 * ONE_USDC);
        _depositAs(staker, 10 * ONE_USDC);
        assertEq(vault.positionCountOf(staker), 2);

        vm.prank(staker);
        vault.requestWithdraw(a);
        vm.warp(block.timestamp + 4 days);
        vm.prank(staker);
        vault.claim(a);

        // The claimed position left the live array.
        assertEq(vault.positionCountOf(staker), 1, "closed position swap-popped");
    }
}
