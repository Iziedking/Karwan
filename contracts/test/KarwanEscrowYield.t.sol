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

/// @notice Stands in for KarwanTreasury's returnEscrowLiquidity. Holds the USDC
///         the escrow sweeps and returns exactly what's asked on demand. A
///         `frozen` switch simulates a dry / misconfigured Treasury so the
///         liveness-degradation invariant can be exercised (payout reverts, no
///         funds lost).
contract MockBackstop {
    IERC20 public immutable usdc;
    address public immutable escrow;
    bool public frozen;

    constructor(IERC20 _usdc, address _escrow) {
        usdc = _usdc;
        escrow = _escrow;
    }

    function setFrozen(bool f) external {
        frozen = f;
    }

    function receiveEscrowFloat(uint256 amount) external {
        require(msg.sender == escrow, "not escrow");
        usdc.transferFrom(escrow, address(this), amount);
    }

    function returnEscrowLiquidity(uint256 amount) external {
        require(msg.sender == escrow, "not escrow");
        require(!frozen, "treasury dry");
        usdc.transfer(escrow, amount);
    }
}

/// @title Escrow idle-yield routing
/// @notice The escrow sweeps idle USDC into the Treasury backstop for USYC
///         yield (owned by the Treasury) and pulls exactly that USDC back for
///         every payout. These tests pin the principal-exactness, liability-
///         coverage, floor, and liveness-degradation invariants.
contract KarwanEscrowYieldTest is Test {
    KarwanEscrow escrow;
    KarwanVault vault;
    KarwanReputation rep;
    MockUSDC usdc;
    MockBackstop backstop;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address treasury = makeAddr("treasury");
    address arbiter = makeAddr("arbiter");
    address keeper = makeAddr("keeper");
    bytes32 constant JOB_ID = keccak256("yield-job");

    uint16 constant FEE_BPS = 150;
    uint16 constant MAX_RESERVATION_BPS = 10000;
    uint256 constant SELLER_NET = 496.25e18;
    uint256 constant FUNDED = 503.75e18;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        rep = new KarwanReputation();
        escrow = new KarwanEscrow(
            address(usdc), FEE_BPS, treasury, address(vault), address(rep), MAX_RESERVATION_BPS
        );
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));
        escrow.setArbiter(arbiter);
        backstop = new MockBackstop(usdc, address(escrow));

        // Enable yield routing.
        escrow.setYieldBackstop(address(backstop));
        escrow.setYieldOperator(keeper);

        usdc.mint(buyer, 1000e18);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _twoMilestones(uint8 a, uint8 b) internal pure returns (uint8[] memory pcts) {
        pcts = new uint8[](2);
        pcts[0] = a;
        pcts[1] = b;
    }

    function _fund() internal {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50), 0);
    }

    function _accept() internal {
        vm.prank(seller);
        escrow.acceptEscrow(JOB_ID);
    }

    /// The liability invariant balance + atTreasury >= escrowedTotal holds
    /// after fund and after a sweep, and sweep moves real USDC to the Treasury.
    function test_Yield_SweepPreservesLiability() public {
        _fund();
        assertEq(escrow.escrowedTotal(), FUNDED, "liability tracked at fund");
        assertEq(usdc.balanceOf(address(escrow)), FUNDED, "all liquid at fund");

        vm.prank(keeper);
        escrow.sweepIdle(400e18);

        assertEq(escrow.atTreasury(), 400e18, "swept tracked");
        assertEq(usdc.balanceOf(address(backstop)), 400e18, "USDC moved to treasury");
        assertEq(usdc.balanceOf(address(escrow)), FUNDED - 400e18, "rest liquid");
        // Invariant.
        assertGe(
            usdc.balanceOf(address(escrow)) + escrow.atTreasury(),
            escrow.escrowedTotal(),
            "liability covered"
        );
    }

    /// A release with most funds swept out pulls the gap back from the Treasury
    /// and pays the seller exactly, then settles with the books flat.
    function test_Yield_ReleasePullsBackAndPaysExactly() public {
        _fund();
        _accept();
        vm.prank(keeper);
        escrow.sweepIdle(450e18); // escrow now holds 53.75, owes 503.75

        vm.prank(buyer);
        escrow.releaseProgress(JOB_ID, 0); // milestone 1: seller 248.125, fee 3.75
        vm.prank(buyer);
        escrow.releaseProgress(JOB_ID, 1); // final

        assertEq(usdc.balanceOf(seller), SELLER_NET, "seller paid exactly, yield-neutral");
        assertEq(usdc.balanceOf(treasury), 7.5e18, "treasury got exactly the fee");
        assertEq(escrow.escrowedTotal(), 0, "liability cleared");
        // Everything pulled back; nothing stranded at the treasury for this deal.
        assertEq(escrow.atTreasury(), 0, "all liquidity pulled back");
    }

    /// Principal exactness across every exit: the amounts each party receives
    /// are identical whether or not funds were parked in yield.
    function test_Yield_ReclaimExactWithFundsInYield() public {
        vm.prank(buyer);
        escrow.fundEscrow(
            JOB_ID, seller, 500e18, _twoMilestones(50, 50), 0,
            KarwanEscrow.Timing({deliveryDeadline: uint64(block.timestamp) + 10 days, reviewWindow: 0, reclaimGrace: 1 days})
        );
        _accept();
        vm.prank(keeper);
        escrow.sweepIdle(500e18); // deep sweep; escrow holds only 3.75

        vm.warp(block.timestamp + 11 days + 1);
        vm.prank(buyer);
        escrow.reclaimAfterDeadline(JOB_ID, address(0));

        // Buyer made whole: full funded amount back regardless of yield routing.
        assertEq(usdc.balanceOf(buyer), 1000e18, "buyer principal exact");
        assertEq(escrow.escrowedTotal(), 0, "liability cleared");
    }

    /// sweepIdle can never drop liquid below the coverage floor, and only the
    /// keeper can call it.
    function test_Yield_FloorAndOperatorGuards() public {
        _fund();
        escrow.setCoverageFloor(200e18);

        vm.prank(keeper);
        vm.expectRevert(KarwanEscrow.FloorBreach.selector);
        escrow.sweepIdle(FUNDED - 100e18); // would leave 100 < 200 floor

        vm.prank(makeAddr("stranger"));
        vm.expectRevert(KarwanEscrow.NotYieldOperator.selector);
        escrow.sweepIdle(1e18);

        // Sweeping down to exactly the floor is allowed.
        vm.prank(keeper);
        escrow.sweepIdle(FUNDED - 200e18);
        assertEq(usdc.balanceOf(address(escrow)), 200e18, "floor preserved");
    }

    /// Liveness degradation: if the Treasury is dry, a payout reverts WHOLE and
    /// no funds move / no state advances. Funds are delayed, never lost. Once
    /// the Treasury recovers, the same release goes through.
    function test_Yield_FrozenTreasuryDelaysNeverLoses() public {
        _fund();
        _accept();
        vm.prank(keeper);
        escrow.sweepIdle(450e18);

        backstop.setFrozen(true);
        vm.prank(buyer);
        vm.expectRevert(); // pull-back reverts inside the release
        escrow.releaseProgress(JOB_ID, 0);

        // Nothing moved, state intact.
        assertEq(usdc.balanceOf(seller), 0, "seller unpaid");
        assertEq(escrow.escrowedTotal(), FUNDED, "liability unchanged");
        assertEq(uint8(escrow.getEscrow(JOB_ID).state), uint8(KarwanEscrow.EscrowState.Accepted), "still accepted");
        assertEq(escrow.getEscrow(JOB_ID).milestonesReleased, 0, "no milestone advanced");

        // Treasury recovers; the release now settles.
        backstop.setFrozen(false);
        vm.prank(buyer);
        escrow.releaseProgress(JOB_ID, 0);
        assertEq(usdc.balanceOf(seller), SELLER_NET / 2, "milestone 1 paid after recovery");
    }

    /// The backstop can't be unwired while USDC is still parked at the Treasury.
    function test_Yield_CannotOrphanParkedFunds() public {
        _fund();
        vm.prank(keeper);
        escrow.sweepIdle(300e18);

        vm.expectRevert(KarwanEscrow.YieldShortfall.selector);
        escrow.setYieldBackstop(address(0));

        // After everything is pulled back (via a full settle), unwiring is fine.
        _accept();
        vm.prank(buyer);
        escrow.releaseFinal(JOB_ID);
        assertEq(escrow.atTreasury(), 0, "all pulled back on settle");
        escrow.setYieldBackstop(address(0));
        assertEq(escrow.yieldBackstop(), address(0), "unwired once flat");
    }

    /// With yield disabled (no backstop), the escrow behaves exactly as a plain
    /// custodian: releases pay from its own balance, atTreasury stays 0.
    /// Fully isolated contracts so the single-set vault/rep escrow wiring
    /// doesn't collide with setUp's.
    function test_Yield_InertWhenDisabled() public {
        KarwanVault v = new KarwanVault(address(usdc));
        KarwanReputation r = new KarwanReputation();
        KarwanEscrow plain = new KarwanEscrow(
            address(usdc), FEE_BPS, treasury, address(v), address(r), MAX_RESERVATION_BPS
        );
        v.setEscrow(address(plain));
        r.setEscrow(address(plain));

        usdc.mint(buyer, FUNDED);
        vm.prank(buyer);
        usdc.approve(address(plain), type(uint256).max);

        vm.prank(buyer);
        plain.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50), 0);
        vm.prank(seller);
        plain.acceptEscrow(JOB_ID);
        vm.prank(buyer);
        plain.releaseFinal(JOB_ID);

        assertEq(plain.atTreasury(), 0, "never touched the treasury");
        assertEq(usdc.balanceOf(seller), SELLER_NET, "seller paid from escrow balance");
    }
}
