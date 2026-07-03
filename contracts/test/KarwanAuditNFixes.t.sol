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

/// Reputation double that ALWAYS reverts. Proves the escrow's try/catch (I-3)
/// keeps the payout flowing when reputation recording fails.
contract RevertingReputation {
    function resolveOwner(address a) external pure returns (address) { return a; }
    function recordCompletion(bytes32, address, address, uint8, uint256) external pure {
        revert("rep down");
    }
    function recordResolution(bytes32, address, address, uint16, uint256) external pure {
        revert("rep down");
    }
}

contract SweepBackstop {
    IERC20 public immutable usdc;
    address public escrow;
    constructor(IERC20 u) { usdc = u; }
    function setEscrow(address e) external { escrow = e; }
    function receiveEscrowFloat(uint256 a) external { usdc.transferFrom(escrow, address(this), a); }
    function returnEscrowLiquidity(uint256 a) external { usdc.transfer(escrow, a); }
}

/// @title Audit N-fixes + I-3
contract KarwanAuditNFixesTest is Test {
    MockUSDC usdc;
    KarwanVault vault;
    KarwanEscrow escrow;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address treasury = makeAddr("treasury");
    address keeper = makeAddr("keeper");
    address guardian = makeAddr("guardian");
    bytes32 constant JOB = keccak256("job");
    uint256 constant SELLER_NET = 496.25e18;

    function _two() internal pure returns (uint8[] memory p) {
        p = new uint8[](2); p[0] = 50; p[1] = 50;
    }

    // ============================ I-3 ============================

    /// A reverting reputation contract must NOT block the seller payout: the
    /// escrow swallows the failure (ReputationRecordFailed) and pays out.
    function test_I3_ReputationRevertDoesNotBlockPayout() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        RevertingReputation rep = new RevertingReputation();
        escrow = new KarwanEscrow(address(usdc), 150, treasury, address(vault), address(rep), 10000);
        vault.setEscrow(address(escrow));
        usdc.mint(buyer, 1000e18);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);

        vm.prank(buyer);
        escrow.fundEscrow(JOB, seller, 500e18, _two(), 0);
        vm.prank(seller);
        escrow.acceptEscrow(JOB);

        // Final release records reputation (which reverts). The seller must
        // still be paid in full despite the reputation contract being down.
        vm.prank(buyer);
        escrow.releaseFinal(JOB);
        assertEq(usdc.balanceOf(seller), SELLER_NET, "paid despite reputation revert");
        assertEq(uint8(escrow.getEscrow(JOB).state), uint8(KarwanEscrow.EscrowState.Settled));
    }

    // ============================ N-1 ============================

    function _stdEscrow() internal {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        KarwanReputation rep = new KarwanReputation();
        escrow = new KarwanEscrow(address(usdc), 150, treasury, address(vault), address(rep), 10000);
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));
        usdc.mint(buyer, 10000e18);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function test_N1_SweepCapBoundsWhatLeaves() public {
        _stdEscrow();
        SweepBackstop bs = new SweepBackstop(usdc);
        bs.setEscrow(address(escrow));
        escrow.setYieldBackstop(address(bs));
        escrow.setYieldOperator(keeper);
        // Default cap 80%. Fund 500 (escrowedTotal ~503.75).
        vm.prank(buyer);
        escrow.fundEscrow(JOB, seller, 500e18, _two(), 0);
        uint256 cap = (escrow.escrowedTotal() * 8000) / 10000;

        // Sweeping above the cap reverts even with the coverage floor at 0.
        vm.prank(keeper);
        vm.expectRevert(KarwanEscrow.SweepCapExceeded.selector);
        escrow.sweepIdle(cap + 1e18);

        // Up to the cap is fine.
        vm.prank(keeper);
        escrow.sweepIdle(cap);
        assertEq(escrow.atTreasury(), cap);
    }

    function test_N1_LockYieldWiringFreezesRepointing() public {
        _stdEscrow();
        SweepBackstop bs = new SweepBackstop(usdc);
        escrow.setYieldBackstop(address(bs));
        escrow.setYieldOperator(keeper);

        escrow.lockYieldWiring();
        // A compromised owner can no longer repoint the backstop to a drain addr.
        vm.expectRevert(KarwanEscrow.YieldWiringLockedErr.selector);
        escrow.setYieldBackstop(makeAddr("attacker"));
        vm.expectRevert(KarwanEscrow.YieldWiringLockedErr.selector);
        escrow.setCoverageFloor(0);
        vm.expectRevert(KarwanEscrow.YieldWiringLockedErr.selector);
        escrow.setMaxYieldBps(10000);
    }

    // ============================ N-2 ============================

    function test_N2_HoldExtendsClaimDeadline() public {
        _stdEscrow();
        escrow.setGuardian(guardian);
        vm.prank(buyer);
        escrow.fundEscrow(JOB, seller, 500e18, _two(), 0);
        vm.prank(seller);
        escrow.acceptEscrow(JOB);
        vm.prank(seller);
        escrow.markDelivered(JOB, "proof");
        uint64 before = escrow.getEscrow(JOB).claimDeadline;

        vm.prank(guardian);
        escrow.hold(JOB, "flagged");
        uint64 afterHold = escrow.getEscrow(JOB).claimDeadline;
        // Extended by the hold budget (default 7d).
        assertEq(afterHold, before + 7 days, "claim deadline pushed out by the hold budget");
    }
}
