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

/// @title C-1: registerOwner stake-theft is CLOSED in v2
/// @notice The audit's single CRITICAL. In v1 an agent could bind itself to
///         ANY owner with no consent, then reserve+slash the victim's stake to
///         the attacker. v2 requires the owner's on-chain approveAgent before
///         a binding can happen, so the attack dies at step 1. These tests
///         assert the fix; git history holds the v1 version that proved the
///         live exploit.
contract KarwanVaultC1AttackTest is Test {
    KarwanVault vault;
    MockUSDC usdc;

    address victim = makeAddr("victim");
    address escrow = makeAddr("escrow");
    address attacker = makeAddr("attacker");
    address attackerAgent = makeAddr("attackerAgent");

    uint256 constant ONE_USDC = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        vault.setEscrow(escrow);
        usdc.mint(victim, 1_000 * ONE_USDC);
        vm.startPrank(victim);
        usdc.approve(address(vault), 100 * ONE_USDC);
        vault.deposit(100 * ONE_USDC);
        vm.stopPrank();
    }

    /// The whole attack now cannot even start: step 1 reverts because the
    /// victim never approved the attacker's agent.
    function test_C1_TheftReplay_revertsAtBinding() public {
        vm.prank(attackerAgent);
        vm.expectRevert(KarwanVault.AgentNotApproved.selector);
        vault.registerOwner(victim);

        // No binding happened, so nothing resolves the attacker's agent to the
        // victim; the victim's stake is untouched and unreachable.
        assertEq(vault.agentOwner(attackerAgent), address(0), "no binding");
        assertEq(vault.freeStakeOf(victim), 100 * ONE_USDC, "victim stake safe");
    }

    /// Direct proof of the gate: registerOwner reverts without a prior
    /// approveAgent from the named owner (plan §8).
    function test_C1_RegisterOwner_RevertsWithoutApproval() public {
        vm.prank(attackerAgent);
        vm.expectRevert(KarwanVault.AgentNotApproved.selector);
        vault.registerOwner(victim);
    }

    /// The legitimate path still works: an owner approves THEIR OWN agent,
    /// then the agent binds and stake resolves correctly.
    function test_C1_ConsentedBinding_Works() public {
        address honestAgent = makeAddr("honestAgent");
        vm.prank(victim);
        vault.approveAgent(honestAgent);
        vm.prank(honestAgent);
        vault.registerOwner(victim);
        assertEq(vault.resolveOwner(honestAgent), victim, "consented binding resolves");
    }

    /// A cross-owner reserve is impossible: even if the attacker's agent is
    /// bound to the attacker's OWN identity, it can never resolve to (or book
    /// against) the victim. Belt-and-braces around the consent fix.
    function test_C1_CrossOwnerReserve_CannotTouchVictim() public {
        // Attacker legitimately binds their agent to their own (empty) identity.
        vm.prank(attacker);
        vault.approveAgent(attackerAgent);
        vm.prank(attackerAgent);
        vault.registerOwner(attacker);

        // Escrow reserves against the attacker's agent -> resolves to the
        // attacker, who has ZERO stake, so it reverts. It can never reach the
        // victim's stake.
        vm.prank(escrow);
        vm.expectRevert(KarwanVault.InsufficientFreeStake.selector);
        vault.reserve(keccak256("attack-job"), attackerAgent, 100 * ONE_USDC, attacker);

        assertEq(vault.freeStakeOf(victim), 100 * ONE_USDC, "victim stake untouched");
    }

    /// Revoke clears the binding so a compromised/rotated agent stops
    /// resolving to the owner (and a rebind needs fresh approval).
    function test_C1_RevokeAgent_ClearsBinding() public {
        address agent = makeAddr("agent");
        vm.prank(victim);
        vault.approveAgent(agent);
        vm.prank(agent);
        vault.registerOwner(victim);
        assertEq(vault.resolveOwner(agent), victim);

        vm.prank(victim);
        vault.revokeAgent(agent);
        assertEq(vault.resolveOwner(agent), agent, "binding cleared");

        // Rebinding needs a fresh approval.
        vm.prank(agent);
        vm.expectRevert(KarwanVault.AgentNotApproved.selector);
        vault.registerOwner(victim);
    }
}
