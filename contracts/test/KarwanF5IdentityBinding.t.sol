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

/// @title F-5: what a unilateral revokeAgent actually does to a live deal
/// @notice Characterisation tests. The escrow resolves agent to identity
///         through vault.resolveOwner at CALL time, in four places: the
///         self-dealing check, _isParty (authorisation), _validPayee (payout
///         routing) and reputation crediting. revokeAgent rewrites that
///         mapping unilaterally, so every one of them changes answer mid-deal.
contract KarwanF5IdentityBindingTest is Test {
    KarwanEscrow escrow;
    KarwanVault vault;
    KarwanReputation rep;
    MockUSDC usdc;

    address buyer = makeAddr("buyer");
    address identity = makeAddr("sellerIdentity");
    address agent = makeAddr("sellerAgent");
    address treasury = makeAddr("treasury");
    bytes32 constant JOB = keccak256("f5-job");

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        rep = new KarwanReputation();
        escrow = new KarwanEscrow(
            address(usdc),
            150,
            treasury,
            address(vault),
            address(rep),
            10000,
            KarwanEscrow.YieldConfig({backstop: address(0), operator: address(0), coverageFloor: 0, maxYieldBps: 8000}),
            KarwanEscrow.TimingConfig({
                minReviewWindow: 60,
                maxReviewWindow: 180 days,
                disputeTimeoutSecs: 14 days,
                attestedWindowSecs: 1 days,
                maxDeadlineHorizon: 730 days
            })
        );
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));

        // The seller's identity wallet approves its agent, and the agent binds.
        vm.prank(identity);
        vault.approveAgent(agent);
        vm.prank(agent);
        vault.registerOwner(identity);

        usdc.mint(buyer, 1000e18);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _pcts() internal pure returns (uint8[] memory p) {
        p = new uint8[](1);
        p[0] = 100;
    }

    /// A deal opened against the AGENT address, which is the normal shape:
    /// agents sign deals on their principal's behalf.
    function _dealViaAgent() internal {
        vm.prank(buyer);
        escrow.fundEscrow(
            JOB,
            agent,
            500e18,
            _pcts(),
            0,
            KarwanEscrow.Timing({deliveryDeadline: 0, reviewWindow: 5 days, reclaimGrace: 0})
        );
        vm.prank(agent);
        escrow.acceptEscrow(JOB);
    }

    /// Baseline: while the binding stands, both the agent and the identity
    /// count as the seller, which is the whole point of the mapping.
    function test_F5_BothAgentAndIdentityArePartyWhileBound() public {
        _dealViaAgent();

        vm.prank(agent);
        escrow.markDelivered(JOB, "proof");

        assertEq(vault.resolveOwner(agent), identity, "agent resolves to identity");
    }

    /// Revocation must not rewrite a live deal. Before the fix it did, and
    /// asymmetrically in the attacker's favour: the agent is the literally
    /// stored seller so it kept passing the party check, while the identity
    /// stopped resolving to it and was locked out of its own deal.
    function test_F5_RevokeDoesNotLockOutTheOwner() public {
        _dealViaAgent();

        vm.prank(identity);
        vault.revokeAgent(agent);

        vm.prank(agent);
        escrow.markDelivered(JOB, "delivered");

        // The identity keeps the authority it committed with.
        vm.warp(block.timestamp + 5 days + 1);
        vm.prank(identity);
        escrow.claimMilestone(JOB, 0);
        assertEq(
            uint8(escrow.getEscrow(JOB).state),
            uint8(KarwanEscrow.EscrowState.Settled),
            "owner can still act on its own deal after revoking the agent"
        );
    }

    /// The reputation half: revoking before settlement must not move the
    /// outcome onto a throwaway address. The deal credits the identity that
    /// was snapshotted when the seller accepted.
    function test_F5_RevokeBeforeSettlementCannotLaunderReputation() public {
        _dealViaAgent();

        vm.prank(agent);
        escrow.markDelivered(JOB, "proof");

        vm.prank(identity);
        vault.revokeAgent(agent);

        vm.prank(buyer);
        escrow.releaseFinal(JOB);

        assertTrue(rep.recorded(JOB), "outcome recorded");
        (uint256 identitySuccess,,) = rep.scores(identity);
        (uint256 agentSuccess,,) = rep.scores(agent);
        assertGt(identitySuccess, 0, "credit lands on the identity that did the deal");
        assertEq(agentSuccess, 0, "nothing lands on the agent address");
    }

    /// The snapshot is taken at accept, the seller's commitment point, so a
    /// binding made between fund and accept is the one the deal carries.
    function test_F5_IdentityIsSnapshottedAtAccept() public {
        address lateAgent = makeAddr("lateAgent");
        address lateIdentity = makeAddr("lateIdentity");

        vm.prank(buyer);
        escrow.fundEscrow(
            JOB,
            lateAgent,
            500e18,
            _pcts(),
            0,
            KarwanEscrow.Timing({deliveryDeadline: 0, reviewWindow: 5 days, reclaimGrace: 0})
        );

        // The binding only happens after the deal was funded.
        vm.prank(lateIdentity);
        vault.approveAgent(lateAgent);
        vm.prank(lateAgent);
        vault.registerOwner(lateIdentity);

        vm.prank(lateAgent);
        escrow.acceptEscrow(JOB);

        assertEq(
            escrow.getEscrow(JOB).sellerIdentity,
            lateIdentity,
            "accept captures the binding that was true at commitment"
        );
    }
}
